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


# --- automatic model switching -------------------------------------------------

class FakeAPIError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def make_client(behaviour):
    """behaviour: model name -> exception to raise, 'slow' to hang, or a value to return."""
    calls = []

    async def generate_content(model, contents, config):
        calls.append(model)
        result = behaviour[model]
        if result == "slow":
            await asyncio.sleep(10)
        if isinstance(result, Exception):
            raise result
        return result

    models = SimpleNamespace(generate_content=generate_content)
    return SimpleNamespace(aio=SimpleNamespace(models=models)), calls


def test_switches_to_working_model_and_remembers_it(monkeypatch):
    from app import config
    from app.services.models import ModelRouter
    monkeypatch.setattr(config, "FALLBACK_MODELS", [])
    r = ModelRouter()
    r.preferred, r.current, r.discovered = ["old-model", "good-model"], "old-model", []
    client, calls = make_client({"old-model": FakeAPIError(404, "no longer available"), "good-model": "OK"})
    switched = []
    out = asyncio.run(r.generate(client, "hi", lambda: None, lambda a, b, why: switched.append((a, b))))
    assert out == "OK" and calls == ["old-model", "good-model"] and switched == [("old-model", "good-model")]
    asyncio.run(r.generate(client, "again", lambda: None))
    assert calls[-1] == "good-model" and calls.count("old-model") == 1   # bad model not retried


def test_slow_model_times_out_and_next_one_is_used(monkeypatch):
    from app import config
    from app.services.models import ModelRouter
    monkeypatch.setattr(config, "MODEL_TIMEOUT_S", -4.9)  # wait_for gets 0.1s
    r = ModelRouter()
    r.preferred, r.current, r.discovered = ["slow-model", "fast-model"], "slow-model", []
    client, calls = make_client({"slow-model": "slow", "fast-model": "OK"})
    assert asyncio.run(r.generate(client, "hi", lambda: None)) == "OK"
    assert calls == ["slow-model", "fast-model"]


def test_bad_api_key_does_not_trigger_switching():
    from app.services.models import is_switchable
    assert not is_switchable(FakeAPIError(401, "unauthorized"))
    assert not is_switchable(FakeAPIError(400, "API key not valid"))
    assert is_switchable(FakeAPIError(429, "quota"))
    assert is_switchable(FakeAPIError(503, "overloaded"))


def test_describe_unwraps_task_group_errors():
    from app.services.errors import describe
    inner = ExceptionGroup("unhandled errors in a TaskGroup", [FakeAPIError(429, "quota exceeded")])
    outer = ExceptionGroup("unhandled errors in a TaskGroup", [inner])
    assert describe(outer) == "FakeAPIError: quota exceeded"


def test_rate_limited_models_cool_down_briefly_and_choice_is_remembered(monkeypatch, tmp_path):
    from app import config
    from app.services.models import ModelRouter
    monkeypatch.setattr(config, "LAST_MODEL_FILE", tmp_path / "last.txt")
    r = ModelRouter()
    r.preferred, r.current, r.discovered = ["quota-model", "ok-model"], "quota-model", []
    client, calls = make_client({"quota-model": FakeAPIError(429, "quota"), "ok-model": "OK"})
    assert asyncio.run(r.generate(client, "hi", lambda: None)) == "OK"
    assert (tmp_path / "last.txt").read_text() == "ok-model"
    assert ModelRouter().current == "ok-model"                         # next start begins on the model that worked
    assert 0 < r.bad_until["quota-model"] - __import__("time").monotonic() <= 61   # quota failures cool down for ~1 minute


def test_pauses_and_retries_when_every_model_is_busy(monkeypatch):
    from app.services import models
    from app.services.models import ModelRouter
    monkeypatch.setattr(models, "RETRY_PAUSES", (0.01,))
    r = ModelRouter()
    r.preferred, r.current, r.discovered = ["a", "b"], "a", []
    state = {"round": 0}
    calls = []

    async def generate_content(model, contents, config):
        calls.append(model)
        if len(calls) <= 2:                      # first round: both busy
            raise FakeAPIError(503, "high demand")
        return "OK"

    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
    assert asyncio.run(r.generate(client, "hi", lambda: None)) == "OK"
    assert len(calls) == 3
