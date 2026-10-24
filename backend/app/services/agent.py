"""The hunting agent: an NVIDIA-hosted model (brain) <-> this loop <-> official MCP servers (Zomato, Swiggy Food)
                                                    <-> local tools: record_deal (validated by pricing.py), finish

Safety: any MCP tool that could place an order or take payment is never shown to the model.
"""
import asyncio
import json
import re
from collections import deque
from types import SimpleNamespace
from contextlib import AsyncExitStack

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from app.config import BLOCKED_TOOLS, KEEP_TURNS, MAX_TURNS, PLATFORMS, PROMPT_FILE, TOOL_OUTPUT_LIMIT
from app.services.errors import describe
from app.services.models import router
from app.services.oauth import make_oauth
from app.services import bill, swiggy_bill, zomato_bill
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
                "source": {"type": "string", "enum": ["menu", "food_rescue", "cross_check"]},
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
CART_TOOL = re.compile(r"^(?!get_|fetch_|list_|search_)\w*(cart|coupon)", re.I)   # tools that change the cart or its offer (not address or menu lookups)
CART_RESET = re.compile(r"clear|empty|flush", re.I)
CART_REPLACE = re.compile(r"^create_\w*cart", re.I)   # Zomato builds the whole cart in one call, replacing any earlier one


TRIMMED = "[older result trimmed]"
CROSS_CHECK_DEALS = 3     # how many of the cheapest deals are priced on the other app
CROSS_CHECK_TURNS = 14    # model turns allowed per cross-check
CROSS_CHECK_BUDGET = 3    # a cross-check bill may be up to this many times the budget (it is only there to compare)


def _parse_args(raw: str | None) -> dict:
    try:
        args = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return args if isinstance(args, dict) else {}


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
        self.sessions: dict[str, ClientSession] = {}
        self.tool_map: dict[str, tuple[str, str]] = {}  # model-facing name -> (platform, real name)
        self.tools: list[dict] = list(LOCAL_TOOLS)
        self.deals: list[Deal] = []
        self.cart_calls: dict[str, list[dict]] = {}   # per platform: cart-changing calls since the cart was last emptied
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
                    final_payable=final, bill_lines=lines, offer=str(data.get("offer") or ""), cart_calls=list(self.cart_calls.get(platform, [])), source=data.get("source") or "menu",
                    distance_km=data.get("distance_km"), eta_min=data.get("eta_min"), **bill.classify(lines))
        # A cross-check price is kept even when over budget: it is only there to be compared with the other app's price.
        errors = validate(deal, self.args.budget * (CROSS_CHECK_BUDGET if deal.source == "cross_check" else 1))
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

    def _track_cart(self, platform: str, tool: str, args: dict) -> None:
        """Remember the calls that built the current cart so a deal can be added to the user's cart later."""
        if not CART_TOOL.search(tool):
            return
        if CART_RESET.search(tool):
            self.cart_calls[platform] = []
        elif CART_REPLACE.search(tool):
            self.cart_calls[platform] = [{"tool": tool, "args": args}]
        else:
            self.cart_calls.setdefault(platform, []).append({"tool": tool, "args": args})

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
            full = full_result_text(res)
            failed = getattr(res, "isError", False)
            builder = {"zomato": zomato_bill, "swiggy": swiggy_bill}.get(platform)   # Zomato's itemised charges miss some the app shows; Swiggy's are plain text
            extra = "" if failed or not builder or not re.search(r"cart", real, re.I) else builder.summary(full)
            self.platform_output.setdefault(platform, deque(maxlen=24)).append(extra + full)   # kept whole, to check bills against
            if not failed:
                self._track_cart(platform, real, args)
            return (extra + full)[:TOOL_OUTPUT_LIMIT] if extra else mcp_result_to_text(res)
        except Exception as e:
            return f"TOOL ERROR calling {real}: {e!r}"

    async def run(self):
        """Hunt every connected platform at the same time; each has its own conversation with the model."""
        summaries = await asyncio.gather(*(self._run_platform(p) for p in self.sessions))
        self.summary = "\n".join(f"{p}: {t.strip()}" for p, t in zip(self.sessions, summaries) if t and t.strip())
        if len(self.sessions) > 1 and not self.error:
            await self.cross_check()

    async def cross_check(self):
        """Price each of the cheapest deals' dishes on the other app too, so the list can keep whichever app is cheaper."""
        found = sorted((d for d in self.deals if d.source != "cross_check"), key=lambda d: d.final_payable)[:CROSS_CHECK_DEALS]
        self.emit({"type": "status", "text": f"Checking {len(found)} top deal(s) on the other app for a fairer price..."})
        for deal in found:
            for other in (p for p in self.sessions if p != deal.platform):
                task = (f"Cross-check, not a new hunt. {deal.platform} offers '{deal.items}' from {deal.restaurant} for ₹{deal.final_payable:.0f} all-in. "
                        f"On {other} ONLY, find the same restaurant (or the same chain nearest to the address) and the same main dish, "
                        f"build the cart with the same items, apply its best offer, read the bill and call record_deal with source=\"cross_check\". "
                        f"If {other} does not sell it, call finish saying so. Stop after at most {CROSS_CHECK_TURNS} steps. Clear the cart when done.")
                await self._run_platform(other, task=task, max_turns=CROSS_CHECK_TURNS)

    def _openai_tools(self, platform: str) -> list[dict]:
        """The tools this platform's conversation may use: the local ones plus that platform's own."""
        return [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
                for t in self.tools if t["name"] in ("record_deal", "finish") or t["name"].startswith(f"{platform}__")]

    def _switched(self, old: str, new: str, why: str) -> None:
        text = f"Model {old} failed ({why}). Switched to {new}."
        print(text)
        self.emit({"type": "status", "text": text})

    async def _generate(self, messages: list[dict], platform: str):
        """One model call. Switches to the next free model on failure."""
        return await router.generate(messages, self._openai_tools(platform), self._switched)

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

    async def _run_platform(self, platform: str, task: str | None = None, max_turns: int = MAX_TURNS) -> str:
        messages = [
            {"role": "system", "content": build_prompt(self.args)},
            {"role": "user", "content": task or (
                f"Start the hunt now. Budget ₹{self.args.budget} all-in. Work ONLY on {platform}; "
                f"the other platform is handled separately. Record each deal the moment its bill is verified.")}]
        stale: list[tuple[int, dict]] = []  # (turn, tool-result message) so old results can be shrunk
        for turn in range(max_turns):
            try:
                msg = await self._generate(messages, platform)
            except Exception as e:  # keep the deals already found; report why we stopped
                self.error = describe(e)
                self.emit({"type": "error", "text": f"{platform}: stopped early, no model answered. {self.error}"})
                return f"Stopped early: {self.error}"
            text = (msg.content or "").strip()
            tool_calls = msg.tool_calls or []
            assistant = {"role": "assistant", "content": text}
            if tool_calls:
                assistant["tool_calls"] = [{"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments or "{}"}}
                                           for tc in tool_calls]
            messages.append(assistant)
            if text:
                self.emit({"type": "step", "text": f"{platform}: {text[:280]}"})
                if self.args.verbose:
                    print(f"\n🤖 [{platform}] {text}\n")
            if not tool_calls:
                return text
            calls = [SimpleNamespace(name=tc.function.name, args=_parse_args(tc.function.arguments)) for tc in tool_calls]
            for call in calls:
                if call.name == "finish":
                    return str(call.args.get("summary", ""))
            outputs = await self._run_calls(calls)
            for tc, out in zip(tool_calls, outputs):
                result = {"role": "tool", "tool_call_id": tc.id, "content": out}
                messages.append(result)
                stale.append((turn, result))
            for t, result in stale:  # shrink old tool results: smaller prompts mean faster turns
                if turn - t >= KEEP_TURNS and result["content"] != TRIMMED:
                    result["content"] = TRIMMED
        return f"Stopped after {max_turns} turns."
