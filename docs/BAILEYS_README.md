# Baileys Integration Guide

This document explains the Baileys WebSocket architecture used by the Sticker Bot.

## Architecture Overview

The bot uses a two-process architecture:

1. **Baileys WebSocket Bridge** (`server.js`) - Maintains the WhatsApp connection
2. **Bot Process** (`index.js`) - Contains business logic and command handlers

This separation allows you to restart the bot without rescanning QR codes.

```
┌─────────────────────┐         WebSocket         ┌──────────────────┐
│  Baileys Bridge     │ <═══════════════════════> │   Bot Process    │
│  (server.js)        │      (port 8765)          │   (index.js)     │
│                     │                           │                  │
│ - WhatsApp Session  │                           │ - Commands       │
│ - QR Code Auth      │                           │ - Media Process  │
│ - Message Routing   │                           │ - Auto Send      │
└─────────────────────┘                           └──────────────────┘
         ↕
    WhatsApp Web
```

## Setup

### 1. Installation

```bash
# Install dependencies (use this exact command due to firewall restrictions)
PUPPETEER_SKIP_DOWNLOAD=true npm install --ignore-scripts

# Rebuild native modules
npm rebuild sqlite3 sharp
```

### 2. Environment Configuration

Add the following to your `.env` file:

```env
# Baileys WebSocket Bridge Configuration
BAILEYS_WS_PORT=8765                      # Bridge server port
BAILEYS_ALLOWED_TOKENS=dev                # Comma-separated auth tokens
BAILEYS_WS_URL=ws://localhost:8765        # Bridge URL for bot
BAILEYS_CLIENT_TOKEN=dev                  # Client auth token (must match ALLOWED_TOKENS)
BAILEYS_AUTH_DIR=auth_info_baileys        # Session data directory

# Required WhatsApp configuration
AUTO_SEND_GROUP_ID=your_group_id_here
ADMIN_NUMBER=5511999999999@c.us
```

### 3. Running the Application

**Step 1: Start the Baileys Bridge**
```bash
npm run baileys:server
```

This will:
- Start the WebSocket server on port 8765
- Display a QR code (first time only)
- Maintain the WhatsApp session persistently

**Step 2: Start the Bot**
```bash
npm run bot
# OR
node index.js
```

This will:
- Connect to the bridge via WebSocket
- Start processing commands and messages
- Can be restarted without rescanning QR code

### 4. Web Interface (Optional)

The web interface runs independently:

```bash
npm run web
```

Access at `http://localhost:3000`

## How It Works

### Message Flow

1. **WhatsApp → Bridge**
   - WhatsApp Web receives message
   - Baileys library processes message
   - Bridge stores message metadata

2. **Bridge → Bot**
   - Bridge converts to OpenWA-compatible format
   - Checks if bot is authorized for this chat
   - Forwards message via WebSocket

3. **Bot Processing**
   - Receives message through adapter
   - Processes commands and media
   - Sends responses back to bridge

4. **Bridge → WhatsApp**
   - Bridge receives send request
   - Validates chat authorization
   - Sends via Baileys to WhatsApp

### Adapter Methods

The `waAdapter.js` exposes these methods to the bot:

```javascript
// Send text message
await client.sendText(chatId, message);

// Send file/media
await client.sendFile(chatId, buffer, filename, caption, mimetype);

// Send stickers
await client.sendRawWebpAsSticker(chatId, buffer);
await client.sendImageAsSticker(chatId, buffer);
await client.sendMp4AsSticker(chatId, buffer);

// Download media
const { buffer, mimetype } = await client.downloadMedia(messageId);
const { buffer, mimetype } = await client.getMediaBuffer(messageId);

// Contact info
const contact = await client.getContact(jid);

// Group operations
await client.removeParticipant(groupId, participantId);
```

### Session Management

- **Session data**: Stored in `auth_info_baileys/` directory
- **First run**: Displays QR code for authentication
- **Subsequent runs**: Uses stored credentials automatically
- **Re-authentication**: Delete `auth_info_baileys/` to reset

## Development Workflow

### Making Code Changes

1. Keep bridge running: `npm run baileys:server`
2. Make changes to bot code
3. Restart bot: `Ctrl+C` then `npm run bot`
4. No QR code needed - WhatsApp stays connected!

### Hot Reloading Benefits

- **10-15 seconds** to restart bot vs **2-3 minutes** to reconnect WhatsApp
- Test changes quickly without rescanning QR
- Persistent session even if bot crashes

## Production Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start Baileys bridge
pm2 start server.js --name "whatsapp-bridge"

# Start bot
pm2 start index.js --name "sticker-bot"

# Start web interface
pm2 start "npm run web" --name "sticker-web"

# Save configuration
pm2 save
pm2 startup
```

### Environment Variables

In production, ensure these are set:

```env
NODE_ENV=production
SESSION_SECRET=cryptographically-secure-random-key
BAILEYS_ALLOWED_TOKENS=production-token-here
```

## Troubleshooting

### Bridge Won't Start

**Error**: `EADDRINUSE` - Port already in use
```bash
# Check what's using port 8765
lsof -i :8765

# Kill the process or change BAILEYS_WS_PORT
```

### Bot Can't Connect

**Error**: `ECONNREFUSED`
```bash
# Ensure bridge is running
npm run baileys:server

# Check BAILEYS_WS_URL matches bridge port
# Check BAILEYS_CLIENT_TOKEN matches ALLOWED_TOKENS
```

### QR Code Issues

**Problem**: QR code not appearing
```bash
# Restart the bridge
# Check terminal supports QR code display
# Try clearing auth_info_baileys/ directory
```

### Session Lost

**Problem**: WhatsApp disconnects frequently
```bash
# Check WhatsApp Web device limit (max 4 linked devices)
# Ensure stable internet connection
# Try clearing and rescanning: rm -rf auth_info_baileys/
```

## Security Notes

- **Token Authentication**: Always use strong tokens in production
- **Localhost Only**: Keep bridge on localhost unless you know what you're doing
- **Firewall Rules**: Restrict WebSocket port access
- **Session Data**: Protect `auth_info_baileys/` directory - contains WhatsApp credentials

## Migration from OpenWA

If migrating from OpenWA:

1. Backup your `stickers.db` database
2. Remove old session directories
3. Update `.env` with Baileys configuration
4. Start bridge and scan QR code
5. Start bot - it will use existing database

The adapter provides OpenWA-compatible methods, so most code continues to work without changes.

## Advanced Configuration

### Multiple Bot Instances

You can run multiple bots connecting to the same bridge:

```env
# Bot 1
BAILEYS_CLIENT_TOKEN=bot1

# Bot 2
BAILEYS_CLIENT_TOKEN=bot2

# Bridge
BAILEYS_ALLOWED_TOKENS=bot1,bot2
```

### Custom WebSocket URL

For distributed deployments:

```env
# Bridge on server A
BAILEYS_WS_PORT=8765

# Bot on server B
BAILEYS_WS_URL=ws://server-a.example.com:8765
```

## References

- [Baileys Documentation](https://github.com/WhiskeySockets/Baileys)
- [WhatsApp Web Protocol](https://github.com/sigalor/whatsapp-web-reveng)
- Main README: [README.md](../README.md)
