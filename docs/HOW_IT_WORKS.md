# FoodHunt200: How It Works

## In short

**FoodHunt200 finds the cheapest real meals on Zomato and Swiggy.** You set a budget (default ₹200). An AI agent browses the platforms, builds carts, applies the best offers and reads the actual bill. It keeps only meals whose **all-in price** (item + delivery + platform fee + packaging + tax − offers) is at or under your budget.

Three things to know:

1. **It never orders or pays.** Order and payment tools are blocked in code. You place the order yourself in the Zomato or Swiggy app.
2. **The AI finds deals, but code checks the money.** The model copies the platform's bill lines. Local code confirms every amount really came from the platform and that the bill adds up. A made-up or mismatched bill is rejected.
3. **You watch it live.** Deals show up one by one in the web UI, with price history, price alerts and an Excel export.

| Part | Tech | Folder |
| --- | --- | --- |
| Web UI | React + Vite | `frontend/` |
| API and agent | FastAPI, Python 3.13 | `backend/app/` |
| Storage | SQLite + Excel log | `backend/data/` (gitignored) |
| AI brain | Free NVIDIA-hosted models (automatic switch to the next one on failure) | `services/models.py` |
| Platform access | Official Zomato / Swiggy Food MCP servers | `services/agent.py` |

---

## The big picture

```
 You (browser)
    │  1. log in, set budget, press the arrow
    ▼
 React UI  ──REST + live SSE stream──►  FastAPI (backend/app/api)
                                            │
                                            ▼
                                   hunt_runner  (one hunt at a time)
                                            │
                                            ▼
                                   Hunt agent (services/agent.py)
                                   ┌──────────┴───────────┐
                                   ▼                      ▼
                             NVIDIA model          Zomato / Swiggy MCP
                             (decides next step)   (search, menu, cart, bill)
                                   │
                          record_deal(bill lines)
                                   ▼
                    bill.verify → bill.classify → pricing.validate
                                   ▼
                      SQLite + Excel  ──►  live "deal" event ──► UI
```

---

## Step by step: what happens in a hunt

### Step 0. Start the app
`./run.sh` builds the UI and serves UI and API from one FastAPI server. `./dev.sh` runs hot reload at `http://localhost:5173`. On startup `repo.init_db()` creates the SQLite tables: `hunts`, `deals`, `feedback`, `hunt_events`, `profile`, `watches`.
The API lives under `/api/v1` and Swagger is at `/api/v1/docs`.

> Note: `run.sh` currently serves on port **8099**. The README and CLAUDE.md say 8000. Use whichever URL `run.sh` prints.

### Step 1. Log in (local profile)
The `/login` page asks for a name and a 10-digit Indian mobile number. It is saved with `PUT /profile` as a single local profile row. This is not a platform login. Logged-out visitors are redirected to `/login`.

### Step 2. Set up the hunt
On the home page you choose:
- **Budget** (default ₹200)
- **Platform**: Zomato, Swiggy or both
- **Diet**: veg, non-veg or any
- **Address label**: which saved address to use
- **Search terms** (thali, biryani, rice bowl, and so on)
- **Max carts** to price-check per platform
- **Extra items** the agent may add to reach an offer's minimum order

Pressing the arrow calls `POST /hunts`.

### Step 3. The backend takes the hunt lock
`hunt_runner.start()` allows **one hunt at a time**. If one is running, the API returns `409`. Otherwise it creates a `hunts` row, opens an in-memory event list for the hunt, and runs the hunt as a background task. The UI then opens `GET /hunts/{id}/events`, a Server-Sent Events stream.

### Step 4. Connect to the platforms
The `Hunt` agent connects to each chosen platform's MCP server (`services/agent.py` → `connect`):
- **First time:** `services/oauth.py` opens a browser tab for the platform's own OTP login (a local callback listens on port 8766 for Zomato, 8765 for Swiggy). Tokens are saved in `backend/data/tokens/`.
- It lists the platform's tools. Any tool matching `BLOCKED_TOOLS` in `config.py` (place order, checkout, payment, UPI, cancel, track…) is **removed before the model sees it**.
- If one platform fails to connect, it is skipped and the other still runs.

### Step 5. The agent loop
Each platform gets its own conversation with the model, and the platforms run at the same time. The system prompt (`prompts/system_prompt.md`) tells the model the strategy:

1. Read the saved address.
2. Check Food Rescue / cancelled orders first (cheapest).
3. Search for cheap candidates and pre-filter menus to about 75% of budget.
4. For the best candidates: add to cart → check coupons → apply the best → **read the bill** → `record_deal` → clear the cart.
5. Call `finish` with a ranked summary.

Each turn, the model returns tool calls and `Hunt.call_tool` runs them:
- **Read-only calls** (search, menu, list…) run in parallel.
- **Cart-changing calls** (add, apply, clear…) run one at a time, in order.
- Tool output sent to the model is shortened (`FOODHUNT_TOOL_OUTPUT_LIMIT`) and old results are trimmed to a stub, which keeps turns fast. The **full** output is kept separately for the bill check in Step 6.
- Every model call goes through `services/models.router`, which applies a timeout and switches to the next free NVIDIA model if one fails or is slow. It remembers the last working model.
- The loop stops at `finish` or after `FOODHUNT_MAX_TURNS` (default 60).

### Step 6. A bill becomes a deal (the trust step)
When the model calls `record_deal`, it passes `bill_lines` (label + amount, copied from the cart) and `final_payable`. It does not pass fee or tax totals. Three checks run in order:

| Check | File | What it does |
| --- | --- | --- |
| `bill.verify` | `services/bill.py` | Every amount, and the final price, must appear in what the platform actually returned, with a matching label word. Invented lines are rejected. |
| `bill.classify` | `services/bill.py` | Sorts the lines into item total, delivery, platform fee, packaging, tax, other charges and discount. The Deal's numbers come from here. |
| `pricing.validate` | `services/pricing.py` | Item total + fees + tax − discount must equal `final_payable` (±₹2). The price must be ≤ budget. A GST/tax line must exist, otherwise the bill wasn't read in full. |

If any check fails, the model gets `REJECTED:` plus the reasons and must re-read the bill or drop the deal. The reason also appears in the live log. Duplicates are ignored.

### Step 6b. Cross-check on the other app
When both apps are chosen, the agent then prices the 3 cheapest deals' dishes on the other app too (`Hunt.cross_check`). The deals table keeps only the cheaper of each pair and labels it, for example "₹20 cheaper than Zomato".

### Step 7. Save and stream
An accepted deal is:
- inserted into SQLite (`repository.insert_deal`)
- emitted as a `deal` SSE event, so the UI shows a toast, plays a chime if the price is under your threshold, and refreshes the list

Other events are `status`, `step`, `alert`, `error` and `done`.

### Step 8. Finish
When the agent is done, `hunt_runner`:
1. Appends the new deals to `backend/data/deals.xlsx` (the history log).
2. Compares new deals against your **price watches** (`alerts_for`) and emits `alert` events for matches.
3. Marks the hunt `done` or `error`, then saves the event list so the hunt can be **replayed** later.
4. Releases the lock.

### Step 9. Browse and act on results
The UI uses these views:
- **Deals table**: filter by platform, price, distance, search text and favourites. Open a deal to see its full bill exactly as the platform labelled it.
- **Price history**: the same dish at the same restaurant over time. A deal is identified by `platform|restaurant|items`, so your favourites, ratings and notes survive re-hunts.
- **Insights**: weekly summary, dishes sold at 2+ places with the price gap, a cheapest-times heat calendar, and hunt replay.
- **Alerts**: a price watch such as "biryani under ₹150" that fires after a hunt finds a match.
- **Alarm**: a meal-time reminder to go hunt.
- **Export**: `GET /export.xlsx`.

- **Add to cart**: each deal has a button that repeats the cart steps the agent took (items, filler item, offer) in your real cart in the platform app.
- **Address picker**: Options lists your saved Zomato/Swiggy addresses to choose from.

Then **you open the Zomato or Swiggy app, check the bill and pay**. FoodHunt200 stops there.

---

## Command-line alternative
```bash
cd backend
.venv/bin/python -m app.cli --platform zomato -v
.venv/bin/python -m app.cli --budget 150 --diet veg --watch 10
```
It uses the same agent, database and Excel file as the web app.

---

## Where things live

```
backend/app/
  config.py            paths, env vars, PLATFORMS, BLOCKED_TOOLS, defaults (single source of config)
  main.py              app factory; mounts routers and the built frontend
  api/                 thin routers: hunts, deals, watches, profile, system
  services/
    hunt_runner.py     one-at-a-time hunt lifecycle + event stream + alerts
    agent.py           model ↔ MCP loop, record_deal / finish tools
    bill.py            verify + classify bill lines
    pricing.py         Deal model + validate()
    models.py          model router (timeout, fallback, remembered choice)
    oauth.py           browser OTP login + token storage for MCP servers
    excel.py           deals.xlsx history
  db/                  connection.py (schema), repository.py (all SQL)
  prompts/             system_prompt.md (the agent's instructions)
  tests/               pytest
frontend/src/
  api/ hooks/ lib/     data fetching, state, helpers
  components/          auth, hero, hunt, deals, insights, alerts, alarm, brand, motion, layout, ui
  styles/              one CSS file per area; colours come from tokens.css
```

## HTTP API (prefix `/api/v1`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/hunts` | Start a hunt (409 if one is running) |
| GET | `/hunts`, `/hunts/{id}/events`, `/hunts/{id}/replay` | List hunts, live stream, replay |
| GET | `/deals`, `/deals/history`, `/deals/compare`, `/deals/heatmap` | Deals, price history, comparisons, cheapest-times |
| GET | `/insights/weekly` | Weekly summary |
| PUT | `/feedback` | Favourite, rating, note |
| GET/POST/DELETE | `/watches` | Price alerts |
| GET/PUT/DELETE | `/profile` | Local user |
| GET | `/status` | Running state and per-platform login-token presence |
| GET | `/export.xlsx` | Excel export |

Full detail: `.claude/docs/api.md`.

## Safety rules (never loosen)
1. Money comes from the platform's own bill, never from the model's arithmetic.
2. Order and payment tools stay blocked (`config.BLOCKED_TOOLS`).
3. Secrets (`backend/.env`, `backend/data/tokens/`) are never read or printed.

## Setup and troubleshooting
See the root `README.md` for install steps, the Swiggy client-id setup and a troubleshooting table.
