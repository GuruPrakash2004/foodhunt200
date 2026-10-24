"""Sign-in for the hosted app: an allowed mobile number plus a private access code, answered with a signed session cookie (JWT).

Off in local mode (config.HOSTED is False): `require_user` then lets everything through, as before.
"""
import hmac
import re
import secrets
import time
from collections import defaultdict, deque

import jwt
from fastapi import HTTPException, Request

from app import config

WINDOW_S = 600           # failed sign-ins are remembered for ten minutes
MAX_PER_IP = 5           # ...five from one address
MAX_ALL = 30             # ...and thirty in total, so rotating addresses does not help
_fails: dict[str, deque] = defaultdict(deque)
_all_fails: deque = deque()


def check_settings() -> None:
    """Refuse to start hosted without everything that keeps it private."""
    missing = [n for n, v in (("FOODHUNT_PUBLIC_URL", config.PUBLIC_URL), ("FOODHUNT_ACCESS_CODE", config.ACCESS_CODE),
                              ("FOODHUNT_ALLOWED_MOBILES", config.ALLOWED_MOBILES), ("FOODHUNT_TOKEN_KEY", config.TOKEN_KEY)) if not v]
    if len(config.JWT_SECRET) < 32:
        missing.append("FOODHUNT_JWT_SECRET (at least 32 characters)")
    if missing:
        raise RuntimeError("Hosted mode needs: " + ", ".join(missing))


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return (forwarded.split(",")[0].strip() if forwarded else "") or (request.client.host if request.client else "unknown")


def _prune(q: deque, now: float) -> None:
    while q and now - q[0] > WINDOW_S:
        q.popleft()


def locked_out(ip: str) -> bool:
    now = time.monotonic()
    _prune(_fails[ip], now)
    _prune(_all_fails, now)
    return len(_fails[ip]) >= MAX_PER_IP or len(_all_fails) >= MAX_ALL


def record_failure(ip: str) -> None:
    now = time.monotonic()
    _fails[ip].append(now)
    _all_fails.append(now)


def clear_failures() -> None:
    _fails.clear()
    _all_fails.clear()


def credentials_ok(mobile: str, code: str) -> bool:
    """Both checks always run, so timing does not reveal which one was wrong."""
    number = re.sub(r"\D", "", mobile)[-10:]
    allowed = number in config.ALLOWED_MOBILES
    right = hmac.compare_digest(code.encode(), config.ACCESS_CODE.encode())
    return allowed and right


def issue_token(mobile: str, name: str) -> str:
    now = int(time.time())
    return jwt.encode({"sub": mobile, "name": name, "iat": now, "exp": now + config.SESSION_DAYS * 86400, "jti": secrets.token_hex(8)},
                      config.JWT_SECRET, algorithm="HS256")


def read_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None


def current_user(request: Request) -> dict | None:
    token = request.cookies.get(config.SESSION_COOKIE)
    claims = read_token(token) if token else None
    if claims and claims["sub"] in config.ALLOWED_MOBILES:   # an allow-list change takes effect on the next request
        return claims
    return None


def require_user(request: Request) -> dict | None:
    """FastAPI dependency: 401 unless the session cookie is valid. A no-op when running locally."""
    if not config.HOSTED:
        return None
    user = current_user(request)
    if user is None:
        raise HTTPException(401, "Please sign in.")
    return user
