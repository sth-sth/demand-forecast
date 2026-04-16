#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}"
API_HEALTH_URL="${API_HEALTH_URL:-http://localhost:8000/api/health}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-180}"

COMPOSE_CMD=()

has_command() {
  command -v "$1" >/dev/null 2>&1
}

init_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return
  fi

  if has_command docker-compose; then
    COMPOSE_CMD=(docker-compose)
    return
  fi

  echo "Error: docker compose (or docker-compose) is required." >&2
  exit 1
}

compose() {
  "${COMPOSE_CMD[@]}" "$@"
}

ensure_env_file() {
  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      cp .env.example .env
      echo "Created .env from .env.example"
    else
      echo "Error: .env.example not found." >&2
      exit 1
    fi
  fi
}

open_url() {
  local url="$1"

  if has_command xdg-open; then
    xdg-open "$url" >/dev/null 2>&1 || true
    return
  fi

  if [[ -n "${BROWSER:-}" ]]; then
    "$BROWSER" "$url" >/dev/null 2>&1 || true
    return
  fi

  echo "Could not auto-open browser. Open this URL manually: $url"
}

wait_for_api() {
  local timeout_seconds="$1"
  local started_at now elapsed

  started_at="$(date +%s)"
  echo "Waiting for API health: $API_HEALTH_URL"

  while true; do
    if curl --silent --show-error --fail "$API_HEALTH_URL" >/dev/null 2>&1; then
      echo "API health check passed."
      return 0
    fi

    now="$(date +%s)"
    elapsed=$((now - started_at))

    if (( elapsed >= timeout_seconds )); then
      echo "API did not become healthy within ${timeout_seconds}s." >&2
      echo "Check logs with: ${COMPOSE_CMD[*]} logs --tail=120 backend frontend db" >&2
      return 1
    fi

    sleep 2
  done
}

print_urls() {
  echo
  echo "Frontend: $FRONTEND_URL"
  echo "Backend OpenAPI: http://localhost:8000/docs"
  echo "API health: $API_HEALTH_URL"
  echo
}

cmd_up() {
  ensure_env_file
  compose up --build -d
  wait_for_api "$WAIT_TIMEOUT"
  print_urls
  open_url "$FRONTEND_URL"
}

cmd_down() {
  compose down
}

cmd_logs() {
  compose logs -f --tail=120
}

cmd_status() {
  compose ps
}

cmd_open() {
  print_urls
  open_url "$FRONTEND_URL"
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/demo.sh up      Build and start all services for demo
  ./scripts/demo.sh down    Stop and remove services
  ./scripts/demo.sh status  Show service status
  ./scripts/demo.sh logs    Follow service logs
  ./scripts/demo.sh open    Open frontend URL in browser

Optional environment variables:
  FRONTEND_URL   (default: http://localhost:8080)
  API_HEALTH_URL (default: http://localhost:8000/api/health)
  WAIT_TIMEOUT   (default: 180)
EOF
}

main() {
  init_compose_cmd

  local action="${1:-up}"

  case "$action" in
    up) cmd_up ;;
    down) cmd_down ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    open) cmd_open ;;
    help|-h|--help) usage ;;
    *)
      echo "Unknown action: $action" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"