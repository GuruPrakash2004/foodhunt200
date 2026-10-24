import asyncio
import time
from types import SimpleNamespace

import pytest

from app import config
from app.services import models, nvidia_models
from app.services.models import ModelRouter, cooldown_for, is_switchable


class Err(Exception):
    def __init__(self, code, msg=""):
        super().__init__(msg or str(code))
        self.code = code


def fake_chat(monkeypatch, behaviour):
    """behaviour: model -> exception to raise, 'slow' to hang, or a value to return. Returns the list of models called."""
    calls = []

    async def chat(model, messages, tools):
        calls.append(model)
        result = behaviour.get(model, "OK")
        if result == "slow":
            await asyncio.sleep(10)
        if isinstance(result, Exception):
            raise result
        return result
    monkeypatch.setattr(nvidia_models, "chat", chat)

    async def no_discovery():
        return []
    monkeypatch.setattr(nvidia_models, "discover", no_discovery)
    return calls


def router(tmp_path, monkeypatch, models_=("a", "b")):
    monkeypatch.setattr(config, "LAST_MODEL_FILE", tmp_path / "last.txt")
    r = ModelRouter()
    r.preferred, r.current = list(models_), models_[0]
    return r


def test_which_errors_switch_models():
    assert is_switchable(Err(429, "quota")) and is_switchable(Err(503, "overloaded")) and is_switchable(Err(404, "gone"))
    assert is_switchable(Err(400, "tools not supported")) and is_switchable(asyncio.TimeoutError())
    assert not is_switchable(Err(401, "key rejected"))                    # a bad key would fail on every model
    assert not is_switchable(ValueError("a bug"))


def test_cooldown_grows_with_repeated_failures():
    assert cooldown_for(503, 1) == 120 and cooldown_for(503, 2) == 240 and cooldown_for(503, 9) == 1800
    assert cooldown_for(429, 1) == 60 and cooldown_for(404, 1) == 3600


def test_switches_to_next_model_and_remembers_it(monkeypatch, tmp_path):
    calls = fake_chat(monkeypatch, {"a": Err(404, "no longer available")})
    r = router(tmp_path, monkeypatch)
    switched = []
    assert asyncio.run(r.generate([], [], lambda a, b, why: switched.append((a, b)))) == "OK"
    assert calls == ["a", "b"] and switched == [("a", "b")]
    assert (tmp_path / "last.txt").read_text() == "b" and ModelRouter().current == "b"   # next start begins on the model that worked
    asyncio.run(r.generate([], []))
    assert calls[-1] == "b" and calls.count("a") == 1                     # the bad model is not retried


def test_repeat_offender_is_skipped_for_the_rest_of_the_hunt(monkeypatch, tmp_path):
    calls = fake_chat(monkeypatch, {"a": Err(503, "overloaded")})
    r = router(tmp_path, monkeypatch)

    async def go():
        return [await r.generate([], []) for _ in range(3)]
    assert asyncio.run(go()) == ["OK"] * 3 and calls.count("a") == 1
    assert r.bad_until["a"] > time.monotonic() + 100


def test_slow_model_times_out_and_next_one_is_used(monkeypatch, tmp_path):
    calls = fake_chat(monkeypatch, {"a": "slow"})
    monkeypatch.setattr(config, "MODEL_TIMEOUT_S", -4.9)                  # wait_for gets 0.1s
    r = router(tmp_path, monkeypatch)
    assert asyncio.run(r.generate([], [])) == "OK" and calls == ["a", "b"]


def test_rejected_key_stops_instead_of_trying_every_model(monkeypatch, tmp_path):
    calls = fake_chat(monkeypatch, {"a": nvidia_models.NvidiaModelError(401, "key rejected")})
    r = router(tmp_path, monkeypatch)
    with pytest.raises(nvidia_models.NvidiaModelError):
        asyncio.run(r.generate([], []))
    assert calls == ["a"]


def test_other_chat_models_on_the_key_are_tried_after_the_configured_ones(monkeypatch, tmp_path):
    calls = fake_chat(monkeypatch, {"a": Err(404, "x"), "b": Err(404, "x")})

    async def found():
        return ["c", "d"]
    monkeypatch.setattr(nvidia_models, "discover", found)
    r = router(tmp_path, monkeypatch)
    assert asyncio.run(r.generate([], [])) == "OK" and calls == ["a", "b", "c"]


def test_pauses_and_retries_when_every_model_is_busy(monkeypatch, tmp_path):
    monkeypatch.setattr(models, "RETRY_PAUSES", (0.01,))
    state = {"n": 0}
    calls = []

    async def chat(model, messages, tools):
        calls.append(model)
        state["n"] += 1
        if state["n"] <= 2:
            raise Err(503, "high demand")
        return "OK"
    monkeypatch.setattr(nvidia_models, "chat", chat)

    async def none():
        return []
    monkeypatch.setattr(nvidia_models, "discover", none)
    r = router(tmp_path, monkeypatch)
    assert asyncio.run(r.generate([], [])) == "OK" and len(calls) == 3


def test_gemini_names_in_old_settings_are_ignored():
    assert config._names("gemini-3.8-flash, nvidia:openai/gpt-oss-20b,") == ["openai/gpt-oss-20b"]
