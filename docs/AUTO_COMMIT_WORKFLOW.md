# Auto Commit/PUSH após validação

Script: `scripts/ops/autocommit-verified.sh`

Objetivo:
- Só commitar/pushar quando a validação local passar.
- Gerar mensagem de commit automática com resumo + lista de arquivos.
- Evitar subir lixo comum (`*.bak`, `core.*`, `.env.bak.*`, `*.tmp`).
- Sincronizar com `origin/<branch>` antes do commit e após o push (absorvendo commit automático de versão do GitHub Actions).

## Uso rápido

```bash
# padrão: valida com npm run test:unit e faz commit+push
npm run git:auto

# validação customizada
npm run git:auto -- --verify-cmd "npm run lint && npm run test:unit"

# header customizado
npm run git:auto -- --summary "memory intent profiling + guardrails"

# só commit local
npm run git:auto -- --no-push

# quando houver muitas mudanças (acima do limite de segurança)
npm run git:auto -- --allow-large
```

## Variáveis opcionais

- `AUTO_COMMIT_VERIFY_CMD` (default: `npm run test:unit`)
- `AUTO_COMMIT_SUMMARY` (default: vazio)
- `AUTO_COMMIT_MAX_FILES` (default: `30`)
- `AUTO_COMMIT_SYNC_BEFORE` (default: `1`)
- `AUTO_COMMIT_SYNC_AFTER_PUSH` (default: `1`)
- `AUTO_COMMIT_POST_PUSH_WAIT_SECONDS` (default: `120`)
- `AUTO_COMMIT_POST_PUSH_POLL_SECONDS` (default: `5`)

Exemplo:

```bash
AUTO_COMMIT_VERIFY_CMD="npm run lint && npm run test:unit" \
AUTO_COMMIT_SUMMARY="ajuste de conversation memory" \
npm run git:auto
```

## Guardrails do script

1. Não roda fora de repo git.
2. Não roda em `detached HEAD`.
3. Sem mudanças -> sai sem erro.
4. Filtra artefatos ruidosos antes de stage.
5. Se validação falhar, não commita.
6. Se não houver nada staged após filtros, aborta sem commit.
7. Faz sync pre-commit (`pull --rebase --autostash`) para evitar commits sobre base antiga.
8. Após push, monitora por alguns segundos e sincroniza se surgir commit remoto automático (ex.: bump de versão do workflow).

## Convenção de mensagem

- Tipo inferido da branch:
  - `feat/*` -> `feat`
  - `fix/*|hotfix/*` -> `fix`
  - `refactor/*` -> `refactor`
  - `docs/*` -> `docs`
  - `test/*` -> `test`
  - `ci/*` -> `ci`
  - fallback -> `chore`
- Scope inferido por áreas alteradas (`services`, `memory`, `commands`, `bot`, `tests`).
- Corpo inclui:
  - comando de verificação executado
  - lista `name-status` dos arquivos staged

## Observação operacional

Esse fluxo é ideal para fechar rapidamente ciclos de fix em produção. Para mudanças grandes em lote, ainda vale revisar `git status` antes de rodar.
