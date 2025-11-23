#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMMAND="${1:-up}"

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
  compose() { docker-compose -f docker-compose.prod.yml "$@"; }
elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
  compose() { docker compose -f docker-compose.prod.yml "$@"; }
else
  echo "ERROR: docker compose is required. Please install Docker Desktop or docker-compose." >&2
  exit 1
fi

cleanup_stale_containers() {
  echo "Cleaning up stale containers and images..."
  compose down --remove-orphans 2>/dev/null || true
  
  for container in attendance-postgres attendance-gateway attendance-admin; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
      echo "Removing stale container: ${container}"
      docker rm -f "${container}" 2>/dev/null || true
    fi
  done
  
  docker ps -a --filter "name=attendance-" --format "{{.ID}}" | while read -r container_id; do
    if [[ -n "${container_id}" ]]; then
      echo "Removing orphaned container: ${container_id}"
      docker rm -f "${container_id}" 2>/dev/null || true
    fi
  done
  
  echo "Cleanup complete."
}

wait_for_postgres() {
  echo "Waiting for PostgreSQL to be ready..."
  local retries=30
  until compose exec -T postgres pg_isready -U "${POSTGRES_USER:-attendance_user}" -d attendance >/dev/null 2>&1; do
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
      compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-attendance_user}" -d attendance < "${migration}" >/dev/null || {
        echo "WARNING: Migration $(basename "${migration}") may have failed or already been applied." >&2
      }
    fi
  done
  echo "Database migrations complete."
}

check_env_file() {
  local env_file="${ROOT_DIR}/.env"
  if [[ ! -f "${env_file}" ]] && [[ -f "${ROOT_DIR}/.env.production" ]]; then
    env_file="${ROOT_DIR}/.env.production"
  fi
  
  if [[ ! -f "${env_file}" ]]; then
    echo "WARNING: .env file not found." >&2
    echo "Required: POSTGRES_PASSWORD, DEVICE_TOKEN_SECRET" >&2
    if [[ "${COMMAND}" == "up" ]] || [[ "${COMMAND}" == "start" ]] || [[ "${COMMAND}" == "deploy" ]]; then
      echo "ERROR: Cannot start without .env file" >&2
      exit 1
    fi
  else
    set -a
    source "${env_file}"
    set +a
  fi
}

case "${COMMAND}" in
  up|start|deploy)
    check_env_file
    echo "Deploying production stack..."
    cleanup_stale_containers
    echo "Building images..."
    compose build --no-cache
    echo "Starting services..."
    compose up -d
    wait_for_postgres
    apply_migrations
    echo
    echo "Production stack is running:"
    compose ps
    ;;
    
  down|stop)
    echo "Stopping production stack..."
    cleanup_stale_containers
    ;;
    
  restart)
    "${BASH_SOURCE[0]}" down
    sleep 2
    "${BASH_SOURCE[0]}" up
    ;;
    
  logs)
    compose logs -f "${2:-}"
    ;;
    
  ps|status)
    compose ps
    ;;
    
  rebuild)
    check_env_file
    echo "Rebuilding and restarting production stack..."
    cleanup_stale_containers
    compose build --no-cache
    compose up -d
    wait_for_postgres
    apply_migrations
    echo "Rebuild complete."
    ;;
    
  *)
    echo "Usage: ./scripts/deploy.sh [up|down|restart|logs|ps|rebuild]" >&2
    exit 1
    ;;
esac

