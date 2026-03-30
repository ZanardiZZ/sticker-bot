# Sticker Bot Agent Instructions

Read this file first when working in this repository. Use it as the default operating contract for Copilot, Codex, Claude, or any other coding agent.

## Current Baseline

- Runtime: Node.js from [`.nvmrc`](/home/dev/work/sticker-bot2/.nvmrc)
- Package manager: `npm`
- Main fast gate: `npm run check`
- Full local gate: `npm run check && npm run test:integration`
- Formatting: `prettier`
- Lint: `eslint`
- Smoke validation: `npm run smoke`

## Repository Entry Points

- Bot process: `npm run bot`
- Web admin: `npm run web`
- WhatsApp bridge server: `npm run baileys:server`
- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:integration`
- Combined tests: `npm test`

## Agent Workflow

Prefer this loop:

1. Run `npm run agent:context`
2. Inspect the relevant module only
3. Make the smallest correct change
4. Run the narrowest useful test
5. Run `npm run check`
6. If behavior crosses subsystems, run `npm run test:integration`

Do not default to starting the bot or web server unless the task needs runtime validation.

## DeepSeek and Local Agent Tooling

The repository includes wrappers for a remote Ollama host at `192.168.20.24:11434`.

- DeepSeek sidecar: `npm run agent:deepseek -- --prompt "task"`
- Local Ollama proxy: `npm run agent:ollama:proxy`
- Stop proxy: `npm run agent:ollama:proxy:stop`
- Codex via Ollama: `npm run agent:codex:deepseek`
- Codex non-interactive: `npm run agent:codex:deepseek:exec -- --skip-git-repo-check "task"`

Important limitation:

- `deepseek-coder:6.7b` works through the sidecar wrapper.
- The current Codex OSS provider rejects `deepseek-coder:6.7b` as a direct coding engine because it does not support tools.
- Use `qwen3:8b` for `codex --oss --local-provider ollama`, or use the DeepSeek sidecar for exploration and drafting.

## Shell Shortcuts

Useful zsh functions may already exist on the machine:

- `oproxy`
- `oproxystop`
- `cdeep`
- `cdeepexec`
- `dside`

They are convenience wrappers around the same scripts above. Do not assume they exist on another machine unless you verify `~/.zshrc`.

## File Map

Core areas:

- [index.js](/home/dev/work/sticker-bot2/index.js): bot entry point
- [server.js](/home/dev/work/sticker-bot2/server.js): bridge entrypoint wrapper
- [src/server/bridge.js](/home/dev/work/sticker-bot2/src/server/bridge.js): WhatsApp bridge server and websocket fanout
- [src/bot/](/home/dev/work/sticker-bot2/src/bot): message handling, media processing, stickers
- [src/commands/](/home/dev/work/sticker-bot2/src/commands): command handlers
- [src/database/](/home/dev/work/sticker-bot2/src/database): db bootstrap and models
- [src/services/](/home/dev/work/sticker-bot2/src/services): AI, NSFW, video, external integrations
- [src/web/](/home/dev/work/sticker-bot2/src/web): web server, routes, auth, static admin UI
- [storage/](/home/dev/work/sticker-bot2/storage): local runtime data, tokens, logs, and caches
- [media/](/home/dev/work/sticker-bot2/media): local bot media storage; do not treat it as source code
- [scripts/agent/](/home/dev/work/sticker-bot2/scripts/agent): local agent tooling

When changing behavior, prefer editing `src/**`. Keep the root wrappers thin and stable.

## High-Value Validation Rules

Run the smallest gate that proves the change:

- Docs-only changes: no tests required
- Agent tooling changes: `npm run agent:tooling` and the specific wrapper command
- Lint/config changes: `npm run check`
- Bot/media/command changes: `npm run check`
- Database or cross-service behavior: `npm run check && npm run test:integration`
- Startup-path changes: `npm run smoke`

## Known Sensitive Areas

- [src/server/bridge.js](/home/dev/work/sticker-bot2/src/server/bridge.js): avoid unbounded maps, intervals, websocket client leaks, or retaining large raw message objects
- [src/bot/mediaProcessor.js](/home/dev/work/sticker-bot2/src/bot/mediaProcessor.js): test doubles may omit optional functions; keep graceful fallbacks
- [src/bot/messageHandler.js](/home/dev/work/sticker-bot2/src/bot/messageHandler.js): preserve tolerant behavior for partial mocks and duplicate-processing guards
- [src/bot/stickers.js](/home/dev/work/sticker-bot2/src/bot/stickers.js): animated WebP detection must preserve VP8X fallback coverage
- [src/web/server.js](/home/dev/work/sticker-bot2/src/web/server.js): keep auth, route registration, and db init consistent with tests

## Code Expectations

- Prefer small, localized patches
- Preserve CommonJS style unless the file already uses a different pattern
- Keep logs structured and searchable, for example `[WEB]`, `[BOT]`, `[DB]`
- Fail gracefully when optional services are absent
- Do not add long-lived caches, intervals, or listeners without cleanup
- Do not invent new workflow commands if an existing `npm run` or `just` target already covers the task

## Installation Notes

Preferred install:

```bash
npm ci
```

If native modules fail:

```bash
npm rebuild sqlite3 sharp
```

Some dependencies fetch prebuilt binaries during install, especially `sqlite3`, `sharp`, and `@tensorflow/tfjs-node`.

## Environment Notes

Frequently used variables:

- `AUTO_SEND_GROUP_ID`
- `ADMIN_NUMBER`
- `PORT`
- `TIMEZONE`
- `OPENAI_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_SSH_HOST`

Never commit secrets, generated credentials, or personal phone numbers.

## References

- Agent workflow: [docs/agent-workflow.md](/home/dev/work/sticker-bot2/docs/agent-workflow.md)
- Agent overview: [.github/agents/README.md](/home/dev/work/sticker-bot2/.github/agents/README.md)
- Expert agent profile: [.github/agents/sticker-bot-expert.md](/home/dev/work/sticker-bot2/.github/agents/sticker-bot-expert.md)
- Bot guide: [.github/agents/BOT.md](/home/dev/work/sticker-bot2/.github/agents/BOT.md)
- Web guide: [.github/agents/WEB.md](/home/dev/work/sticker-bot2/.github/agents/WEB.md)
- Operations guide: [.github/agents/OPERATIONS.md](/home/dev/work/sticker-bot2/.github/agents/OPERATIONS.md)
- Testing guide: [.github/agents/TESTING.md](/home/dev/work/sticker-bot2/.github/agents/TESTING.md)
