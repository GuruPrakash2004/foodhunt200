# FoodHunt200

Finds Zomato/Swiggy meals whose **all-in price** (item + fees + tax − offers) is at or under a budget (default ₹200).
An AI agent (Gemini) drives the platforms' official MCP servers; a local validator rejects any bill that doesn't add up.
The app **never places orders or payments**. The user orders in the platform's own app.

## Layout

```
backend/    FastAPI + agent (Python 3.13)      -> see .claude/docs/architecture.md
  app/config.py        paths, env, defaults (single source of config)
  app/main.py          app factory; mounts routers and the built frontend
  app/api/             HTTP routers only (hunts, deals, watches, system)
  app/services/        agent.py, hunt_runner.py, oauth.py, pricing.py, excel.py
  app/db/              connection.py (schema), repository.py (all SQL)
  app/cli.py           command-line hunt
  tests/               pytest
  data/                gitignored: foodhunt.db, deals.xlsx, tokens/
frontend/   React + Vite                       -> see .claude/docs/design-system.md
  src/api/ hooks/ lib/ components/{auth,brand,motion,layout,hero,hunt,deals,alerts}/ styles/
.claude/    skills, agents, settings, docs (this folder)
```

## Commands

```bash
# backend (from backend/)
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/python -m pytest -q
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
.venv/bin/python -m app.cli --platform zomato -v

# frontend (from frontend/)
npm install && npm run build      # served by FastAPI at http://127.0.0.1:8000

# from the repo root
./run.sh    # built UI + API on one URL: http://127.0.0.1:8000
./dev.sh    # hot reload on one URL:    http://localhost:5173 (proxies /api/v1 to the backend)
```

## Rules

- **Money comes from the platform's own bill, never from the model.** `record_deal` takes the copied bill lines; `services/bill.py` sorts them and checks every amount appears in what the platform returned; `pricing.validate` then checks the sum and that GST is present. Never let the model type fee or tax totals.
- **Order/payment MCP tools stay blocked** (`config.BLOCKED_TOOLS`). Never loosen this.
- Routers stay thin: SQL lives in `db/repository.py`, logic in `services/`, config in `config.py`.
- Frontend: data fetching in `api/` + `hooks/`, presentational components under `components/<area>/`,
  one CSS file per area in `styles/`, all colours via tokens in `styles/tokens.css`.
- Model calls go through `services/models.router`: per-call timeout, automatic switch to a working Gemini model, remembered. Don't call the SDK directly.
- Platforms are defined once in `app/config.py` (`PLATFORMS`, `PLATFORM_LABELS`); the UI, validation and agent read from it. Add a server there, not in components.
- Never read or print `backend/.env` or `backend/data/tokens/` (secrets and login tokens).
- Theme: `#0A0A0A` ground, `#007BA7` primary, `#FF2D95` accent. Use `design-taste-frontend` for UI work.
