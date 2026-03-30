# Sticker Bot Expert Agent

You are working in a Node.js WhatsApp sticker bot with a web admin, SQLite storage, agent tooling, and a remote Ollama sidecar.

## Primary Responsibilities

- implement bot, web, database, and media-processing changes
- keep validation fast and proportionate
- avoid memory leaks and long-lived resource retention
- preserve compatibility with the current test suite and partial mocks

## How To Use This File

Read this file as the repository index, then load only the domain guides relevant to the task:

- [BOT.md](/home/dev/work/sticker-bot2/.github/agents/BOT.md)
- [WEB.md](/home/dev/work/sticker-bot2/.github/agents/WEB.md)
- [OPERATIONS.md](/home/dev/work/sticker-bot2/.github/agents/OPERATIONS.md)
- [TESTING.md](/home/dev/work/sticker-bot2/.github/agents/TESTING.md)

## Repository Architecture

### Runtime entrypoints

- [index.js](/home/dev/work/sticker-bot2/index.js): main bot entrypoint wrapper
- [server.js](/home/dev/work/sticker-bot2/server.js): WhatsApp bridge entrypoint wrapper
- [src/bot/index.js](/home/dev/work/sticker-bot2/src/bot/index.js): main bot process
- [src/server/bridge.js](/home/dev/work/sticker-bot2/src/server/bridge.js): WhatsApp bridge server, websocket fanout, cache lifecycle
- [src/web/server.js](/home/dev/work/sticker-bot2/src/web/server.js): web admin entrypoint

### Bot subsystem

- [src/bot/messageHandler.js](/home/dev/work/sticker-bot2/src/bot/messageHandler.js): message orchestration
- [src/bot/mediaProcessor.js](/home/dev/work/sticker-bot2/src/bot/mediaProcessor.js): media pipeline
- [src/bot/stickers.js](/home/dev/work/sticker-bot2/src/bot/stickers.js): sticker generation and animated WebP handling
- [src/commands/](/home/dev/work/sticker-bot2/src/commands): command modules

### Data and services

- [src/database/](/home/dev/work/sticker-bot2/src/database): database bootstrap and models
- [src/services/](/home/dev/work/sticker-bot2/src/services): AI, NSFW, video, email, integrations
- [storage/](/home/dev/work/sticker-bot2/storage): runtime persistence, logs, auth, cache
- [media/](/home/dev/work/sticker-bot2/media): local bot media storage outside source control
- [scripts/](/home/dev/work/sticker-bot2/scripts): migrations and maintenance tasks

### Agent tooling

- [scripts/agent/context.js](/home/dev/work/sticker-bot2/scripts/agent/context.js)
- [scripts/agent/check-tooling.sh](/home/dev/work/sticker-bot2/scripts/agent/check-tooling.sh)
- [scripts/agent/deepseek-sidecar.sh](/home/dev/work/sticker-bot2/scripts/agent/deepseek-sidecar.sh)
- [scripts/agent/ensure-local-ollama-proxy.sh](/home/dev/work/sticker-bot2/scripts/agent/ensure-local-ollama-proxy.sh)
- [scripts/agent/codex-deepseek.sh](/home/dev/work/sticker-bot2/scripts/agent/codex-deepseek.sh)
- [scripts/agent/codex-deepseek-exec.sh](/home/dev/work/sticker-bot2/scripts/agent/codex-deepseek-exec.sh)

## Preferred Commands

### Validation

- `npm run check`
- `npm run smoke`
- `npm run test:integration`
- `npm run agent:tooling`

### Agent context

- `npm run agent:context`
- `just agent-context`
- `make agent-context`

### Remote model workflows

- `npm run agent:deepseek -- --prompt "task"`
- `npm run agent:ollama:proxy`
- `npm run agent:codex:deepseek`
- `npm run agent:codex:deepseek:exec -- --skip-git-repo-check "task"`

## Model Guidance

- `deepseek-coder:6.7b` is valid for the sidecar wrapper.
- `deepseek-coder:6.7b` is not valid as the direct Codex OSS engine because the model does not support tools.
- Use `qwen3:8b` for `codex --oss --local-provider ollama`.

## Engineering Constraints

### Memory and lifecycle

Be careful in:

- websocket client sets
- message caches
- contact/chat stores
- intervals and timers
- event listeners attached per connection

New long-lived structures must have cleanup rules, bounds, or TTL.

### Test compatibility

The test suite intentionally uses partial mocks. Do not assume every collaborator function exists in tests.

Prefer tolerant wrappers when a dependency is optional in production or omitted in mocks.

### Media behavior

- preserve GIF-like conversion messaging behavior
- preserve animated WebP detection, including VP8X fallback
- do not regress duplicate media or hash lookup fallbacks

## Change Strategy

Use this order:

1. inspect the exact module and its tests
2. patch locally with minimal scope
3. run narrow tests first
4. run `npm run check`
5. run `npm run test:integration` if behavior crosses modules

Do not default to broad refactors unless the task explicitly requires one.

## Good Prompts for Sidecars

- `Summarize risks in src/bot/messageHandler.js`
- `Identify cleanup obligations in src/server/bridge.js`
- `Draft a minimal change plan for src/database/models/media.js`
- `Compare current mediaProcessor behavior against tests`

Use sidecars for analysis and drafting. Keep final edits and validation local.

## Anti-Patterns

- citing `npm test` as the only validation step
- telling agents to start every service before changing code
- assuming remote Ollama can be used directly by Codex without the local proxy
- treating `deepseek-coder:6.7b` as tool-capable for Codex OSS
- adding caches without bounds or cleanup
- replacing narrow validation with a full manual runtime test when unit coverage already exists
