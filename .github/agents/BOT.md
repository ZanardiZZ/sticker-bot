# Bot Guide

Use this guide when changing the WhatsApp bot, command flow, message processing, sticker generation, or media ingestion.

## Main Files

- [index.js](/home/dev/work/sticker-bot2/index.js)
- [server.js](/home/dev/work/sticker-bot2/server.js)
- [src/server/bridge.js](/home/dev/work/sticker-bot2/src/server/bridge.js)
- [src/bot/messageHandler.js](/home/dev/work/sticker-bot2/src/bot/messageHandler.js)
- [src/bot/mediaProcessor.js](/home/dev/work/sticker-bot2/src/bot/mediaProcessor.js)
- [src/bot/stickers.js](/home/dev/work/sticker-bot2/src/bot/stickers.js)
- [src/commands/](/home/dev/work/sticker-bot2/src/commands)

## Current Expectations

- Keep message-processing changes narrow.
- Preserve duplicate-protection and tolerant handling of optional helpers.
- Avoid retaining raw message objects, media buffers, or websocket clients longer than necessary.
- Preserve animated WebP detection, including VP8X fallback behavior.
- Preserve GIF-like conversion messaging expected by tests.

## Validation

- Narrow test first when possible
- `npm run check`
- `npm run smoke` if startup wiring or bridge wiring changed
- `npm run test:integration` if persistence, routing, or cross-process behavior changed

## Common Risks

- memory growth from maps, sets, intervals, or listeners
- regressions in test mocks due to required helper functions
- media conversion behavior drifting from test expectations
- command handlers bypassing analytics, permission checks, or duplicate guards
