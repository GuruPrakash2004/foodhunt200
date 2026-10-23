#!/usr/bin/env bash
# One command, one URL: builds the frontend, then serves UI (/) and API (/api/v1) from FastAPI.
set -euo pipefail
cd "$(dirname "$0")"
[ -d frontend/node_modules ] || (cd frontend && npm install)
(cd frontend && npm run build)
cd backend
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt; }
echo "FoodHunt200 → http://127.0.0.1:8099   (API docs: /api/v1/docs)"
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8099
