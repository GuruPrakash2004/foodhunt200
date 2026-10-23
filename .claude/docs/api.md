# HTTP API (prefix `/api/v1`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/hunts` | Start a hunt `{budget, platform, diet, address, queries, max_carts, extra_items}` -> `{hunt_id}` (409 if one is running) |
| GET | `/hunts` | Recent hunts |
| GET | `/hunts/{id}/events` | Server-sent events: `status`, `step`, `deal`, `alert`, `error`, `done` |
| GET | `/deals` | Query: `platform, min_price, max_price, max_distance, q, favorites, sort, hunt_id` |
| GET | `/insights/weekly?days=7` | Hunts, distinct deals, cheapest, average, total discount, cheapest weekday |
| GET | `/deals/compare` | Dishes sold at 2+ places with the price gap, cheapest first |
| GET | `/deals/heatmap` | Average / lowest price and count by weekday (0 = Sunday) and hour, for the cheapest-times calendar |
| GET | `/hunts/{id}/replay` | A finished hunt `{hunt, events}`; each event has `t` = seconds into the hunt |
| GET | `/deals/history?key=` | Price points for one deal |
| PUT | `/feedback` | `{key, favorite?, rating?, note?}` |
| GET/POST/DELETE | `/watches[/{id}]` | Price alerts `{query, max_price}` |
| GET | `/status` | `{running, platforms: {id: bool}, labels: {id: name}}` for each platform (zomato, swiggy); the bool is "login token present" |
| GET/PUT/DELETE | `/profile` | The local user `{name, mobile}`: `null` when logged out; PUT validates a 10-digit Indian mobile |
| GET | `/export.xlsx` | Excel export of the current deals |

Interactive docs: `/api/v1/docs` (Swagger). The built UI is served at `/` by the same server.
