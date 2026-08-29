#!/usr/bin/env bash
# Starts the backend and frontend together, and stops both on Ctrl-C.
#
#   ./start.sh
#
# Needs no configuration. Add credentials to backend/.env when you have them —
# see SETUP.md.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d backend/venv ]; then
  echo "→ Creating the Python virtualenv (first run only)…"
  python3 -m venv backend/venv
  ./backend/venv/bin/pip install --quiet --upgrade pip
  ./backend/venv/bin/pip install --quiet -r backend/requirements.txt
fi

if [ ! -d frontend/node_modules ]; then
  echo "→ Installing frontend packages (first run only)…"
  (cd frontend && npm install --silent)
fi

# Stop both halves whatever way this script exits.
cleanup() { echo; echo "→ Shutting down…"; kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "→ Backend  http://localhost:8000  (docs at /docs)"
(cd backend && ./venv/bin/uvicorn app.main:app --port 8000) &

echo "→ Frontend http://localhost:5173"
(cd frontend && npm run dev -- --port 5173) &

wait
