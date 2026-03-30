SHELL := /usr/bin/env bash

.PHONY: check lint lint-fix format format-check test-unit test-integration smoke agent-context agent-tooling deepseek-task review-diff codex-deepseek codex-deepseek-exec ollama-proxy ollama-proxy-stop

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

agent-context:
	node scripts/agent/context.js

agent-tooling:
	bash scripts/agent/check-tooling.sh

deepseek-task:
	@if [ -z "$(PROMPT)" ]; then echo "Use: make deepseek-task PROMPT='task'"; exit 1; fi
	bash scripts/agent/deepseek-sidecar.sh --prompt "$(PROMPT)"

ollama-proxy:
	bash scripts/agent/ensure-local-ollama-proxy.sh

ollama-proxy-stop:
	bash scripts/agent/stop-local-ollama-proxy.sh

codex-deepseek:
	bash scripts/agent/codex-deepseek.sh

codex-deepseek-exec:
	@if [ -z "$(PROMPT)" ]; then echo "Use: make codex-deepseek-exec PROMPT='task'"; exit 1; fi
	bash scripts/agent/codex-deepseek-exec.sh --skip-git-repo-check --color never "$(PROMPT)"

review-diff:
	git --no-pager diff --stat $(if $(REF),$(REF),HEAD)
