# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sticker Bot 2 is a WhatsApp bot for managing and distributing stickers with an integrated web administration interface. Built with Node.js using Baileys for WhatsApp integration and SQLite for persistence.

## Commands

### Running the Application

```bash
# Start Baileys WebSocket bridge (maintains WhatsApp session - run first)
npm run baileys:server

# Start bot process (connects to bridge)
npm run bot

# Start web interface (port 3000)
npm run web
```

### Testing

```bash
# Full test suite (unit + integration)
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Database migration test
node scripts/test-migration.js
```

### Installation

```bash
npm ci
# If native modules fail:
npm rebuild sqlite3 sharp
```

## Architecture

### Three-Process Design

```
┌─────────────────────────────────────────┐
│  Baileys WebSocket Bridge (server.js)   │  Port 8765
│  - Maintains persistent WhatsApp session │
│  - Survives bot restarts                 │
└────────────────┬────────────────────────┘
                 │ WebSocket
     ┌───────────┴───────────┐
     │                       │
┌────▼─────┐          ┌──────▼──────┐
│ Bot      │          │ Web Server  │  Port 3000
│(index.js)│          │(web/server) │
└────┬─────┘          └──────┬──────┘
     │                       │
     └───────────┬───────────┘
                 │
         ┌───────▼───────┐
         │ SQLite (WAL)  │  media.db
         └───────────────┘
```

### Message Processing Pipeline (bot/messageHandler.js)

1. Receive message → Log → Sync contact/group
2. Check if command (`#...`) → Route to `commands/handlers/*`
3. If media → NSFW filter → AI tagging → Save to database

### Key Directories

- `bot/` - WhatsApp bot modules (client, messageHandler, mediaProcessor, scheduler)
- `commands/handlers/` - Individual command handlers (#random, #count, #pack, etc.)
- `database/models/` - SQLite CRUD operations for each entity
- `services/` - Business logic (ai.js, nsfwFilter.js, videoProcessor.js, videoDownloader.js)
- `web/routes/` - Express API routes
- `web/middlewares/` - Rate limiting, CSRF, IP rules
- `utils/` - Shared utilities (jidUtils, safeMessaging, commandNormalizer)
- `tests/unit/` - Unit tests (one per module)

### Database

SQLite with WAL mode. 20+ tables. Automatic migrations on startup. Key models:
- `media` - Sticker storage with metadata
- `contacts` - WhatsApp contacts/groups
- `sticker_packs` / `pack_stickers` - Pack organization
- `command_usage` - Analytics
- `delete_requests` - Voting system for deletions

### WebSocket Adapter (waAdapter.js)

Client library that wraps WebSocket communication with the Baileys bridge. Used by both bot and web server to send WhatsApp messages without direct Baileys dependency.

## Key Patterns

### Command Handler Structure

```javascript
// commands/handlers/example.js
async function handleExampleCommand(client, message, args) {
  // Implementation
}
module.exports = { handleExampleCommand };
```

### Database Model Pattern

```javascript
// database/models/example.js
module.exports = {
  create: (data) => { /* INSERT */ },
  getById: (id) => { /* SELECT */ },
  update: (id, data) => { /* UPDATE */ },
  delete: (id) => { /* DELETE */ }
};
```

### Error-Safe Messaging

Use `safeReply()` from `utils/safeMessaging.js` for all user-facing messages to handle send failures gracefully.

## Environment Variables (Required)

```env
AUTO_SEND_GROUP_ID=your_whatsapp_group_id
ADMIN_NUMBER=5511999999999@c.us
```

See `.env.example` for full configuration options including OpenAI API, SMTP, and analytics.

## Adding New Commands

1. Create handler in `commands/handlers/newcommand.js`
2. Register in `commands/index.js` command router
3. Track usage with `commandUsage.recordUsage()` for analytics
4. Add tests in `tests/unit/newcommand.test.js`
5. See `docs/COMMAND_USAGE_ANALYTICS.md` for analytics integration checklist
