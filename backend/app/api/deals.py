from fastapi import APIRouter
from fastapi.responses import FileResponse

from app import config
from app.db import repository as repo
from app.schemas import FeedbackRequest
from app.services.excel import save_deals
from app.services.pricing import Deal

router = APIRouter(tags=["deals"])


@router.get("/deals")
def deals(platform: str | None = None, min_price: float | None = None, max_price: float | None = None,
          max_distance: float | None = None, q: str | None = None, favorites: bool = False,
          sort: str = "price", hunt_id: int | None = None):
    return repo.list_deals(platform, min_price, max_price, max_distance, q, favorites, sort, hunt_id)


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


@router.get("/export.xlsx")
def export_xlsx():
    fields = Deal.__dataclass_fields__
    save_deals([Deal(**{k: v for k, v in d.items() if k in fields}) for d in repo.list_deals()])
    return FileResponse(config.SHEET_FILE, filename="foodhunt-deals.xlsx",
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
