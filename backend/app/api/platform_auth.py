from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse

from app import config
from app.services import platform_login, platform_tools
from app.services.auth import require_user

router = APIRouter(prefix="/auth/platform", tags=["platform login"])
_page = "<!doctype html><meta charset=utf-8><body style='font:16px system-ui;background:#0a0a0a;color:#f2f2ef;display:grid;place-items:center;height:100vh'><h2>{}</h2>"


def _known(name: str) -> str:
    if name not in config.PLATFORMS:
        raise HTTPException(404, "Unknown platform.")
    return name


@router.post("/{name}/connect")
async def connect(name: str, _=Depends(require_user)):
    """Start a login for this platform. The page opens the returned address in a new tab and polls /status."""
    _known(name)
    if not config.HOSTED:
        raise HTTPException(404, "Logging in from the page is only for the hosted app. Run a hunt to log in locally.")
    if platform_tools.has_token(name):
        return {"status": "connected", "url": "", "error": ""}
    platform_login.start(name)
    return platform_login.snapshot(name)


@router.get("/{name}/status")
def status(name: str, _=Depends(require_user)):
    _known(name)
    return platform_login.snapshot(name)


@router.get("/{name}/callback", response_class=HTMLResponse, include_in_schema=False)
def callback(name: str, code: str = Query(""), state: str = Query(""), error: str = Query("")):
    """Public on purpose: the platform's login page sends the browser here. Only the pending login's own state is accepted."""
    _known(name)
    if error or not code or not platform_login.resolve(name, code, state):
        return HTMLResponse(_page.format("That login link did not work. Close this tab and press Connect again."), status_code=400)
    return HTMLResponse(_page.format("Connected. You can close this tab."))
