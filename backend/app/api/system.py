import json

from fastapi import APIRouter

from app import config
from app.services import hunt_runner

router = APIRouter(tags=["system"])


def _has_token(name: str) -> bool:
    try:
        return bool(json.loads((config.TOKEN_DIR / f"{name}.json").read_text()).get("tokens"))
    except (FileNotFoundError, json.JSONDecodeError):
        return False


@router.get("/status")
def status():
    return {"running": hunt_runner.is_running(), "platforms": {n: _has_token(n) for n in config.PLATFORMS},
            "labels": {n: config.PLATFORM_LABELS.get(n, n) for n in config.PLATFORMS}}
