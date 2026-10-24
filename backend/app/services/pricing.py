"""Deterministic bill checks. The LLM finds deals; this code decides if they're real.

Never trust a model's arithmetic for money. Every deal the agent reports must carry
the full bill breakdown read from the platform's cart, and must add up.
"""
from dataclasses import dataclass, asdict, field
from datetime import datetime

ALL_PLATFORMS = ("zomato", "swiggy")
TOLERANCE = 2.0  # rupees; platforms round fees/taxes slightly differently


@dataclass
class Deal:
    platform: str                 # one of ALL_PLATFORMS
    restaurant: str
    items: str                    # e.g. "Veg Thali x1"
    item_total: float             # menu price of items before anything else
    final_payable: float          # the "To Pay" / "Grand Total" line from the cart bill
    delivery_fee: float = 0.0
    platform_fee: float = 0.0     # a.k.a. handling / convenience fee
    packaging_fee: float = 0.0
    taxes: float = 0.0            # GST + restaurant charges
    other_charges: float = 0.0    # rain / surge / small-cart fee, etc.
    discount: float = 0.0         # total of coupon + item offers (positive number)
    offer: str = ""               # coupon code or offer name applied
    source: str = "menu"          # "menu" or "food_rescue"
    distance_km: float | None = None
    eta_min: int | None = None
    bill_lines: list = field(default_factory=list)   # [{label, amount}] exactly as the platform printed them
    cart_calls: list = field(default_factory=list)   # [{tool, args}] the cart calls that built this bill, replayed by "Add to cart"
    found_at: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))

    def computed_total(self) -> float:
        return round(
            self.item_total + self.delivery_fee + self.platform_fee + self.packaging_fee
            + self.taxes + self.other_charges - abs(self.discount), 2)

    def key(self) -> tuple:
        return (self.platform, self.restaurant.lower(), self.items.lower(), round(self.final_payable))

    def to_dict(self) -> dict:
        d = asdict(self)
        d["computed_total"] = self.computed_total()
        return d


def validate(deal: Deal, budget: float) -> list[str]:
    """Return a list of problems. Empty list = deal accepted."""
    errors = []
    if deal.final_payable <= 0:
        errors.append("final_payable must be > 0 (read it from the cart bill, don't estimate).")
    if deal.item_total <= 0:
        errors.append("item_total must be > 0.")
    diff = abs(deal.computed_total() - deal.final_payable)
    if diff > TOLERANCE:
        errors.append(
            f"Bill doesn't add up: item_total + fees + taxes - discount = {deal.computed_total()} "
            f"but final_payable = {deal.final_payable} (off by {diff:.2f}). "
            "Re-read the cart bill and include every fee line.")
    if deal.final_payable > budget:
        errors.append(f"final_payable {deal.final_payable} is over the budget of {budget}.")
    if deal.taxes <= 0:
        errors.append("No GST/tax line on this bill. Every bill carries GST (often shown as 'Taxes & Charges'), so the bill was not read in full: read the cart bill again and copy every line.")
    if deal.platform not in ALL_PLATFORMS:
        errors.append(f"platform must be one of {', '.join(ALL_PLATFORMS)}.")
    return errors
