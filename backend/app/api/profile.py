from fastapi import APIRouter

from app.db import repository as repo
from app.schemas import ProfileRequest

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("")
def get_profile():
    """The saved profile, or null when nobody has logged in yet."""
    return repo.get_profile()


@router.put("")
def save_profile(req: ProfileRequest):
    return repo.save_profile(req.name, req.mobile)


@router.delete("")
def log_out():
    repo.clear_profile()
    return {"ok": True}
