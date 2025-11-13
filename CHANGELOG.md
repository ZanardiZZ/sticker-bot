# Changelog

> Log de mudanças com foco em usuários: novidades, correções e melhorias relevantes.

## [1.0.0] - 2024

### 🚀 Major Changes

#### Migration to Baileys
- **Migrated from OpenWA to Baileys** - WhatsApp library upgrade for better stability and support
- **WebSocket Bridge Architecture** - Separated WhatsApp session from bot logic
  - Start bridge: `npm run baileys:server`
  - Start bot: `npm run bot`
  - Restart bot without rescanning QR code
- **Persistent Sessions** - Session data stored in `auth_info_baileys/`

### ✨ New Commands

#### Media Commands
- **#criar** - Generate memes using AI (DALL-E integration)
- **#exportarmemes** - Export all generated memes (admin only)
- **#fotohd** - Upscale photos to HD quality using AI
- **#downloadmp3** / **#baixarmp3** / **#baixaraudio** - Download audio from video URLs

#### Utility Commands
- **#perfil** - Show user profile and statistics
- **#ping** - Check bot status, uptime, and version
- **#tema** - Get random sticker by theme/topic
- **#issue** - Report issues to developers

#### Admin Commands
- **#deletar** - Delete sticker by ID (admin only)

### 🎨 Features

#### AI Integration
- **Automatic tagging** - AI-powered content analysis and tagging
- **Audio transcription** - OpenAI Whisper integration for voice messages
- **Image upscaling** - HD photo enhancement
- **Meme generation** - AI-generated memes from text prompts
- **NSFW filtering** - Automatic content moderation with external providers

#### Media Processing
- **Animated WebP support** - Process animated stickers with Sharp
- **GIF optimization** - Automatic conversion and size optimization
- **Video downloads** - Support for YouTube, TikTok, Instagram, Twitter, and more
- **Audio extraction** - Download audio from video platforms
- **Queue system** - High-volume media processing with retry logic

#### Web Interface
- **User verification** - Link WhatsApp account to web account with `#verificar`
- **Analytics dashboard** - Usage statistics and user rankings
- **Duplicate management** - Detect and remove duplicate media
- **IP rules** - Allow/block specific IP addresses
- **Command usage tracking** - `#top5comandos` ranking

#### Database & Performance
- **WAL mode** - Better concurrency for SQLite
- **Contact migration** - Historical sender ID migration tools
- **LID support** - WhatsApp's new Local Identifier system
- **Automatic retries** - Handle SQLITE_BUSY errors gracefully

### 🛡️ Security & Moderation

- **Rate limiting** - Protection against abuse
- **Request logging** - Detailed analytics and monitoring
- **Ban command** - Remove users from groups (`#ban @user`)
- **Force save** - Admin override for media processing
- **NSFW detection** - Multiple providers (HuggingFace, OpenAI, local TensorFlow)

### 🔧 Configuration

#### New Environment Variables
- `BAILEYS_WS_PORT` - WebSocket bridge port (default: 8765)
- `BAILEYS_WS_URL` - Bridge URL for bot connection
- `BAILEYS_CLIENT_TOKEN` - Authentication token
- `OPENAI_API_KEY_MEMECREATOR` - Dedicated key for meme generation
- `MEME_IMAGE_SIZE` - Image dimensions (default: 1024x1024)
- `MEME_IMAGE_QUALITY` - Quality setting (default: low)
- `NSFW_EXTERNAL_PROVIDER` - External NSFW detection providers
- `HUGGINGFACE_API_KEY` - HuggingFace API integration
- `DISABLE_MULTIFRAME_WEBP_ANALYSIS` - Disable multi-frame analysis

### 🐛 Bug Fixes

- **Large GIF conversion** - Fixed conversion failing on large files
- **LID counter** - Fixed sticker counter after WhatsApp LID migration
- **Animated WebP processing** - Replaced FFmpeg with Sharp for better support
- **Multi-frame analysis** - Optional disable to prevent resource contention
- **Missing sender IDs** - Migration tool for historical data

### 📚 Documentation

- **Updated README** - Reflects Baileys architecture and new commands
- **Legacy documentation** - Socket Mode guides marked as legacy
- **Command guides** - Detailed usage for all commands
- **Migration guides** - Database migration documentation
- **Testing docs** - Integration and unit test documentation

### 🗑️ Deprecated

- **OpenWA library** - Completely removed in favor of Baileys
- **Socket.IO mode** - Legacy open-wa socket mode no longer supported
- **Direct mode** - Replaced by WebSocket bridge architecture

---

## Migration from OpenWA

If you're upgrading from an OpenWA-based version:

1. **Backup your database** - Copy `stickers.db` to a safe location
2. **Clear old sessions** - Remove old OpenWA session directories
3. **Install dependencies** - Run `PUPPETEER_SKIP_DOWNLOAD=true npm install --ignore-scripts`
4. **Configure Baileys** - Update `.env` with Baileys settings
5. **Start bridge** - Run `npm run baileys:server` and scan QR code
6. **Start bot** - Run `npm run bot` to connect

---

For detailed information about specific features, see the [README.md](README.md) and documentation in the `docs/` directory.