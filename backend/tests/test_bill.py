import argparse

from app.services import bill
from app.services.agent import Hunt

# What a platform cart response might look like (the labels and numbers are the platform's, not ours).
CART = """Cart summary
Item total: ₹120
Delivery partner fee: ₹0 (Free Delivery applied)
Platform fee: ₹5
Taxes & Charges: ₹9.50
Coupon FREEDEL: -₹0
To pay: ₹134.50
"""
LINES = [
    {"label": "Item total", "amount": 120}, {"label": "Delivery partner fee", "amount": 0},
    {"label": "Platform fee", "amount": 5}, {"label": "Taxes & Charges", "amount": 9.5},
]


def test_lines_are_sorted_from_their_labels():
    money = bill.classify(bill.clean(LINES + [{"label": "To pay", "amount": 134.5}]))   # the total line is ignored
    assert money == dict(item_total=120, delivery_fee=0, platform_fee=5, packaging_fee=0, taxes=9.5, other_charges=0, discount=0)


def test_discounts_and_odd_fees():
    money = bill.classify([{"label": "Items", "amount": 199}, {"label": "Packaging charges", "amount": 10},
                           {"label": "CGST", "amount": 4.5}, {"label": "Rain fee", "amount": 12}, {"label": "Offer FLAT61", "amount": -61}])
    assert (money["item_total"], money["packaging_fee"], money["taxes"], money["other_charges"], money["discount"]) == (199, 10, 4.5, 12, 61)


def test_real_bill_passes_the_check_and_an_invented_line_does_not():
    assert bill.verify(bill.clean(LINES), 134.5, [CART]) == []
    invented = bill.clean(LINES + [{"label": "Surge fee", "amount": 34}])
    errors = bill.verify(invented, 134.5, [CART])
    assert errors and "Surge fee" in errors[0]
    assert bill.verify(bill.clean(LINES), 150, [CART])                        # a total the platform never showed
    assert bill.verify(bill.clean(LINES), 134.5, [])                          # nothing was ever read from the platform


def make_hunt():
    h = Hunt(argparse.Namespace(budget=200, verbose=False))
    h.platform_output["zomato"] = [CART]
    return h


def record(h, lines, final=134.5):
    return h.record({"platform": "zomato", "restaurant": "Truth Bowl", "items": "Rajma Chawal Bowl x1", "bill_lines": lines, "final_payable": final})


def test_hunt_records_a_verified_bill_and_keeps_the_platforms_own_lines():
    h = make_hunt()
    assert record(h, LINES).startswith("Recorded")
    deal = h.deals[0]
    assert (deal.item_total, deal.platform_fee, deal.taxes, deal.final_payable) == (120, 5, 9.5, 134.5)
    assert [l["label"] for l in deal.bill_lines] == ["Item total", "Delivery partner fee", "Platform fee", "Taxes & Charges"]


def test_lumping_the_tax_into_other_is_rejected():
    h = make_hunt()
    lumped = [l for l in LINES if "Tax" not in l["label"]] + [{"label": "Other", "amount": 9.5}]
    assert "not a label the platform used" in record(h, lumped)       # "Other" is the model's word, not the platform's
    assert h.deals == []


def test_a_bill_with_no_gst_line_is_not_accepted():
    h = Hunt(argparse.Namespace(budget=200, verbose=False))
    h.platform_output["zomato"] = ["Item total: 120\nPlatform fee: 5\nTo pay: 125"]   # a response that never showed any tax
    lines = [{"label": "Item total", "amount": 120}, {"label": "Platform fee", "amount": 5}]
    assert "GST" in record(h, lines, 125)
    assert h.deals == []
