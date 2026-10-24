from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app import config
from app.db import repository as repo
from app.schemas import ProfileRequest
from app.services import auth

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(ProfileRequest):
    access_code: str = Field(min_length=1, max_length=200)


@router.get("/config")
def public_config():
    """Tells the login page whether it must ask for an access code."""
    return {"hosted": config.HOSTED}


@router.post("/login")
def login(req: LoginRequest, request: Request, response: Response):
    if not config.HOSTED:
        raise HTTPException(404, "Not found")
    ip = auth.client_ip(request)
    if auth.locked_out(ip):
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")
    if not auth.credentials_ok(req.mobile, req.access_code):
        auth.record_failure(ip)
        raise HTTPException(401, "That mobile number or access code is not right.")   # never says which one
    profile = repo.save_profile(req.name, req.mobile)
    response.set_cookie(config.SESSION_COOKIE, auth.issue_token(req.mobile, req.name), max_age=config.SESSION_DAYS * 86400,
                        httponly=True, secure=True, samesite="lax", path="/")
    return profile


@router.get("/session")
def session(request: Request):
    user = auth.current_user(request) if config.HOSTED else None
    if config.HOSTED and user is None:
        raise HTTPException(401, "Please sign in.")
    return repo.get_profile()


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(config.SESSION_COOKIE, path="/")
    return {"ok": True}
