# FoodHunt200

Finds Zomato and Swiggy meals that cost **₹200 or less all-in** (item + delivery + platform fee + tax, after offers).
An AI agent (Google Gemini) works through the platforms' official MCP servers. Every bill it reports is re-checked in code.
**It never places an order or a payment.** You order in the app.

```
backend/    FastAPI API + agent + SQLite        frontend/   React + Vite UI
.claude/    skills, agents, settings, docs
```

## Setup

```bash
# 1. backend
cd backend
cp .env.example .env                 # then set GOOGLE_API_KEY (https://aistudio.google.com/apikey)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt

# 2. frontend
cd ../frontend && npm install && npm run build

# 3. run everything on one URL (builds the UI, then serves UI + API)
cd .. && ./run.sh
```

Open http://127.0.0.1:8000 (login at `/login`, app at `/`, API at `/api/v1`, Swagger at `/api/v1/docs`). Log in with your name and mobile number, set the max price, press the arrow. The first run opens a browser tab for the
platform's own OTP login; tokens are saved in `backend/data/tokens/`.

Development with hot reload, still one URL: `./dev.sh` then open http://localhost:5173 (Vite serves the UI and proxies `/api/v1` to the auto-reloading backend). Ctrl+C stops both.

## Command line

```bash
cd backend
.venv/bin/python -m app.cli --platform zomato -v
.venv/bin/python -m app.cli --budget 150 --diet veg --watch 10
```

Results go to the same database as the web app and to `backend/data/deals.xlsx`.

## Platforms

- **Zomato**: `https://mcp-server.zomato.com/mcp`. Leave `ZOMATO_CLIENT_ID` blank (dynamic registration).
- **Swiggy**: only the **Food** server (`https://mcp.swiggy.com/food`) is used. Apply at mcp.swiggy.com/builders, register the redirect URI
  `http://localhost:8765/callback`, then set `SWIGGY_CLIENT_ID` (and secret if given) in `backend/.env`.

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Model errors or slow replies | Handled automatically: a failing or slow model is skipped and the next working one is used. Tune with `FOODHUNT_MODEL`, `FOODHUNT_FALLBACK_MODELS`, `FOODHUNT_MODEL_TIMEOUT`, `FOODHUNT_THINKING` |
| `could not connect ... 401/invalid_client` | Swiggy: client not approved or wrong id. Zomato: try again or use the Claude app connector |
| Browser login never returns | Port 8765/8766 busy, or the redirect URI isn't registered |
| `Bill doesn't add up` rejections | Run with `-v`, read the cart tool output, adjust `app/prompts/system_prompt.md` |
| A useful tool shows as blocked | Adjust `BLOCKED_TOOLS` in `app/config.py`, but never unblock order or payment tools |

More detail for contributors: `.claude/CLAUDE.md` and `.claude/docs/`.
