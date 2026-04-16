#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WAIT_TIMEOUT="${WAIT_TIMEOUT:-300}"
DNS_WAIT_TIMEOUT="${DNS_WAIT_TIMEOUT:-180}"
HEALTH_MAX_AGE_FACTOR="${HEALTH_MAX_AGE_FACTOR:-3}"

COMPOSE_CMD=()
ENV_FILES=(--env-file .env --env-file .env.prod --env-file .env.duckdns)
COMPOSE_FILES=(-f docker-compose.prod.yml -f docker-compose.duckdns.yml)

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
      echo "Edit .env.prod before long-term launch." >&2
    else
      echo "Error: .env.prod.example not found." >&2
      exit 1
    fi
  fi

  if [[ ! -f .env.duckdns ]]; then
    if [[ -f .env.duckdns.example ]]; then
      cp .env.duckdns.example .env.duckdns
      echo "Created .env.duckdns from .env.duckdns.example"
      echo "Edit .env.duckdns before long-term launch." >&2
    else
      echo "Error: .env.duckdns.example not found." >&2
      exit 1
    fi
  fi
}

validate_config() {
  local domain acme_email duckdns_domain duckdns_token
  domain="$(read_env_var DOMAIN .env.prod)"
  acme_email="$(read_env_var ACME_EMAIL .env.prod)"
  duckdns_domain="$(read_env_var DUCKDNS_DOMAIN .env.duckdns)"
  duckdns_token="$(read_env_var DUCKDNS_TOKEN .env.duckdns)"

  if [[ -z "$domain" || "$domain" == "demo.example.com" ]]; then
    echo "Error: set a real DOMAIN in .env.prod (expected: <subdomain>.duckdns.org)." >&2
    exit 1
  fi

  if [[ -z "$acme_email" || "$acme_email" == "ops@example.com" ]]; then
    echo "Error: set a real ACME_EMAIL in .env.prod." >&2
    exit 1
  fi

  if [[ -z "$duckdns_domain" || "$duckdns_domain" == "your-subdomain" ]]; then
    echo "Error: set DUCKDNS_DOMAIN in .env.duckdns." >&2
    exit 1
  fi

  if [[ -z "$duckdns_token" || "$duckdns_token" == "your-duckdns-token" ]]; then
    echo "Error: set DUCKDNS_TOKEN in .env.duckdns." >&2
    exit 1
  fi

  if [[ "$domain" != "${duckdns_domain}.duckdns.org" ]]; then
    echo "Error: DOMAIN in .env.prod must be '${duckdns_domain}.duckdns.org' for DuckDNS mode." >&2
    exit 1
  fi
}

duckdns_update_once() {
  local duckdns_domain duckdns_token response
  duckdns_domain="$(read_env_var DUCKDNS_DOMAIN .env.duckdns)"
  duckdns_token="$(read_env_var DUCKDNS_TOKEN .env.duckdns)"

  echo "Syncing DuckDNS record..."
  response="$(curl --silent --show-error --max-time 8 "https://www.duckdns.org/update?domains=${duckdns_domain}&token=${duckdns_token}&ip=" || true)"

  if [[ "$response" != "OK" ]]; then
    echo "Error: DuckDNS update failed (response: ${response:-<empty>})." >&2
    exit 1
  fi

  echo "DuckDNS record synced."
}

wait_for_dns_record() {
  local domain="$1"
  local timeout_seconds="$2"
  local public_ip resolved_ip started_at now elapsed

  public_ip="$(curl --silent --show-error --fail --max-time 8 https://api.ipify.org || true)"
  if [[ -z "$public_ip" ]]; then
    echo "Warning: unable to fetch public IP; skipping DNS convergence check." >&2
    return 0
  fi

  echo "Waiting DNS to resolve ${domain} -> ${public_ip}"
  started_at="$(date +%s)"

  while true; do
    resolved_ip="$(getent ahostsv4 "$domain" | awk 'NR==1 { print $1 }' || true)"
    if [[ "$resolved_ip" == "$public_ip" ]]; then
      echo "DNS resolution is aligned."
      return 0
    fi

    now="$(date +%s)"
    elapsed=$((now - started_at))
    if (( elapsed >= timeout_seconds )); then
      echo "Warning: DNS still resolving (${domain} -> ${resolved_ip:-<none>}); continuing." >&2
      return 0
    fi

    sleep 3
  done
}

wait_for_service() {
  local timeout_seconds="$1"
  local domain endpoint_https endpoint_local
  local started_at now elapsed

  domain="$(read_env_var DOMAIN .env.prod)"
  endpoint_https="https://${domain}/api/health"
  endpoint_local="http://localhost/api/health"

  echo "Waiting for service health (${endpoint_https}, fallback ${endpoint_local})"

  started_at="$(date +%s)"
  while true; do
    if curl --silent --show-error --fail --max-time 6 "$endpoint_https" >/dev/null 2>&1; then
      echo "Health check passed via domain."
      return 0
    fi

    if curl --silent --show-error --fail --max-time 6 "$endpoint_local" >/dev/null 2>&1; then
      echo "Health check passed via localhost fallback."
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

duckdns_health_check() {
  local interval max_age last_success now age
  interval="$(read_env_var DUCKDNS_INTERVAL .env.duckdns)"
  if ! [[ "$interval" =~ ^[0-9]+$ ]]; then
    interval=300
  fi
  max_age=$((interval * HEALTH_MAX_AGE_FACTOR))

  if ! compose ps duckdns | tail -n +2 | grep -Eiq 'up|running|healthy'; then
    echo "Error: duckdns service is not running." >&2
    return 1
  fi

  last_success="$(compose exec -T duckdns sh -c 'cat /var/run/duckdns/last_success_epoch 2>/dev/null || true' | tr -d '\r')"
  if ! [[ "$last_success" =~ ^[0-9]+$ ]]; then
    echo "Error: duckdns updater has no successful update yet." >&2
    return 1
  fi

  now="$(date -u +%s)"
  age=$((now - last_success))
  if (( age > max_age )); then
    echo "Error: duckdns last success is ${age}s ago (threshold: ${max_age}s)." >&2
    return 1
  fi

  echo "DuckDNS updater is healthy (last success ${age}s ago)."
}

print_summary() {
  local domain
  domain="$(read_env_var DOMAIN .env.prod)"

  echo
  echo "Public URL: https://${domain}"
  echo "Health URL: https://${domain}/api/health"
  echo "OpenAPI URL: https://${domain}/api/docs"
  echo
}

cmd_up() {
  ensure_env_files
  validate_config
  duckdns_update_once
  wait_for_dns_record "$(read_env_var DOMAIN .env.prod)" "$DNS_WAIT_TIMEOUT"
  compose up --build -d
  wait_for_service "$WAIT_TIMEOUT"
  duckdns_health_check
  print_summary
}

cmd_down() {
  compose down
}

cmd_status() {
  compose ps
}

cmd_logs() {
  compose logs -f --tail=120 duckdns caddy frontend backend db
}

cmd_restart() {
  compose restart
  wait_for_service "$WAIT_TIMEOUT"
  duckdns_health_check
  print_summary
}

cmd_health() {
  validate_config
  wait_for_service 45
  duckdns_health_check
  print_summary
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/longterm.sh up       Build and start long-term stack (DuckDNS + HTTPS)
  ./scripts/longterm.sh down     Stop long-term stack
  ./scripts/longterm.sh status   Show stack status
  ./scripts/longterm.sh logs     Follow stack logs
  ./scripts/longterm.sh restart  Restart running stack
  ./scripts/longterm.sh health   Run health checks

Required files:
  .env            (created from .env.example when missing)
  .env.prod       (created from .env.prod.example when missing)
  .env.duckdns    (created from .env.duckdns.example when missing)

Required .env.prod variables:
  DOMAIN          (must equal <DUCKDNS_DOMAIN>.duckdns.org)
  ACME_EMAIL

Required .env.duckdns variables:
  DUCKDNS_DOMAIN
  DUCKDNS_TOKEN

Optional environment variables:
  WAIT_TIMEOUT          (default: 300)
  DNS_WAIT_TIMEOUT      (default: 180)
  HEALTH_MAX_AGE_FACTOR (default: 3)
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
    health) cmd_health ;;
    help|-h|--help) usage ;;
    *)
      echo "Unknown action: $action" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"