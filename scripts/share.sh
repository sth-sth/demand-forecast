#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOCAL_URL="${LOCAL_URL:-http://localhost:8080}"
TUNNEL_PROTOCOL="${TUNNEL_PROTOCOL:-http2}"
CLOUDFLARED_EXTRA_ARGS="${CLOUDFLARED_EXTRA_ARGS:-}"

has_command() {
  command -v "$1" >/dev/null 2>&1
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/share.sh start   Start temporary public URL sharing
  ./scripts/share.sh help    Show help

Optional environment variables:
  LOCAL_URL              (default: http://localhost:8080)
  TUNNEL_PROTOCOL        (default: http2, options: http2|quic|auto)
  CLOUDFLARED_EXTRA_ARGS (default: empty)

Notes:
  - Keep this process running to keep the public URL alive.
  - For local demo startup, run: ./scripts/demo.sh up
EOF
}

validate_protocol() {
  case "$TUNNEL_PROTOCOL" in
    http2|quic|auto)
      ;;
    *)
      echo "Error: unsupported TUNNEL_PROTOCOL '$TUNNEL_PROTOCOL' (use http2|quic|auto)." >&2
      exit 1
      ;;
  esac
}

print_quic_udp_buffer_hint() {
  cat <<'EOF'
Notice: QUIC uses UDP. If you see:
  failed to sufficiently increase receive buffer size
you can tune Linux kernel buffers:
  sudo sysctl -w net.core.rmem_max=7500000
  sudo sysctl -w net.core.wmem_max=7500000

Persistent config:
  echo 'net.core.rmem_max=7500000' | sudo tee /etc/sysctl.d/99-cloudflared-udp.conf
  echo 'net.core.wmem_max=7500000' | sudo tee -a /etc/sysctl.d/99-cloudflared-udp.conf
  sudo sysctl --system
EOF
}

check_local_url() {
  if curl --silent --show-error --fail --max-time 4 "$LOCAL_URL" >/dev/null 2>&1; then
    return 0
  fi

  echo "Error: LOCAL_URL is not reachable: $LOCAL_URL" >&2
  echo "Hint: start services first with ./scripts/demo.sh up" >&2
  echo "Then re-run: ./scripts/share.sh start" >&2
  exit 1
}

start_share() {
  check_local_url
  validate_protocol

  local -a extra_args=()
  if [[ -n "$CLOUDFLARED_EXTRA_ARGS" ]]; then
    read -r -a extra_args <<<"$CLOUDFLARED_EXTRA_ARGS"
  fi

  if [[ "$TUNNEL_PROTOCOL" == "quic" ]]; then
    print_quic_udp_buffer_hint
  fi

  if has_command cloudflared; then
    echo "Using local cloudflared binary (protocol: $TUNNEL_PROTOCOL)..."
    exec cloudflared tunnel --protocol "$TUNNEL_PROTOCOL" --url "$LOCAL_URL" "${extra_args[@]}"
  fi

  if has_command docker; then
    echo "Using cloudflared container (protocol: $TUNNEL_PROTOCOL)..."
    exec docker run --rm --network host cloudflare/cloudflared:latest \
      tunnel --no-autoupdate --protocol "$TUNNEL_PROTOCOL" --url "$LOCAL_URL" "${extra_args[@]}"
  fi

  echo "Error: neither cloudflared nor docker is available." >&2
  exit 1
}

main() {
  local action="${1:-start}"
  case "$action" in
    start) start_share ;;
    help|-h|--help) usage ;;
    *)
      echo "Unknown action: $action" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
