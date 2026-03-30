#!/usr/bin/env bash
set -euo pipefail

required_tools=(
  "codex"
  "claude"
  "git"
  "node"
  "npm"
  "ssh"
  "tmux"
  "jq"
  "sqlite3"
  "rsync"
  "fzf"
  "gh"
)

required_any=(
  "bat:bat batcat"
  "task-runner:just make"
  "watcher:watchexec entr"
)

optional_any=(
  "delta:delta git-delta"
)

missing=0

for tool in "${required_tools[@]}"; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf 'OK       %s -> %s\n' "$tool" "$(command -v "$tool")"
  else
    printf 'MISSING  %s\n' "$tool"
    missing=1
  fi
done

for entry in "${required_any[@]}"; do
  label="${entry%%:*}"
  candidates="${entry#*:}"
  found=""
  for tool in $candidates; do
    if command -v "$tool" >/dev/null 2>&1; then
      found="$tool"
      break
    fi
  done

  if [[ -n "$found" ]]; then
    printf 'OK       %s -> %s\n' "$label" "$(command -v "$found")"
  else
    printf 'MISSING  %s (%s)\n' "$label" "$candidates"
    missing=1
  fi
done

for entry in "${optional_any[@]}"; do
  label="${entry%%:*}"
  candidates="${entry#*:}"
  found=""
  for tool in $candidates; do
    if command -v "$tool" >/dev/null 2>&1; then
      found="$tool"
      break
    fi
  done

  if [[ -n "$found" ]]; then
    printf 'OK       %s -> %s\n' "$label" "$(command -v "$found")"
  else
    printf 'OPTIONAL %s (%s)\n' "$label" "$candidates"
  fi
done

exit "$missing"
