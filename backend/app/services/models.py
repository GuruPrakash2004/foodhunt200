"""Picks a Gemini model that works and switches automatically when one fails.

Order tried: the configured model, FOODHUNT_FALLBACK_MODELS, then every text model the API key can
actually use (fast "flash" models first, newest first). A model that is gone, rate-limited, overloaded or
too slow is skipped for a while, and the one that worked is remembered, so later calls don't wait on a bad model.
"""
import asyncio
import re
import time
from pathlib import Path

import httpx

from app import config

RETRYABLE_CODES = {403, 404, 408, 429, 500, 502, 503, 504}
RETRYABLE_HINTS = ("no longer available", "not found", "overloaded", "unavailable", "quota", "rate limit",
                   "resource exhausted", "deadline", "timed out", "timeout")
# How long to skip a model after it fails, by kind of failure (quota resets quickly; a missing model does not).
COOLDOWNS = {429: 60, 404: 3600, 403: 3600}
DEFAULT_COOLDOWN = 120
RETRY_PAUSES = (4, 12)  # seconds to wait between full rounds when every model is busy
SKIP_NAMES = re.compile(r"image|tts|embed|live|audio|robotics|computer|learnlm|gemma|aqa|deep-research|veo|imagen", re.I)


def is_switchable(error: Exception) -> bool:
    """True when a different model might succeed (not for bad requests or a bad API key)."""
    if isinstance(error, (asyncio.TimeoutError, TimeoutError, httpx.TimeoutException, httpx.ConnectError)):
        return True
    code = getattr(error, "code", None) or getattr(error, "status_code", None)
    if code == 401 or code == 400 and "api key" in str(error).lower():
        return False
    if code in RETRYABLE_CODES:
        return True
    return any(h in str(error).lower() for h in RETRYABLE_HINTS) and code != 400


def _rank(name: str) -> tuple:
    version = re.search(r"gemini-(\d+(?:\.\d+)?)", name)
    return ("flash" not in name, -float(version.group(1)) if version else 0, "lite" not in name, name)


class ModelRouter:
    def __init__(self):
        self.preferred: list[str] = [config.MODEL, *config.FALLBACK_MODELS]
        self.discovered: list[str] | None = None
        self.bad_until: dict[str, float] = {}
        self.current: str = self._load_last() or config.MODEL

    @staticmethod
    def _load_last() -> str | None:
        try:
            return Path(config.LAST_MODEL_FILE).read_text().strip() or None
        except OSError:
            return None

    def _remember(self, model: str) -> None:
        try:
            Path(config.LAST_MODEL_FILE).write_text(model)
        except OSError:
            pass  # remembering is a nicety

    async def _discover(self, client) -> list[str]:
        if self.discovered is None:
            try:
                names = []
                async for m in await client.aio.models.list(config={"page_size": 100}):
                    n = (m.name or "").removeprefix("models/")
                    if n.startswith("gemini") and "generateContent" in (m.supported_actions or []) and not SKIP_NAMES.search(n):
                        names.append(n)
                self.discovered = sorted(set(names), key=_rank)
            except Exception:  # listing is a bonus; the preferred models still work without it
                self.discovered = []
        return self.discovered

    def _order(self, extra: list[str]) -> list[str]:
        seen, order = set(), []
        for name in [self.current, *self.preferred, *extra]:
            if name not in seen:
                seen.add(name)
                order.append(name)
        now = time.monotonic()
        usable = [m for m in order if self.bad_until.get(m, 0) <= now]
        return usable or order  # if everything is cooling down, try them all rather than give up

    async def generate(self, client, contents, make_config, on_switch=lambda old, new, why: None):
        """One model call with automatic fallback. make_config() builds the request config."""
        started_on = self.current
        reported: set[str] = set()
        pauses = list(RETRY_PAUSES)
        tried: list[str] = []
        extra: list[str] = []
        last: Exception | None = None
        while True:
            candidates = [m for m in self._order(extra) if m not in tried]
            if not candidates and extra == [] and self.discovered is None:
                extra = await self._discover(client)  # only look the list up once the known models have failed
                continue
            if not candidates:
                if pauses and is_switchable(last):  # every model is busy or out of quota: pause, then try them all again
                    await asyncio.sleep(pauses.pop(0))
                    tried.clear()
                    self.bad_until.clear()
                    continue
                raise last or RuntimeError("No Gemini model available.")
            model = candidates[0]
            try:
                resp = await asyncio.wait_for(
                    client.aio.models.generate_content(model=model, contents=contents, config=make_config()),
                    timeout=config.MODEL_TIMEOUT_S + 5)
            except Exception as e:
                if not is_switchable(e):
                    raise
                last = e
                tried.append(model)
                code = getattr(e, "code", None) or getattr(e, "status_code", None)
                self.bad_until[model] = time.monotonic() + COOLDOWNS.get(code, DEFAULT_COOLDOWN)
                nxt = [m for m in self._order(extra) if m not in tried]
                if nxt:
                    on_switch(model, nxt[0], str(e)[:120] or type(e).__name__)
                    reported.add(nxt[0])
                continue
            if model != started_on and model not in reported:  # found after the model list was looked up
                on_switch(started_on, model, "previous model unavailable")
            if model != self.current:
                self._remember(model)
            self.current = model
            return resp


router = ModelRouter()  # shared by every hunt so a working model stays chosen
