"""Hosted mode: sign-in with JWT, protected routes, encrypted token storage, platform login state."""
import asyncio
import time

import jwt
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app import config
from app.services import auth

SECRET = "s" * 40
ORIGIN = "https://foodhunt.example"
GOOD = {"name": "Guru", "mobile": "98765 43210", "access_code": "open-sesame-42"}


@pytest.fixture
def hosted(tmp_path, monkeypatch):
    monkeypatch.setenv("FOODHUNT_DB", str(tmp_path / "t.db"))
    for key, value in (("HOSTED", True), ("PUBLIC_URL", ORIGIN), ("JWT_SECRET", SECRET), ("ACCESS_CODE", "open-sesame-42"),
                       ("ALLOWED_MOBILES", frozenset({"9876543210"})), ("TOKEN_KEY", Fernet.generate_key().decode())):
        monkeypatch.setattr(config, key, value)
    auth.clear_failures()
    from app.main import create_app
    with TestClient(create_app(), base_url="https://testserver", headers={"origin": ORIGIN}) as c:
        yield c
    auth.clear_failures()


def sign_in(c):
    r = c.post("/api/v1/auth/login", json=GOOD)
    assert r.status_code == 200
    return r


def test_everything_needs_a_session(hosted):
    for path in ("/deals", "/status", "/profile", "/watches", "/hunts"):
        assert hosted.get(f"/api/v1{path}").status_code == 401
    assert hosted.get("/api/v1/auth/config").json() == {"hosted": True}   # only the login page's own question is public


def test_login_sets_a_locked_down_cookie_and_opens_the_api(hosted):
    cookie = sign_in(hosted).headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=lax" in cookie
    assert hosted.get("/api/v1/profile").json()["mobile"] == "9876543210"
    assert hosted.get("/api/v1/status").status_code == 200
    assert hosted.post("/api/v1/auth/logout").json() == {"ok": True}
    assert hosted.get("/api/v1/deals").status_code == 401


@pytest.mark.parametrize("body", [{**GOOD, "access_code": "wrong"}, {**GOOD, "mobile": "9123456780"}])
def test_wrong_code_or_unlisted_number_gets_the_same_answer(hosted, body):
    r = hosted.post("/api/v1/auth/login", json=body)
    assert r.status_code == 401 and r.json()["detail"] == "That mobile number or access code is not right."
    assert "set-cookie" not in r.headers


def test_repeated_failures_lock_the_door_even_for_the_right_code(hosted):
    for _ in range(auth.MAX_PER_IP):
        assert hosted.post("/api/v1/auth/login", json={**GOOD, "access_code": "nope"}).status_code == 401
    assert hosted.post("/api/v1/auth/login", json=GOOD).status_code == 429


def test_forged_expired_and_revoked_tokens_are_refused(hosted):
    now = int(time.time())
    forged = jwt.encode({"sub": "9876543210", "exp": now + 600}, "another-secret-" * 4, algorithm="HS256")
    expired = jwt.encode({"sub": "9876543210", "exp": now - 5}, SECRET, algorithm="HS256")
    unsigned = jwt.encode({"sub": "9876543210", "exp": now + 600}, None, algorithm="none")
    stranger = jwt.encode({"sub": "9123456780", "exp": now + 600}, SECRET, algorithm="HS256")
    for token in (forged, expired, unsigned, stranger):
        hosted.cookies.clear()
        hosted.cookies.set(config.SESSION_COOKIE, token)
        assert hosted.get("/api/v1/deals").status_code == 401
    hosted.cookies.clear()
    sign_in(hosted)
    assert hosted.get("/api/v1/deals").status_code == 200


def test_requests_from_other_sites_are_refused(hosted):
    r = hosted.post("/api/v1/auth/login", json=GOOD, headers={"origin": "https://evil.example"})
    assert r.status_code == 403 and "set-cookie" not in r.headers


def test_hosted_hides_the_api_docs_and_adds_security_headers(hosted):
    assert hosted.get("/api/v1/docs").status_code == 404
    h = hosted.get("/api/v1/auth/config").headers
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY" and h["cache-control"] == "no-store"


def test_hosted_refuses_to_start_without_a_strong_secret(tmp_path, monkeypatch):
    monkeypatch.setenv("FOODHUNT_DB", str(tmp_path / "t.db"))
    monkeypatch.setattr(config, "HOSTED", True)
    monkeypatch.setattr(config, "JWT_SECRET", "short")
    from app.main import create_app
    with pytest.raises(RuntimeError, match="FOODHUNT_JWT_SECRET"):
        with TestClient(create_app()):
            pass


def test_login_is_off_when_running_locally(tmp_path, monkeypatch):
    monkeypatch.setenv("FOODHUNT_DB", str(tmp_path / "t.db"))
    from app.main import app
    with TestClient(app) as c:
        assert c.get("/api/v1/auth/config").json() == {"hosted": False}
        assert c.post("/api/v1/auth/login", json=GOOD).status_code == 404
        assert c.get("/api/v1/deals").status_code == 200   # no sign-in needed on your own computer


def test_platform_tokens_are_encrypted_in_the_database(hosted):
    from app.db import repository as repo
    from app.services.oauth import DbTokenStorage
    store = DbTokenStorage("zomato")
    store._save({"tokens": {"access_token": "super-secret-value"}})
    assert b"super-secret-value" not in repo.get_secret("zomato")
    assert store._load()["tokens"]["access_token"] == "super-secret-value"
    config.TOKEN_KEY = Fernet.generate_key().decode()   # a different key cannot read it: counts as logged out
    assert DbTokenStorage("zomato")._load() == {}


def test_platform_connect_needs_a_session_and_callback_needs_the_right_state(hosted):
    assert hosted.post("/api/v1/auth/platform/zomato/connect").status_code == 401
    assert hosted.get("/api/v1/auth/platform/nowhere/callback?code=x&state=y").status_code == 404
    assert hosted.get("/api/v1/auth/platform/zomato/callback?code=x&state=y").status_code == 400   # no login is waiting


def test_platform_login_accepts_only_its_own_state():
    from app.services import platform_login

    async def scenario():
        login = platform_login.Login("zomato")
        platform_login.LOGINS["zomato"] = login
        redirect, _ = platform_login.handlers("zomato")
        await redirect("https://login.example/authorize?client_id=1&state=abc123")
        assert platform_login.snapshot("zomato")["status"] == "awaiting"
        assert platform_login.resolve("zomato", "the-code", "wrong") is False
        assert not login.future.done()
        assert platform_login.resolve("zomato", "the-code", "abc123") is True
        assert login.future.result() == ("the-code", "abc123")
        with pytest.raises(platform_login.HostedLoginNeeded):   # a second redirect (a hunt with an expired login) never waits
            await redirect("https://login.example/authorize?state=zzz")
    try:
        asyncio.run(scenario())
    finally:
        platform_login.LOGINS.clear()
