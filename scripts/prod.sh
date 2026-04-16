#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WAIT_TIMEOUT="${WAIT_TIMEOUT:-240}"
COMPOSE_CMD=()
ENV_FILES=(--env-file .env --env-file .env.prod)
COMPOSE_FILES=(-f docker-compose.prod.yml)

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
  "${COMPOSE_CMD[@]}" "${ENV_FILES[@]}" "${COMPOSE_FILES[@]}" "$@"
}

read_env_var() {
  local key="$1"
  local file="$2"
  awk -F= -v k="$key" '$1==k { $1=""; sub(/^=/, ""); print; exit }' "$file" | tr -d '"' | xargs
}

ensure_env_files() {
  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      cp .env.example .env
      echo "Created .env from .env.example"
    else
      echo "Error: .env.example not found." >&2
      exit 1
    fi
  fi

  if [[ ! -f .env.prod ]]; then
    if [[ -f .env.prod.example ]]; then
      cp .env.prod.example .env.prod
      echo "Created .env.prod from .env.prod.example"
      echo "Edit .env.prod before production launch." >&2
    else
      echo "Error: .env.prod.example not found." >&2
      exit 1
    fi
  fi

  local domain acme_email
  domain="$(read_env_var DOMAIN .env.prod)"
  acme_email="$(read_env_var ACME_EMAIL .env.prod)"

  if [[ -z "$domain" || "$domain" == "demo.example.com" ]]; then
    echo "Error: set a real DOMAIN in .env.prod (current: '$domain')." >&2
    exit 1
  fi

  if [[ -z "$acme_email" || "$acme_email" == "ops@example.com" ]]; then
    echo "Error: set a real ACME_EMAIL in .env.prod (current: '$acme_email')." >&2
    exit 1
  fi
}

wait_for_service() {
  local domain timeout_seconds
  domain="$(read_env_var DOMAIN .env.prod)"
  timeout_seconds="$1"

  local endpoint
  if getent ahosts "$domain" >/dev/null 2>&1; then
    endpoint="https://${domain}/api/health"
  else
    endpoint="http://localhost/api/health"
  fi

  echo "Waiting for service endpoint: $endpoint"

  local started_at now elapsed
  started_at="$(date +%s)"

  while true; do
    if curl --silent --show-error --fail --max-time 5 "$endpoint" >/dev/null 2>&1; then
      echo "Service endpoint is healthy."
      return 0
    fi

    now="$(date +%s)"
    elapsed=$((now - started_at))
    if (( elapsed >= timeout_seconds )); then
      echo "Service did not become healthy within ${timeout_seconds}s." >&2
      echo "Inspect logs with: ${COMPOSE_CMD[*]} ${ENV_FILES[*]} ${COMPOSE_FILES[*]} logs --tail=120" >&2
      return 1
    fi

    sleep 3
  done
}

print_summary() {
  local domain
  domain="$(read_env_var DOMAIN .env.prod)"

  echo
  echo "Public URL: https://${domain}"
  echo "Health URL: https://${domain}/api/health"
  echo "OpenAPI via domain: https://${domain}/api/docs"
  echo
}

cmd_up() {
  ensure_env_files
  compose up --build -d
  wait_for_service "$WAIT_TIMEOUT"
  print_summary
}

cmd_down() {
  compose down
}

cmd_status() {
  compose ps
}

cmd_logs() {
  compose logs -f --tail=120
}

cmd_restart() {
  compose restart
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/prod.sh up       Build and start production stack (HTTPS)
  ./scripts/prod.sh down     Stop production stack
  ./scripts/prod.sh status   Show production stack status
  ./scripts/prod.sh logs     Follow production stack logs
  ./scripts/prod.sh restart  Restart running production stack

Required files:
  .env       (created from .env.example when missing)
  .env.prod  (created from .env.prod.example when missing)

Required .env.prod variables:
  DOMAIN
  ACME_EMAIL

Optional environment variables:
  WAIT_TIMEOUT (default: 240)
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
    restart) cmd_restart ;;
    help|-h|--help) usage ;;
    *)
      echo "Unknown action: $action" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
