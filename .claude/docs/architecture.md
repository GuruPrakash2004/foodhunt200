# Architecture

```
React (frontend/) <--REST + SSE--> FastAPI (backend/app) --> Hunt (services/agent.py) --> Zomato / Swiggy MCP
                                        |
                                    SQLite (data/foodhunt.db): hunts, deals, feedback, watches
```

## Request flow for a hunt
1. `POST /api/hunts` -> `hunt_runner.start()` takes the single hunt lock (409 if busy) and creates a `hunts` row.
2. `_run()` builds a `Hunt`, connects to each MCP server (OAuth in `services/oauth.py`), then loops: Gemini picks tools,
   `Hunt.call_tool` runs them, and `record_deal` validates each bill with `pricing.validate`.
3. Every accepted deal is inserted via `repository.insert_deal` and emitted as an SSE `deal` event.
4. `GET /api/hunts/{id}/events` streams events; the UI refetches `/api/deals` as they arrive.
5. After the hunt, `alerts_for()` compares new deals with `watches` and emits `alert` events.

## Data
- A deal is identified by `deal_key = platform|restaurant|items` (lower-cased). Feedback (favourite, rating, note)
  is keyed by `deal_key`, so it survives re-hunts. Price history = all `deals` rows with the same key.
- `list_deals` returns the latest sighting per key plus `fees`, `savings`, `lowest_price`, `seen_count`.

## Notes
- The Gemini SDK call is blocking; it runs in `asyncio.to_thread` so the event loop stays free.
- Tests swap `hunt_runner.HuntClass` for a fake and point `FOODHUNT_DB` at a temp file.

## How a bill becomes a deal
1. Every MCP response is kept whole per platform (`Hunt.platform_output`). The model only sees a shortened copy.
2. `record_deal` carries `bill_lines` (the platform's labels and amounts, copied) and `final_payable`.
3. `bill.verify` rejects any line or total that does not appear in the platform's own responses.
4. `bill.classify` sorts the lines into dish, delivery, platform fee, packaging, tax, other and discount. The Deal's numbers come from here.
5. `pricing.validate` checks the sum, the budget and that a GST/tax line exists. The accepted lines are stored (`deals.bill_lines`) and shown as the platform labelled them.
