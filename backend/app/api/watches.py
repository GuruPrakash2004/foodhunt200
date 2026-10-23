from fastapi import APIRouter

from app.db import repository as repo
from app.schemas import WatchRequest

router = APIRouter(prefix="/watches", tags=["watches"])


@router.get("")
def watches():
    return repo.list_watches()


@router.post("", status_code=201)
def add_watch(req: WatchRequest):
    return {"id": repo.add_watch(req.query.strip(), req.max_price)}


@router.delete("/{watch_id}")
def remove_watch(watch_id: int):
    repo.delete_watch(watch_id)
    return {"ok": True}
