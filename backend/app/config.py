"""Central configuration: paths, environment and defaults. Everything else imports from here."""
import os
import re
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

DATA_DIR = Path(os.getenv("FOODHUNT_DATA_DIR", BACKEND_DIR / "data"))
TOKEN_DIR = DATA_DIR / "tokens"
SHEET_FILE = DATA_DIR / "deals.xlsx"
LEGACY_DEALS_FILE = DATA_DIR / "deals.json"
PROMPT_FILE = Path(__file__).parent / "prompts" / "system_prompt.md"
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"
DATA_DIR.mkdir(parents=True, exist_ok=True)

API_PREFIX = "/api/v1"
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


def db_path() -> Path:
    """Resolved on each call so tests can point FOODHUNT_DB at a temp file."""
    return Path(os.getenv("FOODHUNT_DB", DATA_DIR / "foodhunt.db"))


PLATFORMS = {
    "zomato": {
        "url": os.getenv("ZOMATO_MCP_URL", "https://mcp-server.zomato.com/mcp"),
        "port": 8766,
        "client_id": os.getenv("ZOMATO_CLIENT_ID", ""),
        "client_secret": os.getenv("ZOMATO_CLIENT_SECRET", ""),
    },
    # Swiggy: only the Food server is used (Instamart, Dineout and Scenes are intentionally not hunted).
    "swiggy": {
        "url": os.getenv("SWIGGY_MCP_URL", "https://mcp.swiggy.com/food"),
        "port": 8765,
        "client_id": os.getenv("SWIGGY_CLIENT_ID", ""),
        "client_secret": os.getenv("SWIGGY_CLIENT_SECRET", ""),
    },
}
PLATFORM_LABELS = {"zomato": "Zomato", "swiggy": "Swiggy Food"}

# Never expose these to the model. FoodHunt200 finds deals; you place the order yourself.
BLOCKED_TOOLS = re.compile(
    r"(place|confirm|create)_?\w*order|checkout|payment|^pay_|_pay$|upi|qr_?code|cancel|track", re.I)

MAX_TURNS = int(os.getenv("FOODHUNT_MAX_TURNS", "60"))

DEAL_MAX_AGE_HOURS = float(os.getenv("FOODHUNT_DEAL_MAX_AGE_HOURS", "4"))   # older deals are not shown: their prices and offers have moved on
DEFAULT_BUDGET = float(os.getenv("FOODHUNT_BUDGET", 200))
DEFAULT_DIET = os.getenv("FOODHUNT_DIET", "any (veg or non-veg)")
DEFAULT_ADDRESS = os.getenv("FOODHUNT_ADDRESS", "Home")
DEFAULT_QUERIES = os.getenv("FOODHUNT_QUERIES", "thali, biryani, rice bowl, meals, dosa, combo, rolls")

# Speed knobs (see services/agent.py)
TOOL_OUTPUT_LIMIT = int(os.getenv("FOODHUNT_TOOL_OUTPUT_LIMIT", "6000"))  # chars of a tool result sent back to the model
KEEP_TURNS = int(os.getenv("FOODHUNT_KEEP_TURNS", "3"))                   # older tool results are shrunk to a stub

# Models: NVIDIA NIM, the free preview models on build.nvidia.com (see services/models.py and services/nvidia_models.py)
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")   # from https://build.nvidia.com ("Get API Key")
NVIDIA_BASE_URL = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
MODEL_TIMEOUT_S = float(os.getenv("FOODHUNT_MODEL_TIMEOUT", "30"))             # one model call may take at most this long
LAST_MODEL_FILE = DATA_DIR / "last_model.txt"                                  # the model that last worked; tried first next start
NVIDIA_MAX_INPUT_TOKENS = int(os.getenv("FOODHUNT_NVIDIA_MAX_INPUT_TOKENS", "24000"))   # how much of the hunt so far is sent
NVIDIA_TOOL_RESULT_CHARS = int(os.getenv("FOODHUNT_NVIDIA_TOOL_CHARS", "4000"))         # tool results are clipped to this
# Free models checked to return tool calls, fastest and strongest first. Tried in this order; every other chat model on the key follows.
DEFAULT_MODELS = ("nvidia/nemotron-3-ultra-550b-a55b,minimaxai/minimax-m3.1-flash,stepfun-ai/step-5-preview,"
                  "openai/gpt-oss-20b,nvidia/nemotron-3.5-lightning-30b-a3b,meta/muse-glimmer-30b,nvidia/nemotron-3.5-bolt-e4b")


def _names(value: str) -> list[str]:
    """Model ids from a comma list; names left over from the Gemini days are ignored."""
    return [n for n in (m.strip().removeprefix("nvidia:") for m in value.split(",")) if n and not n.startswith("gemini")]


# FOODHUNT_MODEL is tried first, then FOODHUNT_FALLBACK_MODELS, then the defaults (no duplicates).
MODELS = list(dict.fromkeys(_names(os.getenv("FOODHUNT_MODEL", "")) + _names(os.getenv("FOODHUNT_FALLBACK_MODELS", "")) + _names(DEFAULT_MODELS)))
