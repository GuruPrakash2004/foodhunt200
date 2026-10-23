"""The hunting agent: Gemini (brain) <-> this loop <-> official MCP servers (Zomato, Swiggy Food)
                                                    <-> local tools: record_deal (validated by pricing.py), finish

Safety: any MCP tool that could place an order or take payment is never shown to the model.
"""
import asyncio
import json
import os
import re
from collections import deque
from contextlib import AsyncExitStack

from google import genai
from google.genai import types
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from app.config import (BLOCKED_TOOLS, KEEP_TURNS, MAX_TURNS, MODEL_TIMEOUT_S, PLATFORMS, PROMPT_FILE,
                        THINKING_LEVEL, TOOL_OUTPUT_LIMIT)
from app.services.errors import describe
from app.services.models import router
from app.services.oauth import make_oauth
from app.services import bill
from app.services.pricing import Deal, validate

LOCAL_TOOLS = [
    {
        "name": "record_deal",
        "description": (
            "Record ONE confirmed deal after reading the platform's real cart bill with the offer applied. "
            "Copy EVERY line of that bill into bill_lines exactly as the platform shows it: its own label and its amount "
            "(charges positive, discounts negative). Do not merge, rename, round or invent lines, and do not put the total in bill_lines. "
            "The server takes every number from those lines, checks that each one really appears in the platform's response, "
            "and rejects the deal if a line is missing, made up, or the bill has no GST/tax line."),
        "input_schema": {
            "type": "object",
            "properties": {
                "platform": {"type": "string", "enum": list(PLATFORMS)},
                "restaurant": {"type": "string"},
                "items": {"type": "string", "description": "every item in the cart, e.g. 'Paneer Rice Bowl x1 + Lime Soda x1'"},
                "bill_lines": {
                    "type": "array",
                    "description": "every line of the bill, copied exactly: item total, delivery, platform/handling fee, packaging, GST / taxes & charges, discounts",
                    "items": {
                        "type": "object",
                        "properties": {"label": {"type": "string"}, "amount": {"type": "number"}},
                        "required": ["label", "amount"],
                    },
                },
                "final_payable": {"type": "number", "description": "the 'To Pay' amount exactly as the platform shows it"},
                "offer": {"type": "string", "description": "the coupon or offer name that was applied"},
                "source": {"type": "string", "enum": ["menu", "food_rescue"]},
                "distance_km": {"type": "number"},
                "eta_min": {"type": "integer"},
            },
            "required": ["platform", "restaurant", "items", "bill_lines", "final_payable"],
        },
    },
    {
        "name": "finish",
        "description": "End the hunt with a short ranked summary for the user.",
        "input_schema": {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        },
    },
]


# Tools that only read can run side by side; anything that touches the cart runs one at a time, in order.
READ_ONLY = re.compile(r"search|menu|list|find|nearby|rescue|restaurant|address|offer|coupon", re.I)
MUTATING = re.compile(r"add|remove|clear|apply|update|set_|select|delete|empty", re.I)


def is_parallel_safe(tool_name: str) -> bool:
    real = tool_name.split("__", 1)[-1]
    return bool(READ_ONLY.search(real)) and not MUTATING.search(real)


def build_prompt(args) -> str:
    tpl = PROMPT_FILE.read_text(encoding="utf-8")
    return tpl.format(
        budget=args.budget,
        prefilter=int(args.budget * 0.75),
        max_carts=args.max_carts,
        diet=args.diet,
        address=args.address,
        queries=args.queries,
        extra_items=getattr(args, "extra_items", 2),
    )


def full_result_text(result) -> str:
    parts = []
    for c in result.content:
        parts.append(getattr(c, "text", None) or json.dumps(c.model_dump(mode="json"))[:4000])
    text = "\n".join(parts)
    return ("TOOL ERROR: " + text) if getattr(result, "isError", False) else text


def mcp_result_to_text(result) -> str:
    return full_result_text(result)[:TOOL_OUTPUT_LIMIT]  # the model gets a short copy; menus can be huge


class Hunt:
    def __init__(self, args, emit=None, on_deal=None):
        self.args = args
        self.emit = emit or (lambda event: None)  # progress hook (web UI); CLI just prints
        self.on_deal = on_deal or (lambda deal: None)
        self.platform_output: dict[str, deque] = {}   # what each platform actually returned (full text), newest last
        self.error = ""  # set when a model failure stopped the hunt early
        self.thinking = True  # use FOODHUNT_THINKING level until the model rejects it
        self.client = genai.Client(
            api_key=os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"),
            http_options=types.HttpOptions(
                timeout=int(MODEL_TIMEOUT_S * 1000),
                retry_options=types.HttpRetryOptions(attempts=1)))  # the router handles retries by switching model
        self.sessions: dict[str, ClientSession] = {}
        self.tool_map: dict[str, tuple[str, str]] = {}  # model-facing name -> (platform, real name)
        self.tools: list[dict] = list(LOCAL_TOOLS)
        self.deals: list[Deal] = []
        self.summary = ""

    async def connect(self, stack: AsyncExitStack):
        wanted = PLATFORMS if self.args.platform == "both" else {self.args.platform: PLATFORMS[self.args.platform]}
        for name, cfg in wanted.items():
            try:
                auth = make_oauth(name, cfg["url"], cfg["port"], cfg["client_id"], cfg["client_secret"])
                read, write, _ = await stack.enter_async_context(streamablehttp_client(cfg["url"], auth=auth))
                session = await stack.enter_async_context(ClientSession(read, write))
                await session.initialize()
                listed = await session.list_tools()
            except Exception as e:  # one platform failing shouldn't kill the hunt
                print(f"[{name}] could not connect: {describe(e)}  -> skipping {name}")
                self.emit({"type": "error", "text": f"{name} could not connect: {describe(e)}"})
                continue
            self.sessions[name] = session
            kept, blocked = 0, []
            for t in listed.tools:
                if BLOCKED_TOOLS.search(t.name):
                    blocked.append(t.name)
                    continue
                mname = f"{name}__{t.name}"[:64]
                self.tool_map[mname] = (name, t.name)
                self.tools.append({
                    "name": mname,
                    "description": f"[{name.upper()}] {t.description or ''}"[:1024],
                    "input_schema": t.inputSchema or {"type": "object", "properties": {}},
                })
                kept += 1
            print(f"[{name}] connected: {kept} tools available, blocked for safety: {blocked}")
            self.emit({"type": "status", "text": f"{name} connected ({kept} tools)"})
        if not self.sessions:
            raise SystemExit("No platform connected. See README -> Troubleshooting.")

    def _rejected(self, platform, data: dict, errors: list[str]) -> str:
        """Tell the model why, and show the reason in the progress log so a rejected bill is never silent."""
        self.emit({"type": "step", "text": f"{platform}: bill for {data.get('restaurant', '?')} not accepted: {errors[0][:140]}"})
        return "REJECTED:\n- " + "\n- ".join(errors)

    def record(self, data: dict) -> str:
        """Turn the model's copy of the bill into a Deal. The numbers come from the platform's lines, checked against its own responses."""
        platform = data.get("platform")
        lines = bill.clean(data.get("bill_lines"))
        if not lines:
            return "REJECTED:\n- bill_lines is empty. Copy every line of the platform's bill (label and amount)."
        final = float(data.get("final_payable") or 0)
        errors = bill.verify(lines, final, list(self.platform_output.get(platform, [])))
        if errors:
            return self._rejected(platform, data, errors)
        deal = Deal(platform=platform, restaurant=str(data.get("restaurant", "")).strip(), items=str(data.get("items", "")).strip(),
                    final_payable=final, bill_lines=lines, offer=str(data.get("offer") or ""), source=data.get("source") or "menu",
                    distance_km=data.get("distance_km"), eta_min=data.get("eta_min"), **bill.classify(lines))
        errors = validate(deal, self.args.budget)
        if errors:
            return self._rejected(platform, data, errors)
        if any(d.key() == deal.key() for d in self.deals):
            return "Already recorded this deal."
        self.deals.append(deal)
        self.on_deal(deal)
        self.emit({"type": "deal", "deal": deal.to_dict()})
        print(f"  ✓ ₹{deal.final_payable:>6.0f}  {deal.platform:<6} {deal.restaurant} — {deal.items}"
              f"  ({deal.offer or 'no offer'})")
        return f"Recorded. {len(self.deals)} deal(s) so far."

    async def call_tool(self, name: str, args: dict) -> str:
        if name == "record_deal":
            return self.record(args)
        if name not in self.tool_map:
            return f"Unknown or blocked tool: {name}"
        platform, real = self.tool_map[name]
        if self.args.verbose:
            print(f"  → {platform}.{real} {json.dumps(args)[:200]}")
        self.emit({"type": "step", "text": f"{platform}: {real} {json.dumps(args, ensure_ascii=False)[:120]}"})
        try:
            res = await self.sessions[platform].call_tool(real, args)
            self.platform_output.setdefault(platform, deque(maxlen=24)).append(full_result_text(res))   # kept whole, to check bills against
            return mcp_result_to_text(res)
        except Exception as e:
            return f"TOOL ERROR calling {real}: {e!r}"

    async def run(self):
        """Hunt every connected platform at the same time; each has its own conversation with the model."""
        summaries = await asyncio.gather(*(self._run_platform(p) for p in self.sessions))
        self.summary = "\n".join(f"{p}: {t.strip()}" for p, t in zip(self.sessions, summaries) if t and t.strip())

    def _config(self, platform: str, thinking: bool) -> types.GenerateContentConfig:
        declarations = [
            types.FunctionDeclaration(name=t["name"], description=t["description"], parameters_json_schema=t["input_schema"])
            for t in self.tools if t["name"] in ("record_deal", "finish") or t["name"].startswith(f"{platform}__")]
        return types.GenerateContentConfig(
            system_instruction=build_prompt(self.args), max_output_tokens=4096,
            tools=[types.Tool(function_declarations=declarations)],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            thinking_config=types.ThinkingConfig(thinking_level=THINKING_LEVEL) if thinking and THINKING_LEVEL else None,
        )

    def _switched(self, old: str, new: str, why: str) -> None:
        text = f"Model {old} failed ({why}). Switched to {new}."
        print(text)
        self.emit({"type": "status", "text": text})

    async def _generate(self, contents, platform: str):
        """One model call. Switches model on failure; drops the thinking level if a model rejects it."""
        try:
            return await router.generate(self.client, contents, lambda: self._config(platform, self.thinking), self._switched)
        except Exception as e:
            if self.thinking and "think" in str(e).lower():
                self.thinking = False
                return await router.generate(self.client, contents, lambda: self._config(platform, False), self._switched)
            raise

    async def _run_calls(self, calls) -> list[str]:
        """Run one turn's tool calls: independent reads together, cart changes one by one, results in call order."""
        outputs: list[str | None] = [None] * len(calls)

        async def one(i):
            outputs[i] = await self.call_tool(calls[i].name, dict(calls[i].args or {}))

        batch = [i for i, c in enumerate(calls) if is_parallel_safe(c.name)]
        if len(batch) > 1:
            await asyncio.gather(*(one(i) for i in batch))
        for i in range(len(calls)):
            if outputs[i] is None:
                await one(i)
        return outputs

    async def _run_platform(self, platform: str) -> str:
        contents = [types.Content(role="user", parts=[types.Part(text=(
            f"Start the hunt now. Budget ₹{self.args.budget} all-in. Work ONLY on {platform}; "
            f"the other platform is handled separately. Record each deal the moment its bill is verified."))])]
        stale: list[tuple[int, types.Part]] = []  # (turn, tool-result part) so old results can be shrunk
        for turn in range(MAX_TURNS):
            try:
                resp = await self._generate(contents, platform)
            except Exception as e:  # keep the deals already found; report why we stopped
                self.error = describe(e)
                self.emit({"type": "error", "text": f"{platform}: stopped early, no Gemini model answered. {self.error}"})
                return f"Stopped early: {self.error}"
            if not resp.candidates or not resp.candidates[0].content:
                return "Model returned no content."
            content = resp.candidates[0].content
            contents.append(content)  # keep as-is so thought signatures round-trip
            parts = content.parts or []
            text = "".join(p.text for p in parts if p.text and not p.thought)
            if text.strip():
                self.emit({"type": "step", "text": f"{platform}: {text.strip()[:280]}"})
                if self.args.verbose:
                    print(f"\n🤖 [{platform}] {text.strip()}\n")
            calls = [p.function_call for p in parts if p.function_call]
            if not calls:
                return text
            for fc in calls:
                if fc.name == "finish":
                    return (fc.args or {}).get("summary", "")
            outputs = await self._run_calls(calls)
            results = [types.Part.from_function_response(name=fc.name, response={"result": out})
                       for fc, out in zip(calls, outputs)]
            stale += [(turn, r) for r in results]
            contents.append(types.Content(role="user", parts=results))
            for t, part in stale:  # shrink old tool results: smaller prompts mean faster turns
                if turn - t >= KEEP_TURNS and not part.function_response.response.get("trimmed"):
                    part.function_response.response = {"result": "[older result trimmed]", "trimmed": True}
        return f"Stopped after {MAX_TURNS} turns (FOODHUNT_MAX_TURNS)."
