#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMMAND="${1:-up}"

ADMIN_PORT="${ADMIN_PORT:-8001}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
GATEWAY_PORT="${GATEWAY_PORT:-8080}"
DEVICE_TOKEN_SECRET="${DEVICE_TOKEN_SECRET:-dev-secret}"
BUFFER_DB_PATH="${BUFFER_DB_PATH:-/tmp/gateway-buffer.db}"

ADMIN_PID=""
GATEWAY_PID=""
FRONTEND_PID=""

# Determine docker compose command once
if command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose -f docker-compose.dev.yml "$@"; }
elif command -v docker >/dev/null 2>&1; then
  compose() { docker compose -f docker-compose.dev.yml "$@"; }
else
  echo "ERROR: docker compose is required. Please install Docker Desktop or docker-compose." >&2
  exit 1
fi

kill_if_running() {
  local pid="${1:-}"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1; then
    kill "${pid}" >/dev/null 2>&1 || true
    wait "${pid}" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  echo
  echo "Shutting down development stack..."
  kill_if_running "${FRONTEND_PID}"
  kill_if_running "${GATEWAY_PID}"
  kill_if_running "${ADMIN_PID}"
  compose down >/dev/null 2>&1 || true
}

wait_for_postgres() {
  echo "Waiting for PostgreSQL to be ready..."
  local retries=30
  until compose exec -T postgres pg_isready -U attendance_user -d attendance >/dev/null 2>&1; do
    sleep 2
    retries=$((retries - 1))
    if [[ ${retries} -le 0 ]]; then
      echo "ERROR: PostgreSQL did not become ready in time." >&2
      exit 1
    fi
  done
  echo "PostgreSQL is ready."
}

apply_migrations() {
  local migrations=(
    "${ROOT_DIR}/migrations/attendance.sql"
    "${ROOT_DIR}/migrations/02-grant-permissions.sql"
    "${ROOT_DIR}/migrations/03-add-rfid-uid.sql"
  )

  for migration in "${migrations[@]}"; do
    if [[ -f "${migration}" ]]; then
      echo "Applying $(basename "${migration}")..."
      compose exec -T postgres psql -v ON_ERROR_STOP=1 -U attendance_user -d attendance < "${migration}" >/dev/null
    fi
  done
  echo "Database migrations complete."
}

ensure_python_env() {
  if [[ ! -d "${ROOT_DIR}/admin/venv" ]]; then
    echo "Creating Python virtual environment for Admin API..."
    python3 -m venv "${ROOT_DIR}/admin/venv"
    # shellcheck disable=SC1091
    source "${ROOT_DIR}/admin/venv/bin/activate"
    pip install --upgrade pip >/dev/null
    pip install -r "${ROOT_DIR}/admin/requirements.txt" >/dev/null
    deactivate
  fi
}

start_admin_api() {
  echo "Starting Admin API (port ${ADMIN_PORT})..."
  pushd "${ROOT_DIR}/admin" >/dev/null
  # shellcheck disable=SC1091
  source "venv/bin/activate"
  export PG_URL="postgresql://attendance_user:dev_password_123@localhost:5432/attendance"
  export PORT="${ADMIN_PORT}"
  export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000}"
  python3 -m uvicorn main:app --reload --host 0.0.0.0 --port "${ADMIN_PORT}" &
  ADMIN_PID=$!
  deactivate
  popd >/dev/null
}

start_gateway() {
  echo "Starting Gateway (port ${GATEWAY_PORT})..."
  pushd "${ROOT_DIR}/gateway" >/dev/null
  env \
    PG_URL="postgresql://attendance_user:dev_password_123@localhost:5432/attendance?sslmode=disable" \
    DEVICE_TOKEN_SECRET="${DEVICE_TOKEN_SECRET}" \
    BUFFER_DB_PATH="${BUFFER_DB_PATH}" \
    PORT="${GATEWAY_PORT}" \
    go run . &
  GATEWAY_PID=$!
  popd >/dev/null
}

start_frontend() {
  echo "Starting frontend (port ${FRONTEND_PORT})..."
  if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
    echo "Installing npm dependencies..."
    npm install >/dev/null
  fi
  npm run dev -- --hostname 0.0.0.0 --port "${FRONTEND_PORT}" &
  FRONTEND_PID=$!
}

case "${COMMAND}" in
  up)
    trap cleanup EXIT INT TERM

    echo "Booting development stack..."
    compose up -d postgres
    wait_for_postgres
    apply_migrations
    ensure_python_env
    start_admin_api
    start_gateway
    start_frontend

    echo
    echo "All services are running:"
    echo "  Frontend:      http://localhost:${FRONTEND_PORT}"
    echo "  Admin API:     http://localhost:${ADMIN_PORT}"
    echo "  Gateway API:   http://localhost:${GATEWAY_PORT}"
    echo "  PostgreSQL:    localhost:5432"
    echo
    echo "Press Ctrl+C to stop everything."

    wait
    ;;

  down|stop)
    echo "Stopping development stack..."
    compose down
    ;;

  restart)
    "${BASH_SOURCE[0]}" down
    "${BASH_SOURCE[0]}" up
    ;;

  *)
    echo "Usage: ./scripts/dev.sh [up|down|stop|restart]" >&2
    exit 1
    ;;
esac

