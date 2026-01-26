# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sticker Bot 2 is a WhatsApp bot for managing and distributing stickers with an integrated web administration interface. Built with Node.js using Baileys for WhatsApp integration and SQLite for persistence.

## Commands

### Running the Application

**⚠️ IMPORTANT: Use PM2 to avoid process duplication**

The application uses PM2 for process management. **NEVER** run processes manually with `npm run` or `node` in production as this creates duplicate processes.

```bash
# ✅ CORRECT: Start all services via PM2 (as user dev)
sudo -u dev pm2 start ecosystem.config.js

# ✅ Check status
sudo -u dev pm2 list

# ✅ View logs
sudo -u dev pm2 logs Bot-Client          # Main bot
sudo -u dev pm2 logs WS-Socket-Server    # Baileys bridge
sudo -u dev pm2 logs WebServer           # Web interface

# ✅ Restart services
sudo -u dev pm2 restart Bot-Client
sudo -u dev pm2 restart all

# ✅ Stop all services
sudo -u dev pm2 stop all

# ❌ WRONG: Manual start (creates duplicates!)
npm run baileys:server  # Don't use this
npm run bot             # Don't use this
npm run web             # Don't use this
node index.js           # Don't use this
```

**Process Duplication Prevention:**

If you see duplicate processes, follow this cleanup procedure:

```bash
# 1. Check for duplicates
ps aux | grep -E '(index.js|server.js)' | grep -v grep

# 2. Kill ALL processes first
pkill -f 'node.*index.js'
pkill -f 'node.*server.js'

# 3. Stop all PM2 instances (both root and dev)
pm2 delete all
sudo -u dev pm2 delete all

# 4. Wait for processes to fully stop
sleep 3

# 5. Start ONLY via dev user's PM2
sudo -u dev pm2 start ecosystem.config.js

# 6. Verify no duplicates (should see exactly 3-4 processes)
ps aux | grep -E '(index.js|server.js)' | grep -v grep | wc -l
```

**PM2 Process Names:**
- `Bot-Client` - Main bot (index.js) with AdminWatcher
- `WS-Socket-Server` - Baileys WebSocket bridge (server.js)
- `WebServer` - Web interface (web/server.js)
- `Wordnet` - NLP service (app.py)

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

### Maintenance Scripts

```bash
# Database migrations and verification
node scripts/test-migration.js
node scripts/migrate-historical-contacts.js
node scripts/migrate-missing-sender-ids.js
node scripts/migrate-to-lids.js
node scripts/verify-contacts-migration.js
node scripts/verify-lid-system.js

# Version management
node scripts/increment-version.js          # Auto-increment version
node scripts/release-version.js            # Create release with changelog

# Media and database maintenance
node scripts/cleanup-missing-media.js      # Remove orphaned media references
node scripts/backfill-hash-visual.js       # Backfill visual hashes for media
node scripts/check-db-schema.js            # Verify database schema

# Development utilities
node scripts/inject-umami.js               # Inject analytics script
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

### Available Commands

User commands implemented in `commands/handlers/`:

**Core Commands:**
- `#random` - Get random sticker
- `#count` - Show total sticker count
- `#123` (ID) - Get sticker by ID
- `#tema <theme>` - Get random sticker by theme/tag
- `#top10` - Top 10 most used stickers
- `#top5users` - Top 5 contributors by sticker count
- `#top5comandos` - Top 5 most used commands

**Pack Management:**
- `#pack` - List all packs or get pack stickers
- `#addpack <name>` - Add sticker to pack (reply to sticker info)

**Media Management:**
- `#editar <ID>` - Edit sticker tags/description
- `#deletar <ID>` - Delete sticker (voting system: 3 votes or admin/sender)
- `#forçar` - Force save next media (admin only)

**Download & Creation:**
- `#download <URL>` - Download short video from URL (YouTube, TikTok, etc.)
- `#baixar <URL>` - Same as #download (Portuguese)
- `#downloadmp3 <URL>` - Download audio from video URL
- `#baixarmp3 <URL>` - Same as #downloadmp3 (Portuguese)
- `#baixaraudio <URL>` - Same as #downloadmp3 (Portuguese)
- `#criar <prompt>` - Generate meme with AI (OpenAI DALL-E)
- `#exportarmemes` - Export all generated memes (admin only)
- `#fotohd` - Upscale photo to HD quality (reply to image)

**User & Admin:**
- `#perfil` - Show user profile and statistics
- `#verificar` - Generate WhatsApp verification code for web account linking
- `#ban @user` - Kick user from group (admin only, group only)
- `#issue <description>` - Report issue to developers
- `#ping` - Check bot status and uptime

**Special:**
- `#pinga` - Get least-used beverage sticker

### Key Directories

- `bot/` - WhatsApp bot modules (client, messageHandler, mediaProcessor, scheduler, contacts, stickers, historyRecovery)
- `commands/handlers/` - Individual command handlers (see Available Commands section below)
- `database/models/` - SQLite CRUD operations for each entity (see Database Models section below)
- `services/` - Business logic (ai.js, nsfwFilter.js, videoProcessor.js, videoDownloader.js, adminWatcher.js, openaiTools.js)
- `web/routes/` - Express API routes (index, admin, packs, account, captcha)
- `web/middlewares/` - Rate limiting, CSRF, IP rules, CSP, request logger
- `utils/` - Shared utilities (jidUtils, safeMessaging, commandNormalizer)
- `tests/unit/` - Unit tests (one per module)
- `tests/integration/` - Integration tests
- `scripts/` - Maintenance and migration scripts

### Database

SQLite with WAL mode. 20+ tables. Automatic migrations on startup.

**Database Models** (`database/models/`):

*Core Models:*
- `media.js` - Sticker storage with metadata (visual hash, MD5, tags, descriptions, AI analysis)
- `contacts.js` - WhatsApp contacts/groups with sender ID mapping
- `tags.js` - Tag management and relationships

*Pack System:*
- `packs.js` - Sticker pack management (creation, metadata, capacity tracking)
- Includes `sticker_packs` and `pack_stickers` tables

*User & Analytics:*
- `commandUsage.js` - Command execution tracking and rankings
- `reactions.js` - User reactions to stickers (if implemented)
- `whatsappVerification.js` - WhatsApp-to-web account verification codes

*Voting & Moderation:*
- `deleteRequests.js` - Voting system for sticker deletions (3 votes or admin/sender)

*Processing & State:*
- `processing.js` - Media processing queue and job management
- `processedMessages.js` - Deduplication and message history
- `pendingEdits.js` - Edit mode state management
- `duplicates.js` - Duplicate media detection (visual hash + MD5)

*System Management:*
- `lidMapping.js` - LID (Local ID) to JID mapping for contacts
- `version.js` - Semantic versioning and changelog management
- `maintenance.js` - Database migrations and maintenance tasks
- `config.js` - Runtime configuration storage

### WebSocket Adapter (waAdapter.js)

Client library that wraps WebSocket communication with the Baileys bridge. Used by both bot and web server to send WhatsApp messages without direct Baileys dependency.

### Important Systems

**LID System** (`database/models/lidMapping.js`):
- Maps WhatsApp LIDs (Local IDs) to JIDs (full WhatsApp IDs)
- Handles contact ID resolution and reuse
- Automatic migration from historical data
- See `docs/LID_MIGRATION.md` for details

**Pack System** (`database/models/packs.js`, `commands/handlers/pack.js`, `commands/handlers/addpack.js`):
- Create and manage sticker collections (max 30 stickers per pack)
- WhatsApp pack metadata (name, author)
- Web sharing via `/packs/<id>` endpoint
- Automatic sequel suggestions when pack is full
- See `docs/PACK_FEATURE_GUIDE.md` for details

**Voting System** (`database/models/deleteRequests.js`, `commands/handlers/delete.js`):
- Democratic deletion: 3 votes required
- Instant deletion for original sender or admins
- One vote per user per sticker
- Progress tracking

**Verification System** (`database/models/whatsappVerification.js`, `commands/handlers/verify.js`):
- Links WhatsApp accounts to web accounts
- 8-character verification codes (24h expiry)
- Enables web editing privileges
- See `docs/WHATSAPP_VERIFICATION.md` for details

**Version Management** (`database/models/version.js`, `scripts/increment-version.js`, `scripts/release-version.js`):
- Semantic versioning (SemVer)
- Automatic version increments (0.1 per changelog)
- Manual bumps via commit messages
- Changelog generation
- See `docs/VERSION_MANAGEMENT.md` and `docs/SEMVER_IMPLEMENTATION.md` for details

**Media Processing Queue** (`database/models/processing.js`, `bot/mediaProcessor.js`):
- Concurrent processing (default: 3 jobs)
- Automatic retries with exponential backoff
- Job status tracking (queued, active, completed, failed)
- NSFW filtering and AI tagging integration

**History Recovery** (`bot/historyRecovery.js`):
- Automatic recovery of missed messages on reconnection
- Batch processing with configurable limits
- Periodic sync (optional)
- See `docs/MESSAGE_HISTORY_RECOVERY.md` for details

**Admin Watcher (Self-Healing System)** (`services/adminWatcher.js`, `services/openaiTools.js`):
- Monitors admin messages for problem reports
- Detects keywords: "erro", "falha", "parou", "bug", "problema", "crashou", etc.
- **15 specialized tools** (9 diagnostic + 6 remediation) for autonomous problem-solving:
  - **Diagnostic (9)**: `getBotLogs`, `searchLogsForPattern`, `getServiceStatus`, `getLastSentSticker`, `getSchedulerStatus`, `getQueueStatus`, `readFile`, `runHealthCheck`, `analyzeDatabaseSchema`
  - **Remediation (6)**: `restartService`, `executeSqlQuery`, `createDatabaseTable`, `modifyBotConfig`, `clearProcessingQueue`, `writeFile`
- **Automatically diagnoses AND fixes issues** - no manual intervention needed
- Example: Missing table → detects error → creates table → restarts service → reports fix
- Security controls: blocks DELETE/DROP/TRUNCATE, protects sensitive files
- Reports diagnosis back to admin via WhatsApp in **natural, casual Portuguese**
- Intelligent cooldown (5 minutes) to prevent spam
- Cost-effective: ~$0.60/month with gpt-4o-mini (recommended)
- Enable via `ADMIN_WATCHER_ENABLED=true` in .env (requires `OPENAI_API_KEY`)
- See `docs/agents.md` for complete documentation and `docs/ADMIN_WATCHER_REMEDIATION_TOOLS.md` for tool details

**Conversation Agent** (`services/conversationAgent.js`):
- AI-powered group chat participant that converses naturally with users
- **Improved for naturalness**: less robotic, more casual and authentic
- 4 random system prompt variations to avoid predictable responses
- Organic probability calculation (less mechanical, more human-like)
- Detects mentions via name aliases and @mentions
- Smart response timing: waits for MIN_MESSAGES before participating
- Cooldown system to avoid spam (default: 2 minutes between responses)
- Conversation memory: maintains context across messages (default: 16 messages)
- Less aggressive sanitization: allows natural name mentions, removes only AI patterns
- Intelligent text truncation: cuts at sentence boundaries when possible
- Configurable persona name and behavior via env vars
- Enable/disable via `CONVERSATION_AGENT_ENABLED` (default: enabled)
- Requires OpenAI API key (uses `generateConversationalReply` from `services/ai.js`)
- See `docs/CONVERSATION_AGENT_IMPROVEMENTS.md` for details and examples

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

## Environment Variables

**Required:**
```env
AUTO_SEND_GROUP_ID=your_whatsapp_group_id
ADMIN_NUMBER=5511999999999@c.us
```

**Baileys WebSocket (default):**
```env
BAILEYS_WS_PORT=8765
BAILEYS_ALLOWED_TOKENS=dev
BAILEYS_WS_URL=ws://localhost:8765
BAILEYS_CLIENT_TOKEN=dev
BAILEYS_AUTH_DIR=auth_info_baileys
```

**Web Interface:**
```env
PORT=3000
ADMIN_INITIAL_USERNAME=admin
ADMIN_INITIAL_PASSWORD=secure_password
SESSION_SECRET=random-secure-key
JWT_SECRET=change_me_in_production
JWT_EXPIRES_IN=7d
WEB_SERVER_URL=http://localhost:3000
BOT_WHATSAPP_NUMBER=5511999999999
```

**Optional Features:**
```env
# OpenAI for AI tagging and meme generation
OPENAI_API_KEY=sk-your-key
OPENAI_API_KEY_MEMECREATOR=sk-meme-key

# SMTP for email verification
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=email@gmail.com
SMTP_PASS=app-password

# NSFW filtering (external providers)
NSFW_EXTERNAL_PROVIDER=huggingface,openai
HUGGINGFACE_API_KEY=hf_token

# Analytics
ENABLE_INTERNAL_ANALYTICS=true
UMAMI_ORIGIN=https://analytics.domain.com

# History recovery
HISTORY_RECOVERY_ENABLED=true
HISTORY_BATCH_SIZE=10
HISTORY_MAX_MESSAGES=50

# Admin Watcher (self-healing system)
ADMIN_WATCHER_ENABLED=false
ADMIN_WATCHER_MODEL=gpt-4o-mini  # gpt-4o-mini (~$0.60/mo) or gpt-4o (~$10/mo)

# Conversation Agent (group chat bot)
CONVERSATION_AGENT_ENABLED=1
CONVERSATION_PERSONA_NAME=Lia
CONVERSATION_HISTORY_LIMIT=16
CONVERSATION_COOLDOWN_MS=120000
CONVERSATION_MIN_MESSAGES=3
```

See `.env.example` for full configuration options with detailed comments.

## Testing

**Test Structure:**
```
tests/
├── unit/              # Unit tests for individual modules
├── integration/       # Integration tests for cross-module functionality
├── helpers/           # Test utilities and fixtures
│   └── testUtils.js   # Shared test helpers
├── fixtures/          # Test data
└── runTests.js        # Test runner
```

**Running Tests:**
- Full suite: `npm test`
- Unit only: `npm run test:unit`
- Integration only: `npm run test:integration`

**Test Coverage:** 51+ tests across media models, contacts, database handlers, media queue, maintenance, and integration scenarios.

See `docs/TESTING.md` for comprehensive testing documentation.

## Adding New Commands

1. Create handler in `commands/handlers/newcommand.js`
2. Register in `commands/index.js` command router
3. Set `shouldTrackUsage = true` for analytics inclusion
4. Track usage with `commandUsage.incrementCommandUsage()`
5. Add tests in `tests/unit/newcommand.test.js`
6. Update this file (CLAUDE.md) with the new command in Available Commands section
7. See `docs/COMMAND_USAGE_ANALYTICS.md` for analytics integration checklist

## Common Patterns & Best Practices

**Safe Messaging:**
- Always use `safeReply()` from `utils/safeMessaging.js` for user-facing messages
- Handles send failures gracefully with automatic retries
- Prevents bot crashes from network issues

**Command Normalization:**
- Use `normalizeCommand()` from `utils/commandNormalizer.js`
- Handles Portuguese/English variations (#download/#baixar)
- Standardizes command format

**JID Handling:**
- Use `utils/jidUtils.js` for WhatsApp ID operations
- Functions: `normalizeJid()`, `isGroup()`, `extractNumber()`
- Handles both old JID and new LID formats

**Database Operations:**
- All operations use retry logic for SQLITE_BUSY errors
- Use transactions for multi-step operations
- WAL mode enabled for better concurrency
- Always close database connections in error handlers

**Media Processing:**
- Queue system prevents overload (3 concurrent jobs default)
- Automatic retries with exponential backoff
- NSFW filtering before saving
- AI tagging integration (if OpenAI key configured)

## Troubleshooting

**SQLITE_BUSY errors:**
- Handled automatically with retry logic (up to 5 attempts)
- Check for long-running transactions
- Consider reducing queue concurrency
- **May indicate process duplication** - see below

**Process duplication (CRITICAL):**
- **Symptoms:** Multiple node processes, SQLITE_BUSY errors, double message processing
- **Cause:** Running both root and dev PM2 instances, or manual `node` commands while PM2 is active
- **Check:** `ps aux | grep -E '(index.js|server.js)' | grep -v grep | wc -l` should return 3-4, not 6+
- **Fix:** Follow cleanup procedure in "Running the Application" section above or see `docs/agents.md`
- **Prevention:** ALWAYS use `sudo -u dev pm2` commands, NEVER mix PM2 instances or run manual node commands

**WhatsApp connection issues:**
- Ensure Baileys bridge is running: `npm run baileys:server`
- Check `BAILEYS_WS_URL` and `BAILEYS_CLIENT_TOKEN` in `.env`
- Verify authentication directory exists: `auth_info_baileys/`

**Native module errors:**
- Rebuild native modules: `npm rebuild sqlite3 sharp`
- Ensure build tools installed (gcc, g++, make, python3)

**FFmpeg not available:**
- Bot continues with reduced video processing
- No frame analysis for videos
- GIFs not converted to MP4
- Install `ffmpeg-static` or system FFmpeg if needed

## Key Documentation

**⭐ Process Management & AI Agents:**
- `docs/agents.md` - **Complete guide to AdminWatcher (self-healing), ConversationAgent, and process management**
- `docs/ADMIN_WATCHER_REMEDIATION_TOOLS.md` - AdminWatcher's 15 tools (diagnostic + remediation)
- `docs/ADMIN_WATCHER_EXAMPLES.md` - Self-healing system response examples (natural language)
- `docs/CONVERSATION_AGENT_IMPROVEMENTS.md` - Conversation agent naturalness improvements

**Features & Systems:**
- `docs/COMMAND_USAGE_ANALYTICS.md` - Analytics implementation guide
- `docs/TESTING.md` - Comprehensive test suite documentation
- `docs/PACK_FEATURE_GUIDE.md` - Sticker packs system
- `docs/WHATSAPP_VERIFICATION.md` - Account verification
- `docs/VERSION_MANAGEMENT.md` - Semantic versioning system
- `docs/LID_MIGRATION.md` - LID system implementation
- `docs/MESSAGE_HISTORY_RECOVERY.md` - Message recovery on reconnection
- `docs/APPROVAL_SYSTEM.md` - Approval workflow (if implemented)
- `docs/VIDEO_DOWNLOAD_FEATURE.md` - Video download functionality
- `docs/GIF_PROCESSING_IMPROVEMENTS.md` - GIF processing enhancements
- `docs/ANIMATED_WEBP_SHARP_IMPLEMENTATION.md` - WebP animation handling
