# Agents - Self-Healing & AI Systems

This document describes the autonomous agents and AI-powered systems in the Sticker Bot.

---

## 📋 Table of Contents

1. [AdminWatcher (Self-Healing Agent)](#adminwatcher-self-healing-agent)
2. [ConversationAgent (Group Chat Bot)](#conversationagent-group-chat-bot)
3. [Process Management](#process-management)
4. [Troubleshooting](#troubleshooting)

---

## AdminWatcher (Self-Healing Agent)

### Overview

AdminWatcher is an autonomous agent that monitors admin messages in WhatsApp, detects problem reports, and automatically diagnoses and fixes common issues using OpenAI GPT-4 with 14 specialized tools.

**Location:** `services/adminWatcher.js` + `services/openaiTools.js`

### Features

- 🔍 **Automatic Problem Detection** - Detects keywords like "erro", "falha", "parou", "bug", "problema"
- 🛠️ **13 Diagnostic & Remediation Tools** - 9 for diagnosis + 4 for automatic fixes
- 🤖 **Natural Language Responses** - Casual Brazilian Portuguese responses
- ⏱️ **Cooldown System** - 5-minute cooldown per chat to prevent spam
- 🔒 **Security Controls** - Blocks destructive operations (DROP, DELETE, etc.)

### Configuration

```env
# Enable/disable the watcher
ADMIN_WATCHER_ENABLED=true

# OpenAI model (gpt-4o-mini recommended for cost)
ADMIN_WATCHER_MODEL=gpt-4o-mini

# Send acknowledgment before diagnosis (default: true)
ADMIN_WATCHER_SEND_ACK=true

# OpenAI API key (required)
OPENAI_API_KEY=sk-your-key-here
```

### How It Works

1. **Detection**: Admin sends message with problem keywords
2. **Acknowledgment**: Bot responds with casual message ("deixa eu dar uma olhada aqui")
3. **Diagnosis**: Uses 9 diagnostic tools to investigate
4. **Fix**: Applies automatic corrections using 6 remediation tools
5. **Report**: Sends casual Portuguese summary of what was found and fixed

### Example Flow

```
Admin: "erro na verificação de duplicadas"

Bot thinks:
[getBotLogs] → sees "SQLITE_ERROR: no such table: media"
[analyzeDatabaseSchema] → confirms media table has 0 records
[readFile('database/models/media.js')] → analyzes media model
[executeSqlQuery("SELECT COUNT(*) FROM media")] → gets count
[getQueueStatus] → checks processing queue

Bot responds:
"dei uma olhada aqui 👍 a tabela media tá vazia mesmo, mas o banco tá
funcionando. o erro é porque não tem figurinha pra verificar ainda.
quando processarem as primeiras mídias vai funcionar normal"
```

### 13 Available Tools

#### 🔍 Diagnostic Tools (9)

1. **getBotLogs** - Read recent logs (bot/baileys/web)
2. **searchLogsForPattern** - Search logs with regex
3. **getServiceStatus** - Check PM2 service status
4. **getLastSentSticker** - Info of last sent sticker
5. **getSchedulerStatus** - Scheduler status
6. **getQueueStatus** - Processing queue status
7. **readFile** - Read source code files
8. **runHealthCheck** - Complete system health check
9. **analyzeDatabaseSchema** - Analyze database structure

#### 🛠️ Remediation Tools (4)

10. **restartService** - Restart PM2 service (EXCEPT Bot-Client itself to prevent suicide)
11. **executeSqlQuery** - Execute SQL (SELECT/INSERT/UPDATE/CREATE INDEX only, NO TABLE CREATION)
12. **modifyBotConfig** - Modify bot configuration values in bot_config table
13. **writeFile** - Write temporary fix files (BLOCKS .sql, .db, .env, auth files)

### Security & Restrictions

**⚠️ CRITICAL: Schema Modifications are BLOCKED**

The agent **CANNOT** create or modify database tables. This prevents unnecessary structures like `media_queue` from being created when they don't exist in the codebase.

**Blocked Operations:**
- ❌ DELETE queries
- ❌ DROP tables
- ❌ TRUNCATE
- ❌ CREATE TABLE (schema changes)
- ❌ ALTER TABLE (schema changes)
- ❌ PRAGMA commands
- ❌ Restarting Bot-Client or sticker-bot services (would kill itself)
- ❌ Writing to .env, auth files, node_modules, .git
- ❌ Writing .key, .pem, .crt, .sql, .db files

**Allowed Operations:**
- ✅ SELECT queries
- ✅ INSERT queries (data only, not schema)
- ✅ UPDATE queries
- ✅ CREATE INDEX (performance optimization only)
- ✅ Reading .env.example (but not .env)
- ✅ Writing to temp/scripts directories (except .sql/.db files)

### Testing

```bash
# Test AdminWatcher flow (without WhatsApp)
node test-admin-watcher.js

# Test remediation tools
node test-remediation-tools.js
```

### Monitoring

```bash
# Check if AdminWatcher is active
sudo -u dev pm2 logs Bot-Client | grep -i admin

# View statistics
# (Statistics tracking can be added to getStats() method)
```

### Cost Estimation

Using **gpt-4o-mini** (recommended):
- ~$0.004 per diagnosis
- ~$0.60/month for 5 diagnoses/day
- ~$10/month for 80+ diagnoses/day

Using **gpt-4o** (more capable):
- ~$0.07 per diagnosis
- ~$10/month for 5 diagnoses/day

### Troubleshooting

**AdminWatcher not responding:**
```bash
# 1. Check if enabled
grep ADMIN_WATCHER_ENABLED .env

# 2. Check if OpenAI key is set
grep OPENAI_API_KEY .env | head -c 30

# 3. Check logs
sudo -u dev pm2 logs Bot-Client --lines 50 | grep -i admin

# 4. Check cooldown (may be waiting 5 minutes)
# Try in a different chat or wait 5+ minutes
```

**Bot suggests fixes but doesn't apply them:**
- This was the old behavior before remediation tools were added
- Make sure you're running the latest version with all 15 tools
- Check logs for "executeSqlQuery", "createDatabaseTable" calls

---

## ConversationAgent (Group Chat Bot)

### Overview

The ConversationAgent allows the bot to participate naturally in group conversations, responding to messages organically rather than only to commands.

**Location:** `services/conversationAgent.js`

### Features

- 🗣️ **Natural Conversations** - Responds like a human group member
- 🎲 **Organic Probability** - 12-20% base chance + boosts for mentions/keywords
- 🎭 **Multiple Personalities** - 4 random system prompt variations
- ⏰ **Smart Cooldown** - 2-minute cooldown per chat
- 🧠 **Context Aware** - Maintains 16-message conversation history

### Configuration

```env
# Enable/disable conversation agent
CONVERSATION_AGENT_ENABLED=1

# Bot persona name
CONVERSATION_PERSONA_NAME=Lia

# Conversation history limit
CONVERSATION_HISTORY_LIMIT=16

# Cooldown between responses (ms)
CONVERSATION_COOLDOWN_MS=120000

# Minimum messages before bot can respond
CONVERSATION_MIN_MESSAGES=3

# Maximum response length (characters)
CONVERSATION_MAX_RESPONSE_CHARS=360

# OpenAI API key (shared with AdminWatcher)
OPENAI_API_KEY=sk-your-key-here
```

### Response Probability

Base probability: **12-20%** (random)

**Boosts:**
- +40% if bot is mentioned (@Lia)
- +30% if message contains "?"
- +20% if message contains bot's name
- +15% if message contains keywords (bot, sticker, figurinha)
- +10% if recent context mentions bot
- ±5% random variance

**Example:**
- Regular message: ~15% chance
- "Oi Lia!" → 35% chance
- "@Lia como funciona?" → 85% chance

### Naturalness Improvements (2026-01-25)

**System Prompt Variations:**
- 4 different prompt styles chosen randomly
- Prevents repetitive, mechanical responses
- More organic and human-like

**Response Sanitization:**
- Less aggressive filtering
- Preserves natural language quirks
- Removes only obvious AI artifacts

---

## Process Management

### ⚠️ CRITICAL: Avoiding Process Duplication

**The Problem:**
Multiple PM2 instances (root and dev) can create duplicate processes, causing:
- Double message processing
- Database locks
- Wasted memory
- Unpredictable behavior

**The Solution:**
Always use **user dev's PM2** and never mix PM2 instances.

### Correct Process Management

```bash
# ✅ ALWAYS use dev user's PM2
sudo -u dev pm2 list
sudo -u dev pm2 start ecosystem.config.js
sudo -u dev pm2 restart Bot-Client
sudo -u dev pm2 logs Bot-Client

# ❌ NEVER use root's PM2
pm2 list              # Wrong - uses root's PM2
pm2 start index.js    # Wrong - creates duplicates

# ❌ NEVER start processes manually
node index.js         # Wrong - bypasses PM2
npm run bot           # Wrong - bypasses PM2
nohup node index.js & # Wrong - creates orphan process
```

### Expected Process Count

**Normal state:** Exactly 3-4 processes

```bash
ps aux | grep -E '(index.js|server.js)' | grep -v grep | wc -l
# Should output: 3 or 4
```

**Breakdown:**
1. `node .../index.js` - Bot-Client (main bot)
2. `node .../server.js` - WS-Socket-Server (Baileys bridge)
3. `node .../web/server.js` - WebServer (web interface)
4. `python3 .../app.py` - Wordnet (optional NLP service)

### Cleanup Procedure (If Duplicates Found)

```bash
# 1. Check current state
ps aux | grep -E '(index.js|server.js)' | grep -v grep
sudo -u dev pm2 list
pm2 list  # Check root's PM2 too

# 2. Nuclear cleanup (stops everything)
pkill -f 'node.*index.js'
pkill -f 'node.*server.js'
pm2 delete all                    # Root's PM2
sudo -u dev pm2 delete all        # Dev's PM2
sleep 5

# 3. Verify all stopped
ps aux | grep -E '(index.js|server.js)' | grep -v grep
# Should output nothing

# 4. Start fresh (ONLY via dev PM2)
sudo -u dev pm2 start ecosystem.config.js

# 5. Verify correct state
sudo -u dev pm2 list
ps aux | grep -E '(index.js|server.js)' | grep -v grep | wc -l
# Should see exactly 3-4 processes
```

### PM2 Ecosystem Configuration

**File:** `ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'baileys-bridge',      // → WS-Socket-Server in dev PM2
      script: 'server.js',
      // ...
    },
    {
      name: 'sticker-bot',          // → Bot-Client in dev PM2
      script: 'index.js',
      // ...
    },
    {
      name: 'web-interface',        // → WebServer in dev PM2
      script: 'web/server.js',
      // ...
    }
  ]
};
```

**Note:** The `name` fields in ecosystem.config.js don't match the actual PM2 process names because dev's PM2 was started with a different configuration. Don't rely on matching names.

### Monitoring Commands

```bash
# Real-time process monitoring
watch -n 2 'ps aux | grep -E "(index.js|server.js)" | grep -v grep'

# PM2 monitoring dashboard
sudo -u dev pm2 monit

# Check for zombie processes
ps aux | grep defunct

# View all node processes
pgrep -fl node
```

---

## Troubleshooting

### AdminWatcher Issues

**Problem:** AdminWatcher not detecting problems
**Solution:**
1. Check keywords include bot context ("bot parou" not just "parou")
2. Ensure message is from admin (check ADMIN_NUMBERS env var)
3. Verify cooldown hasn't blocked (5 min between diagnoses)

**Problem:** Bot diagnoses but doesn't fix
**Solution:**
1. Update to latest version with 15 tools
2. Check logs for tool execution: `sudo -u dev pm2 logs Bot-Client | grep OpenAITools`
3. Verify OpenAI API key has sufficient credits

**Problem:** "OPENAI_API_KEY not set"
**Solution:**
```bash
# Check if key exists
grep OPENAI_API_KEY .env

# Restart bot to reload env vars
sudo -u dev pm2 restart Bot-Client
```

### ConversationAgent Issues

**Problem:** Bot responds too often
**Solution:** Increase cooldown or decrease probability boosts in `conversationAgent.js`

**Problem:** Bot responses are too robotic
**Solution:** Already improved with 4 prompt variations (2026-01-25 update)

**Problem:** Bot doesn't respond at all
**Solution:**
1. Check `CONVERSATION_AGENT_ENABLED=1` in .env
2. Verify OpenAI API key is set
3. Check cooldown hasn't blocked chat (2 min default)

### Process Duplication Issues

**Symptoms:**
- Messages processed twice
- `SQLITE_BUSY` errors
- Memory usage doubled
- `ps aux` shows 6+ node processes

**Root Causes:**
1. Multiple PM2 instances (root + dev)
2. Manual `node` commands while PM2 is running
3. Cron jobs or systemd services starting processes
4. Auto-restart scripts spawning duplicates

**Prevention:**
- ✅ Always use `sudo -u dev pm2` commands
- ✅ Never mix root and dev PM2
- ✅ Never run `node index.js` or `npm run` manually in production
- ✅ Check for cron jobs: `crontab -l` and `sudo crontab -l`
- ✅ Check for systemd services: `systemctl list-units | grep sticker`

---

## References

- **AdminWatcher Documentation:** `docs/ADMIN_WATCHER_REMEDIATION_TOOLS.md`
- **Conversation Agent Improvements:** `docs/CONVERSATION_AGENT_IMPROVEMENTS.md`
- **Main Configuration:** `CLAUDE.md`
- **Testing Scripts:** `test-admin-watcher.js`, `test-remediation-tools.js`

---

**Last Updated:** 2026-01-25
**Bot Version:** 0.6.0
**AdminWatcher Tools:** 15 (9 diagnostic + 6 remediation)
