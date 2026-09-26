#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${STICKERBOT_REPO:-/home/dev/work/sticker-bot2}"
STATE_DIR="${STICKERBOT_DEPLOY_STATE:-$REPO/storage/deploy}"
TARGET_SHA="${1:-}"
TIMEOUT_SECONDS="${STICKERBOT_DEPLOY_HEALTH_TIMEOUT:-180}"
INTERVAL=5

log() { printf '[stickerbot-await-deploy] %s\n' "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }
[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "SHA alvo inválido"

for ((elapsed=0; elapsed<TIMEOUT_SECONDS; elapsed+=INTERVAL)); do
  status="$(cat "$STATE_DIR/status" 2>/dev/null || true)"
  marker="$(cat "$STATE_DIR/healthy-sha" 2>/dev/null || true)"
  if [[ "$status" == "healthy" && "$marker" == "$TARGET_SHA" ]]; then
    log "saúde confirmada em $TARGET_SHA"
    exit 0
  fi
  if [[ "$status" == "rolled-back" || "$status" == "rolled-back-before-restart" ]]; then
    fail "deploy falhou e rollback foi acionado"
  fi
  sleep "$INTERVAL"
done

fail "tempo esgotado aguardando saúde/rollback"
