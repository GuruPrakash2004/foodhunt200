import argparse
import asyncio
import time
from types import SimpleNamespace

from app.services.agent import Hunt, is_parallel_safe


def test_reads_are_parallel_but_cart_changes_are_not():
    assert is_parallel_safe("zomato__search_restaurants")
    assert is_parallel_safe("swiggy__get_menu")
    assert not is_parallel_safe("zomato__add_to_cart")
    assert not is_parallel_safe("zomato__apply_coupon")
    assert not is_parallel_safe("zomato__clear_cart")


class TimedHunt(Hunt):
    def __init__(self):
        super().__init__(argparse.Namespace(budget=200, verbose=False))
        self.order = []

    async def call_tool(self, name, args):
        self.order.append(("start", name))
        await asyncio.sleep(0.2)
        self.order.append(("end", name))
        return name


def test_run_calls_overlaps_reads_and_keeps_result_order():
    hunt = TimedHunt()
    calls = [SimpleNamespace(name=n, args={}) for n in
             ["z__search_a", "z__search_b", "z__add_to_cart", "z__get_menu"]]
    t0 = time.perf_counter()
    out = asyncio.run(hunt._run_calls(calls))
    elapsed = time.perf_counter() - t0
    assert out == ["z__search_a", "z__search_b", "z__add_to_cart", "z__get_menu"]  # same order as the calls
    assert elapsed < 0.55                      # 3 reads overlapped (0.2s) + 1 cart change (0.2s), not 4 x 0.2s
    starts = [n for kind, n in hunt.order if kind == "start"]
    assert starts[-1] == "z__add_to_cart" or starts.index("z__add_to_cart") >= 2


def test_describe_unwraps_task_group_errors():
    from app.services.errors import describe
    class FakeAPIError(Exception):
        pass
    inner = ExceptionGroup("unhandled errors in a TaskGroup", [FakeAPIError("quota exceeded")])
    outer = ExceptionGroup("unhandled errors in a TaskGroup", [inner])
    assert describe(outer) == "FakeAPIError: quota exceeded"


# --- the conversation loop, with a scripted model ---------------------------------------------

def _msg(text="", calls=()):
    tcs = [SimpleNamespace(id=f"id{i}", function=SimpleNamespace(name=n, arguments=a)) for i, (n, a) in enumerate(calls)]
    return SimpleNamespace(content=text, tool_calls=tcs)


def test_agent_loop_runs_tools_feeds_results_back_and_finishes(monkeypatch):
    from app.services import agent as agent_mod
    seen = []
    script = [_msg("checking", [("swiggy__search_menu", '{"query": "thali"}')]),
              _msg("", [("swiggy__search_menu", "{not json")]),          # a broken argument string becomes {}
              _msg("", [("finish", '{"summary": "best is the thali"}')])]

    async def generate(messages, tools, on_switch=None):
        seen.append(([m["role"] for m in messages], [t["function"]["name"] for t in tools]))
        return script[len(seen) - 1]
    monkeypatch.setattr(agent_mod.router, "generate", generate)

    class H(Hunt):
        async def call_tool(self, name, args):
            return f"result of {name} {args}"
    h = H(argparse.Namespace(budget=200, max_carts=6, diet="any", address="Home", queries="thali", extra_items=2, verbose=False))
    h.tools += [{"name": "swiggy__search_menu", "description": "d", "input_schema": {"type": "object", "properties": {}}},
                {"name": "zomato__search", "description": "d", "input_schema": {"type": "object", "properties": {}}}]
    out = asyncio.run(h._run_platform("swiggy"))
    assert out == "best is the thali"
    assert seen[0][0] == ["system", "user"] and seen[1][0] == ["system", "user", "assistant", "tool"]
    assert "zomato__search" not in seen[0][1] and "swiggy__search_menu" in seen[0][1]   # only this platform's tools, plus record_deal / finish
