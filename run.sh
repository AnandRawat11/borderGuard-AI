#!/bin/bash
# ==============================================================================
# IBVAP Tactical Command Center - Unified Runner Script
# Launches both FastAPI Backend (8000) and Vite React Frontend (3000)
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/ibvap-backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# Load project-local configuration when present. Keep secrets in .env (ignored
# by git); the runner only exports them to the child services.
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi

# Local runner defaults. Production deployments must provide their own
# environment and must never rely on seeded accounts.
if [ "${IBVAP_ENV:-development}" != "production" ]; then
  : "${IBVAP_SEED_DEMO_USERS:=true}"
  export IBVAP_SEED_DEMO_USERS
fi
export IBVAP_SEED_DEMO_ALERTS="${IBVAP_SEED_DEMO_ALERTS:-false}"
export IBVAP_ENABLE_SIMULATION="${IBVAP_ENABLE_SIMULATION:-false}"
export NO_PROXY="localhost,127.0.0.1,0.0.0.0,${NO_PROXY:-}"
export no_proxy="localhost,127.0.0.1,0.0.0.0,${no_proxy:-}"

echo "=========================================================="
echo "🛡️  STARTING IBVAP TACTICAL DEFENSE PLATFORM"
echo "=========================================================="

# 1. Clean up any existing processes on ports 8000 & 3000
echo "[-] Checking ports 8000 & 3000..."
PIDS=$(lsof -ti :8000 -ti :3000 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "[-] Freeing existing processes on ports 8000/3000: $PIDS"
  kill -9 $PIDS 2>/dev/null
  sleep 1
fi

# 2. Check the project-local Python virtual environment
PYTHON_BIN=""
for candidate in "$BACKEND_DIR/venv/bin/python" "$BACKEND_DIR/.venv/bin/python"; do
  if [ -x "$candidate" ]; then
    PYTHON_BIN="$candidate"
    break
  fi
done
if [ -z "$PYTHON_BIN" ]; then
  PYTHON_BIN="python3"
fi

# 3. Start Backend
echo "[-] Starting FastAPI Backend on http://localhost:8000..."
cd "$BACKEND_DIR" || exit 1
"$PYTHON_BIN" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "[+] Backend PID: $BACKEND_PID"

# 4. Start Frontend
echo "[-] Starting Vite Frontend on http://localhost:3000..."
cd "$FRONTEND_DIR" || exit 1
npm run dev -- --host 0.0.0.0 --port 3000 &
FRONTEND_PID=$!
echo "[+] Frontend PID: $FRONTEND_PID"

echo "[-] Waiting for both services..."
for attempt in {1..30}; do
  if "$PYTHON_BIN" -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=1)' >/dev/null 2>&1 \
    && "$PYTHON_BIN" -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:3000/", timeout=1)' >/dev/null 2>&1; then
    echo "[+] Backend and frontend are ready."
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "[!] Services did not become ready in time. Check the logs above."
  fi
  sleep 1
done

echo ""
echo "=========================================================="
echo "✅  IBVAP IS LIVE AND RUNNING!"
echo "👉  Dashboard:    http://localhost:3000/"
echo "👉  Evidence:     http://localhost:3000/alerts"
echo "👉  Timeline:     http://localhost:3000/analytics"
echo "👉  API Swagger:  http://localhost:8000/docs"
echo "=========================================================="
echo "Press Ctrl+C to stop both servers."
echo ""

# Handle clean exit on Ctrl+C
cleanup() {
  echo ""
  echo "[-] Shutting down IBVAP servers..."
  kill -9 "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  PIDS=$(lsof -ti :8000 -ti :3000 2>/dev/null)
  if [ -n "$PIDS" ]; then
    kill -9 $PIDS 2>/dev/null
  fi
  echo "[+] Servers stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM

wait
