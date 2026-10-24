# HTTP API (prefix `/api/v1`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/hunts` | Start a hunt `{budget, platform, diet, address, queries, max_carts, extra_items}` -> `{hunt_id}` (409 if one is running) |
| POST | `/hunts/stop` | Stop the running hunt; deals already found are kept, the stream ends with `done` status `stopped` (409 if none running) |
| GET | `/hunts` | Recent hunts |
| GET | `/hunts/{id}/events` | Server-sent events: `status`, `step`, `deal`, `alert`, `error`, `done` |
| GET | `/deals` | Query: `platform, min_price, max_price, max_distance, q, favorites, sort, hunt_id` |
| GET | `/insights/weekly?days=7` | Hunts, distinct deals, cheapest, average, total discount, cheapest weekday |
| GET | `/deals/compare` | Dishes sold at 2+ places with the price gap, cheapest first |
| GET | `/deals/heatmap` | Average / lowest price and count by weekday (0 = Sunday) and hour, for the cheapest-times calendar |
| GET | `/hunts/{id}/replay` | A finished hunt `{hunt, events}`; each event has `t` = seconds into the hunt |
| GET | `/addresses` | Saved delivery addresses per platform `{addresses: {platform: [{label, text}]}, errors}`; 409 while a hunt runs; needs a login token |
| POST | `/deals/cart` | `{key}`: replay the deal's recorded cart calls (empty the cart, add items, apply offer) in the user's real cart. Never orders or pays. 401 not logged in, 409 hunt running, 422 old deal without a cart |
| GET | `/deals/history?key=` | Price points for one deal |
| PUT | `/feedback` | `{key, favorite?, rating?, note?}` |
| GET/POST/DELETE | `/watches[/{id}]` | Price alerts `{query, max_price}` |
| GET | `/status` | `{running, platforms: {id: bool}, labels: {id: name}}` for each platform (zomato, swiggy); the bool is "login token present" |
| GET/PUT/DELETE | `/profile` | The local user `{name, mobile}`: `null` when logged out; PUT validates a 10-digit Indian mobile |
| GET | `/export.xlsx` | Excel export of the current deals |

Interactive docs: `/api/v1/docs` (Swagger). The built UI is served at `/` by the same server.


## Same dish on both apps
`GET /deals` lists only the cheaper of a dish sold by the same restaurant on Zomato and Swiggy (`best_only=false` shows both). Each deal carries `rival` (`platform`, `final_payable`, `gap`) and `cheaper_here`. After a two-app hunt the agent prices the 3 cheapest deals on the other app (`source: cross_check`, kept even over budget so it can be compared).
