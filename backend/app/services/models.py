"""Picks an NVIDIA model that works and switches automatically when one fails.

Order tried: the model that worked last, FOODHUNT_MODEL, FOODHUNT_FALLBACK_MODELS, the built-in list of free models
that return tool calls, then every other chat model the key can see on build.nvidia.com. A model that is gone,
rate-limited, overloaded or too slow is skipped for a while (longer each time it fails in a row), and the one that
worked is remembered, so later calls don't wait on a bad model.
"""
import asyncio
import time
from pathlib import Path

import httpx

from app import config
from app.services import nvidia_models

RETRYABLE_CODES = {400, 403, 404, 408, 413, 429, 500, 502, 503, 504}
# How long to skip a model after it fails, by kind of failure (quota resets quickly; a missing model does not).
COOLDOWNS = {429: 60, 413: 60, 404: 3600, 403: 3600, 400: 900}   # a 400 usually means this model cannot do tool calls
DEFAULT_COOLDOWN = 120
MAX_COOLDOWN = 1800     # a model that keeps failing is benched longer each time, up to this many seconds
RETRY_PAUSES = (4, 12)  # seconds to wait between full rounds when every model is busy


def is_switchable(error: Exception) -> bool:
    """True when a different model might succeed (not for a rejected API key)."""
    if isinstance(error, (asyncio.TimeoutError, TimeoutError, httpx.TimeoutException, httpx.ConnectError)):
        return True
    code = getattr(error, "code", None) or getattr(error, "status_code", None)
    if code == 401:
        return False
    return code in RETRYABLE_CODES or isinstance(error, nvidia_models.NvidiaModelError)


def timeout_for(model: str) -> float:
    return config.MODEL_TIMEOUT_S + 5


def cooldown_for(code, strikes: int) -> float:
    """Skip a failing model for longer each time it fails in a row, so one bad model stops costing a timeout per turn."""
    base = COOLDOWNS.get(code, DEFAULT_COOLDOWN)
    return min(base * 2 ** (strikes - 1), max(base, MAX_COOLDOWN))


class ModelRouter:
    def __init__(self):
        self.preferred: list[str] = list(config.MODELS)
        self.discovered: list[str] | None = None   # the rest of the key's chat models, looked up once when needed
        self.bad_until: dict[str, float] = {}
        self.strikes: dict[str, int] = {}          # failures in a row per model; reset when it works
        self.current: str = self._load_last() or (self.preferred[0] if self.preferred else "")

    @staticmethod
    def _load_last() -> str | None:
        try:
            name = Path(config.LAST_MODEL_FILE).read_text().strip()
            return None if name.startswith("gemini") else name or None   # a model remembered from before NVIDIA-only
        except OSError:
            return None

    def _remember(self, model: str) -> None:
        try:
            Path(config.LAST_MODEL_FILE).write_text(model)
        except OSError:
            pass  # remembering is a nicety

    def _order(self, extra: list[str], prefer: tuple = ()) -> list[str]:
        seen, order = set(), []
        for name in [*prefer, self.current, *self.preferred, *extra]:
            if name and name not in seen:
                seen.add(name)
                order.append(name)
        now = time.monotonic()
        usable = [m for m in order if self.bad_until.get(m, 0) <= now]
        return usable or order  # if everything is cooling down, try them all rather than give up

    async def generate(self, messages: list[dict], tools: list[dict], on_switch=lambda old, new, why: None, prefer: tuple = ()):
        """One model call with automatic fallback. Returns the assistant message. `prefer` models are tried first and never become the remembered model."""
        started_on = prefer[0] if prefer else self.current
        reported: set[str] = set()
        pauses = list(RETRY_PAUSES)
        tried: list[str] = []
        extra: list[str] = []
        last: Exception | None = None
        while True:
            candidates = [m for m in self._order(extra, prefer) if m not in tried]
            if not candidates and self.discovered is None:
                self.discovered = await nvidia_models.discover()   # only look the list up once the known models have failed
                extra = self.discovered
                continue
            if not candidates:
                if pauses and last is not None and is_switchable(last):  # every model is busy or out of quota: pause, then try again
                    await asyncio.sleep(pauses.pop(0))
                    tried.clear()
                    self.bad_until = {m: t for m, t in self.bad_until.items() if self.strikes.get(m, 0) >= 3}
                    continue
                raise last or RuntimeError("No NVIDIA model available. Check NVIDIA_API_KEY.")
            model = candidates[0]
            try:
                msg = await asyncio.wait_for(nvidia_models.chat(model, messages, tools), timeout=timeout_for(model))
            except Exception as e:
                if not is_switchable(e):
                    raise
                last = e
                tried.append(model)
                code = getattr(e, "code", None) or getattr(e, "status_code", None)
                self.strikes[model] = self.strikes.get(model, 0) + 1
                self.bad_until[model] = time.monotonic() + cooldown_for(code, self.strikes[model])
                nxt = [m for m in self._order(extra, prefer) if m not in tried]
                if nxt:
                    on_switch(model, nxt[0], str(e)[:120] or type(e).__name__)
                    reported.add(nxt[0])
                continue
            if model != started_on and model not in reported:  # found after the model list was looked up
                on_switch(started_on, model, "previous model unavailable")
            self.strikes[model] = 0
            if not prefer and model != self.current:
                self._remember(model)
                self.current = model
            return msg


router = ModelRouter()  # shared by every hunt so a working model stays chosen
