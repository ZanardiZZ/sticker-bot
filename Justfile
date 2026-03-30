set shell := ["zsh", "-lc"]

default:
  @just --list

check:
  npm run check

lint:
  npm run lint

lint-fix:
  npm run lint:fix

format:
  npm run format

format-check:
  npm run format:check

test-unit:
  npm run test:unit

test-integration:
  npm run test:integration

smoke:
  npm run smoke

agent-context *args='':
  node scripts/agent/context.js {{args}}

agent-tooling:
  bash scripts/agent/check-tooling.sh

deepseek-task prompt:
  bash scripts/agent/deepseek-sidecar.sh --prompt {{prompt}}

review-diff ref='HEAD':
  git --no-pager diff --stat {{ref}}
