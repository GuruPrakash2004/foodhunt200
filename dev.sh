#!/usr/bin/env bash
# Development with hot reload on ONE URL: http://localhost:5173
# Vite serves the React app and proxies /api/v1 to the FastAPI backend (auto-reload) on a private port.
set -euo pipefail
cd "$(dirname "$0")"

[ -d frontend/node_modules ] || (cd frontend && npm install)
if [ ! -d backend/.venv ]; then
  (cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt)
fi

(cd backend && exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8099 --reload --reload-dir app) &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT INT TERM

echo "FoodHunt200 (dev) → http://localhost:5173   (API docs: /api/v1/docs)"
[ "$(uname)" = "Darwin" ] && (sleep 2 && open "http://localhost:5173") &
cd frontend && npm run dev
