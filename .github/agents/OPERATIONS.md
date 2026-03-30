# Operations And Agent Tooling Guide

Use this guide for local tooling, remote-model setup, shell helpers, and developer workflow scripts.

## Main Files

- [scripts/agent/context.js](/home/dev/work/sticker-bot2/scripts/agent/context.js)
- [scripts/agent/check-tooling.sh](/home/dev/work/sticker-bot2/scripts/agent/check-tooling.sh)
- [scripts/agent/deepseek-sidecar.sh](/home/dev/work/sticker-bot2/scripts/agent/deepseek-sidecar.sh)
- [scripts/agent/ensure-local-ollama-proxy.sh](/home/dev/work/sticker-bot2/scripts/agent/ensure-local-ollama-proxy.sh)
- [scripts/agent/stop-local-ollama-proxy.sh](/home/dev/work/sticker-bot2/scripts/agent/stop-local-ollama-proxy.sh)
- [scripts/agent/codex-deepseek.sh](/home/dev/work/sticker-bot2/scripts/agent/codex-deepseek.sh)
- [scripts/agent/codex-deepseek-exec.sh](/home/dev/work/sticker-bot2/scripts/agent/codex-deepseek-exec.sh)
- [docs/agent-workflow.md](/home/dev/work/sticker-bot2/docs/agent-workflow.md)

## Model Rules

- `deepseek-coder:6.7b` is for the sidecar wrapper.
- `qwen3:8b` is the current default model for Codex plus Ollama because it supports tools.
- Codex OSS should talk to the remote Ollama host through the local proxy on `127.0.0.1:11434`.

## Shell Helpers

These may exist in local `zsh`:

- `oproxy`
- `oproxystop`
- `cdeep`
- `cdeepexec`
- `dside`

There are also repo-local wrappers for common tasks:

- `make check`, `make smoke`, `make agent-tooling`
- `just check`, `just smoke`, `just agent-tooling`

## Validation

- `npm run agent:tooling`
- the exact wrapper command you changed

`npm run agent:tooling` is a local workstation check. It is not expected to run in generic CI runners that do not have `codex`, `claude`, or the optional shell tooling installed.

## Common Risks

- assuming `deepseek-coder:6.7b` can be the direct Codex OSS engine
- changing proxy behavior without validating `127.0.0.1:11434/api/version`
- drifting docs and scripts out of sync
