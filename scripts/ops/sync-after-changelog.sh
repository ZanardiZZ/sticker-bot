#!/usr/bin/env bash
set -Eeuo pipefail

REPO="/home/dev/work/sticker-bot2"
BRANCH="main"
LOCK_FILE="/run/lock/stickerbot-main-sync.lock"

log() { printf '[stickerbot-sync] %s\n' "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

cd "$REPO"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "outra sincronização já está em andamento"

if [[ "$(git symbolic-ref --short HEAD 2>/dev/null || true)" != "$BRANCH" ]]; then
  fail "checkout não está na branch $BRANCH"
fi

if [[ -n "$(git status --porcelain=v1)" ]]; then
  fail "checkout local não está limpo; nenhuma alteração foi tocada"
fi

before="$(git rev-parse HEAD)"
git fetch --prune origin "$BRANCH"
after="$(git rev-parse "origin/$BRANCH")"

if [[ "$before" == "$after" ]]; then
  log "já sincronizado em ${before:0:12}"
  exit 0
fi

base="$(git merge-base HEAD "origin/$BRANCH")" || fail "históricos divergentes sem merge-base"
mapfile -t remote_commits < <(git rev-list --reverse "$base..origin/$BRANCH")

for sha in "${remote_commits[@]}"; do
  subject="$(git show -s --format=%s "$sha")"
  case "$subject" in
    'docs(changelog): '*|'chore: bump version to '* )
      log "commit automático autorizado: ${sha:0:12} $subject"
      ;;
    *)
      fail "commit remoto não autorizado para sincronização automática: ${sha:0:12} $subject"
      ;;
  esac
done

if git merge-base --is-ancestor HEAD "origin/$BRANCH"; then
  git merge --ff-only "origin/$BRANCH"
  log "fast-forward concluído: $(git rev-parse --short HEAD)"
elif git merge-base --is-ancestor "origin/$BRANCH" HEAD; then
  log "remoto está atrás; nenhum pull necessário"
else
  log "há commits locais posteriores; rebase seguro sobre origin/$BRANCH"
  GIT_EDITOR=true git rebase "origin/$BRANCH"
  log "rebase concluído: $(git rev-parse --short HEAD)"
fi

git status --porcelain=v1
log "sincronização concluída; HEAD=$(git rev-parse --short HEAD)"
