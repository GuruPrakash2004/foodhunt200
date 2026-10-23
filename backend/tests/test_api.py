import asyncio
import pytest
from fastapi.testclient import TestClient


class FakeHunt:
    def __init__(self, args, emit=None, on_deal=None):
        self.args, self.emit, self.on_deal, self.summary = args, emit, on_deal, "all good"

    async def connect(self, stack):
        pass

    async def run(self):
        from app.services.pricing import Deal
        for name, price in [("Mess A", 150.0), ("Mess B", 120.0)]:
            d = Deal(platform="zomato", restaurant=name, items="Thali x1", item_total=price - 20,
                     delivery_fee=10, platform_fee=10, final_payable=price, distance_km=2.0)
            self.on_deal(d)
            self.emit({"type": "deal", "deal": d.to_dict()})


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FOODHUNT_DB", str(tmp_path / "t.db"))
    from app.main import app
    from app.services import hunt_runner
    monkeypatch.setattr(hunt_runner, "HuntClass", FakeHunt)
    with TestClient(app) as c:
        yield c, hunt_runner


def run_hunt(c):
    hid = c.post("/api/v1/hunts", json={"budget": 200, "platform": "zomato"}).json()["hunt_id"]
    with c.stream("GET", f"/api/v1/hunts/{hid}/events") as r:
        return hid, [line for line in r.iter_lines() if line.startswith("data:")]


def test_hunt_streams_events_and_stores_deals(client):
    c, _ = client
    hid, events = run_hunt(c)
    assert any('"type": "deal"' in e for e in events)
    assert '"type": "done"' in events[-1]
    rows = c.get("/api/v1/deals").json()
    assert [r["restaurant"] for r in rows] == ["Mess B", "Mess A"]  # cheapest first
    assert rows[0]["fees"] == 20 and rows[0]["item_total"] == 100


def test_filters_and_feedback_survive_rehunt(client):
    c, _ = client
    run_hunt(c)
    assert len(c.get("/api/v1/deals", params={"max_price": 130}).json()) == 1
    key = c.get("/api/v1/deals").json()[0]["deal_key"]
    c.put("/api/v1/feedback", json={"key": key, "favorite": True, "rating": 4, "note": "tasty"})
    run_hunt(c)
    rows = c.get("/api/v1/deals").json()
    assert len(rows) == 2 and rows[0]["seen_count"] == 2
    assert rows[0]["favorite"] and rows[0]["note"] == "tasty"
    assert len(c.get("/api/v1/deals", params={"favorites": True}).json()) == 1
    assert len(c.get(f"/api/v1/deals/history", params={"key": key}).json()) == 2


def test_watch_alert(client):
    c, _ = client
    wid = c.post("/api/v1/watches", json={"query": "mess b", "max_price": 125}).json()["id"]
    _, events = run_hunt(c)
    assert any('"type": "alert"' in e for e in events)
    c.delete(f"/api/v1/watches/{wid}")
    assert c.get("/api/v1/watches").json() == []


def test_second_hunt_while_running_is_409(client):
    c, server = client
    server.hunt_lock._locked = True  # simulate a running hunt
    try:
        assert c.post("/api/v1/hunts", json={}).status_code == 409
    finally:
        server.hunt_lock._locked = False  # the lock is module-global: never leak it into other tests


def test_platform_choices_come_from_config(client):
    c, _ = client
    assert c.post("/api/v1/hunts", json={"platform": "nope"}).status_code == 422
    status = c.get("/api/v1/status").json()
    assert set(status["platforms"]) == {"zomato", "swiggy"} and status["labels"]["swiggy"] == "Swiggy Food"


def test_replay_and_heatmap(client):
    c, _ = client
    hid, _events = run_hunt(c)
    replay = c.get(f"/api/v1/hunts/{hid}/replay").json()
    kinds = [e["type"] for e in replay["events"]]
    assert kinds[0] == "status" and kinds[-1] == "done" and kinds.count("deal") == 2
    assert all("t" in e for e in replay["events"])
    assert replay["hunt"]["id"] == hid
    assert c.get("/api/v1/hunts/999/replay").status_code == 404
    assert c.get("/api/v1/hunts").json()[0]["deal_count"] == 2
    cells = c.get("/api/v1/deals/heatmap").json()
    assert sum(cell["n"] for cell in cells) == 2 and cells[0]["min"] == 120 and 0 <= cells[0]["dow"] <= 6


def test_weekly_summary_and_dish_comparison(client):
    c, _ = client
    run_hunt(c)                                   # FakeHunt: "Thali x1" at Mess A (150) and Mess B (120)
    week = c.get("/api/v1/insights/weekly").json()
    assert week["deals"] == 2 and week["hunts"] == 1 and week["cheapest"]["restaurant"] == "Mess B"
    assert week["average"] == 135 and week["by_platform"] == {"zomato": 2} and week["best_day"]["name"]
    groups = c.get("/api/v1/deals/compare").json()
    assert len(groups) == 1 and groups[0]["dish"] == "Thali" and groups[0]["spread"] == 30
    assert [o["restaurant"] for o in groups[0]["options"]] == ["Mess B", "Mess A"]


def test_login_route_serves_the_app_but_unknown_api_paths_stay_404(client):
    from app import config
    c, _ = client
    assert c.get("/api/v1/nope").status_code == 404
    if config.FRONTEND_DIST.exists():
        for path in ("/", "/login"):
            r = c.get(path)
            assert r.status_code == 200 and '<div id="root">' in r.text
        assert c.get("/../../etc/passwd").status_code in (200, 404)   # never a file outside dist
        assert c.get("/favicon.svg").headers["content-type"].startswith("image/svg")
