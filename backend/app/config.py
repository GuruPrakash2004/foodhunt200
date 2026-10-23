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

MODEL = os.getenv("FOODHUNT_MODEL", "gemini-3.8-flash")
MAX_TURNS = int(os.getenv("FOODHUNT_MAX_TURNS", "60"))

DEFAULT_BUDGET = float(os.getenv("FOODHUNT_BUDGET", 200))
DEFAULT_DIET = os.getenv("FOODHUNT_DIET", "any (veg or non-veg)")
DEFAULT_ADDRESS = os.getenv("FOODHUNT_ADDRESS", "Home")
DEFAULT_QUERIES = os.getenv("FOODHUNT_QUERIES", "thali, biryani, rice bowl, meals, dosa, combo, rolls")

# Speed knobs (see services/agent.py)
TOOL_OUTPUT_LIMIT = int(os.getenv("FOODHUNT_TOOL_OUTPUT_LIMIT", "6000"))  # chars of a tool result sent back to the model
KEEP_TURNS = int(os.getenv("FOODHUNT_KEEP_TURNS", "3"))                   # older tool results are shrunk to a stub
THINKING_LEVEL = os.getenv("FOODHUNT_THINKING", "low").strip().upper()    # MINIMAL | LOW | MEDIUM | HIGH | "" (model default)

# Model resilience (see services/models.py)
MODEL_TIMEOUT_S = float(os.getenv("FOODHUNT_MODEL_TIMEOUT", "25"))             # one model call may take at most this long
FALLBACK_MODELS = [m.strip() for m in os.getenv("FOODHUNT_FALLBACK_MODELS", "").split(",") if m.strip()]
LAST_MODEL_FILE = DATA_DIR / "last_model.txt"                                  # the model that last worked; tried first next start
