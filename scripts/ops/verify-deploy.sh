#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${STICKERBOT_REPO:-/home/dev/work/sticker-bot2}"
STATE_DIR="${STICKERBOT_DEPLOY_STATE:-$REPO/storage/deploy}"
TARGET_SHA="$1"
PREVIOUS_SHA="$2"
TIMEOUT_SECONDS="${STICKERBOT_DEPLOY_HEALTH_TIMEOUT:-120}"
INTERVAL=5

log() { printf '[stickerbot-deploy-check] %s\n' "$*"; }
cd "$REPO"

for ((elapsed=0; elapsed<TIMEOUT_SECONDS; elapsed+=INTERVAL)); do
  marker="$(cat "$STATE_DIR/healthy-sha" 2>/dev/null || true)"
  if [[ "$marker" == "$TARGET_SHA" ]]; then
    printf 'healthy\n' > "$STATE_DIR/status"
    log "deploy saudável em $TARGET_SHA"
    exit 0
  fi
  sleep "$INTERVAL"
done

log "saúde não confirmada; iniciando rollback para $PREVIOUS_SHA"
printf 'rolling-back\n' > "$STATE_DIR/status"
git reset --hard "$PREVIOUS_SHA"
npm ci --omit=dev
mapfile -t services < "$STATE_DIR/services"
pm2 restart "${services[@]}" --update-env
printf 'rolled-back\n' > "$STATE_DIR/status"
log "rollback reiniciado em $PREVIOUS_SHA"
