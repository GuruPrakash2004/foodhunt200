"""One-off calls to a platform's MCP server, outside a hunt: list saved addresses, put a deal's items in the cart.

Only read and cart tools are used. Anything matching config.BLOCKED_TOOLS (order, payment, ...) is refused here as well.
"""
import json
import re
from contextlib import AsyncExitStack, asynccontextmanager

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from app import config
from app.services.oauth import make_oauth

ADDRESS_TOOL = re.compile(r"^(get|list|fetch)_\w*address", re.I)   # lookups only; create_address / delete_address are never called
CLEAR_CART = re.compile(r"(clear|empty|flush)", re.I)   # Swiggy: flush_food_cart. Zomato has none: create_cart replaces the cart
LABEL_KEYS = ("addressTag", "label", "tag", "address_type", "addressCategory", "title")   # Swiggy sends addressTag (Home, Office...)
TEXT_KEYS = ("addressLine", "location_name", "address", "full_address", "display_address", "formatted_address", "text")   # never phone numbers


def has_token(name: str) -> bool:
    if config.HOSTED:
        from app.services.oauth import DbTokenStorage
        return bool(DbTokenStorage(name)._load().get("tokens"))
    try:
        return bool(json.loads((config.TOKEN_DIR / f"{name}.json").read_text()).get("tokens"))
    except (FileNotFoundError, json.JSONDecodeError):
        return False


class LoginNeeded(Exception):
    pass


@asynccontextmanager
async def platform_session(name: str):
    """Yield (session, tool names) for one platform. Never opens a login tab: the user logs in by running a hunt (hosted: the Connect button)."""
    if not has_token(name):
        raise LoginNeeded(f"Log in to {config.PLATFORM_LABELS.get(name, name)} first: run one hunt and finish the login in the browser tab.")
    cfg = config.PLATFORMS[name]
    async with AsyncExitStack() as stack:
        auth = make_oauth(name, cfg["url"], cfg["port"], cfg["client_id"], cfg["client_secret"])
        read, write, _ = await stack.enter_async_context(streamablehttp_client(cfg["url"], auth=auth))
        session = await stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        yield session, [t.name for t in (await session.list_tools()).tools]


def result_text(result) -> str:
    return "\n".join(getattr(c, "text", None) or "" for c in result.content)


def _first(d: dict, keys) -> str:
    for k in keys:
        v = d.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _dicts(node):
    """Every dict that looks like one address in a nested JSON answer."""
    if isinstance(node, dict):
        if _first(node, TEXT_KEYS) or _first(node, LABEL_KEYS):
            yield node
        else:
            for v in node.values():
                yield from _dicts(v)
    elif isinstance(node, list):
        for v in node:
            yield from _dicts(v)


def parse_addresses(data) -> list[dict]:
    """Best effort. `data` is the tool's structured answer, or its text (JSON or one address per line).
    Returns [{label, text}] without duplicates; label is what the hunt is told to deliver to."""
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            data = [{"text": re.sub(r"^[\s\-*\d.)]+", "", line).strip()} for line in data.splitlines() if line.strip()]
    out, seen = [], set()
    for d in _dicts(data):
        tag, text = _first(d, LABEL_KEYS), _first(d, TEXT_KEYS)
        label = (f"{tag} · {text}" if tag and text and tag.lower() not in text.lower() else text or tag)[:70]
        if label.lower() not in seen:
            seen.add(label.lower())
            out.append({"label": label, "text": text or tag})
    return out


async def list_addresses(name: str) -> list[dict]:
    async with platform_session(name) as (session, tools):
        picks = [t for t in tools if ADDRESS_TOOL.search(t) and not config.BLOCKED_TOOLS.search(t)]
        if not picks:
            raise RuntimeError(f"{name} has no tool that lists saved addresses.")
        res = await session.call_tool(picks[0], {})
        if res.isError:
            raise RuntimeError(result_text(res)[:200] or "address tool failed")
        return parse_addresses(res.structuredContent or result_text(res))


def cart_link(platform: str, calls: list[dict], answers: list[str]) -> str:
    """A link that opens the cart (Zomato) or the restaurant (Swiggy) in the platform's own app or site, or ''."""
    if platform == "zomato":
        for text in reversed(answers):   # create_cart answers with a shareable link that opens the cart
            try:
                link = json.loads(text)["cart"].get("shareable_link")
            except (ValueError, KeyError, TypeError, AttributeError):
                continue
            if isinstance(link, str) and link.startswith("https://"):
                return link
    if platform == "swiggy":
        for call in reversed(calls):
            rid = str(call["args"].get("restaurantId") or "").strip()
            if rid.isdigit():
                return f"https://www.swiggy.com/menu/{rid}"
    return ""


async def add_to_cart(name: str, calls: list[dict]) -> dict:
    """Empty the cart, then repeat the cart calls the hunt made for this deal. Returns {answer, link}."""
    async with platform_session(name) as (session, tools):
        for call in calls:
            if call["tool"] not in tools or config.BLOCKED_TOOLS.search(call["tool"]):
                raise RuntimeError(f"Tool {call['tool']} is not available, so this deal cannot be added.")
        for t in tools:   # a cart left over from earlier would change the bill
            if CLEAR_CART.search(t) and "cart" in t.lower() and not config.BLOCKED_TOOLS.search(t):
                await session.call_tool(t, {})
                break
        answers = []
        for call in calls:
            res = await session.call_tool(call["tool"], call["args"])
            answers.append(result_text(res))
            if res.isError:
                raise RuntimeError(f"{call['tool']} failed: {answers[-1][:200]}")
        return {"answer": answers[-1][:2000] if answers else "", "link": cart_link(name, calls, answers)}
