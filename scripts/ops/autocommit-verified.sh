#!/usr/bin/env bash
set -euo pipefail

# Auto-commit + push only after verification command passes.
# Usage:
#   bash scripts/ops/autocommit-verified.sh
#   bash scripts/ops/autocommit-verified.sh --verify-cmd "npm run test:unit"
#   bash scripts/ops/autocommit-verified.sh --summary "memory intent hardening"
#   bash scripts/ops/autocommit-verified.sh --no-push

VERIFY_CMD="${AUTO_COMMIT_VERIFY_CMD:-npm run test:unit}"
SUMMARY="${AUTO_COMMIT_SUMMARY:-}"
DO_PUSH=1
DRY_RUN=0
ALLOW_LARGE=0
MAX_FILES="${AUTO_COMMIT_MAX_FILES:-30}"
SYNC_BEFORE="${AUTO_COMMIT_SYNC_BEFORE:-1}"
SYNC_AFTER_PUSH="${AUTO_COMMIT_SYNC_AFTER_PUSH:-1}"
POST_PUSH_WAIT_SECONDS="${AUTO_COMMIT_POST_PUSH_WAIT_SECONDS:-120}"
POST_PUSH_POLL_SECONDS="${AUTO_COMMIT_POST_PUSH_POLL_SECONDS:-5}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verify-cmd)
      VERIFY_CMD="${2:-}"
      shift 2
      ;;
    --summary)
      SUMMARY="${2:-}"
      shift 2
      ;;
    --no-push)
      DO_PUSH=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --allow-large)
      ALLOW_LARGE=1
      shift
      ;;
    *)
      echo "[autocommit] argumento inválido: $1" >&2
      exit 2
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[autocommit] execute dentro de um repositório git." >&2
  exit 2
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "HEAD" ]]; then
  echo "[autocommit] detached HEAD não suportado para push automático." >&2
  exit 2
fi

sync_with_remote() {
  local mode="${1:-pre}"
  git fetch origin "$BRANCH" >/dev/null 2>&1 || true

  if ! git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
    return 0
  fi

  local ahead behind
  read -r ahead behind < <(git rev-list --left-right --count "HEAD...origin/$BRANCH")

  if [[ "$ahead" -eq 0 && "$behind" -eq 0 ]]; then
    return 0
  fi

  echo "[autocommit] sync-${mode}: local ahead=${ahead}, behind=${behind} -> rebase com autostash"
  git pull --rebase --autostash origin "$BRANCH"
}

if [[ "$DRY_RUN" -ne 1 && "$SYNC_BEFORE" != "0" ]]; then
  sync_with_remote pre
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "[autocommit] sem mudanças; nada para commitar."
  exit 0
fi

# Ignore noisy artifacts from accidental local dumps/crashes/backups.
EXCLUDE_REGEX='(^|/)(core\.[0-9]+|.*\.bak(\.|$)|.*\.tmp$|.*\.swp$|\.env\.bak\.|npm-debug\.log|yarn-error\.log)'

mapfile -t CANDIDATE_FILES < <(
  git status --porcelain | sed -E 's/^..\s+//' | sed 's/^"//; s/"$//' | awk 'NF' | sort -u
)

FILTERED_FILES=()
for f in "${CANDIDATE_FILES[@]}"; do
  if [[ "$f" =~ $EXCLUDE_REGEX ]]; then
    continue
  fi
  FILTERED_FILES+=("$f")
done

if [[ ${#FILTERED_FILES[@]} -eq 0 ]]; then
  echo "[autocommit] só havia arquivos excluídos (bak/core/tmp); nada para commitar."
  exit 0
fi

if [[ ${#FILTERED_FILES[@]} -gt ${MAX_FILES} && ${ALLOW_LARGE} -ne 1 ]]; then
  echo "[autocommit] mudanças demais (${#FILTERED_FILES[@]} arquivos). Limite atual: ${MAX_FILES}." >&2
  echo "[autocommit] revise o working tree e rode novamente com --allow-large se quiser forçar." >&2
  exit 3
fi

echo "[autocommit] branch: $BRANCH"
echo "[autocommit] verify: $VERIFY_CMD"
echo "[autocommit] arquivos candidatos (${#FILTERED_FILES[@]}):"
printf '  - %s\n' "${FILTERED_FILES[@]}"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[autocommit] dry-run ativo; não executa verificação/commit."
  exit 0
fi

echo "[autocommit] executando verificação..."
bash -lc "$VERIFY_CMD"
echo "[autocommit] verificação OK."

# Stage only filtered files
for f in "${FILTERED_FILES[@]}"; do
  git add -- "$f"
done

if git diff --cached --quiet; then
  echo "[autocommit] nada foi staged após filtros; abortando."
  exit 0
fi

TYPE="chore"
case "$BRANCH" in
  feat/*) TYPE="feat" ;;
  fix/*|hotfix/*) TYPE="fix" ;;
  refactor/*) TYPE="refactor" ;;
  docs/*) TYPE="docs" ;;
  test/*) TYPE="test" ;;
  ci/*) TYPE="ci" ;;
esac

# scope heurístico por áreas alteradas
SCOPES=()
if git diff --cached --name-only | grep -q '^src/services/'; then SCOPES+=("services"); fi
if git diff --cached --name-only | grep -q '^src/client/'; then SCOPES+=("memory"); fi
if git diff --cached --name-only | grep -q '^src/commands/'; then SCOPES+=("commands"); fi
if git diff --cached --name-only | grep -q '^src/bot/'; then SCOPES+=("bot"); fi
if git diff --cached --name-only | grep -q '^tests/'; then SCOPES+=("tests"); fi
if [[ ${#SCOPES[@]} -eq 0 ]]; then SCOPES+=("repo"); fi
SCOPE="$(IFS=,; echo "${SCOPES[*]}")"

HEADER="$TYPE($SCOPE): auto commit após verificação"
if [[ -n "$SUMMARY" ]]; then
  HEADER="$TYPE($SCOPE): $SUMMARY"
fi

BODY_FILE="$(mktemp)"
{
  echo "Commit automático após verificação local bem-sucedida."
  echo
  echo "Verified-by: $VERIFY_CMD"
  echo
  echo "Arquivos alterados:"
  git diff --cached --name-status | sed 's/^/- /'
} > "$BODY_FILE"

git commit -F <(printf "%s\n\n" "$HEADER"; cat "$BODY_FILE")
rm -f "$BODY_FILE"

if [[ $DO_PUSH -eq 1 ]]; then
  git push origin "$BRANCH"
  echo "[autocommit] push concluído em origin/$BRANCH"

  if [[ "$SYNC_AFTER_PUSH" != "0" ]]; then
    deadline=$(( $(date +%s) + POST_PUSH_WAIT_SECONDS ))
    synced=0

    while [[ $(date +%s) -lt ${deadline} ]]; do
      git fetch origin "$BRANCH" >/dev/null 2>&1 || true
      remote_head="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo '')"
      current_head="$(git rev-parse HEAD)"

      if [[ -n "$remote_head" && "$remote_head" != "$current_head" ]]; then
        echo "[autocommit] detectado commit remoto adicional (ex.: workflow de versão). sincronizando..."
        git pull --rebase --autostash origin "$BRANCH"
        synced=1
        break
      fi

      sleep "$POST_PUSH_POLL_SECONDS"
    done

    if [[ "$synced" -eq 1 ]]; then
      echo "[autocommit] sincronização pós-push concluída."
    else
      echo "[autocommit] nenhum commit remoto adicional detectado na janela de ${POST_PUSH_WAIT_SECONDS}s."
    fi
  fi
else
  echo "[autocommit] commit concluído sem push (--no-push)."
fi
