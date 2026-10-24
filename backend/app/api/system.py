from fastapi import APIRouter, HTTPException

from app import config
from app.services import hunt_runner, platform_tools
from app.services.errors import describe

router = APIRouter(tags=["system"])
_has_token = platform_tools.has_token


@router.get("/status")
def status():
    return {"running": hunt_runner.is_running(), "platforms": {n: _has_token(n) for n in config.PLATFORMS},
            "labels": {n: config.PLATFORM_LABELS.get(n, n) for n in config.PLATFORMS}}


@router.get("/addresses")
async def addresses():
    """Saved delivery addresses per platform, for the address picker. A platform that is not logged in or fails is listed under `errors`."""
    if hunt_runner.is_running():
        raise HTTPException(409, "A hunt is running. Addresses load when it finishes.")
    found, errors = {}, {}
    for name in config.PLATFORMS:
        try:
            found[name] = await platform_tools.list_addresses(name)
        except Exception as e:
            errors[name] = str(e) if isinstance(e, platform_tools.LoginNeeded) else describe(e)
    return {"addresses": found, "errors": errors}
