from app.services.pricing import Deal, validate


def make(**kw):
    base = dict(platform="swiggy", restaurant="Test Mess", items="Veg Thali x1",
                item_total=149, delivery_fee=25, platform_fee=10, packaging_fee=15,
                taxes=9.45, discount=40, final_payable=168.45, offer="FLAT40")
    base.update(kw)
    return Deal(**base)


def test_valid_deal_accepted():
    assert validate(make(), 200) == []


def test_bill_that_does_not_add_up_rejected():
    errs = validate(make(final_payable=120), 200)  # model "forgot" fees
    assert any("doesn't add up" in e for e in errs)


def test_over_budget_rejected():
    errs = validate(make(item_total=249, final_payable=268.45), 200)
    assert any("over the budget" in e for e in errs)


def test_rounding_tolerance():
    assert validate(make(final_payable=169), 200) == []  # within ₹2


def test_negative_discount_sign_is_normalised():
    assert validate(make(discount=-40), 200) == []
