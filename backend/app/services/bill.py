"""A deal's money comes from the platform's own bill, never from the model's arithmetic.

The agent copies the bill lines it read (label + amount). This module sorts those lines into delivery, fees, tax and
discount, and checks that every amount really appears in something the platform sent back. A line the platform never
returned is a made-up line, and the deal is rejected.
"""
import re

# Lines that restate the total are not charges: counting them would double the bill.
TOTAL_LINE = re.compile(r"to ?pay|grand total|total payable|amount payable|payable|bill total|net total", re.I)
TAX = re.compile(r"gst|tax|vat|cess|restaurant charge", re.I)          # "Taxes & Charges", "CGST", "Restaurant charges"
PACKING = re.compile(r"packag|packing", re.I)
PLATFORM = re.compile(r"platform|handling|convenience|service fee", re.I)
DELIVERY = re.compile(r"deliver", re.I)
DISCOUNT = re.compile(r"discount|offer|coupon|promo|saving|cashback|\boff\b", re.I)
ITEMS = re.compile(r"item|sub ?total|food|dish|cart", re.I)
STOP_WORDS = {"and", "the", "for", "your", "fee", "fees", "charge", "charges", "total", "amount"}

NUMBER = re.compile(r"\d+(?:\.\d+)?")


def _words(text: str) -> set[str]:
    return {w for w in re.sub(r"[^a-z0-9]+", " ", text.lower()).split() if len(w) >= 3 and w not in STOP_WORDS}


def _numbers(text: str) -> set[float]:
    return {float(n) for n in NUMBER.findall(text.replace(",", ""))}


def clean(lines) -> list[dict]:
    """Normalise whatever the model sent into [{label, amount}], dropping anything unusable."""
    out = []
    for line in lines or []:
        try:
            label, amount = str(line["label"]).strip(), float(line["amount"])
        except (KeyError, TypeError, ValueError):
            continue
        if label:
            out.append({"label": label, "amount": round(amount, 2)})
    return out


def classify(lines: list[dict]) -> dict:
    """Sort bill lines into the Deal's money fields. Charges are positive; discounts come back as a positive number."""
    money = dict(item_total=0.0, delivery_fee=0.0, platform_fee=0.0, packaging_fee=0.0, taxes=0.0, other_charges=0.0, discount=0.0)
    for line in lines:
        label, amount = line["label"], line["amount"]
        if TOTAL_LINE.search(label):
            continue
        if amount < 0 or (DISCOUNT.search(label) and not ITEMS.search(label)):
            money["discount"] += abs(amount)
        elif TAX.search(label):
            money["taxes"] += amount
        elif PACKING.search(label):
            money["packaging_fee"] += amount
        elif PLATFORM.search(label):
            money["platform_fee"] += amount
        elif DELIVERY.search(label):
            money["delivery_fee"] += amount
        elif ITEMS.search(label):
            money["item_total"] += amount
        else:
            money["other_charges"] += amount
    return {k: round(v, 2) for k, v in money.items()}


def verify(lines: list[dict], final_payable: float, platform_output: list[str]) -> list[str]:
    """Every non-zero amount (and the final price) must appear in what the platform returned, with a matching label word."""
    blob = "\n".join(platform_output)
    if not blob.strip():
        return ["No cart or bill has been read from this platform yet. Build the cart and read its bill first."]
    seen_numbers, seen_words = _numbers(blob), _words(blob)
    errors = []
    if final_payable not in seen_numbers and round(final_payable) not in seen_numbers:
        errors.append(f"final_payable {final_payable:g} does not appear in the platform's cart response.")
    for line in lines:
        amount = abs(line["amount"])
        if amount == 0:
            continue
        if amount not in seen_numbers and round(amount) not in seen_numbers:
            errors.append(f'Bill line "{line["label"]}" ({line["amount"]:g}) does not appear in the platform\'s response. Copy the lines exactly.')
        elif _words(line["label"]) and not (_words(line["label"]) & seen_words):
            errors.append(f'Bill line "{line["label"]}" is not a label the platform used. Copy the label exactly.')
    return errors
