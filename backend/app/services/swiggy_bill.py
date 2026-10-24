"""Swiggy's cart answer, turned into bill lines.

`get_food_cart` / `update_food_cart` answer in plain text ("Item total: ₹130", "Taxes & charges: ₹24.48", "TO PAY: ₹154") next to
a long item list and widget notes. Models mix those up (item names read as bill lines, the total counted twice), so the
bill lines are read here and given to the model ready to copy. The lines are the platform's own labels and amounts.
"""
import re

LINE = re.compile(r"^\s*(?P<label>[A-Za-z][A-Za-z0-9 &/().%'-]*?)\s*:\s*(?P<sign>[-−–]?)\s*(?:₹|Rs\.?)?\s*(?P<sign2>[-−–]?)\s*(?P<amount>FREE|[\d,]+(?:\.\d+)?)\s*$", re.I | re.M)
TOTAL = re.compile(r"to ?pay|grand total|amount payable", re.I)
DISCOUNT = re.compile(r"discount|coupon|offer|saving|promo|cashback", re.I)
TOLERANCE = 2.0   # Swiggy rounds TO PAY to a whole rupee


def _amount(m: re.Match) -> float:
    if m["amount"].upper() == "FREE":
        return 0.0
    value = float(m["amount"].replace(",", ""))
    negative = bool(m["sign"] or m["sign2"]) or bool(DISCOUNT.search(m["label"]))
    return -value if negative else value


def lines(text: str) -> tuple[list[dict], float] | None:
    """([{label, amount}], to_pay) for a Swiggy cart answer, or None when the text is not one."""
    found, to_pay = [], None
    for m in LINE.finditer(text):
        label = m["label"].strip()
        if TOTAL.search(label):
            to_pay = _amount(m) if m["amount"].upper() != "FREE" else 0.0
            to_pay = abs(to_pay)
        elif not label.lower().startswith(("note", "cart widget", "items")):
            found.append({"label": label, "amount": _amount(m)})
    if to_pay is None or not any(re.search(r"item|sub ?total", l["label"], re.I) for l in found):
        return None
    return found, to_pay


def summary(text: str) -> str:
    """A block to put in front of the model: the bill lines and the amount payable."""
    parsed = lines(text)
    if not parsed:
        return ""
    found, to_pay = parsed
    gap = round(to_pay - sum(l["amount"] for l in found), 2)
    if abs(gap) > TOLERANCE:    # something the cart text does not itemise: say so instead of letting the model guess it
        return ""
    rows = "\n".join(f"  {l['label']}: {l['amount']:g}" for l in found)
    return (f"PLATFORM BILL (built by FoodHunt200 from this cart answer; copy these lines into bill_lines exactly):\n{rows}\n"
            f"  To pay: {to_pay:g}\n")
