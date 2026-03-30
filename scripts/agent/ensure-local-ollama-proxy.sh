#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LISTEN_HOST="${LOCAL_OLLAMA_PROXY_HOST:-127.0.0.1}"
LISTEN_PORT="${LOCAL_OLLAMA_PROXY_PORT:-11434}"
UPSTREAM_URL="${DEEPSEEK_BASE_URL:-http://192.168.20.24:11434}"
PID_FILE="${ROOT_DIR}/storage/temp/ollama-local-proxy.pid"
LOG_FILE="${ROOT_DIR}/storage/logs/ollama-local-proxy.log"
HEALTH_URL="http://${LISTEN_HOST}:${LISTEN_PORT}/api/version"

mkdir -p "${ROOT_DIR}/storage/temp" "${ROOT_DIR}/storage/logs"

is_healthy() {
  curl -fsSL --max-time 2 "$HEALTH_URL" >/dev/null 2>&1
}

cleanup_stale_pid() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      return 0
    fi
    rm -f "$PID_FILE"
  fi
}

cleanup_stale_pid

if is_healthy; then
  echo "[ollama-proxy] local endpoint already healthy at ${HEALTH_URL}"
  exit 0
fi

start_proxy() {
  if command -v setsid >/dev/null 2>&1; then
    setsid python3 "${ROOT_DIR}/scripts/agent/ollama_local_proxy.py" \
      --listen-host "$LISTEN_HOST" \
      --listen-port "$LISTEN_PORT" \
      --upstream "$UPSTREAM_URL" \
      >>"$LOG_FILE" 2>&1 </dev/null &
  else
    nohup python3 "${ROOT_DIR}/scripts/agent/ollama_local_proxy.py" \
      --listen-host "$LISTEN_HOST" \
      --listen-port "$LISTEN_PORT" \
      --upstream "$UPSTREAM_URL" \
      >>"$LOG_FILE" 2>&1 </dev/null &
  fi
  echo $!
}

proxy_pid="$(start_proxy)"
echo "$proxy_pid" >"$PID_FILE"

for _ in $(seq 1 30); do
  if is_healthy; then
    echo "[ollama-proxy] ready at ${HEALTH_URL} -> ${UPSTREAM_URL}"
    exit 0
  fi

  if ! kill -0 "$proxy_pid" >/dev/null 2>&1; then
    echo "[ollama-proxy] failed to start; check ${LOG_FILE}" >&2
    exit 1
  fi

  sleep 1
done

echo "[ollama-proxy] timed out waiting for ${HEALTH_URL}; check ${LOG_FILE}" >&2
exit 1
