# Agent Docs Summary

This summary describes the current agent-doc set after the tooling and remote-model workflow updates.

## What The Docs Now Assume

- `npm run check` is the default fast gate
- `npm run test:integration` is the cross-subsystem gate
- `npm run smoke` validates startup-path parsing
- `npm run agent:tooling` validates local developer tooling
- code lives under `src/` and runtime artifacts live outside git-tracked code paths, including `storage/` and `media/`
- remote Ollama lives at `192.168.20.24:11434`
- `deepseek-coder:6.7b` is used as a sidecar, not as a direct Codex OSS engine
- `qwen3:8b` is the default tool-capable model for the Codex Ollama wrappers
- zsh shortcuts may exist for `oproxy`, `oproxystop`, `cdeep`, `cdeepexec`, and `dside`

## Main Documents

- [`.github/copilot-instructions.md`](/home/dev/work/sticker-bot2/.github/copilot-instructions.md)
- [`docs/agent-workflow.md`](/home/dev/work/sticker-bot2/docs/agent-workflow.md)
- [`sticker-bot-expert.md`](/home/dev/work/sticker-bot2/.github/agents/sticker-bot-expert.md)
- [`BOT.md`](/home/dev/work/sticker-bot2/.github/agents/BOT.md)
- [`WEB.md`](/home/dev/work/sticker-bot2/.github/agents/WEB.md)
- [`OPERATIONS.md`](/home/dev/work/sticker-bot2/.github/agents/OPERATIONS.md)
- [`TESTING.md`](/home/dev/work/sticker-bot2/.github/agents/TESTING.md)
- [`USAGE_GUIDE.md`](/home/dev/work/sticker-bot2/.github/agents/USAGE_GUIDE.md)

## Why This Matters

Previous guidance still referenced outdated validation and older runtime assumptions. The updated docs now match:

- the scripts in `package.json`
- the segmented `src/` layout with runtime artifacts kept under local data directories such as `storage/` and `media/`
- the current passing test workflow
- the local proxy required for Codex plus Ollama
- the real limitation of `deepseek-coder:6.7b` in Codex OSS tool mode
- the sensitive modules that recently caused regressions
