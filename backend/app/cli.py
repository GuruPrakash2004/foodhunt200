"""Command line hunt.  From backend/:  python -m app.cli [--budget 150 --diet veg --platform zomato --watch 10]"""
import argparse
import asyncio
from contextlib import AsyncExitStack

from app import config
from app.db import repository as repo
from app.services.agent import Hunt
from app.services.excel import SHEET_FILE, load_rows, save_deals


def print_report(hunt: Hunt) -> None:
    deals = sorted(hunt.deals, key=lambda d: d.final_payable)
    print("\n" + "=" * 72)
    print(f"FoodHunt200 — {len(deals)} deal(s) at or under ₹{hunt.args.budget} all-in")
    print("=" * 72)
    for i, d in enumerate(deals, 1):
        tag = " 🛟 RESCUE" if d.source == "food_rescue" else ""
        print(f"{i:>2}. ₹{d.final_payable:<6.0f} {d.platform.upper():<7} {d.restaurant}{tag}")
        print(f"     {d.items} | items ₹{d.item_total:.0f} + fees ₹"
              f"{d.delivery_fee + d.platform_fee + d.packaging_fee + d.other_charges:.0f}"
              f" + tax ₹{d.taxes:.0f} − off ₹{abs(d.discount):.0f} | {d.offer or '-'}")
    print("\n" + (hunt.summary or "").strip())
    total = save_deals(deals)
    print(f"\nSaved to the database and {SHEET_FILE.name} ({total} row(s)). Open the app and order the one you like 🍛")


async def main() -> None:
    p = argparse.ArgumentParser(description="FoodHunt200 deal agent")
    p.add_argument("--budget", type=float, default=config.DEFAULT_BUDGET)
    p.add_argument("--platform", choices=["both", *config.PLATFORMS], default="both")
    p.add_argument("--diet", default=config.DEFAULT_DIET)
    p.add_argument("--address", default=config.DEFAULT_ADDRESS)
    p.add_argument("--queries", default=config.DEFAULT_QUERIES)
    p.add_argument("--max-carts", type=int, default=6)
    p.add_argument("--extra-items", type=int, default=2, choices=range(0, 4), help="items the agent may add to unlock an offer")
    p.add_argument("--watch", type=int, default=0, help="repeat every N minutes")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args()

    repo.init_db()
    print(f"Loaded {SHEET_FILE.name}: {len(load_rows())} saved deal(s). Add notes in the Feedback column anytime.")
    while True:
        hunt_id = repo.start_hunt(vars(args))
        async with AsyncExitStack() as stack:
            hunt = Hunt(args, on_deal=lambda d: repo.insert_deal(hunt_id, d))
            await hunt.connect(stack)
            await hunt.run()
            repo.finish_hunt(hunt_id, "done", hunt.summary)
            print_report(hunt)
        if not args.watch:
            break
        print(f"\nNext hunt in {args.watch} min…")
        await asyncio.sleep(args.watch * 60)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBye 👋")
