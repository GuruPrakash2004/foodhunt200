"""The hunting agent: an NVIDIA-hosted model (brain) <-> this loop <-> official MCP servers (Zomato, Swiggy Food)
                                                    <-> local tools: record_deal (validated by pricing.py), finish

Safety: any MCP tool that could place an order or take payment is never shown to the model.
"""
import asyncio
import copy
import json
import math
import re
from collections import deque
from types import SimpleNamespace
from contextlib import AsyncExitStack

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from app.config import BLOCKED_TOOLS, KEEP_TURNS, MAX_TURNS, PLATFORMS, TOOL_OUTPUT_LIMIT, PRICERS_PER_PLATFORM, SCOUT_MODELS, SCOUTS_PER_PLATFORM, WORKERS_PER_PLATFORM
from app.services.errors import describe
from app.services.models import router
from app.services.oauth import make_oauth
from app.services import bill, swiggy_bill, zomato_bill
from app.services.pricing import Deal, validate

from app.services.agent_support import (  # noqa: F401  (re-exported: tests and callers import these from app.services.agent)
    CART_REPLACE, CART_RESET, CART_TOOL, CROSS_CHECK_BUDGET, CROSS_CHECK_DEALS, CROSS_CHECK_EXTRA, CROSS_CHECK_TURNS, LOCAL_TOOLS,
    ROLE_START, SCOUT_ENOUGH, SCOUT_TURNS, TRIMMED, _WORKER, _parse_args, build_prompt, full_result_text, is_parallel_safe,
    mcp_result_to_text, split_terms)


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
        self.cart_locks: dict[str, asyncio.Lock] = {}
        self.queues: dict[str, SimpleNamespace] = {}   # per platform: candidates the scouts found, waiting for a pricer
        self._cross_started: set = set()   # deals whose cross-check has begun
        self._cross_tasks: list[asyncio.Task] = []
        self._cross_workers = 0

    def _key(self, platform: str) -> str:
        """Per-worker bookkeeping key: the plain platform name for the first worker, so single-worker hunts are unchanged."""
        w = _WORKER.get()
        return platform if w is None or w.n == 0 else f"{platform}#{w.n}"

    async def _take_cart(self, platform: str) -> None:
        w = _WORKER.get()
        if w is None or w.holds:
            return
        await self.cart_locks.setdefault(platform, asyncio.Lock()).acquire()
        w.holds = True

    def _release_cart(self, platform: str) -> None:
        w = _WORKER.get()
        if w is not None and w.holds:
            w.holds = False
            self.cart_locks[platform].release()

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
        errors = bill.verify(lines, final, list(self.platform_output.get(self._key(platform), [])))
        if errors:
            return self._rejected(platform, data, errors)
        deal = Deal(platform=platform, restaurant=str(data.get("restaurant", "")).strip(), items=str(data.get("items", "")).strip(),
                    final_payable=final, bill_lines=lines, offer=str(data.get("offer") or ""), cart_calls=list(self.cart_calls.get(self._key(platform), [])), source=data.get("source") or "menu",
                    distance_km=data.get("distance_km"), eta_min=data.get("eta_min"), **bill.classify(lines))
        # A cross-check price is kept even when over budget: it is only there to be compared with the other app's price.
        errors = validate(deal, self.args.budget * (CROSS_CHECK_BUDGET if deal.source == "cross_check" else 1))
        if errors:
            return self._rejected(platform, data, errors)
        if any(d.key() == deal.key() for d in self.deals):
            return "Already recorded this deal."
        self.deals.append(deal)
        self.on_deal(deal)
        self._maybe_cross_check(deal)
        self.emit({"type": "deal", "deal": deal.to_dict()})
        print(f"  ✓ ₹{deal.final_payable:>6.0f}  {deal.platform:<6} {deal.restaurant} — {deal.items}"
              f"  ({deal.offer or 'no offer'})")
        self._release_cart(platform)   # the next worker waiting for this platform's cart may go
        return f"Recorded. {len(self.deals)} deal(s) so far."

    def _queue(self, platform: str) -> SimpleNamespace:
        return self.queues.setdefault(platform, SimpleNamespace(q=asyncio.PriorityQueue(), seen=set(), proposed=0, handed=0, seq=0))

    def propose(self, platform: str, data: dict) -> str:
        """A scout's candidate goes on the platform's queue, cheapest first; repeats are dropped."""
        st = self._queue(platform)
        restaurant, items = str(data.get("restaurant", "")).strip(), str(data.get("items", "")).strip()
        if not restaurant or not items:
            return "REJECTED: restaurant and items are required."
        if st.proposed >= self.args.max_carts * SCOUT_ENOUGH:
            return "Enough candidates queued. Call finish."
        key = (restaurant.lower(), items.lower())
        if key in st.seen:
            return "Already queued."
        st.seen.add(key)
        st.proposed += 1
        st.seq += 1
        try:
            price = float(data.get("est_price") or 9999)
        except (TypeError, ValueError):
            price = 9999.0
        st.q.put_nowait((price, st.seq, {"restaurant": restaurant, "items": items, "est_price": price, "details": str(data.get("details", ""))[:1500]}))
        self.emit({"type": "step", "text": f"{platform}: candidate queued: {restaurant} — {items} (₹{price:.0f})"})
        return f"Queued ({st.proposed})."

    def _end_of_candidates(self, platform: str) -> None:
        st = self._queue(platform)
        st.seq += 1
        st.q.put_nowait((float("inf"), st.seq, None))

    async def next_candidate(self, platform: str) -> str:
        """A pricer's next candidate. Waits for scouts while any are still searching; the cart-check allowance is shared by all pricers."""
        st = self._queue(platform)
        if st.handed >= self.args.max_carts:
            return "NO MORE CANDIDATES. Call finish."
        st.handed += 1   # claimed before waiting, so pricers cannot overshoot the allowance
        _, _, cand = await st.q.get()
        if cand is None:
            st.handed -= 1
            self._end_of_candidates(platform)   # leave the marker for the other pricers
            return "NO MORE CANDIDATES. Call finish."
        return json.dumps(cand, ensure_ascii=False)

    def _track_cart(self, platform: str, tool: str, args: dict) -> None:
        """Remember the calls that built the current cart so a deal can be added to the user's cart later."""
        if not CART_TOOL.search(tool):
            return
        key = self._key(platform)
        if CART_RESET.search(tool):
            self.cart_calls[key] = []
        elif CART_REPLACE.search(tool):
            self.cart_calls[key] = [{"tool": tool, "args": args}]
        else:
            self.cart_calls.setdefault(key, []).append({"tool": tool, "args": args})

    async def call_tool(self, name: str, args: dict) -> str:
        if name == "record_deal":
            return self.record(args)
        if name in ("propose_candidate", "next_candidate"):
            w = _WORKER.get()
            if w is None or not w.platform:
                return "Not available here."
            return self.propose(w.platform, args) if name == "propose_candidate" else await self.next_candidate(w.platform)
        if name not in self.tool_map:
            return f"Unknown or blocked tool: {name}"
        platform, real = self.tool_map[name]
        if self.args.verbose:
            print(f"  → {platform}.{real} {json.dumps(args)[:200]}")
        self.emit({"type": "step", "text": f"{platform}: {real} {json.dumps(args, ensure_ascii=False)[:120]}"})
        try:
            if CART_TOOL.search(real):
                await self._take_cart(platform)
            res = await self.sessions[platform].call_tool(real, args)
            full = full_result_text(res)
            failed = getattr(res, "isError", False)
            builder = {"zomato": zomato_bill, "swiggy": swiggy_bill}.get(platform)   # Zomato's itemised charges miss some the app shows; Swiggy's are plain text
            extra = "" if failed or not builder or not re.search(r"cart", real, re.I) else builder.summary(full)
            self.platform_output.setdefault(self._key(platform), deque(maxlen=24)).append(extra + full)   # kept whole, to check bills against
            if not failed:
                self._track_cart(platform, real, args)
            return (extra + full)[:TOOL_OUTPUT_LIMIT] if extra else mcp_result_to_text(res)
        except Exception as e:
            return f"TOOL ERROR calling {real}: {e!r}"

    async def run(self):
        """Hunt every connected platform at the same time; each has its own conversation with the model."""
        if PRICERS_PER_PLATFORM > 0:
            summaries = await asyncio.gather(*(self._run_split(p) for p in self.sessions))
            self.summary = "\n".join(f"{p}: {t.strip()}" for p, t in zip(self.sessions, summaries) if t and t.strip())
        else:
            jobs = []   # (platform, worker number, its slice of the search terms)
            for p in self.sessions:
                for n, terms in enumerate(split_terms(self.args.queries, WORKERS_PER_PLATFORM)):
                    jobs.append((p, n, terms))
            per_platform = {p: sum(1 for j in jobs if j[0] == p) for p in self.sessions}
            if len(jobs) > len(self.sessions):
                self.emit({"type": "status", "text": f"Hunting with {len(jobs)} parallel sub-agents ({', '.join(f'{p} x{c}' for p, c in per_platform.items())})"})
            summaries = await asyncio.gather(*(self._run_platform(p, worker=n, terms=t, workers=per_platform[p]) for p, n, t in jobs))
            self.summary = "\n".join(f"{p}: {t.strip()}" for (p, _, _), t in zip(jobs, summaries) if t and t.strip())
        if len(self.sessions) > 1:
            await self.cross_check()

    def _start_cross_check(self, deal: Deal) -> None:
        """Price this deal's dish on the other app(s) in the background: one sub-agent per other platform (workers 100+)."""
        if not self._cross_started:
            self.emit({"type": "status", "text": "Checking top deal(s) on the other app for a fairer price..."})
        self._cross_started.add(deal.key())
        for other in (p for p in self.sessions if p != deal.platform):
            self._cross_workers += 1
            self._cross_tasks.append(asyncio.create_task(self._cross_one(100 + self._cross_workers, deal, other)))

    def _maybe_cross_check(self, deal: Deal) -> None:
        """Called as each deal is recorded: if it is among the cheapest so far, start its cross-check now instead of after the hunt."""
        if len(self.sessions) < 2 or deal.source == "cross_check" or self.error or deal.key() in self._cross_started:
            return
        cheapest = sorted((d for d in self.deals if d.source != "cross_check"), key=lambda d: d.final_payable)[:CROSS_CHECK_DEALS]
        if deal in cheapest and len(self._cross_started) < CROSS_CHECK_DEALS + CROSS_CHECK_EXTRA:
            self._start_cross_check(deal)

    async def _run_split(self, platform: str) -> str:
        """Scouts search and read menus and queue candidates; pricers take them off the queue and read the real bills, as they arrive."""
        terms = split_terms(self.args.queries, SCOUTS_PER_PLATFORM)
        self.emit({"type": "status", "text": f"{platform}: {len(terms)} scout(s) + {PRICERS_PER_PLATFORM} pricer(s) working in parallel"})

        async def scouts() -> list[str]:
            try:
                return await asyncio.gather(*(self._run_platform(platform, worker=10 + i, terms=t, role="scout", max_turns=SCOUT_TURNS) for i, t in enumerate(terms)))
            finally:
                for _ in range(PRICERS_PER_PLATFORM):   # whatever happened, no pricer waits for a candidate that will never come
                    self._end_of_candidates(platform)

        out = await asyncio.gather(scouts(), *(self._run_platform(platform, worker=i, role="pricer") for i in range(PRICERS_PER_PLATFORM)))
        return "\n".join(t.strip() for t in [*out[0], *out[1:]] if t and t.strip())

    async def cross_check(self):
        """Wait for the cross-checks already running, and start any that the final cheapest deals still lack."""
        if len(self.sessions) > 1 and not self.error:
            final = sorted((d for d in self.deals if d.source != "cross_check"), key=lambda d: d.final_payable)[:CROSS_CHECK_DEALS]
            missing = [d for d in final if d.key() not in self._cross_started]
            if missing and self._cross_started:
                self.emit({"type": "status", "text": f"Checking {len(missing)} top deal(s) on the other app for a fairer price..."})
            for d in missing:
                self._start_cross_check(d)
        await asyncio.gather(*self._cross_tasks)

    async def _cross_one(self, worker: int, deal: Deal, other: str) -> None:
        task = (f"Cross-check, not a new hunt. {deal.platform} offers '{deal.items}' from {deal.restaurant} for ₹{deal.final_payable:.0f} all-in. "
                f"On {other} ONLY, find the same restaurant (or the same chain nearest to the address) and the same main dish, "
                f"build the cart with the same items, apply its best offer, read the bill and call record_deal with source=\"cross_check\". "
                f"If {other} does not sell it, call finish saying so. Stop after at most {CROSS_CHECK_TURNS} steps. Clear the cart when done.")
        try:
            await self._run_platform(other, task=task, max_turns=CROSS_CHECK_TURNS, worker=worker)
        except Exception as e:   # a failed cross-check must not lose the deals already found
            self.emit({"type": "step", "text": f"{other}: cross-check of {deal.restaurant} failed: {describe(e)}"})

    def _openai_tools(self, platform: str, role: str = "hunt") -> list[dict]:
        """The tools this platform's conversation may use: the local ones for its role plus that platform's own (scouts: only the reading ones)."""
        local = {"hunt": ("record_deal", "finish"), "scout": ("propose_candidate", "finish"), "pricer": ("record_deal", "next_candidate", "finish")}[role]
        mine = f"{platform}__"
        return [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
                for t in self.tools if t["name"] in local or (t["name"].startswith(mine) and (role != "scout" or is_parallel_safe(t["name"])))]

    def _switched(self, old: str, new: str, why: str) -> None:
        text = f"Model {old} failed ({why}). Switched to {new}."
        print(text)
        self.emit({"type": "status", "text": text})

    async def _generate(self, messages: list[dict], platform: str, role: str = "hunt"):
        """One model call. Switches to the next free model on failure. Scouts handle no money, so they try the fast models first."""
        tools = self._openai_tools(platform, role)
        if role == "scout" and SCOUT_MODELS:
            return await router.generate(messages, tools, self._switched, prefer=tuple(SCOUT_MODELS))
        return await router.generate(messages, tools, self._switched)

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

    async def _run_platform(self, platform: str, task: str | None = None, max_turns: int = MAX_TURNS,
                            worker: int = 0, terms: str | None = None, workers: int = 1, role: str = "hunt") -> str:
        """One sub-agent's whole conversation. `terms` narrows it to a slice of the search terms; `workers` shares the cart-check allowance."""
        state = SimpleNamespace(n=worker, holds=False, platform=platform)
        token = _WORKER.set(state)
        try:
            return await self._converse(platform, task, max_turns, terms, workers, role)
        finally:
            self._release_cart(platform)   # never leave the platform's cart locked behind a worker that ended
            _WORKER.reset(token)

    async def _converse(self, platform: str, task: str | None, max_turns: int, terms: str | None, workers: int, role: str = "hunt") -> str:
        args = self.args
        if terms is not None:
            args = copy.copy(self.args)
            args.queries = terms
            if role == "hunt" and workers > 1:
                args.max_carts = max(1, math.ceil(self.args.max_carts / workers))
        messages = [
            {"role": "system", "content": build_prompt(args, role)},
            {"role": "user", "content": task or ROLE_START.get(role) or (
                f"Start the hunt now. Budget ₹{self.args.budget} all-in. Work ONLY on {platform}; "
                f"the other platform is handled separately. Record each deal the moment its bill is verified.")}]
        stale: list[tuple[int, dict]] = []  # (turn, tool-result message) so old results can be shrunk
        for turn in range(max_turns):
            try:
                msg = await self._generate(messages, platform, role)
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
