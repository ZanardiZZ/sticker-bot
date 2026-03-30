# Agent Usage Guide

This guide shows how to work efficiently in this repository with the current local tooling and remote model setup.

For domain details, pair it with one of:

- [BOT.md](/home/dev/work/sticker-bot2/.github/agents/BOT.md)
- [WEB.md](/home/dev/work/sticker-bot2/.github/agents/WEB.md)
- [OPERATIONS.md](/home/dev/work/sticker-bot2/.github/agents/OPERATIONS.md)
- [TESTING.md](/home/dev/work/sticker-bot2/.github/agents/TESTING.md)

## Quick Start

### Standard local loop

```bash
npm run agent:context
npm run check
```

Use `npm run test:integration` when the change affects database behavior, web routes, multi-process coordination, or command flows that span subsystems.

### DeepSeek sidecar

Use the sidecar when you want cheap analysis or a first draft from the remote machine:

```bash
DEEPSEEK_BASE_URL=http://192.168.20.24:11434 \
DEEPSEEK_MODEL=deepseek-coder:6.7b \
npm run agent:deepseek -- --prompt "summarize src/bot/messageHandler.js"
```

### Codex through remote Ollama

Use the local proxy and a tool-capable model:

```bash
DEEPSEEK_MODEL=qwen3:8b npm run agent:codex:deepseek
```

For one-shot execution:

```bash
DEEPSEEK_MODEL=qwen3:8b \
npm run agent:codex:deepseek:exec -- --skip-git-repo-check "Reply with exactly: pong"
```

Do not try to run the Codex OSS workflow on `deepseek-coder:6.7b`; it is reachable but rejected for lack of tool support.

## Shell Shortcuts On This Machine

If the local zsh config has been loaded, these wrappers may be available:

```bash
oproxy
oproxystop
cdeep
cdeepexec "task"
dside "task"
```

Run `source ~/.zshrc` if a current shell session does not see them yet.

## Task Recipes

### 1. Fix a command bug

1. Read the command module and the nearest tests.
2. Ask the sidecar to summarize the local risk if the file is large.
3. Patch the command.
4. Run the narrowest related test.
5. Run `npm run check`.

### 2. Change media processing

1. Inspect [src/bot/mediaProcessor.js](/home/dev/work/sticker-bot2/src/bot/mediaProcessor.js) and [src/bot/stickers.js](/home/dev/work/sticker-bot2/src/bot/stickers.js).
2. Preserve fallback behavior for optional helpers and animated WebP detection.
3. Run `npm run check`.
4. If the flow touches persistence or integration boundaries, run `npm run test:integration`.

### 3. Change websocket or bridge behavior

1. Inspect [src/server/bridge.js](/home/dev/work/sticker-bot2/src/server/bridge.js).
2. Audit cleanup for maps, sets, intervals, listeners, and raw message retention.
3. Run `npm run smoke`.
4. Run `npm run check`.
5. Run `npm run test:integration` if message routing or persistence changed.

### 4. Update agent tooling

1. Change the scripts under [scripts/agent/](/home/dev/work/sticker-bot2/scripts/agent).
2. Run `npm run agent:tooling`.
3. Run the exact wrapper you changed.
4. Update the markdown docs in the same patch.

## Prompt Patterns That Work Well

### Good

- `Map the cleanup lifecycle in src/server/bridge.js and identify leak risks`
- `Summarize the dependencies of src/bot/messageHandler.js in 10 bullets`
- `Draft a minimal patch plan for adding a new command to src/commands/`
- `List which tests should be run if src/web/server.js changes`

### Bad

- `Fix the whole project`
- `Refactor everything`
- `Run whatever tests you think`
- `Use deepseek-coder:6.7b as the Codex engine`

## Validation Matrix

- Docs only: no code validation required
- Agent docs or wrappers: `npm run agent:tooling`
- JS code in one subsystem: `npm run check`
- Startup wiring: `npm run smoke`
- Cross-subsystem or DB behavior: `npm run check && npm run test:integration`

## Working Agreement

- Final edits happen locally in this repository.
- Sidecars can explore, summarize, and draft.
- Validation is always local.
- If documentation changes the workflow, update the docs with the code.
