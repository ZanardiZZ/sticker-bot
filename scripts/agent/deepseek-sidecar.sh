#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deepseek-sidecar.sh --prompt "your prompt"
  echo "your prompt" | deepseek-sidecar.sh

Environment:
  DEEPSEEK_BASE_URL   OpenAI-compatible or Ollama-compatible endpoint
  DEEPSEEK_MODEL      Model name to request
  DEEPSEEK_API_KEY    Optional bearer token
  DEEPSEEK_SSH_HOST   Optional SSH host fallback for remote execution
  DEEPSEEK_SSH_CMD    Optional remote command when using SSH fallback
EOF
}

prompt=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt)
      prompt="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$prompt" ]] && [[ ! -t 0 ]]; then
  prompt="$(cat)"
fi

if [[ -z "$prompt" ]]; then
  echo "Prompt is required." >&2
  usage >&2
  exit 1
fi

model="${DEEPSEEK_MODEL:-deepseek-coder:6.7b}"
base_url="${DEEPSEEK_BASE_URL:-}"
api_key="${DEEPSEEK_API_KEY:-}"

if [[ -n "$base_url" ]]; then
  endpoint="${base_url%/}"
  parsed_path="$(python3 - "$endpoint" <<'PY'
from urllib.parse import urlparse
import sys
print(urlparse(sys.argv[1]).path or "")
PY
)"

  if [[ -z "$parsed_path" || "$parsed_path" == "/" ]]; then
    endpoint="${endpoint}/api/generate"
  fi

  if [[ "$endpoint" == */api/generate ]]; then
    payload="$(python3 - "$model" "$prompt" <<'PY'
import json, sys
print(json.dumps({
    "model": sys.argv[1],
    "prompt": sys.argv[2],
    "stream": False
}))
PY
)"

    response="$(curl -fsSL \
      -H 'Content-Type: application/json' \
      ${api_key:+-H "Authorization: Bearer $api_key"} \
      -d "$payload" \
      "$endpoint")"

    printf '%s\n' "$response" | python3 -c 'import json, sys; data = json.load(sys.stdin); print((data.get("response") or "").strip())'
    exit 0
  fi

  payload="$(python3 - "$model" "$prompt" <<'PY'
import json, sys
print(json.dumps({
    "model": sys.argv[1],
    "messages": [{"role": "user", "content": sys.argv[2]}],
    "temperature": 0.2
}))
PY
)"

  response="$(curl -fsSL \
    -H 'Content-Type: application/json' \
    ${api_key:+-H "Authorization: Bearer $api_key"} \
    -d "$payload" \
    "$endpoint/chat/completions")"

  printf '%s\n' "$response" | python3 -c 'import json, sys; data = json.load(sys.stdin); choices = data.get("choices") or []; 
if not choices: raise SystemExit("No choices returned by DeepSeek endpoint"); 
message = choices[0].get("message") or {}; 
print((message.get("content") or "").strip())'
  exit 0
fi

if [[ -n "${DEEPSEEK_SSH_HOST:-}" ]]; then
  remote_cmd="${DEEPSEEK_SSH_CMD:-ollama run ${model}}"
  printf '%s\n' "$prompt" | ssh "$DEEPSEEK_SSH_HOST" "$remote_cmd"
  exit 0
fi

echo "Set DEEPSEEK_BASE_URL or DEEPSEEK_SSH_HOST before using this wrapper." >&2
exit 1
