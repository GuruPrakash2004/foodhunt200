"""Runs one hunt at a time in the background and keeps its event stream for the UI."""
import argparse
import asyncio
import time
import traceback
from contextlib import AsyncExitStack

from app.db import repository as repo
from app.services.agent import Hunt
from app.services.errors import describe
from app.services.excel import save_deals

HuntClass = Hunt  # tests swap this for a fake

hunts: dict[int, dict] = {}  # hunt_id -> {"events": [...], "done": bool}
hunt_lock = asyncio.Lock()


def is_running() -> bool:
    return hunt_lock.locked()


def alerts_for(hunt_id: int) -> list[dict]:
    """Price-watch matches among the deals this hunt found."""
    found = repo.list_deals(hunt_id=hunt_id)
    alerts = []
    for w in repo.list_watches():
        for d in found:
            if w["query"].lower() in f"{d['restaurant']} {d['items']}".lower() and d["final_payable"] <= w["max_price"]:
                alerts.append({"type": "alert", "watch": w["query"], "deal_key": d["deal_key"],
                               "text": f"{d['items']} at {d['restaurant']} for ₹{d['final_payable']:.0f}"})
    return alerts


async def _run(hunt_id: int, params: dict) -> None:
    state = hunts[hunt_id]

    started = time.monotonic()

    def emit(event: dict) -> None:
        event.setdefault("t", round(time.monotonic() - started, 2))  # seconds into the hunt, for replay
        state["events"].append(event)
        state["wake"].set()  # push to the stream right away
    args = argparse.Namespace(**params, verbose=False, watch=0)
    status, summary = "done", ""
    try:
        hunt = HuntClass(args, emit=emit, on_deal=lambda d: repo.insert_deal(hunt_id, d))
        async with AsyncExitStack() as stack:
            emit({"type": "status", "text": "Connecting… a browser tab may open for a one-time login."})
            await hunt.connect(stack)
            await hunt.run()
        summary = hunt.summary
        if getattr(hunt, "error", "") and not getattr(hunt, "deals", []):
            status = "error"
        deals = getattr(hunt, "deals", [])
        if deals:  # keep the Excel history log in step with the database
            save_deals(deals)
        for alert in alerts_for(hunt_id):
            emit(alert)
    except (Exception, SystemExit) as e:
        status = "error"
        traceback.print_exc()  # full detail in the server terminal
        emit({"type": "error", "text": describe(e)})
    finally:
        repo.finish_hunt(hunt_id, status, summary)
        emit({"type": "done", "status": status, "summary": summary})
        repo.save_events(hunt_id, state["events"])
        state["done"] = True
        state["wake"].set()
        hunt_lock.release()


async def start(params: dict) -> int | None:
    """Start a hunt; returns its id, or None if one is already running."""
    if hunt_lock.locked():
        return None
    await hunt_lock.acquire()
    hunt_id = repo.start_hunt(params)
    hunts[hunt_id] = {"events": [], "done": False, "wake": asyncio.Event()}
    asyncio.create_task(_run(hunt_id, params))
    return hunt_id
