# Sticker Bot Expert Profile

This is an optional repository profile for broad Sticker Bot work. Read the root [`AGENTS.md`](<PROJECT_ROOT>/AGENTS.md) first; that file remains the only repository-wide contract. Load the narrower profile that matches the task when possible.

## Current system

Sticker Bot is a Node.js WhatsApp bot with an Express administration surface, SQLite persistence, media processing, optional AI integrations, and WPPConnect/WA-JS compatibility layers. The production runtime is not a local Whisper or local LLM installation.

## When to use this profile

Use it for changes that cross bot, bridge, commands, media, database, web, or AI boundaries. For a single subsystem, prefer the narrower profile:

- [`BOT.md`](<PROJECT_ROOT>/.github/agents/BOT.md): WhatsApp, messages, commands, and media.
- [`WEB.md`](<PROJECT_ROOT>/.github/agents/WEB.md): Express, authentication, routes, and frontend.
- [`OPERATIONS.md`](<PROJECT_ROOT>/.github/agents/OPERATIONS.md): optional agent tooling and operational scripts.
- [`TESTING.md`](<PROJECT_ROOT>/.github/agents/TESTING.md): validation selection.

## Current architecture

### Entrypoints and processes

- [`index.js`](<PROJECT_ROOT>/index.js): stable bot entrypoint wrapper.
- [`server.js`](<PROJECT_ROOT>/server.js): stable bridge entrypoint wrapper.
- [`src/bot/index.js`](<PROJECT_ROOT>/src/bot/index.js): bot process wiring.
- [`src/server/bridge.js`](<PROJECT_ROOT>/src/server/bridge.js): WPPConnect bridge, media/message adaptation, chat listing, LID resolution, and websocket fanout.
- [`src/web/server.js`](<PROJECT_ROOT>/src/web/server.js): Express administration server.
- `ecosystem.config.cjs`: deployment process definition; the operational PM2 instance belongs to the configured `dev` user.

### Main subsystems

- `src/bot/messageHandler.js`: message orchestration and routing.
- `src/bot/mediaProcessor.js`: incoming media classification, descriptions, tags, and delivery.
- `src/bot/stickers.js`: sticker creation and animated WebP handling.
- `src/commands/`: command registry, validation, permissions, analytics, and handlers.
- `src/database/`: SQLite bootstrap, models, migrations, and LID mapping.
- `src/services/`: AI, media, payments, privacy, queues, and external integrations.
- `src/web/`: routes, middleware, data access, authentication, and frontend.

## Contracts that must not regress

- Keep WPPConnect/WA-JS compatibility and the current WhatsApp Web adapter behavior.
- Prefer `listChats()` and preserve the compatibility fallback to `getAllChats()`.
- Preserve LID-to-phone-number resolution, `lid_mapping`, cache invalidation, and backward-compatible message IDs.
- Preserve duplicate-media/hash fallbacks, permission checks, command analytics, and safe messaging behavior.
- Preserve animated WebP/GIF detection and the FFmpeg fallback chain (`FFMPEG_PATH`, available `ffmpeg-static` binary, then system FFmpeg).
- Audio transcription uses the configured remote multimodal provider through `src/services/ai.js`; do not reintroduce `whisper.cpp` or a local transcription binary.
- Gemma endpoints/models are external runtime configuration. Never hardcode their host, model path, API key, or private network identity.
- Runtime data remains outside Git: sessions, databases, WAL files, media, logs, backups, and local model caches.

## Official validation

```bash
npm run check
npm run smoke
npm run test:integration
npm run agent:tooling
```

Use `npm run check` as the baseline. Add `npm run smoke` for startup or wiring changes and `npm run test:integration` for persistence, routing, bridge, LID, or cross-process behavior. Do not start WhatsApp or PM2 to validate a public CI change.

## Agent tooling boundary

The repository contains optional DeepSeek/Ollama helper scripts under `scripts/agent/`. They are developer tooling, not production dependencies and not prerequisites for ordinary code changes. Use them only when the task explicitly benefits from a sidecar or local agent workflow. Keep final edits, tests, and security decisions in the primary working tree.

## Change strategy

1. Read the root contract and nearest local `AGENTS.md`.
2. Query or inspect the exact implementation and tests before editing.
3. Make the smallest compatible change.
4. Run focused tests, then the applicable official gates.
5. Check for secrets, host-specific paths, runtime artifacts, and stale documentation before committing.

Avoid broad refactors, unbounded caches, duplicate PM2 instances, and changes that make mocks require production-only collaborators.
