"""What the hunting agent works with besides the loop itself: the local tool schemas, which MCP tools are safe to run side by side,
the per-role prompts, and small helpers. Kept apart from agent.py so each file stays under 450 lines."""
import contextvars
import json
import re

from app.config import PLATFORMS, PROMPT_FILE, TOOL_OUTPUT_LIMIT

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
        "name": "propose_candidate",
        "description": "SCOUT ONLY. Queue one promising meal for a pricer to build a cart for and read the real bill. Call it the moment you find a good one.",
        "input_schema": {
            "type": "object",
            "properties": {
                "restaurant": {"type": "string"},
                "items": {"type": "string", "description": "the items to put in the cart, e.g. 'Paneer Rice Bowl x1'"},
                "est_price": {"type": "number", "description": "menu price of those items, before fees and tax"},
                "details": {"type": "string", "description": "everything needed to build the cart without searching again: restaurant id, item ids, variants, offers seen"},
            },
            "required": ["restaurant", "items", "est_price"],
        },
    },
    {
        "name": "next_candidate",
        "description": "PRICER ONLY. Take the next queued candidate (cheapest first), waiting for scouts if none is ready yet. Says when there are no more.",
        "input_schema": {"type": "object", "properties": {}},
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
CROSS_CHECK_EXTRA = 2     # deals that were cheap early but got overtaken may also be checked: at most this many beyond CROSS_CHECK_DEALS
CROSS_CHECK_TURNS = 14    # model turns allowed per cross-check
CROSS_CHECK_BUDGET = 3    # a cross-check bill may be up to this many times the budget (it is only there to compare)


# One worker = one sub-agent hunting a slice of the search terms on one platform. Workers search and read menus side by side,
# but a platform account has a single cart, so a worker holds that platform's cart lock from its first cart change until its deal is recorded.
_WORKER: contextvars.ContextVar = contextvars.ContextVar("hunt_worker", default=None)


def split_terms(queries: str, workers: int) -> list[str]:
    """Deal the comma-separated search terms out round-robin, one comma-separated string per worker (never an empty one)."""
    terms = [t.strip() for t in str(queries).split(",") if t.strip()]
    n = max(1, min(workers, len(terms)))
    return [", ".join(terms[i::n]) for i in range(n)] if terms else [str(queries)]


def _parse_args(raw: str | None) -> dict:
    try:
        args = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return args if isinstance(args, dict) else {}


def is_parallel_safe(tool_name: str) -> bool:
    real = tool_name.split("__", 1)[-1]
    return bool(READ_ONLY.search(real)) and not MUTATING.search(real)


PROMPT_FILES = {"hunt": PROMPT_FILE, "scout": PROMPT_FILE.with_name("scout_prompt.md"), "pricer": PROMPT_FILE.with_name("pricer_prompt.md")}
SCOUT_TURNS = 20
ROLE_START = {
    "scout": "Start scouting now. Search and read menus only, and queue each good candidate with propose_candidate as soon as you find it.",
    "pricer": "Start pricing now. Take candidates with next_candidate and read each one's real bill until there are none left.",
}
SCOUT_ENOUGH = 2    # a platform's scouts stop once they have queued this many times the cart-check allowance


def build_prompt(args, role: str = "hunt") -> str:
    tpl = PROMPT_FILES[role].read_text(encoding="utf-8")
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
