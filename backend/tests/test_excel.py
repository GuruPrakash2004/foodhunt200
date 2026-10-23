from openpyxl import load_workbook

from app.services import excel
from app.services.pricing import Deal


def deal(name, price, platform="zomato"):
    return Deal(platform=platform, restaurant=name, items="Thali x1", item_total=price - 20, delivery_fee=10,
                platform_fee=10, final_payable=price, distance_km=2.0)


def test_history_keeps_feedback_and_adds_platform(tmp_path):
    path = tmp_path / "h.xlsx"
    excel.save_deals([deal("A", 150)], path)
    wb = load_workbook(path)
    wb.active["E2"] = "tasty"
    wb.save(path)
    assert excel.save_deals([deal("A", 150), deal("B", 120, "swiggy")], path) == 2
    rows = excel.load_rows(path)
    assert [r[0] for r in rows] == ["B", "A"]            # cheapest first
    assert rows[1][4] == "tasty"                          # feedback survived
    assert rows[0][5] == "swiggy" and rows[0][6]          # platform and last-seen recorded
