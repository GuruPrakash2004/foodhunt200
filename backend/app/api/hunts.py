import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.db import repository as repo
from app.schemas import HuntRequest
from app.services import hunt_runner

router = APIRouter(prefix="/hunts", tags=["hunts"])


@router.post("", status_code=202)
async def start_hunt(req: HuntRequest):
    hunt_id = await hunt_runner.start(req.model_dump())
    if hunt_id is None:
        raise HTTPException(409, "A hunt is already running.")
    return {"hunt_id": hunt_id}


@router.post("/stop")
def stop_hunt():
    if not hunt_runner.stop():
        raise HTTPException(409, "No hunt is running.")
    return {"ok": True}


@router.get("")
def recent_hunts():
    return repo.list_hunts()


@router.get("/{hunt_id}/replay")
def hunt_replay(hunt_id: int):
    """A finished hunt's timestamped steps, for scrubbing back through it."""
    hunt, events = repo.get_hunt(hunt_id), repo.get_events(hunt_id)
    if hunt is None or events is None:
        raise HTTPException(404, "No recording for this hunt.")
    return {"hunt": hunt, "events": events}


@router.get("/{hunt_id}/events")
async def hunt_events(hunt_id: int):
    state = hunt_runner.hunts.get(hunt_id)
    if state is None:
        raise HTTPException(404, "Unknown hunt (events are only kept until the server restarts).")

    async def stream():
        i = 0
        while True:
            while i < len(state["events"]):
                yield f"data: {json.dumps(state['events'][i], ensure_ascii=False)}\n\n"
                i += 1
            if state["done"]:
                return
            state["wake"].clear()
            try:
                await asyncio.wait_for(state["wake"].wait(), timeout=15)
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
