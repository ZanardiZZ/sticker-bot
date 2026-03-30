#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export DEEPSEEK_BASE_URL="${DEEPSEEK_BASE_URL:-http://192.168.20.24:11434}"
export DEEPSEEK_MODEL="${DEEPSEEK_MODEL:-deepseek-coder:6.7b}"
export LOCAL_OLLAMA_PROXY_HOST="${LOCAL_OLLAMA_PROXY_HOST:-127.0.0.1}"
export LOCAL_OLLAMA_PROXY_PORT="${LOCAL_OLLAMA_PROXY_PORT:-11434}"

if [[ "${DEEPSEEK_MODEL}" == "deepseek-coder:6.7b" ]]; then
  cat >&2 <<'EOF'
codex-deepseek-exec: `deepseek-coder:6.7b` is reachable through Ollama, but Codex OSS rejected it because the model does not support tools.

Use one of these paths instead:
  1. Keep DeepSeek as a sidecar:
     npm run agent:deepseek -- --prompt "task"
  2. Use a tool-capable Ollama model with Codex:
     DEEPSEEK_MODEL=qwen3:8b npm run agent:codex:deepseek:exec -- --skip-git-repo-check "task"
EOF
  exit 1
fi

bash "${ROOT_DIR}/scripts/agent/ensure-local-ollama-proxy.sh"

exec codex exec --oss --local-provider ollama -m "${DEEPSEEK_MODEL}" "$@"
