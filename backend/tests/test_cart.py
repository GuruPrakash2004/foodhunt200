import asyncio

from app.services import hunt_runner, platform_tools
from app.services.agent import Hunt
from app.services.pricing import Deal
from tests.test_api import client  # noqa: F401  (fixture)


def test_parse_addresses_from_json_and_text():
    zomato = '{"addresses": [{"address_id": "1", "location_name": "12 MG Road, Bengaluru"}]}'
    assert platform_tools.parse_addresses(zomato) == [{"label": "12 MG Road, Bengaluru", "text": "12 MG Road, Bengaluru"}]
    swiggy = {"addresses": [{"id": "x", "addressLine": "Tech Park, Pune", "phoneNumber": "999", "addressTag": "Office"},
                            {"id": "y", "addressLine": "Tech Park, Pune", "addressTag": "Office"}]}
    got = platform_tools.parse_addresses(swiggy)
    assert got == [{"label": "Office · Tech Park, Pune", "text": "Tech Park, Pune"}]       # duplicates dropped, phone never read
    plain = platform_tools.parse_addresses("1. Home - 12 MG Road\n2. Office - Tech Park")
    assert [a["text"] for a in plain] == ["Home - 12 MG Road", "Office - Tech Park"]


def test_hunt_remembers_cart_calls_since_last_clear():
    hunt = Hunt.__new__(Hunt)
    hunt.cart_calls = {}
    hunt._track_cart("swiggy", "update_food_cart", {"cartItems": [1]})
    hunt._track_cart("swiggy", "search_menu", {"q": "x"})           # reads are not cart calls
    hunt._track_cart("swiggy", "get_addresses", {})                  # "addresses" contains "add" but is not a cart call
    hunt._track_cart("swiggy", "get_food_cart", {"addressId": "a"})
    hunt._track_cart("swiggy", "flush_food_cart", {})
    hunt._track_cart("swiggy", "update_food_cart", {"cartItems": [2]})
    hunt._track_cart("swiggy", "apply_food_coupon", {"couponCode": "A"})
    assert hunt.cart_calls["swiggy"] == [{"tool": "update_food_cart", "args": {"cartItems": [2]}}, {"tool": "apply_food_coupon", "args": {"couponCode": "A"}}]
    hunt._track_cart("zomato", "create_cart", {"res_id": 1})
    hunt._track_cart("zomato", "create_cart", {"res_id": 2})        # a new cart replaces the old one
    assert hunt.cart_calls["zomato"] == [{"tool": "create_cart", "args": {"res_id": 2}}]


def test_address_tool_pick_matches_real_names():
    pick = platform_tools.ADDRESS_TOOL.search
    assert pick("get_saved_addresses_for_user") and pick("get_addresses")
    assert not pick("create_address") and not pick("delete_address") and not pick("bind_user_number")


def _store(c, calls):
    from app.db import repository as repo
    repo.insert_deal(None, Deal(platform="zomato", restaurant="R", items="Thali x1", item_total=100, taxes=5, final_payable=105, cart_calls=calls))
    return repo.list_deals()[0]


def test_add_to_cart_replays_stored_calls(client, monkeypatch):  # noqa: F811
    c, _ = client
    deal = _store(c, [{"tool": "add_to_cart", "args": {"item": 2}}])
    assert deal["can_add_to_cart"]
    seen = []

    async def fake(platform, calls):
        seen.append((platform, calls))
        return {"answer": "", "link": "https://zomato.onelink.me/x"}
    monkeypatch.setattr(platform_tools, "add_to_cart", fake)
    r = c.post("/api/v1/deals/cart", json={"key": deal["deal_key"]})
    assert r.status_code == 200 and seen == [("zomato", deal["cart_calls"])]
    assert r.json()["link"] == "https://zomato.onelink.me/x"


def test_add_to_cart_refuses_old_deals_unknown_keys_and_running_hunts(client, monkeypatch):  # noqa: F811
    c, _ = client
    assert c.post("/api/v1/deals/cart", json={"key": "nope"}).status_code == 404
    old = _store(c, [])
    assert not old["can_add_to_cart"]
    assert c.post("/api/v1/deals/cart", json={"key": old["deal_key"]}).status_code == 422
    new = _store(c, [{"tool": "add_to_cart", "args": {}}])
    hunt_runner.hunt_lock._locked = True
    try:
        assert c.post("/api/v1/deals/cart", json={"key": new["deal_key"]}).status_code == 409
        assert c.get("/api/v1/addresses").status_code == 409
    finally:
        hunt_runner.hunt_lock._locked = False


def test_add_to_cart_never_calls_blocked_tools(monkeypatch):
    class S:
        async def call_tool(self, *a): raise AssertionError("must not be called")

    class Ctx:
        async def __aenter__(self): return S(), ["place_order"]
        async def __aexit__(self, *a): pass

    monkeypatch.setattr(platform_tools, "platform_session", lambda name: Ctx())
    try:
        asyncio.run(platform_tools.add_to_cart("zomato", [{"tool": "place_order", "args": {}}]))
    except RuntimeError:
        return
    raise AssertionError("blocked tool was accepted")


def test_zomato_bill_matches_the_app_and_adds_up():
    import json
    from app.services import bill, zomato_bill
    cart = {"cart": {"item_total": 120.0, "final_amount": 153.66, "charge_breakdown": {
        "base_charges": [{"amount": 17.688, "charge_type": "CHARGE_ID_PLATFORM", "taxes": [{"tax_amount": 2.698}]},
                         {"amount": 0.0, "discount": 48.0, "charge_type": "CHARGE_ID_DELIVERY_CHARGE", "taxes": []}],
        "taxes": [{"tax_amount": 9.17}]}}}
    text = json.dumps(cart)
    got = {l["label"]: l["amount"] for l in zomato_bill.lines(text)}
    assert got == {"Item total": 120.0, "Platform fee": 14.99, "Delivery fee": 0.0, "GST (govt. taxes)": 9.17, "Restaurant packaging charges": 9.5}
    shown = zomato_bill.summary(text) + text
    lines = zomato_bill.lines(text)
    assert bill.verify(lines, 153.66, [shown]) == []                     # every amount appears in what the model was shown
    money = bill.classify(lines)
    assert money["packaging_fee"] == 9.5 and money["platform_fee"] == 14.99 and money["taxes"] == 9.17 and money["item_total"] == 120
    assert abs(sum(l["amount"] for l in lines) - 153.66) < 0.01
    assert zomato_bill.lines("not json") == [] and zomato_bill.summary('{"cart": {}}') == ""


def test_cart_links_open_the_cart_or_the_restaurant():
    import json
    zomato = json.dumps({"cart": {"shareable_link": "https://zomato.onelink.me/abc"}})
    assert platform_tools.cart_link("zomato", [], ["ignored", zomato]) == "https://zomato.onelink.me/abc"
    assert platform_tools.cart_link("zomato", [], ["not json"]) == ""
    calls = [{"tool": "update_food_cart", "args": {"restaurantId": "28003"}}]
    assert platform_tools.cart_link("swiggy", calls, []) == "https://www.swiggy.com/menu/28003"
    assert platform_tools.cart_link("swiggy", [{"tool": "x", "args": {}}], []) == ""


def _deal(platform, restaurant, items, price, source="menu"):
    return Deal(platform=platform, restaurant=restaurant, items=items, item_total=price - 40, delivery_fee=20, platform_fee=10,
                taxes=10, final_payable=price, source=source)


def test_same_dish_on_both_apps_keeps_the_cheaper(client):  # noqa: F811
    from app.db import repository as repo
    hunt = repo.create_hunt({}) if hasattr(repo, "create_hunt") else 1
    for d in (_deal("zomato", "Burger King - Indiranagar", "Crispy Veg Burger x1", 180),
              _deal("swiggy", "Burger King", "Crispy Veg Burger x1 + Dip x1", 160),
              _deal("swiggy", "Other Place", "Thali x1", 150)):
        repo.insert_deal(hunt, d)
    best = {(d["platform"], d["restaurant"]) for d in repo.list_deals(best_only=True)}
    assert best == {("swiggy", "Burger King"), ("swiggy", "Other Place")}
    both = {d["platform"]: d for d in repo.list_deals() if d["restaurant"].startswith("Burger")}
    assert both["swiggy"]["rival"] == {"platform": "zomato", "final_payable": 180, "deal_key": both["zomato"]["deal_key"], "gap": 20}
    assert both["zomato"]["cheaper_here"] is False
