import asyncio

import pytest

from app import config
from app.services import models, nvidia_models as nv


def tool(name, description="d", props=None):
    return {"type": "function", "function": {"name": name, "description": description,
                                             "parameters": {"type": "object", "properties": props or {}}}}


def test_unused_tools_are_dropped_and_text_is_clipped():
    tools = nv.slim_tools([tool("zomato__create_address"), tool("swiggy__order_history"),
                           tool("swiggy__search_menu", "d" * 900, {"q": {"type": "string", "description": "z" * 500}})])
    assert [t["function"]["name"] for t in tools] == ["swiggy__search_menu"]
    f = tools[0]["function"]
    assert len(f["description"]) == nv.DESCRIPTION_CHARS
    assert len(f["parameters"]["properties"]["q"]["description"]) == nv.FIELD_CHARS


def call(i, q):
    return {"role": "assistant", "content": "", "tool_calls": [{"id": f"c{i}", "type": "function", "function": {"name": "s", "arguments": "{}"}}]}


def result(i, text):
    return {"role": "tool", "tool_call_id": f"c{i}", "content": text}


def test_tool_results_are_clipped(monkeypatch):
    monkeypatch.setattr(config, "NVIDIA_TOOL_RESULT_CHARS", 50)
    out = nv.fit([{"role": "system", "content": "s"}, {"role": "user", "content": "go"}, call(1, "a"), result(1, "x" * 500)], [])
    assert out[-1]["content"].endswith("[clipped]") and len(out[-1]["content"]) < 80


def test_long_hunts_drop_oldest_steps_but_keep_pairs_and_the_start(monkeypatch):
    monkeypatch.setattr(config, "NVIDIA_MAX_INPUT_TOKENS", 1500)
    messages = [{"role": "system", "content": "sys"}, {"role": "user", "content": "start the hunt"}]
    for i in range(30):
        messages += [call(i, f"step{i}"), result(i, f"result{i} " + "w" * 400)]
    out = nv.fit(messages, [])
    assert out[0]["role"] == "system" and out[1]["content"].startswith("start the hunt") and nv.TRIM_NOTE.strip() in out[1]["content"]
    assert "result29" in out[-1]["content"] and not any("result0 " in str(m) for m in out)
    for i, m in enumerate(out):                                       # a tool result always follows its assistant call
        if m["role"] == "tool":
            j = i
            while out[j]["role"] == "tool":
                j -= 1
            assert out[j]["role"] == "assistant" and out[j]["tool_calls"]


def test_no_key_is_a_clear_unswitchable_error(monkeypatch):
    monkeypatch.setattr(config, "NVIDIA_API_KEY", "")
    with pytest.raises(nv.NvidiaModelError) as e:
        asyncio.run(nv.chat("m", [], []))
    assert e.value.code == 401 and "NVIDIA_API_KEY" in str(e.value) and not models.is_switchable(e.value)


def test_non_chat_reply_is_a_switchable_error_not_a_crash(monkeypatch):
    class Client:
        class chat:
            class completions:
                @staticmethod
                async def create(**kw):
                    return "OK"       # what a proxy or a moved endpoint answers
    monkeypatch.setattr(config, "NVIDIA_API_KEY", "k")
    monkeypatch.setattr(nv, "_get_client", lambda: Client)
    with pytest.raises(nv.NvidiaModelError) as e:
        asyncio.run(nv.chat("m", [{"role": "user", "content": "go"}], []))
    assert models.is_switchable(e.value)


def test_discovery_skips_models_that_cannot_chat():
    assert nv.NOT_CHAT.search("nvidia/nv-embedqa-mistral-7b-v2") and nv.NOT_CHAT.search("nvidia/llama-3.1-nemoguard-8b-content-safety")
    assert not nv.NOT_CHAT.search("openai/gpt-oss-20b") and not nv.NOT_CHAT.search("minimaxai/minimax-m3.1-flash")
