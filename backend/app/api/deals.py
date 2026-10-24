from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app import config
from app.db import repository as repo
from app.schemas import CartRequest, FeedbackRequest
from app.services import hunt_runner, platform_tools
from app.services.errors import describe
from app.services.excel import save_deals
from app.services.pricing import Deal

router = APIRouter(tags=["deals"])


@router.get("/deals")
def deals(platform: str | None = None, min_price: float | None = None, max_price: float | None = None,
          max_distance: float | None = None, q: str | None = None, favorites: bool = False,
          sort: str = "price", hunt_id: int | None = None, max_age_hours: float | None = None, best_only: bool = True):
    """Deals seen in the last FOODHUNT_DEAL_MAX_AGE_HOURS (4) hours, unless max_age_hours says otherwise.
    When the same dish is on both apps only the cheaper one is listed, unless best_only=false."""
    fresh = repo.FRESH if max_age_hours is None else max_age_hours
    return repo.list_deals(platform, min_price, max_price, max_distance, q, favorites, sort, hunt_id, fresh, best_only)


@router.get("/insights/weekly")
def weekly_summary(days: int = 7):
    return repo.weekly_summary(max(1, min(days, 90)))


@router.get("/deals/compare")
def compare_dishes():
    """The same dish from different restaurants or platforms, side by side."""
    return repo.compare_dishes()


@router.get("/deals/heatmap")
def deal_heatmap():
    """Cheapest times: price stats by weekday and hour."""
    return repo.heatmap()


@router.get("/deals/history")
def deal_history(key: str):
    return repo.history(key)


@router.put("/feedback")
def feedback(req: FeedbackRequest):
    repo.set_feedback(req.key, req.favorite, req.rating, req.note)
    return {"ok": True}


@router.post("/deals/cart")
async def add_to_cart(req: CartRequest):
    """Put a deal's items (and its offer) in the user's real cart in the platform app. Never orders or pays."""
    deal = repo.get_deal(req.key)
    if not deal:
        raise HTTPException(404, "Deal not found.")
    if not deal["cart_calls"]:
        raise HTTPException(422, "This deal was saved before carts were recorded. Hunt again to get one that can be added.")
    if hunt_runner.is_running():
        raise HTTPException(409, "A hunt is running. Try again when it finishes.")
    try:
        added = await platform_tools.add_to_cart(deal["platform"], deal["cart_calls"])
    except platform_tools.LoginNeeded as e:
        raise HTTPException(401, str(e))
    except Exception as e:
        raise HTTPException(502, describe(e))
    return {"ok": True, "platform": deal["platform"], "link": added["link"]}


@router.get("/export.xlsx")
def export_xlsx():
    fields = Deal.__dataclass_fields__
    save_deals([Deal(**{k: v for k, v in d.items() if k in fields}) for d in repo.list_deals(max_age_hours=None)])
    return FileResponse(config.SHEET_FILE, filename="foodhunt-deals.xlsx",
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
