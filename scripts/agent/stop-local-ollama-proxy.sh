#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PID_FILE="${ROOT_DIR}/storage/temp/ollama-local-proxy.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "[ollama-proxy] no pid file found"
  exit 0
fi

pid="$(cat "$PID_FILE" 2>/dev/null || true)"
rm -f "$PID_FILE"

if [[ -z "$pid" ]]; then
  echo "[ollama-proxy] pid file was empty"
  exit 0
fi

if kill -0 "$pid" >/dev/null 2>&1; then
  kill "$pid"
  echo "[ollama-proxy] stopped process $pid"
else
  echo "[ollama-proxy] process $pid was not running"
fi
