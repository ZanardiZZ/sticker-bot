#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${STICKERBOT_REPO:-/home/dev/work/sticker-bot2}"
BRANCH="main"
LOCK_FILE="${STICKERBOT_DEPLOY_LOCK:-/run/lock/stickerbot-main-deploy.lock}"
STATE_DIR="${STICKERBOT_DEPLOY_STATE:-$REPO/storage/deploy}"
TARGET_SHA="${1:-}"

log() { printf '[stickerbot-deploy] %s\n' "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "SHA alvo inválido"
cd "$REPO"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "outro deploy já está em andamento"

[[ "$(git symbolic-ref --short HEAD 2>/dev/null || true)" == "$BRANCH" ]] || fail "checkout não está na branch $BRANCH"
[[ -z "$(git status --porcelain=v1 --untracked-files=no)" ]] || fail "há alterações rastreadas locais; deploy abortado"

before="$(git rev-parse HEAD)"
git fetch --prune origin "$BRANCH"
after="$(git rev-parse "origin/$BRANCH")"
[[ "$after" == "$TARGET_SHA" ]] || fail "origin/$BRANCH ($after) difere do SHA aprovado ($TARGET_SHA)"
git merge-base --is-ancestor "$before" "$after" || fail "deploy não é fast-forward"

mkdir -p "$STATE_DIR"
printf '%s\n' "$before" > "$STATE_DIR/previous-sha"
printf '%s\n' "$after" > "$STATE_DIR/target-sha"
printf 'preparing\n' > "$STATE_DIR/status"

mapfile -t changed < <(git diff --name-only "$before..$after")
(( ${#changed[@]} > 0 )) || { log "nenhuma mudança"; exit 0; }

services=()
add_service() {
  local candidate="$1" existing
  for existing in "${services[@]:-}"; do [[ "$existing" == "$candidate" ]] && return; done
  services+=("$candidate")
}

dependencies_changed=false
if printf '%s\n' "${changed[@]}" | grep -Eq '^(package(-lock)?\.json)$'; then
  before_deps="$(git show "$before:package.json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);console.log(JSON.stringify({dependencies:p.dependencies||{},optionalDependencies:p.optionalDependencies||{}}))})")"
  after_deps="$(git show "$after:package.json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);console.log(JSON.stringify({dependencies:p.dependencies||{},optionalDependencies:p.optionalDependencies||{}}))})")"
  [[ "$before_deps" != "$after_deps" ]] && dependencies_changed=true
fi

for file in "${changed[@]}"; do
  case "$file" in
    package.json|package-lock.json)
      if $dependencies_changed; then
        add_service WS-Socket-Server-Baileys; add_service Bot-Client; add_service WebServer
      else
        add_service Bot-Client
      fi ;;
    ecosystem.config.*)
      add_service WS-Socket-Server-Baileys; add_service Bot-Client; add_service WebServer ;;
    CHANGELOG.md)
      add_service Bot-Client ;;
    src/server/*|src/waAdapter.js|server.js)
      add_service WS-Socket-Server-Baileys; add_service Bot-Client ;;
    src/bot/*|src/commands/*|src/services/*|src/database/*|index.js)
      add_service Bot-Client ;;
    src/web/*)
      add_service WebServer ;;
    src/*)
      add_service WS-Socket-Server-Baileys; add_service Bot-Client; add_service WebServer ;;
  esac
done

rollback_pre_restart() {
  local rc=$?
  trap - ERR
  log "falha antes do restart; restaurando $before"
  git reset --hard "$before"
  if printf '%s\n' "${changed[@]}" | grep -Eq '^(package(-lock)?\.json)$'; then
    npm ci
  fi
  printf 'rolled-back-before-restart\n' > "$STATE_DIR/status"
  exit "$rc"
}
trap rollback_pre_restart ERR

git merge --ff-only "$after"
if printf '%s\n' "${changed[@]}" | grep -Eq '^(package(-lock)?\.json)$'; then
  npm ci
fi

npm run check
npm run smoke
npm audit --audit-level=high --omit=dev

git diff --check "$before..$after"
printf '%s\n' "${services[@]}" > "$STATE_DIR/services"
printf 'prepared\n' > "$STATE_DIR/status"
trap - ERR

if ((\${#services[@]} == 0)); then
  printf 'deployed-no-restart\n' > "$STATE_DIR/status"
  log "deploy concluído sem serviço afetado; HEAD=$(git rev-parse HEAD)"
  exit 0
fi

printf 'restarting\n' > "$STATE_DIR/status"
log "reinício final: ${services[*]}"
nohup "$REPO/scripts/ops/verify-deploy.sh" "$after" "$before" > "$STATE_DIR/verify.log" 2>&1 </dev/null &
exec pm2 restart "${services[@]}" --update-env
