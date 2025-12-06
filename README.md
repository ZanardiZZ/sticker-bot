# Sticker Bot

A comprehensive WhatsApp bot for managing, automatically sending, and administering stickers with a complete web interface, user management, and advanced features.

## ✨ Features

### 🤖 WhatsApp Bot
- **Automatic sticker sending** - Default hourly schedule (08:00-21:00) with fallback matched-minute sends; configurable via bot settings
- **Smart media processing** - Handles images, videos, GIFs, and audio
- **AI-powered tagging** - Automatic content analysis and tagging
- **NSFW filtering** - External moderation support and gated NSFW access
- **Rich commands** - Comprehensive command system for users

### 🌐 Web Administration Interface
- **User management** - Registration, authentication, and role-based access
- **Sticker browsing** - Search, filter, and manage stickers
- **Analytics dashboard** - Usage statistics and user rankings
- **Duplicate management** - Detect and remove duplicate media
- **Tag management** - Organize and categorize content
- **Admin controls** - IP rules, rate limiting, and system monitoring

### 🔐 Security & Analytics
- **Rate limiting** - Protection against abuse
- **Request logging** - Detailed analytics and monitoring
- **IP-based rules** - Allow/block specific IPs
- **Secure sessions** - Production-ready authentication
- **Email verification** - Optional user email confirmation

### 🚀 Advanced Features
- **Media queue system** - High-volume processing with retry logic
- **Database optimization** - WAL mode, indexes, and concurrency control
- **Email service** - SMTP integration for notifications
- **Migration tools** - Safe database upgrades and data migration
- **AI integration** - OpenAI for transcription and analysis

## 📋 Requirements

- **Node.js 20+**
- **npm** 
- **SQLite3** (included)
- **WhatsApp account** for bot connection

### Optional Dependencies
- **OpenAI API key** - For AI-powered features
- **SMTP server** - For email functionality
- **FFmpeg** - For advanced video processing

### 🚨 Network Restrictions
The application gracefully handles environments where FFmpeg binaries cannot be downloaded due to firewall restrictions (common with `storage.googleapis.com` blocks). When FFmpeg is unavailable:

- **Video processing**: Returns basic fallback descriptions instead of frame analysis
- **GIF conversion**: Uses original files instead of optimized MP4 conversion  
- **WebP repair**: Skips FFmpeg-based repair attempts
- **NSFW video filtering**: Falls back to safe assumptions

The bot continues to function normally with reduced video processing capabilities.

## ⚡ Quick Start

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/ZanardiZZ/sticker-bot.git
cd sticker-bot

# Install dependencies (uses package-lock for reproducibility)
npm ci

# If you hit native module errors, rebuild the binaries
npm rebuild sqlite3 sharp
```

### 2. Configuration

```bash
# Create environment file
cp .env.example .env

# Edit .env with your settings (required)
nano .env
```

**Required configuration:**
```env
AUTO_SEND_GROUP_ID=your_whatsapp_group_id
ADMIN_NUMBER=5511999999999@c.us
```

### 3. Start the Applications

#### 🚀 Baileys WebSocket Mode (Default)

The bot now runs exclusively on the Baileys WebSocket bridge. Keep the bridge online and restart the bot freely without losing the session.

**Setup:**
1. Start Baileys bridge (maintains the WhatsApp session):
   ```bash
   npm run baileys:server
   ```
   - Scan the QR code the first time only.
   - Leave this running in production and during development.

2. Start the bot (can be restarted anytime):
   ```bash
   npm run bot
   ```
   - Connects to the bridge automatically.
   - No QR code needed on restarts.

**Available Scripts:**
- `npm run baileys:server` – Start the shared WhatsApp session.
- `npm run bot` – Launch the bot logic.
- `npm run bot-direct` – Alias for `npm run bot` (kept for backward compatibility).

#### 🌐 Web Interface

```bash
npm run web
```
- Access at `http://localhost:3000`
- Default admin: `admin` (password shown on startup)
- Provides user management, sticker browsing, and analytics

**Note:** The web interface runs independently of the bot. You can run both simultaneously for full functionality.

## 🎮 Bot Commands

Send these commands to the bot in WhatsApp:

| Command | Description | Example |
|---------|-------------|---------|
| `#random` | Get a random sticker | `#random` |
| `#count` | Show total sticker count | `#count` |
| `#top10` | Top 10 most used stickers | `#top10` |
| `#top5users` | Top 5 users by sticker count | `#top5users` |
| `#top5comandos` | Top 5 commands ranked by usage | `#top5comandos` |
| `#123` | Get sticker by ID | `#456` |
| `#editar 123` | Edit sticker tags/description | `#editar 456` |
| `#forçar` | Force save next media (admin) | `#forçar` |
| `#ban @user` | Kick mentioned user from group (admin) | `#ban @username` |
| `#verificar` | Generate WhatsApp verification code | `#verificar` |
| `#download <URL>` | Download short video from URL | `#download https://youtube.com/shorts/xxxxx` |
| `#baixar <URL>` | Same as #download (Portuguese) | `#baixar https://tiktok.com/@user/video/xxxxx` |
| `#downloadmp3 <URL>` | Download audio from video URL | `#downloadmp3 https://youtube.com/watch?v=xxxxx` |
| `#baixarmp3 <URL>` | Same as #downloadmp3 (Portuguese) | `#baixarmp3 https://youtube.com/watch?v=xxxxx` |
| `#baixaraudio <URL>` | Same as #downloadmp3 (Portuguese) | `#baixaraudio https://youtube.com/watch?v=xxxxx` |
| `#criar <prompt>` | Generate meme with AI | `#criar gato engraçado com chapéu` |
| `#exportarmemes` | Export all generated memes (admin) | `#exportarmemes` |
| `#deletar <ID>` | Delete sticker by ID (voting system) | `#deletar 123` |
| `#issue <description>` | Report an issue to developers | `#issue O bot está lento` |
| `#perfil` | Show your user profile and statistics | `#perfil` |
| `#fotohd` | Upscale photo to HD quality | `#fotohd` (reply to image) |
| `#tema <theme>` | Get random sticker by theme | `#tema cats` |
| `#addpack <name>` | Add sticker to a pack | `#addpack MyPack` (reply to sticker info) |
| `#pack [name]` | List packs or get pack stickers | `#pack` or `#pack MyPack` |
| `#ping` | Check bot status and uptime | `#ping` |

### 🛡️ Group Moderation

**Ban Command** - Remove users from group (admin only):

**Usage:**
```
#ban @username
```

**Requirements:**
- ✅ Must be executed in a group chat
- ✅ Command sender must be an admin (configured via `ADMIN_NUMBER` environment variable)
- ✅ Must mention a user to kick using @mention
- ✅ Bot must have admin permissions in the group

**Example:**
```
#ban @spammer
```

**Response Messages:**
- ✅ Success: "✅ Usuário removido do grupo."
- ⚠️ Non-group: "⚠️ Este comando só funciona em grupos."
- ⚠️ Non-admin: "⚠️ Apenas administradores podem usar este comando."
- ⚠️ No mention: "⚠️ Você precisa mencionar um usuário para banir."
- ⚠️ No permission: "⚠️ O bot não tem permissão de administrador neste grupo."

**Note:** The bot needs to be promoted to admin in the WhatsApp group for this command to work.

### 📥 Video Download Feature

Download short videos from various platforms and process them as stickers:

**Usage:**
```
#download <URL>
#baixar <URL>
```

**Supported platforms:**
- YouTube (including Shorts)
- TikTok
- Instagram (Reels, IGTV)
- Twitter/X
- Facebook
- Vimeo
- Reddit
- And many more...

**Limitations:**
- ⏱️ Maximum duration: 60 seconds (1 minute)
- 📦 Maximum file size: 50MB
- 🤖 Videos are automatically analyzed with AI
- 🔒 NSFW filtering is applied
- ✨ GIF-like videos are converted to animated stickers

**Example:**
```
#download https://youtube.com/shorts/abc123
```

The bot will:
1. Check video duration and availability
2. Download the video
3. Analyze content with AI (description and tags)
4. Apply NSFW filtering
5. Convert to sticker format (if applicable)
6. Save to database with full metadata

### 🗑️ Delete Command (Voting System)

Delete stickers using a democratic voting system:

**Usage:**
```
#deletar <ID>
```

**How it works:**

1. **Immediate deletion** (no voting needed):
   - ✅ **Original sender** of the sticker can delete it directly
   - ✅ **Admins** (configured via `ADMIN_NUMBER` or WhatsApp group admins) can delete directly

2. **Community voting**:
   - 👥 Regular users can vote to delete a sticker
   - 🗳️ When **3 votes** are reached, the sticker is automatically deleted
   - ✅ Each user can vote once per sticker
   - 📊 Bot shows remaining votes needed

**Example:**
```
User1: #deletar 123
Bot: 🗳️ Seu voto para deletar a mídia ID 123 foi registrado. Faltam 2 voto(s).

User2: #deletar 123
Bot: 🗳️ Seu voto para deletar a mídia ID 123 foi registrado. Faltam 1 voto(s).

User3: #deletar 123
Bot: 🗑️ Mídia ID 123 deletada após atingir 3 votos.
```

**Note:** The voting threshold can be configured by admins in the database (`delete_vote_threshold`).

### 📦 Sticker Packs

Organize your stickers into themed packs with WhatsApp pack metadata:

**Usage:**
```
#pack                    - List all available packs
#pack <name>             - Get all stickers from a pack
#addpack <name>          - Add sticker to a pack (reply to sticker info message)
```

**How it works:**

1. **Creating a pack:**
   - Simply use `#addpack <name>` - the pack is created automatically if it doesn't exist
   - Each pack can hold up to 30 stickers (WhatsApp limit)
   - Packs include bot information (PACK_NAME and AUTHOR_NAME)

2. **Adding stickers:**
   - Get a sticker from the bot (e.g., `#random`, `#tema`, etc.)
   - Reply to the **info message** (the one with 🆔 ID) with `#addpack <pack-name>`
   - The bot will confirm the addition and show remaining space

3. **Viewing packs:**
   - Use `#pack` without parameters to see all packs
   - Shows pack name, sticker count, and capacity (e.g., 15/30)
   - Status indicator: 🟢 (available space) or 🔴 (full)

4. **Getting pack stickers:**
   - Use `#pack <name>` to receive all stickers from a specific pack
   - Stickers are sent in order with their metadata
   - Works like `#tema` but for your custom collections

**Examples:**
```
User: #pack
Bot: 📦 Packs Disponíveis:
     🟢 Animals (15/30 stickers - 50%)
     🟢 Funny Memes (8/30 stickers - 27%)
     🔴 Complete Pack (30/30 stickers - 100%)

User: #addpack Animals
Bot: ✅ Figurinha adicionada ao pack "Animals"!
     📊 Stickers no pack: 16/30
     💡 Espaço disponível: 14 stickers

User: #pack Animals
Bot: [Sends all 16 stickers from the Animals pack]
```

**Pack Full Handling:**
- When a pack reaches 30 stickers, the bot suggests creating a numbered sequel
- Example: "Animals" → "Animals (2)" → "Animals (3)"
- The bot automatically suggests the next available number

**Features:**
- ✅ Automatic pack creation
- ✅ 30 sticker limit per pack (WhatsApp standard)
- ✅ Pack metadata (name, description, creator)
- ✅ Smart name suggestions when full
- ✅ Search packs by name (partial matching)
- ✅ Pack statistics and usage tracking

### Tag Editing Mode
After using `#editar ID`, send:
```
descricao: Your description; tags: tag1, tag2, tag3
```
Or just tags:
```
funny, cat, meme
```

### 🔐 WhatsApp Verification

To link your WhatsApp account to your web account and enable editing privileges:

1. **Register** on the website (if you haven't already)
2. **Generate verification code** - Send `#verificar` to the bot in WhatsApp (private message only)
3. **Enter code** - Go to your account panel on the website and enter the 8-character code
4. **Verify** - Click "Verify" to link your accounts

**Benefits of verification:**
- ✅ Ability to edit sticker tags and descriptions on the website
- ✅ Enhanced account privileges and trust level
- ✅ Seamless integration between WhatsApp and web interface

**Note:** Verification is optional but recommended for full functionality.

## 🌐 Web Interface

### User Features
- **Browse stickers** - Search and filter by tags
- **View analytics** - Usage statistics and rankings
- **Tag filtering** - Find content by categories
- **Responsive design** - Mobile and desktop friendly

### Admin Features
- **User management** - Approve/reject registrations
- **System monitoring** - Request logs and analytics
- **Duplicate management** - Find and remove duplicate media
- **IP rules** - Block or allow specific IP addresses
- **Bulk operations** - Mass delete, export, import

### API Endpoints

#### Public API
```
GET /api/media          - List media with pagination
GET /api/media/:id      - Get specific media
GET /api/tags           - List all tags
GET /api/rank/tags      - Tag usage ranking
GET /api/rank/users     - User contribution ranking
```

#### Admin API
```
POST /api/login                    - User authentication
GET /api/admin/stats              - System statistics
GET /api/admin/duplicates         - List duplicate media
DELETE /api/admin/duplicates/:id  - Remove duplicates
GET /api/admin/users              - User management
POST /api/admin/ip-rules          - IP rule management
```

## 📊 Database Management

### Migrations

**Historical contacts migration:**
```bash
node scripts/migrate-historical-contacts.js
```

**Missing sender IDs migration:**
```bash
node scripts/migrate-missing-sender-ids.js
```

**Verify migrations:**
```bash
node scripts/verify-contacts-migration.js
```

**Test migrations:**
```bash
node scripts/test-migration.js
```

### Maintenance

All database operations use:
- **WAL mode** for better concurrency
- **Automatic retries** for SQLITE_BUSY errors
- **Queue system** for high-volume processing
- **Transaction safety** with rollback on failures

### Command Usage Analytics

Command executions are recorded in the `command_usage` table and exposed through the helpers in `database/models/commandUsage.js`. When you add new commands, follow the checklist in [`docs/COMMAND_USAGE_ANALYTICS.md`](docs/COMMAND_USAGE_ANALYTICS.md) to make sure usage counts stay accurate and appear in rankings like `#top5comandos`.

## ⚙️ Configuration

### Environment Variables

Create a `.env` file from `.env.example` and configure:

#### Required
```env
AUTO_SEND_GROUP_ID=your_group_id_here
ADMIN_NUMBER=5511999999999@c.us
```

#### Web Interface
```env
PORT=3000
ADMIN_INITIAL_USERNAME=admin
ADMIN_INITIAL_PASSWORD=secure_password
SESSION_SECRET=random-secure-key
```

#### AI Services (Optional)
```env
OPENAI_API_KEY=sk-your-key-here
```

#### Email Service (Optional)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@yourdomain.com
```

#### Analytics (Optional)
```env
ENABLE_INTERNAL_ANALYTICS=true
UMAMI_ORIGIN=https://analytics.domain.com
```

#### Production Settings
```env
NODE_ENV=production
TIMEZONE=America/Sao_Paulo
```

See `.env.example` for all available options with detailed comments.

## 🔧 Advanced Setup

### Email Service Setup

For user registration and notifications:

1. **Gmail Setup:**
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-specific-password
   ```

2. **Other Providers:**
   - **Outlook:** `smtp-mail.outlook.com:587`
   - **Yahoo:** `smtp.mail.yahoo.com:587`
   - **Custom SMTP:** Use your provider settings

### AI Features Setup

Enable OpenAI integration:

```env
OPENAI_API_KEY=sk-your-api-key-here
```

**Features enabled:**
- Automatic media tagging
- Audio transcription
- Content analysis
- Smart descriptions

### Production Deployment

1. **Environment:**
   ```env
   NODE_ENV=production
   SESSION_SECRET=cryptographically-secure-random-key
   ```

2. **Process Management:**
   ```bash
   # Using PM2
   npm install -g pm2
   pm2 start index.js --name "sticker-bot"
   pm2 start "npm run web" --name "sticker-web"
   
   # Save PM2 configuration
   pm2 save
   pm2 startup
   ```

3. **Reverse Proxy (nginx):**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

## 🚨 Troubleshooting

### Installation Issues

**Native module build failed (sqlite3/sharp/tfjs-node):**
- Make sure build tooling is installed (Linux: `build-essential python3 make gcc g++`)
- Re-run `npm ci` and then `npm rebuild sqlite3 sharp`
- Ensure the machine has internet access to download prebuilt binaries

**Dependency download blocked/firewalled:**
- Retry on a network that allows downloads from npm/CDN mirrors
- If corporate proxies are involved, configure `npm config set proxy/https-proxy`

**"SQLITE_BUSY errors":**
- Database uses WAL mode and queue system
- Errors automatically retry up to 5 times
- Check logs for persistent issues

### Runtime Issues

**WhatsApp connection fails:**
- Verify `.env` configuration
- Check phone number format: `5511999999999@c.us`
- Ensure WhatsApp Web is not open elsewhere

**Web interface not accessible:**
- Check if port 3000 is in use
- Verify `PORT` environment variable
- Check firewall settings

**Missing features:**
- AI features require `OPENAI_API_KEY`
- Email requires SMTP configuration
- Some features need admin privileges

### Performance Tuning

**High memory usage:**
- Reduce queue concurrency (default: 3)
- Monitor duplicate detection frequency
- Check for memory leaks in logs

**Database slow:**
- Ensure WAL mode is enabled
- Check index usage with EXPLAIN QUERY PLAN
- Consider VACUUM if database is large

## 📈 Monitoring

### Built-in Analytics

Access at `/admin` when `ENABLE_INTERNAL_ANALYTICS=true`:

- **Request logs** - All API calls and response times
- **User statistics** - Registration, login, activity
- **Media statistics** - Upload, processing, usage
- **Error tracking** - Failed operations and debugging

### Queue Monitoring

Monitor media processing:
- **Processed** - Successfully completed
- **Failed** - Permanently failed after retries
- **Queued** - Waiting for processing
- **Active** - Currently processing

### Health Checks

```bash
# Test database connectivity
node scripts/test-migration.js

# Check web server
curl http://localhost:3000/api/health

# Verify bot status
# Check console output for connection status
```

## 🤖 Custom Agents

This repository includes custom agent definitions to improve agent-based coding efficiency. These agents provide specialized knowledge about the repository structure, patterns, and best practices.

### Available Agents

- **Sticker Bot Expert** (`.github/agents/sticker-bot-expert.md`) - Comprehensive expert for all development tasks
  - WhatsApp bot development (Baileys, WebSocket bridges)
  - Media processing (images, videos, GIFs)
  - Node.js backend (Express, SQLite)
  - AI integration (OpenAI, content filtering)
  - Web administration and security

### Using Custom Agents

For GitHub Copilot and AI-assisted development:
1. Reference `.github/agents/` for context on repository patterns
2. Follow guidelines in agent definitions for consistent code
3. Use the Sticker Bot Expert for comprehensive guidance

See [`.github/agents/README.md`](.github/agents/README.md) for detailed documentation.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Make minimal, focused changes
4. Test thoroughly
5. Use custom agents for guidance on repository patterns
6. Submit a pull request

### Version Management

This project uses an automated version management system:
- Version starts at **0.5** and auto-increments by 0.1 for each changelog
- Manual version bumps: include `bump: version X.Y` in commit messages
- See [docs/VERSION_MANAGEMENT.md](docs/VERSION_MANAGEMENT.md) for details

## 📄 License

ISC License

## 🆘 Support

- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions
- **Documentation:** This README and inline comments
