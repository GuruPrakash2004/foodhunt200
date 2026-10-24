"""Zomato's cart answer, turned into the bill the app shows.

`create_cart` returns `charge_breakdown` (platform fee, delivery, taxes) and `final_amount`, but the breakdown leaves out
charges the app does show (the restaurant's packaging charge, and the tax on the platform fee, which the app folds into it). The platform's `final_amount` is still the amount
payable, so whatever the itemised lines do not explain is that missing charge. It is listed under its own label so the
bill adds up to exactly what the app will charge, and the model copies lines instead of doing arithmetic.
"""
import json

TOLERANCE = 0.02


def _charge(c: dict) -> tuple[float, float]:
    """(amount without its own tax, tax on it) for one entry of base_charges."""
    taxes = round(sum(t.get("tax_amount") or 0 for t in c.get("taxes") or []), 2)
    return round((c.get("amount") or 0) - taxes, 2) if c.get("charge_type") == "CHARGE_ID_PLATFORM" else round(c.get("amount") or 0, 2), taxes


def lines(text: str) -> list[dict]:
    """[{label, amount}] for a create_cart answer, or [] when the text is not one."""
    try:
        cart = json.loads(text)["cart"]
        final, item_total = float(cart["final_amount"]), float(cart["item_total"])
        base = cart["charge_breakdown"].get("base_charges") or []
        cart_taxes = cart["charge_breakdown"].get("taxes") or []
    except (ValueError, KeyError, TypeError, AttributeError):
        return []
    out = [{"label": "Item total", "amount": round(item_total, 2)}]
    gst = round(sum(t.get("tax_amount") or 0 for t in cart_taxes), 2)   # the app's GST line is the cart-level tax only
    for c in base:
        amount, _ = _charge(c)   # the tax on the platform fee is not a GST line in the app; it ends up in the remainder below
        kind = c.get("charge_type", "")
        label = ("Platform fee" if "PLATFORM" in kind else "Delivery fee" if "DELIVERY" in kind
                 else kind.removeprefix("CHARGE_ID_").replace("_", " ").capitalize() or "Charge")
        out.append({"label": label, "amount": amount})
    out.append({"label": "GST (govt. taxes)", "amount": gst})
    missing = round(final - sum(l["amount"] for l in out), 2)
    if abs(missing) > TOLERANCE:
        out.append({"label": "Restaurant packaging charges", "amount": missing})
    return out


def summary(text: str) -> str:
    """A block to put in front of the model: the bill lines and the amount payable."""
    found = lines(text)
    if not found:
        return ""
    final = round(json.loads(text)["cart"]["final_amount"], 2)
    rows = "\n".join(f"  {l['label']}: {l['amount']:g}" for l in found)
    return (f"PLATFORM BILL (built by FoodHunt200 from this cart answer; copy these lines into bill_lines exactly):\n{rows}\n"
            f"  To pay: {final:g}\n")
