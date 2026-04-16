#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKEND_API_BASE="${BACKEND_API_BASE:-}"
DEPLOY_PROD="${DEPLOY_PROD:-true}"

read_env_var() {
  local key="$1"
  local file="$2"
  awk -F= -v k="$key" '$1==k { $1=""; sub(/^=/, ""); print; exit }' "$file" | tr -d '"' | xargs
}

if ! command -v vercel >/dev/null 2>&1; then
  echo "Error: vercel CLI is required." >&2
  exit 1
fi

if ! vercel whoami >/dev/null 2>&1; then
  echo "Error: vercel login is required. Run: vercel login" >&2
  exit 1
fi

if [[ -z "$BACKEND_API_BASE" && -f .env.prod ]]; then
  domain="$(read_env_var DOMAIN .env.prod)"
  if [[ -n "$domain" && "$domain" != "demo.example.com" ]]; then
    BACKEND_API_BASE="https://${domain}/api"
  fi
fi

if [[ -z "$BACKEND_API_BASE" ]]; then
  cat >&2 <<'EOF'
Error: BACKEND_API_BASE is empty.

Usage:
  BACKEND_API_BASE=https://your-backend-domain/api ./scripts/vercel_sync_api.sh

Optional:
  DEPLOY_PROD=false BACKEND_API_BASE=https://your-backend-domain/api ./scripts/vercel_sync_api.sh
EOF
  exit 1
fi

echo "Using BACKEND_API_BASE=${BACKEND_API_BASE}"

vercel env rm VITE_API_BASE_URL production --yes >/dev/null 2>&1 || true
printf '%s\n' "$BACKEND_API_BASE" | vercel env add VITE_API_BASE_URL production

if [[ "$DEPLOY_PROD" == "true" ]]; then
  echo "Triggering production deployment..."
  vercel --prod --yes
fi

echo "Done. VITE_API_BASE_URL is set for production."
