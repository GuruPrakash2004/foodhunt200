"""OAuth 2.1 + PKCE for remote MCP servers (Swiggy, Zomato), with tokens cached on disk.

First run opens your browser -> you log in with OTP on the platform's own page ->
the platform redirects to http://localhost:<port>/callback -> we capture the code.
Tokens are saved in data/tokens/<name>.json and refreshed automatically next time.
"""
import asyncio
import json
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from mcp.client.auth import OAuthClientProvider, TokenStorage
from mcp.shared.auth import OAuthClientInformationFull, OAuthClientMetadata, OAuthToken

from cryptography.fernet import Fernet, InvalidToken

from app import config
from app.config import TOKEN_DIR
from app.db import repository as repo



class FileTokenStorage(TokenStorage):
    def __init__(self, name: str):
        TOKEN_DIR.mkdir(exist_ok=True)
        self.path = TOKEN_DIR / f"{name}.json"

    def _load(self) -> dict:
        try:
            return json.loads(self.path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _save(self, data: dict) -> None:
        self.path.write_text(json.dumps(data, indent=2))
        self.path.chmod(0o600)

    async def get_tokens(self) -> OAuthToken | None:
        t = self._load().get("tokens")
        return OAuthToken.model_validate(t) if t else None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        d = self._load(); d["tokens"] = tokens.model_dump(mode="json"); self._save(d)

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        c = self._load().get("client")
        return OAuthClientInformationFull.model_validate(c) if c else None

    async def set_client_info(self, info: OAuthClientInformationFull) -> None:
        d = self._load(); d["client"] = info.model_dump(mode="json"); self._save(d)


class DbTokenStorage(FileTokenStorage):
    """Hosted mode: the same token store, kept encrypted inside the database so it survives restarts and is backed up with it."""

    def __init__(self, name: str):
        self.name = name
        self.fernet = Fernet(config.TOKEN_KEY.encode())

    def _load(self) -> dict:
        blob = repo.get_secret(self.name)
        if blob is None:
            return {}
        try:
            return json.loads(self.fernet.decrypt(blob))
        except (InvalidToken, json.JSONDecodeError):
            return {}   # a wrong key or damaged data counts as "not logged in"

    def _save(self, data: dict) -> None:
        repo.set_secret(self.name, self.fernet.encrypt(json.dumps(data).encode()))


class _CallbackCatcher:
    """Tiny one-shot local web server that waits for ?code=...&state=..."""

    def __init__(self, port: int):
        self.port = port
        self.result: dict = {}
        self.done = threading.Event()

    def start(self) -> None:
        catcher = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                q = parse_qs(urlparse(self.path).query)
                catcher.result = {k: v[0] for k, v in q.items()}
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(b"<h2>FoodHunt200: login done. You can close this tab.</h2>")
                catcher.done.set()

            def log_message(self, *a):  # keep the console quiet
                pass

        server = HTTPServer(("127.0.0.1", self.port), Handler)
        threading.Thread(target=server.handle_request, daemon=True).start()


def make_oauth(name: str, server_url: str, port: int, client_id: str = "", client_secret: str = "") -> OAuthClientProvider:
    if config.HOSTED:   # the login page returns to this server's public address and the tokens live in the database
        from app.services import platform_login
        redirect, storage = platform_login.redirect_uri(name), DbTokenStorage(name)
        redirect_handler, callback_handler = platform_login.handlers(name)
    else:
        redirect, storage = f"http://localhost:{port}/callback", FileTokenStorage(name)

    # If the platform gave you a registered client_id (Swiggy Builders Club does), pre-seed it
    # so the SDK skips dynamic client registration.
    if client_id and not storage._load().get("client"):
        info = OAuthClientInformationFull(
            client_id=client_id,
            client_secret=client_secret or None,
            redirect_uris=[redirect],
            grant_types=["authorization_code", "refresh_token"],
            response_types=["code"],
            token_endpoint_auth_method="client_secret_post" if client_secret else "none",
            client_name="FoodHunt200",
        )
        d = storage._load(); d["client"] = info.model_dump(mode="json"); storage._save(d)

    if not config.HOSTED:
        catcher = _CallbackCatcher(port)

        async def redirect_handler(auth_url: str) -> None:
            catcher.start()
            print(f"\n[{name}] Opening browser to log in. If it doesn't open, visit:\n{auth_url}\n")
            webbrowser.open(auth_url)

        async def callback_handler() -> tuple[str, str | None]:
            ok = await asyncio.to_thread(catcher.done.wait, 300)
            if not ok or "code" not in catcher.result:
                raise RuntimeError(f"[{name}] Login timed out or was denied: {catcher.result}")
            return catcher.result["code"], catcher.result.get("state")

    return OAuthClientProvider(
        server_url=server_url,
        client_metadata=OAuthClientMetadata(
            client_name="FoodHunt200",
            redirect_uris=[redirect],
            grant_types=["authorization_code", "refresh_token"],
            response_types=["code"],
        ),
        storage=storage,
        redirect_handler=redirect_handler,
        callback_handler=callback_handler,
    )
