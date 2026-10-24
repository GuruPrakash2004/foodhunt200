"""Hosted platform login. The platform's login page sends the browser back to this server's public address
(/api/v1/auth/platform/<name>/callback) instead of localhost, and the code it brings completes the login.

One login at a time per platform, held in memory. Hunts never start one: with no valid login they stop with a clear message.
"""
import asyncio
import hmac
from contextlib import AsyncExitStack
from urllib.parse import parse_qs, urlparse

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from app import config
from app.services.errors import describe

LOGIN_TIMEOUT_S = 300


class HostedLoginNeeded(RuntimeError):
    pass


class Login:
    def __init__(self, name: str):
        self.name = name
        self.status = "starting"   # starting -> awaiting -> connected | failed
        self.url = ""
        self.state: str | None = None
        self.error = ""
        self.future: asyncio.Future = asyncio.get_running_loop().create_future()


LOGINS: dict[str, Login] = {}


def redirect_uri(name: str) -> str:
    return f"{config.PUBLIC_URL}{config.API_PREFIX}/auth/platform/{name}/callback"


def handlers(name: str):
    """The two callbacks the OAuth client needs, wired to the pending login instead of a local browser."""
    label = config.PLATFORM_LABELS.get(name, name)

    async def redirect_handler(auth_url: str) -> None:
        login = LOGINS.get(name)
        if login is None or login.status != "starting":   # a hunt hit an expired login: never wait for a browser nobody opened
            raise HostedLoginNeeded(f"Your {label} login has expired. Press Connect in the top bar to log in again.")
        login.url = auth_url
        login.state = (parse_qs(urlparse(auth_url).query).get("state") or [None])[0]
        login.status = "awaiting"

    async def callback_handler() -> tuple[str, str | None]:
        return await asyncio.wait_for(LOGINS[name].future, LOGIN_TIMEOUT_S)

    return redirect_handler, callback_handler


def resolve(name: str, code: str, state: str) -> bool:
    """The callback route hands over what the platform sent. Accepted only for the pending login with the same state."""
    login = LOGINS.get(name)
    if login is None or login.status != "awaiting" or not login.state or not hmac.compare_digest(state.encode(), login.state.encode()):
        return False
    if not login.future.done():
        login.future.set_result((code, state))
    return True


async def _run(login: Login) -> None:
    from app.services.oauth import make_oauth
    cfg = config.PLATFORMS[login.name]
    try:
        auth = make_oauth(login.name, cfg["url"], cfg["port"], cfg["client_id"], cfg["client_secret"])
        async with AsyncExitStack() as stack:
            read, write, _ = await stack.enter_async_context(streamablehttp_client(cfg["url"], auth=auth))
            session = await stack.enter_async_context(ClientSession(read, write))
            await session.initialize()
        login.status = "connected"
    except asyncio.TimeoutError:
        login.status, login.error = "failed", "The login took too long. Press Connect and try again."
    except Exception as e:   # includes the platform refusing the redirect address
        login.status, login.error = "failed", describe(e)


def start(name: str) -> Login:
    current = LOGINS.get(name)
    if current and current.status in ("starting", "awaiting"):
        return current
    login = Login(name)
    LOGINS[name] = login
    asyncio.create_task(_run(login))
    return login


def snapshot(name: str) -> dict:
    login = LOGINS.get(name)
    if login is None:
        return {"status": "idle", "url": "", "error": ""}
    return {"status": login.status, "url": login.url if login.status == "awaiting" else "", "error": login.error}
