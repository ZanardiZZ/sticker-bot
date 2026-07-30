# Bot Specialist Profile

Use this optional profile for WhatsApp, message routing, commands, sticker generation, media ingestion, or bridge changes. Read the root [`AGENTS.md`](<PROJECT_ROOT>/AGENTS.md) first and the nearest local `AGENTS.md` for subtree-specific rules.

## Main files

- [`index.js`](<PROJECT_ROOT>/index.js): stable bot entrypoint wrapper.
- [`server.js`](<PROJECT_ROOT>/server.js): stable bridge entrypoint wrapper.
- [`src/server/bridge.js`](<PROJECT_ROOT>/src/server/bridge.js): WPPConnect/WA-JS bridge, message adaptation, media download/send, chat listing, LID resolution, and websocket fanout.
- [`src/waAdapter.js`](<PROJECT_ROOT>/src/waAdapter.js): WhatsApp adapter boundary.
- [`src/bot/index.js`](<PROJECT_ROOT>/src/bot/index.js): bot process wiring.
- [`src/bot/messageHandler.js`](<PROJECT_ROOT>/src/bot/messageHandler.js): message routing and orchestration.
- [`src/bot/mediaProcessor.js`](<PROJECT_ROOT>/src/bot/mediaProcessor.js): incoming image/video/audio processing and descriptions.
- [`src/bot/stickers.js`](<PROJECT_ROOT>/src/bot/stickers.js): sticker generation and animated WebP behavior.
- [`src/commands/`](<PROJECT_ROOT>/src/commands): command registry, validation, permissions, analytics, and handlers.
- [`src/database/models/lidMapping.js`](<PROJECT_ROOT>/src/database/models/lidMapping.js): LID-to-phone-number persistence and cache invalidation.
- [`src/services/ai.js`](<PROJECT_ROOT>/src/services/ai.js): remote multimodal transcription and AI annotations.
- [`src/services/videoProcessor.js`](<PROJECT_ROOT>/src/services/videoProcessor.js): video/audio extraction and remote transcription orchestration.
- [`src/services/audioConverter.js`](<PROJECT_ROOT>/src/services/audioConverter.js): MP3-to-OPUS conversion for outbound audio.

## Current behavior to preserve

### WhatsApp and chat compatibility

- Preserve WPPConnect/WA-JS compatibility and the adapter’s tolerant handling of partial message objects.
- Prefer `listChats()` and retain the fallback to `getAllChats()` for older/partial clients.
- Preserve LID resolution, `lid_mapping`, in-memory cache invalidation, and backward-compatible message IDs.
- Keep media send/download fallbacks and avoid assuming every collaborator exists in tests.

### Commands and routing

- Keep permission checks, ownership boundaries, command usage analytics, duplicate protection, and safe messaging paths intact.
- New commands belong under `src/commands/` and must use the existing registry/validation patterns.
- Do not bypass the message handler to create a second routing path.

### Media and audio

- Preserve animated WebP detection, GIF-like video behavior, VP8X fallback handling, and duplicate/hash lookup behavior.
- Use the configured FFmpeg fallback chain; do not assume `ffmpeg-static` contains a usable binary.
- Audio transcription is remote through the configured Gemma/OpenAI-compatible multimodal endpoint after WAV normalization. There is no local `whisper.cpp` runtime and it must not be reintroduced.
- Keep temporary audio/video files bounded and remove them in success and failure paths.
- Never log raw audio, media contents, credentials, or private WhatsApp identifiers.

### Lifecycle and memory

Bound or clean up maps, sets, buffers, intervals, websocket clients, listeners, and temporary files. Do not retain complete raw message objects or media buffers longer than required.

## Validation matrix

```bash
npm run check
npm run smoke
npm run test:integration
```

- `npm run check`: baseline lint, formatting, and unit suite.
- `npm run smoke`: startup-path and syntax validation.
- `npm run test:integration`: database, routing, LID, bridge, or cross-process behavior.

For media or command changes, run `npm run check`. Add integration tests when persistence, routing, ownership, LID, or bridge behavior changes. Public CI must not require WhatsApp connectivity, PM2, operational databases, sessions, or private services.

## Common failure modes

- A second PM2 instance creates duplicate processes or port conflicts; deployment PM2 belongs to the configured `dev` user.
- A partial mock lacks a production-only helper; keep wrappers tolerant and test-compatible.
- A LID is treated as a phone JID; use the existing resolver and mapping model.
- A video with `isWhatsAppGif` is assumed to be WebP; inspect MIME/container and preserve the FFmpeg fallback.
- Remote Gemma configuration is treated as a local binary; use environment configuration and fail closed when unavailable.
- A command bypasses permission, analytics, duplicate, or safe-reply helpers.
