#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DUCKDNS_DOMAIN="${DUCKDNS_DOMAIN:-}"
DUCKDNS_TOKEN="${DUCKDNS_TOKEN:-}"
ACME_EMAIL="${ACME_EMAIL:-}"

read_env_var() {
  local key="$1"
  local file="$2"
  [[ -f "$file" ]] || return 0
  awk -F= -v k="$key" '$1==k { $1=""; sub(/^=/, ""); print; exit }' "$file" | tr -d '"' | xargs
}

upsert_env_var() {
  local key="$1"
  local value="$2"
  local file="$3"

  if grep -q "^${key}=" "$file"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

ensure_env_files() {
  [[ -f .env ]] || cp .env.example .env
  [[ -f .env.prod ]] || cp .env.prod.example .env.prod
  [[ -f .env.duckdns ]] || cp .env.duckdns.example .env.duckdns
}

sanitize_value() {
  local value="$1"
  value="${value// /}"
  printf '%s' "$value"
}

is_placeholder() {
  local value="$1"
  [[ -z "$value" || "$value" == "your-subdomain" || "$value" == "your-duckdns-token" || "$value" == "ops@example.com" || "$value" == "demo.example.com" ]]
}

prompt_if_needed() {
  if is_placeholder "$DUCKDNS_DOMAIN"; then
    read -r -p "DuckDNS 子域名（不含 .duckdns.org）: " DUCKDNS_DOMAIN
  fi

  if is_placeholder "$DUCKDNS_TOKEN"; then
    read -r -p "DuckDNS Token: " DUCKDNS_TOKEN
  fi

  if is_placeholder "$ACME_EMAIL"; then
    read -r -p "ACME 邮箱（用于 HTTPS 证书）: " ACME_EMAIL
  fi

  DUCKDNS_DOMAIN="$(sanitize_value "$DUCKDNS_DOMAIN")"
  DUCKDNS_TOKEN="$(sanitize_value "$DUCKDNS_TOKEN")"
  ACME_EMAIL="$(sanitize_value "$ACME_EMAIL")"

  if [[ -z "$DUCKDNS_DOMAIN" || -z "$DUCKDNS_TOKEN" || -z "$ACME_EMAIL" ]]; then
    echo "Error: DUCKDNS_DOMAIN, DUCKDNS_TOKEN, ACME_EMAIL 均不能为空。" >&2
    exit 1
  fi
}

main() {
  ensure_env_files

  if is_placeholder "$DUCKDNS_DOMAIN"; then
    DUCKDNS_DOMAIN="$(read_env_var DUCKDNS_DOMAIN .env.duckdns || true)"
  fi
  if is_placeholder "$DUCKDNS_TOKEN"; then
    DUCKDNS_TOKEN="$(read_env_var DUCKDNS_TOKEN .env.duckdns || true)"
  fi
  if is_placeholder "$ACME_EMAIL"; then
    ACME_EMAIL="$(read_env_var ACME_EMAIL .env.prod || true)"
  fi

  prompt_if_needed

  local domain
  domain="${DUCKDNS_DOMAIN}.duckdns.org"

  upsert_env_var "DOMAIN" "$domain" .env.prod
  upsert_env_var "ACME_EMAIL" "$ACME_EMAIL" .env.prod
  upsert_env_var "DUCKDNS_DOMAIN" "$DUCKDNS_DOMAIN" .env.duckdns
  upsert_env_var "DUCKDNS_TOKEN" "$DUCKDNS_TOKEN" .env.duckdns

  echo "配置已写入 .env.prod 和 .env.duckdns"
  echo "开始长期部署..."
  ./scripts/longterm.sh up

  local backend_api_base
  backend_api_base="https://${domain}/api"

  if command -v vercel >/dev/null 2>&1 && vercel whoami >/dev/null 2>&1; then
    echo "检测到已登录 Vercel，自动同步前端 API 地址并触发重部署..."
    BACKEND_API_BASE="$backend_api_base" ./scripts/vercel_sync_api.sh
  else
    echo "未检测到可用 Vercel 登录，会跳过前端同步。"
    echo "你可以在本机执行："
    echo "BACKEND_API_BASE=${backend_api_base} ./scripts/vercel_sync_api.sh"
  fi

  echo "完成。前端应使用后端地址：${backend_api_base}"
}

main "$@"
