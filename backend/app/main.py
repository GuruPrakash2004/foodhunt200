"""FoodHunt200 API. API at /api/v1, UI at /. From backend/:  uvicorn app.main:app --host 127.0.0.1 --port 8000"""
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import config
from app.api import deals, hunts, profile, system, watches
from app.db import repository as repo


@asynccontextmanager
async def lifespan(app: FastAPI):
    repo.init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="FoodHunt200", lifespan=lifespan, docs_url=f"{config.API_PREFIX}/docs",
                  openapi_url=f"{config.API_PREFIX}/openapi.json", redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
    api = APIRouter(prefix=config.API_PREFIX)
    for module in (hunts, deals, watches, profile, system):
        api.include_router(module.router)
    app.include_router(api)
    if config.FRONTEND_DIST.exists():  # production: serve the built React app
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
