#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
PID_DIR="$ROOT_DIR/.pids"

mkdir -p "$LOG_DIR" "$PID_DIR"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"

is_running() {
  local pid="$1"
  kill -0 "$pid" 2>/dev/null
}

start_backend() {
  if [[ -f "$BACKEND_PID_FILE" ]] && is_running "$(cat "$BACKEND_PID_FILE")"; then
    echo "Backend already running (PID $(cat "$BACKEND_PID_FILE"))."
  else
    echo "Starting backend..."
    cd "$ROOT_DIR"
    nohup "$ROOT_DIR/.venv/bin/uvicorn" backend.main:app --host 127.0.0.1 --port 8000 > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    echo "Backend started (PID $(cat "$BACKEND_PID_FILE"))."
  fi
}

start_frontend() {
  if [[ -f "$FRONTEND_PID_FILE" ]] && is_running "$(cat "$FRONTEND_PID_FILE")"; then
    echo "Frontend already running (PID $(cat "$FRONTEND_PID_FILE"))."
  else
    echo "Starting frontend..."
    cd "$ROOT_DIR/frontend"
    rm -rf "$ROOT_DIR/frontend/node_modules/.vite"
    nohup npm run dev -- --host 127.0.0.1 --port 5173 --force > "$LOG_DIR/frontend.log" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    echo "Frontend started (PID $(cat "$FRONTEND_PID_FILE"))."
  fi
}

start_backend
start_frontend

echo ""
echo "Dashboard: http://127.0.0.1:5173"
echo "API health: http://127.0.0.1:8000/health"
echo "Logs: $LOG_DIR"
