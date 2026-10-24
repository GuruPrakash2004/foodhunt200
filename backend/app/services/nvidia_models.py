"""NVIDIA NIM (build.nvidia.com free preview models): the one place the agent's model calls leave this app.

NVIDIA's API is OpenAI-compatible, so the agent keeps its conversation as OpenAI-style messages and tools.
The request is compacted before it is sent (unused tools left out, descriptions and tool results clipped, the oldest
steps dropped) so it stays small and fast on the shared free endpoints.
"""
import json
import re

from app import config

MAX_OUTPUT_TOKENS = 4096
DESCRIPTION_CHARS = 300           # tool descriptions are clipped to this
FIELD_CHARS = 90                  # descriptions of single arguments inside a tool's schema are clipped to this
# Tools a price hunt never uses. Leaving them out of the request saves thousands of tokens on every call.
UNUSED_TOOLS = re.compile(r"create_address|delete_address|bind_user|verify_code|order_history|order_tracking|food_orders?$|"
                          r"order_details|delivery_status|report_error|payment|menu_items_listing", re.I)
TRIM_NOTE = ("\n\n(Earlier steps of this hunt were trimmed to fit the model's input limit. "
             "Deals already recorded stay recorded; carry on from the latest results.)")
# Chat models only: embeddings, safety/guard, reward, vision, speech and code-only models cannot drive a hunt.
NOT_CHAT = re.compile(r"embed|rerank|guard|safety|reward|parse|clip|vision|vlm|vila|neva|fuyu|kosmos|deplot|detector|calibration|"
                      r"cosmos|translate|riva|codellama|starcoder|codegemma|codestral|coder|code-instruct|diffusion|llama2|gemma-2b|zamba|jamba", re.I)

_client = None


class NvidiaModelError(Exception):
    """Carries an HTTP-like code so models.is_switchable / cooldown_for treat it like any model failure."""

    def __init__(self, code: int, message: str):
        super().__init__(f"{code} NVIDIA: {message}")
        self.code = code


def _get_client():
    global _client
    if _client is None:
        from openai import AsyncOpenAI
        _client = AsyncOpenAI(base_url=config.NVIDIA_BASE_URL, api_key=config.NVIDIA_API_KEY, max_retries=0)
    return _client


def _tokens(obj) -> int:
    """Rough token estimate (about 4 characters per token), good enough to stay under the input budget."""
    return len(json.dumps(obj, ensure_ascii=False)) // 4 + 1


def _clean_schema(schema):
    if isinstance(schema, dict):
        out = {k: _clean_schema(v) for k, v in schema.items() if k not in ("$schema", "$id", "examples", "title")}
        if isinstance(out.get("description"), str):
            out["description"] = out["description"][:FIELD_CHARS]
        return out
    if isinstance(schema, list):
        return [_clean_schema(v) for v in schema]
    return schema


def slim_tools(tools: list[dict]) -> list[dict]:
    """OpenAI-style tool definitions without the tools a hunt never uses, with shortened descriptions."""
    out = []
    for t in tools:
        f = t["function"]
        if UNUSED_TOOLS.search(f["name"].split("__", 1)[-1]):
            continue
        out.append({"type": "function", "function": {
            "name": f["name"], "description": (f.get("description") or "")[:DESCRIPTION_CHARS],
            "parameters": _clean_schema(f.get("parameters") or {"type": "object", "properties": {}})}})
    return out


def _clip(text: str) -> str:
    limit = config.NVIDIA_TOOL_RESULT_CHARS
    return text if len(text) <= limit else text[:limit] + " …[clipped]"


def _groups(messages: list[dict]) -> list[list[dict]]:
    """Messages grouped so an assistant's tool calls always stay together with their results."""
    groups: list[list[dict]] = []
    for m in messages:
        if m["role"] == "tool" and groups and groups[-1][0]["role"] == "assistant":
            groups[-1].append({**m, "content": _clip(str(m["content"]))})
        else:
            groups.append([m])
    return groups


def fit(messages: list[dict], tools: list[dict]) -> list[dict]:
    """The system prompt, the opening request and as many of the newest steps as fit the input budget."""
    system = [m for m in messages if m["role"] == "system"]
    body = _groups([m for m in messages if m["role"] != "system"])
    first = body[:1] if body and body[0][0]["role"] == "user" else []
    rest = body[len(first):]
    budget = config.NVIDIA_MAX_INPUT_TOKENS - _tokens(tools) - _tokens(system) - _tokens(first) - 50
    kept: list[list[dict]] = []
    used = 0
    for g in reversed(rest):                      # newest steps are the ones that matter
        size = _tokens(g)
        if kept and used + size > budget:
            break
        kept.insert(0, g)
        used += size
    if first and len(kept) < len(rest):
        first = [[{**first[0][0], "content": first[0][0]["content"] + TRIM_NOTE}]]
    return system + [m for g in first + kept for m in g]


async def chat(model: str, messages: list[dict], tools: list[dict]):
    """One model call. Returns the assistant message (content + tool_calls). Raises NvidiaModelError."""
    import openai

    if not config.NVIDIA_API_KEY:
        raise NvidiaModelError(401, "NVIDIA_API_KEY is not set. Add it to backend/.env (key from https://build.nvidia.com).")
    tools = slim_tools(tools)
    try:
        resp = await _get_client().chat.completions.create(
            model=model, messages=fit(messages, tools), tools=tools or None, max_tokens=MAX_OUTPUT_TOKENS, temperature=0.2)
    except openai.AuthenticationError as e:
        raise NvidiaModelError(401, f"key rejected ({e})") from e
    except openai.APIStatusError as e:
        raise NvidiaModelError(e.status_code, str(e)[:300]) from e
    except openai.APITimeoutError as e:
        raise NvidiaModelError(408, "timed out") from e
    except openai.APIConnectionError as e:
        raise NvidiaModelError(503, f"connection failed ({e})") from e
    if not getattr(resp, "choices", None):   # e.g. a plain-text reply from a proxy, or an empty answer
        raise NvidiaModelError(502, f"unexpected reply: {str(resp)[:80]!r}")
    return resp.choices[0].message


async def discover() -> list[str]:
    """Every chat model the key can see on build.nvidia.com. A model that cannot call tools is benched by the router
    on its first failure, so this list only has to be roughly right."""
    if not config.NVIDIA_API_KEY:
        return []
    try:
        listed = await _get_client().models.list()
        return sorted({m.id for m in listed.data if not NOT_CHAT.search(m.id)})
    except Exception:   # listing is a bonus; the configured models still work without it
        return []
