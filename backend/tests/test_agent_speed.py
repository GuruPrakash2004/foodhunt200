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


def test_search_terms_are_dealt_out_to_parallel_workers():
    from app.services.agent import split_terms
    assert split_terms("thali, biryani, rice bowl, meals, dosa, combo, rolls", 3) == ["thali, meals, rolls", "biryani, dosa", "rice bowl, combo"]
    assert split_terms("thali, biryani", 5) == ["thali", "biryani"]   # never more workers than terms
    assert split_terms("thali", 3) == ["thali"]


def test_workers_take_turns_on_one_platform_cart():
    async def go():
        h = Hunt(argparse.Namespace(budget=200, verbose=False))
        order = []

        async def worker(n):
            from app.services.agent import _WORKER
            _WORKER.set(SimpleNamespace(n=n, holds=False))
            await h._take_cart("zomato")
            order.append(("in", n)); await asyncio.sleep(0.05); order.append(("out", n))
            h._release_cart("zomato")
        await asyncio.gather(worker(0), worker(1))
        return order
    order = asyncio.run(go())
    assert order[0][0] == "in" and order[1][0] == "out"   # the second worker only enters after the first has left


def test_cross_check_starts_as_soon_as_a_cheap_deal_is_recorded():
    from app.services.pricing import Deal

    async def go():
        started = []

        class H(Hunt):
            async def _cross_one(self, worker, deal, other):
                started.append((deal.restaurant, other))
        h = H(argparse.Namespace(budget=200, verbose=False))
        h.sessions = {"zomato": object(), "swiggy": object()}
        for name, price in [("A", 150), ("B", 120), ("C", 130), ("D", 190)]:
            d = Deal(platform="zomato", restaurant=name, items="x", item_total=price, final_payable=price)
            h.deals.append(d)
            h._maybe_cross_check(d)
        await h.cross_check()
        return started
    started = asyncio.run(go())
    assert sorted(r for r, _ in started) == ["A", "B", "C"] and all(o == "swiggy" for _, o in started)   # D never made the cheapest three


def test_scouts_queue_candidates_and_pricers_take_them_cheapest_first():
    async def go():
        h = Hunt(argparse.Namespace(budget=200, max_carts=2, verbose=False))
        assert "Queued" in h.propose("zomato", {"restaurant": "A", "items": "Thali", "est_price": 150})
        assert h.propose("zomato", {"restaurant": "a", "items": "thali", "est_price": 150}) == "Already queued."
        h.propose("zomato", {"restaurant": "B", "items": "Roll", "est_price": 90})
        h._end_of_candidates("zomato")
        first = json.loads(await h.next_candidate("zomato"))
        second = json.loads(await h.next_candidate("zomato"))
        third = await h.next_candidate("zomato")          # the allowance (max_carts=2) is used up
        return first, second, third
    import json
    first, second, third = asyncio.run(go())
    assert (first["restaurant"], second["restaurant"]) == ("B", "A") and third.startswith("NO MORE")


def test_pricer_waits_for_scouts_then_stops_when_they_are_done():
    async def go():
        h = Hunt(argparse.Namespace(budget=200, max_carts=5, verbose=False))
        waiting = asyncio.create_task(h.next_candidate("swiggy"))
        await asyncio.sleep(0.05)
        assert not waiting.done()                          # nothing queued yet: the pricer waits
        h._end_of_candidates("swiggy")
        return await waiting, await h.next_candidate("swiggy")   # the end marker is left for every pricer
    a, b = asyncio.run(go())
    assert a.startswith("NO MORE") and b.startswith("NO MORE")


def test_scouts_only_get_reading_tools():
    h = Hunt(argparse.Namespace(budget=200, verbose=False))
    h.tools += [{"name": n, "description": "d", "input_schema": {"type": "object", "properties": {}}}
                for n in ("swiggy__search_menu", "swiggy__update_food_cart", "swiggy__apply_food_coupon")]
    names = lambda role: {t["function"]["name"] for t in h._openai_tools("swiggy", role)}
    assert names("scout") == {"swiggy__search_menu", "propose_candidate", "finish"}
    assert "swiggy__update_food_cart" in names("pricer") and "next_candidate" in names("pricer") and "propose_candidate" not in names("pricer")
    assert "next_candidate" not in names("hunt")


def test_all_prompt_roles_fill_in():
    from app.services.agent import build_prompt
    a = argparse.Namespace(budget=200, max_carts=6, diet="any", address="Home", queries="thali", extra_items=2)
    for role in ("hunt", "scout", "pricer"):
        assert "{" not in build_prompt(a, role)
