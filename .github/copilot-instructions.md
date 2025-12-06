# Sticker Bot - WhatsApp Sticker Management Bot

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Network and Firewall Notes

This project installs native modules (`sqlite3`, `sharp`, `@tensorflow/tfjs-node`) that download prebuilt binaries during install. Make sure npm can reach its CDN/proxy; otherwise installation will fail.

### Recommended Install Command
- **Installation**: `npm ci`
- If native binaries fail to build, rerun `npm rebuild sqlite3 sharp`
- Configure corporate proxies via `npm config set proxy/https-proxy` when required

### What Works vs. What Needs Network
✅ Works offline after install:
- Basic bot functionality (WhatsApp integration)
- Web administration interface 
- Database operations and migrations
- Local sticker processing
- Command handling

❌ Needs network access:
- TensorFlow binary downloads during install
- Ubuntu package updates (only if you choose to install build tools)

**NOTE**: Audio transcription uses OpenAI Whisper API (cloud); provide `OPENAI_API_KEY` to enable.

## Working Effectively

### Bootstrap and Setup Process
- Install Node.js 20+ and npm
- Clone the repository and navigate to project root
- Set up environment variables:
  - `cp .env.example .env`
  - Edit `.env` with required WhatsApp configuration (AUTO_SEND_GROUP_ID, ADMIN_NUMBER)
- Install dependencies with lockfile: `npm ci`
  - If you see native module errors, run `npm rebuild sqlite3 sharp`
  - Ensure network access for downloading prebuilt binaries
- Database initialization happens automatically on first run

### Build and Test Process
- No build step required; run directly with Node.js
- Full test suite available: `npm test` (runs unit + integration)
- Quick checks:
  - `npm run web` - starts web interface on port 3000
  - `node index.js` - starts WhatsApp bot (requires WhatsApp setup)
  - Test database migrations: `node scripts/test-migration.js`
  - Verify contacts migration: `node scripts/verify-contacts-migration.js`

### Running the Application
- **Main WhatsApp bot**: `node index.js`
  - Requires WhatsApp connection and .env configuration
  - Will display QR code for WhatsApp Web authentication
  - Automatic send schedule is driven by DB config (default cron 0 8-21 plus matching-minute fallbacks)
- **Web administration interface**: `npm run web`
  - Runs on port 3000 by default
  - Provides user management, sticker browsing, and analytics
  - Default admin: username "admin" (password from ADMIN_INITIAL_PASSWORD or auto-generated)
- **Tag synonym service**: `python3 app.py` (or `python app.py`)
  - Runs on port 5000 by default
  - Provides Portuguese synonyms for intelligent tag management and search
  - Required for advanced tag features (avoiding duplicates, semantic search)

### Audio Transcription Setup (OpenAI Whisper API)
- **AUDIO TRANSCRIPTION**: Now uses OpenAI's cloud-based Whisper API instead of local installation
- **Setup**: Add `OPENAI_API_KEY=sk-your-key-here` to your `.env` file
- **Benefits**: More reliable, no local dependencies, no complex installation
- **Fallback**: Gracefully handles missing API key (transcription unavailable but app works)

### Legacy Whisper.cpp Setup (DEPRECATED)
- **DEPRECATED**: Local Whisper.cpp installation is no longer needed
- **Old script available**: `bash scripts/setup-whisper.sh` (now only installs Chromium dependencies)
- **Migration**: Remove any existing `whisper.cpp/` directory - no longer used

## Validation Scenarios

After making changes, always validate through these scenarios:

### Basic Web Interface Test
- Start web server: `npm run web`
- Open http://localhost:3000 in browser
- Verify interface loads without errors
- Check admin login works (use credentials from console output)

### Database Migration Test  
- Run: `node scripts/test-migration.js`
- Should complete in <1 second without errors
- Validates database operations are working

### Bot Startup Test
- Run: `node index.js` 
- Should start without errors and display WhatsApp connection info
- CTRL+C to exit after verifying startup

### Command Processing Test (if WhatsApp connected)
- Send `#count` to bot - should return sticker count
- Send `#random` to bot - should send a random sticker
- Send `#top10` to bot - should show top 10 stickers

## Common Development Tasks

### Database Operations
- All database logic in `database.js`
- Migration scripts in `scripts/` directory:
  - `migrate-historical-contacts.js` - Migrates sender contacts
  - `migrate-missing-sender-ids.js` - Fixes missing sender IDs  
  - `test-migration.js` - Tests migration functionality
  - `verify-contacts-migration.js` - Validates migration results

### Bot Commands
- Command handlers in `commands.js`
- Add new commands by updating the switch statement in `handleCommand()`
- Command format: `#commandname` 
- Always validate commands work with bot before committing

### Web Interface
- Server logic in `web/server.js`
- Static files in `web/public/`
- Authentication handled via `web/auth.js`
- Database access via `web/dataAccess.js`

### Media Processing
- Main processing in `mediaProcessor.js`
- AI services in `services/` directory:
  - `ai.js` - OpenAI integration (requires API key)
  - `nsfwFilter.js` - Image content filtering
  - `nsfwVideoFilter.js` - Video content filtering
  - `videoProcessor.js` - Video format conversion

## Key Project Structure

### Core Files
- `index.js` - Main WhatsApp bot entry point
- `commands.js` - Bot command handlers
- `database.js` - SQLite database operations
- `app.py` - Flask microservice for Portuguese synonyms (WordNet) to enhance tag management
- `package.json` - Dependencies and npm scripts
- `.env` - Environment configuration

### Important Directories
- `scripts/` - Database migrations and utility scripts
- `services/` - AI and media processing services
- `web/` - Web administration interface
- `config/` - Configuration files
- `utils/` - Utility functions
- `bot/` - Additional bot modules
- `media/` - Stored sticker files (created at runtime)

### Configuration Files
- `.env.example` - Environment variable template
- `config/stickers.js` - Sticker pack metadata
- `web/public/styles.css` - Web interface styling

## Troubleshooting Common Issues

### Installation Problems
- **Native module build fails (sqlite3/sharp/tfjs-node)**: Install build tools (Linux: `build-essential python3 make gcc g++`), re-run `npm ci`, then `npm rebuild sqlite3 sharp`
- **Audio transcription not working**: Add `OPENAI_API_KEY` to your `.env` file 
- **Network/Firewall Blocks**: Ensure npm can reach its CDN; configure `npm config set proxy/https-proxy` when behind corporate proxies
- **CI/CD**: Prefer `npm ci` with cached npm directories; ensure binaries can be downloaded during install

### Runtime Issues
- **Database errors**: Ensure write permissions in project directory
- **WhatsApp connection fails**: Check .env configuration, ensure valid phone numbers
- **Port 3000 in use**: Change PORT in .env or kill existing process
- **Missing stickers**: Check STICKERS_DIR exists and has proper permissions

### Performance Notes
- SQLite database can handle thousands of stickers efficiently
- Media files are stored locally in `media/` directory
- Web interface includes rate limiting for security
- Bot includes NSFW filtering to prevent inappropriate content

## Development Workflow

1. **Before making changes**: Run validation scenarios to ensure system works
2. **After code changes**: 
   - Test web interface if web code changed
   - Test bot startup if bot code changed  
   - Run migration tests if database code changed
3. **Before committing**: Ensure all validation scenarios pass

## Environment Variables Reference

### Required
- `AUTO_SEND_GROUP_ID` - WhatsApp group ID for auto-sending
- `ADMIN_NUMBER` - WhatsApp admin number (format: "5511999999999@c.us")

### Optional
- `PORT` - Web server port (default: 3000)
- `TIMEZONE` - Bot timezone (default: "America/Sao_Paulo")
- `BOT_WHATSAPP_NUMBER` - Bot's WhatsApp number for web interface
- `ADMIN_INITIAL_USERNAME` - Initial admin username (default: "admin")
- `ADMIN_INITIAL_PASSWORD` - Initial admin password (auto-generated if not set)
- `OPENAI_API_KEY` - OpenAI API key for AI features (optional)
- `ENABLE_INTERNAL_ANALYTICS` - Enable internal analytics (default: true)

Never commit sensitive values like API keys or phone numbers to the repository.

## Common Tasks and Command Outputs

The following are outputs from frequently run commands. Reference them instead of viewing, searching, or running bash commands to save time.

### Repository Root Structure
```
ls -la
total 632
drwxr-xr-x 9 runner docker   4096 Aug 27 11:54 .
drwxr-xr-x 3 runner docker   4096 Aug 27 11:53 ..
-rw-r--r-- 1 runner docker    825 Aug 27 11:54 .env.example
drwxr-xr-x 7 runner docker   4096 Aug 27 11:54 .git
-rw-r--r-- 1 runner docker    682 Aug 27 11:54 .gitignore
-rw-r--r-- 1 runner docker   1901 Aug 27 11:54 README.md
-rw-r--r-- 1 runner docker   1852 Aug 27 11:54 SENDER_ID_MIGRATION.md
-rw-r--r-- 1 runner docker    586 Aug 27 11:54 app.py
drwxr-xr-x 2 runner docker   4096 Aug 27 11:54 bot
-rw-r--r-- 1 runner docker  15852 Aug 27 11:54 commands.js
drwxr-xr-x 2 runner docker   4096 Aug 27 11:54 config
-rw-r--r-- 1 runner docker  27976 Aug 27 11:54 database.js
-rw-r--r-- 1 runner docker  14646 Aug 27 11:54 index.js
-rw-r--r-- 1 runner docker   5330 Aug 27 11:54 mediaProcessor.js
-rw-r--r-- 1 runner docker 509632 Aug 27 11:54 package-lock.json
-rw-r--r-- 1 runner docker   1025 Aug 27 11:54 package.json
drwxr-xr-x 2 runner docker   4096 Aug 27 11:54 scripts
drwxr-xr-x 2 runner docker   4096 Aug 27 11:54 services
-rw-r--r-- 1 runner docker   3830 Aug 27 11:54 tagsEditor.js
drwxr-xr-x 2 runner docker   4096 Aug 27 11:54 utils
drwxr-xr-x 3 runner docker   4096 Aug 27 11:54 web
```

### Key Scripts Directory
```
ls scripts/
inject-umami.js
migrate-historical-contacts.js
migrate-missing-sender-ids.js
setup-whisper.sh
test-migration.js
verify-contacts-migration.js
```

### Services Directory Structure
```
ls services/
ai.js                 # OpenAI integration
nsfwFilter.js        # Image content filtering
nsfwVideoFilter.js   # Video content filtering  
videoProcessor.js    # Video format conversion
```

### Web Directory Structure
```
ls web/
auth.js              # Authentication logic
dataAccess.js       # Database access layer
emailService.js     # Email functionality
eventBus.js         # Event system
public/             # Static web assets
server.js           # Express web server
```

### Package.json Scripts
```json
{
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "web": "node web/server.js"
  }
}
```

**Note**: The `postinstall` script has been removed as Whisper.cpp is no longer needed.

### Expected Migration Test Output
```
$ node scripts/test-migration.js
[dotenv@17.2.1] injecting env (8) from .env
[AI] OpenAI API key not configured. AI features will be disabled.
=== Teste da Migração de Contatos Históricos ===
[DB] Tabela 'media' tem 0 registros.
✅ Dados de teste criados
Estado inicial - Media com sender_id: 3, Contatos: 1
Executando migração...
[migrate] Iniciando migração de contatos históricos...
[migrate] Nenhum contato histórico para migrar.
Resultado - Contatos migrados: 0, Total contatos: 1
# Completes in ~0.17 seconds
```

### Expected Web Server Startup Output
```
$ npm run web
[dotenv@17.2.1] injecting env (8) from .env
[ENV] .env carregado
[AI] OpenAI API key not configured. AI features will be disabled.
[EMAIL] Email service not configured - missing SMTP credentials
[BOOT] requires: 21.569ms
[WEB] STICKERS_DIR: /media exists: false
[WEB] PUBLIC_DIR: /web/public exists: true
[BOOT] auth: 0.398ms
[BOOT] static: 0.16ms
[BOOT] listen: 1.979ms
[BOOT] total: 133.147ms
Webserver de stickers ouvindo em http://localhost:3000
[DB] Tabela 'media' tem 0 registros.
======================================================
[INIT] Admin inicial criado/garantido:
        username: admin
        senha: definida via ADMIN_INITIAL_PASSWORD (não exibida).
        Será solicitado trocar a senha no painel /admin.
======================================================
```

### Expected Bot Startup Output (First 10 Lines)
```
$ node index.js
[dotenv@17.2.1] injecting env (8) from .env
[AI] OpenAI API key not configured. AI features will be disabled.
2025-08-27 12:01:10.393561: I tensorflow/core/platform/cpu_feature_guard.cc:193] This TensorFlow binary is optimized with oneAPI Deep Neural Network Library (oneDNN)


        ____/\\\\\\\\\\__________/\\\\\_______/\\\\\\\\\\\\\___
         __/\\\////////\\\______/\\\///\\\____\/\\\/////////\\\_
          _\/\\\__/\\\\\\\\\___/\\\/__\///\\\__\/\\\_______\/\\\_
           _\/\\\_\/\\\///\\\__/\\\______\//\\\_\/\\\\\\\\\\\\\/__
# Continues with WhatsApp connection setup
```

## Exact Command Timing Reference

**Typical durations (approximate):**

- `npm ci` - 2-5 minutes depending on native binary downloads  
- `npm run web` - 1-2 seconds startup, immediate availability  
- `node index.js` - 3-5 seconds to WhatsApp connection screen
- `node scripts/test-migration.js` - ~0.2 seconds
- `node scripts/verify-contacts-migration.js` - ~0.2 seconds
- `node scripts/migrate-historical-contacts.js` - ~0.2 seconds

**If installs fail with CDN timeouts**, retry on a network that allows downloads for npm binaries (sharp/sqlite3/tfjs-node) or configure your proxy settings.

## Web Interface Screenshot

![Web Interface](https://github.com/user-attachments/assets/2e393e94-c65e-479b-aa64-3cc77401248f)

The web interface provides:
- Sticker browsing and search functionality
- User ranking and analytics  
- Tag-based filtering and management
- Admin authentication and controls
- Real-time sticker statistics
