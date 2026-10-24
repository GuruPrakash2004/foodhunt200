"""FoodHunt200 API. API at /api/v1, UI at /. From backend/:  uvicorn app.main:app --host 127.0.0.1 --port 8000"""
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import config
from app.api import auth as auth_api
from app.api import deals, hunts, platform_auth, profile, system, watches
from app.db import repository as repo
from app.services import auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    if config.HOSTED:
        auth.check_settings()   # refuse to start hosted without what keeps it private
    repo.init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="FoodHunt200", lifespan=lifespan, redoc_url=None,
                  docs_url=None if config.HOSTED else f"{config.API_PREFIX}/docs",
                  openapi_url=None if config.HOSTED else f"{config.API_PREFIX}/openapi.json")
    if not config.HOSTED:   # hosted, the page and the API share one origin through Vercel, so no CORS is needed
        app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def hosted_guard(request: Request, call_next):
        """Hosted only: refuse state-changing requests from other sites, and add security headers."""
        if config.HOSTED and request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            if origin and origin.rstrip("/") != config.PUBLIC_URL:
                return JSONResponse({"detail": "Cross-site request refused."}, status_code=403)
        response = await call_next(request)
        if config.HOSTED:
            response.headers.update({"X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
                                     "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "Cache-Control": "no-store"})
        return response

    api = APIRouter(prefix=config.API_PREFIX)
    api.include_router(auth_api.router)             # sign-in itself is public
    api.include_router(platform_auth.router)        # its routes guard themselves; the callback must stay public
    for module in (hunts, deals, watches, profile, system):
        api.include_router(module.router, dependencies=[Depends(auth.require_user)])
    app.include_router(api)
    if config.FRONTEND_DIST.exists() and not config.HOSTED:  # production: serve the built React app
        dist = config.FRONTEND_DIST.resolve()
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def web(path: str):
            """Real files (favicon, ...) as they are; any other page route (/, /login) gets the app and the client routes it."""
            if path.startswith("api/"):
                raise HTTPException(404, "Not found")
            target = (dist / path).resolve()
            if path and target.is_file() and dist in target.parents:
                return FileResponse(target)
            return FileResponse(dist / "index.html")
    return app


app = create_app()
