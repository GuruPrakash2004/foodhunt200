"""All SQL for the app lives here: deals, hunts, feedback and watches."""
import difflib
import json
import re
from datetime import datetime, timedelta

from app import config
from app.db.connection import SCHEMA, connect
from app.services.pricing import Deal

DEAL_COLS = ["platform", "restaurant", "items", "item_total", "delivery_fee", "platform_fee",
             "packaging_fee", "taxes", "other_charges", "discount", "final_payable", "offer",
             "source", "distance_km", "eta_min", "bill_lines", "cart_calls", "found_at"]
JSON_COLS = ("bill_lines", "cart_calls")

SORTS = {
    "price": "final_payable ASC", "price_desc": "final_payable DESC", "base": "item_total ASC",
    "distance": "distance_km ASC", "restaurant": "restaurant COLLATE NOCASE ASC",
    "newest": "found_at DESC", "rating": "rating DESC",
}


def deal_key(platform: str, restaurant: str, items: str) -> str:
    return f"{platform}|{restaurant.strip().lower()}|{items.strip().lower()}"


def init_db() -> None:
    with connect() as con:
        con.executescript(SCHEMA)
        have = [r["name"] for r in con.execute("PRAGMA table_info(deals)")]
        for column in JSON_COLS:   # databases from before bills / cart calls were stored
            if column not in have:
                con.execute(f"ALTER TABLE deals ADD COLUMN {column} TEXT")
        empty = con.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 0
    if empty and config.LEGACY_DEALS_FILE.exists():  # carry over history from the first CLI version
        try:
            rows = json.loads(config.LEGACY_DEALS_FILE.read_text())
        except json.JSONDecodeError:
            return
        for r in rows:
            try:
                insert_deal(None, Deal(**{k: v for k, v in r.items() if k in Deal.__dataclass_fields__}))
            except TypeError:
                continue


# --- hunts -----------------------------------------------------------------

def start_hunt(params: dict) -> int:
    with connect() as con:
        cur = con.execute(
            "INSERT INTO hunts (started_at, budget, platform, diet, address, status) VALUES (?,?,?,?,?,?)",
            (datetime.now().isoformat(timespec="seconds"), params["budget"], params["platform"],
             params["diet"], params["address"], "running"))
        return cur.lastrowid


def finish_hunt(hunt_id: int, status: str, summary: str = "") -> None:
    with connect() as con:
        con.execute("UPDATE hunts SET finished_at=?, status=?, summary=? WHERE id=?",
                    (datetime.now().isoformat(timespec="seconds"), status, summary, hunt_id))


def list_hunts(limit: int = 10) -> list[dict]:
    with connect() as con:
        return [dict(r) for r in con.execute(
            "SELECT h.*, (SELECT COUNT(*) FROM deals d WHERE d.hunt_id = h.id) AS deal_count "
            "FROM hunts h ORDER BY h.id DESC LIMIT ?", (limit,))]


def get_hunt(hunt_id: int) -> dict | None:
    with connect() as con:
        row = con.execute("SELECT * FROM hunts WHERE id = ?", (hunt_id,)).fetchone()
        return dict(row) if row else None


def save_events(hunt_id: int, events: list[dict]) -> None:
    """Keep a hunt's step-by-step events so it can be replayed after a restart."""
    with connect() as con:
        con.execute("INSERT OR REPLACE INTO hunt_events (hunt_id, events) VALUES (?, ?)",
                    (hunt_id, json.dumps(events, ensure_ascii=False)))


def get_events(hunt_id: int) -> list[dict] | None:
    with connect() as con:
        row = con.execute("SELECT events FROM hunt_events WHERE hunt_id = ?", (hunt_id,)).fetchone()
        return json.loads(row["events"]) if row else None


# --- deals -----------------------------------------------------------------

def insert_deal(hunt_id: int | None, d: Deal) -> None:
    row = d.to_dict()
    with connect() as con:
        con.execute(
            f"INSERT INTO deals (hunt_id, deal_key, {', '.join(DEAL_COLS)}) "
            f"VALUES (?, ?, {', '.join('?' * len(DEAL_COLS))})",
            [hunt_id, deal_key(d.platform, d.restaurant, d.items)]
            + [json.dumps(row[c], ensure_ascii=False) if c in JSON_COLS else row[c] for c in DEAL_COLS])


FRESH = object()   # "use the default freshness window"


def list_deals(platform=None, min_price=None, max_price=None, max_distance=None, q=None,
               favorites=False, sort="price", hunt_id=None, max_age_hours=FRESH, best_only=False) -> list[dict]:
    """Latest sighting of each distinct deal, joined with feedback and price stats.
    Only deals seen within max_age_hours (default config.DEAL_MAX_AGE_HOURS) are returned; pass None for all of them."""
    if max_age_hours is FRESH:
        max_age_hours = config.DEAL_MAX_AGE_HOURS
    where, args = ["rn = 1"], []
    if max_age_hours:
        where.append("found_at >= ?"); args.append((datetime.now() - timedelta(hours=max_age_hours)).isoformat(timespec="seconds"))
    if platform:
        where.append("platform = ?"); args.append(platform)
    if min_price is not None:
        where.append("final_payable >= ?"); args.append(min_price)
    if max_price is not None:
        where.append("final_payable <= ?"); args.append(max_price)
    if max_distance is not None:
        where.append("(distance_km IS NULL OR distance_km <= ?)"); args.append(max_distance)
    if q:
        where.append("(restaurant LIKE ? OR items LIKE ?)"); args += [f"%{q}%"] * 2
    if favorites:
        where.append("favorite = 1")
    inner_where, inner_args = "", []
    if hunt_id is not None:
        inner_where, inner_args = "WHERE hunt_id = ?", [hunt_id]
    sql = f"""
        SELECT * FROM (
            SELECT d.*, COALESCE(f.favorite, 0) AS favorite, f.rating AS rating,
                   COALESCE(f.note, '') AS note,
                   ROW_NUMBER() OVER (PARTITION BY d.deal_key ORDER BY d.found_at DESC, d.id DESC) AS rn,
                   MIN(d.final_payable) OVER (PARTITION BY d.deal_key) AS lowest_price,
                   COUNT(*) OVER (PARTITION BY d.deal_key) AS seen_count
            FROM (SELECT * FROM deals {inner_where}) d
            LEFT JOIN feedback f ON f.deal_key = d.deal_key)
        WHERE {' AND '.join(where)}
        ORDER BY {SORTS.get(sort, SORTS['price'])}"""
    with connect() as con:
        rows = [dict(r) for r in con.execute(sql, inner_args + args)]
    for r in rows:
        r["fees"] = round(r["delivery_fee"] + r["platform_fee"] + r["packaging_fee"] + r["other_charges"], 2)
        r["savings"] = abs(r["discount"])
        r["favorite"] = bool(r["favorite"])
        for column in JSON_COLS:   # bill_lines: the platform's own labels; cart_calls: what "Add to cart" replays (empty for old deals)
            r[column] = json.loads(r[column]) if r.get(column) else []
        r["can_add_to_cart"] = bool(r["cart_calls"])
    _mark_rivals(rows)
    if best_only:   # the dearer twin goes, and so does a cross-check price that matched nothing (it may be over budget)
        rows = [r for r in rows if r["cheaper_here"] and (r["rival"] or r["source"] != "cross_check")]
    return rows


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _restaurant(name: str) -> str:
    return _norm(re.split(r"\s+[-–(]|\(", name, maxsplit=1)[0])   # "Burger King - Indiranagar" and "Burger King" are the same chain


def _main_dish(items: str) -> str:
    return _norm(_dish(items.split("+")[0]))    # the extra filler items differ between apps; the main dish is what is compared


def _mark_rivals(rows: list[dict]) -> None:
    """Pair each deal with the same dish from the same restaurant on the other app: `rival` is that deal's platform and price,
    `cheaper_here` says which of the two is the better buy."""
    for r in rows:
        r["rival"], r["cheaper_here"] = None, True
    for a in rows:
        for b in rows:
            if a["platform"] == b["platform"] or _restaurant(a["restaurant"]) != _restaurant(b["restaurant"]):
                continue
            da, db = _main_dish(a["items"]), _main_dish(b["items"])
            if da != db and difflib.SequenceMatcher(None, da, db).ratio() < 0.8:
                continue
            if a["rival"] is None or b["final_payable"] < a["rival"]["final_payable"]:
                a["rival"] = {"platform": b["platform"], "final_payable": b["final_payable"], "deal_key": b["deal_key"]}
    for r in rows:
        if r["rival"]:
            gap = round(r["rival"]["final_payable"] - r["final_payable"], 2)
            r["cheaper_here"] = gap >= 0                # a tie keeps both
            r["rival"]["gap"] = abs(gap)


def get_deal(key: str) -> dict | None:
    return next((d for d in list_deals() if d["deal_key"] == key), None)


def history(key: str) -> list[dict]:
    with connect() as con:
        return [dict(r) for r in con.execute(
            "SELECT found_at, final_payable, item_total FROM deals WHERE deal_key=? ORDER BY found_at", (key,))]


# --- feedback --------------------------------------------------------------

def set_feedback(key: str, favorite: bool | None, rating: int | None, note: str | None) -> None:
    with connect() as con:
        con.execute("INSERT OR IGNORE INTO feedback (deal_key) VALUES (?)", (key,))
        if favorite is not None:
            con.execute("UPDATE feedback SET favorite=? WHERE deal_key=?", (int(favorite), key))
        if rating is not None:
            con.execute("UPDATE feedback SET rating=? WHERE deal_key=?", (rating or None, key))
        if note is not None:
            con.execute("UPDATE feedback SET note=? WHERE deal_key=?", (note, key))


# --- price watches ---------------------------------------------------------

def list_watches() -> list[dict]:
    with connect() as con:
        return [dict(r) for r in con.execute("SELECT * FROM watches WHERE active=1 ORDER BY id")]


def add_watch(query: str, max_price: float) -> int:
    with connect() as con:
        return con.execute("INSERT INTO watches (query, max_price) VALUES (?,?)", (query, max_price)).lastrowid


def delete_watch(watch_id: int) -> None:
    with connect() as con:
        con.execute("UPDATE watches SET active=0 WHERE id=?", (watch_id,))


# --- profile (the single local user) ---------------------------------------

def get_profile() -> dict | None:
    with connect() as con:
        row = con.execute("SELECT name, mobile, updated_at FROM profile WHERE id = 1").fetchone()
        return dict(row) if row else None


def save_profile(name: str, mobile: str) -> dict:
    with connect() as con:
        con.execute(
            "INSERT INTO profile (id, name, mobile, updated_at) VALUES (1, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name, mobile=excluded.mobile, updated_at=excluded.updated_at",
            (name, mobile, datetime.now().isoformat(timespec="seconds")))
    return get_profile()


def clear_profile() -> None:
    with connect() as con:
        con.execute("DELETE FROM profile WHERE id = 1")


# --- insights --------------------------------------------------------------

def heatmap() -> list[dict]:
    """Average and lowest all-in price per weekday (0 = Sunday) and hour of day, from every sighting."""
    with connect() as con:
        return [dict(r) for r in con.execute(
            "SELECT CAST(strftime('%w', found_at) AS INTEGER) AS dow, CAST(strftime('%H', found_at) AS INTEGER) AS hour, "
            "ROUND(AVG(final_payable)) AS avg, MIN(final_payable) AS min, COUNT(*) AS n "
            "FROM deals GROUP BY dow, hour ORDER BY dow, hour")]


DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def weekly_summary(days: int = 7) -> dict:
    """What the last `days` days of hunting found: counts, the cheapest meal, savings and the best weekday."""
    cutoff = (datetime.now() - timedelta(days=days)).isoformat(timespec="seconds")
    with connect() as con:
        rows = [dict(r) for r in con.execute("SELECT * FROM deals WHERE found_at >= ? ORDER BY found_at", (cutoff,))]
        hunts = con.execute("SELECT COUNT(*) FROM hunts WHERE started_at >= ?", (cutoff,)).fetchone()[0]
        favourites = con.execute("SELECT COUNT(*) FROM feedback WHERE favorite = 1").fetchone()[0]
    latest: dict[str, dict] = {}
    for r in rows:
        latest[r["deal_key"]] = r                       # later sightings overwrite earlier ones
    distinct = list(latest.values())
    by_day: dict[int, list[float]] = {}
    for r in rows:
        dow = int(datetime.fromisoformat(r["found_at"]).strftime("%w"))
        by_day.setdefault(dow, []).append(r["final_payable"])
    best_day = min(by_day, key=lambda d: sum(by_day[d]) / len(by_day[d])) if by_day else None
    cheapest = min(distinct, key=lambda r: r["final_payable"]) if distinct else None
    return {
        "days": days, "hunts": hunts, "sightings": len(rows), "deals": len(distinct), "favourites": favourites,
        "cheapest": cheapest and {k: cheapest[k] for k in ("restaurant", "items", "platform", "final_payable", "found_at")},
        "average": round(sum(r["final_payable"] for r in distinct) / len(distinct)) if distinct else None,
        "saved": round(sum(abs(r["discount"]) for r in distinct)),
        "by_platform": {p: sum(1 for r in distinct if r["platform"] == p) for p in sorted({r["platform"] for r in distinct})},
        "best_day": best_day is not None and {"name": DAY_NAMES[best_day], "average": round(sum(by_day[best_day]) / len(by_day[best_day]))} or None,
    }


def _dish(items: str) -> str:
    return re.sub(r"\s*(x|×)\s*\d+\s*$", "", items.lower()).strip()


def compare_dishes() -> list[dict]:
    """Dishes that more than one restaurant or platform sells, cheapest first, with the gap to the others."""
    groups: dict[str, list[dict]] = {}
    for d in list_deals():
        groups.setdefault(_dish(d["items"]), []).append(d)
    out = []
    for dish, ds in groups.items():
        sellers = {(d["platform"], d["restaurant"].lower()) for d in ds}
        if len(sellers) < 2:
            continue
        ds.sort(key=lambda d: d["final_payable"])
        out.append({
            "dish": dish.title(),
            "spread": round(ds[-1]["final_payable"] - ds[0]["final_payable"], 2),
            "options": [{k: d[k] for k in ("deal_key", "platform", "restaurant", "items", "final_payable")} for d in ds],
        })
    return sorted(out, key=lambda g: -g["spread"])
