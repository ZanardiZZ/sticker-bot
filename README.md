# Sticker Bot

A comprehensive WhatsApp bot for managing, automatically sending, and administering stickers with a complete web interface, user management, and advanced features.

## ✨ Features

### 🤖 WhatsApp Bot
- **Automatic sticker sending** - Hourly stickers from 08:00-21:00
- **Smart media processing** - Handles images, videos, GIFs, and audio
- **AI-powered tagging** - Automatic content analysis and tagging
- **NSFW filtering** - Content safety with automatic filtering
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

## ⚡ Quick Start

### 1. Installation

**⚠️ Important:** Due to firewall restrictions, always use the following installation command:

```bash
# Clone the repository
git clone https://github.com/ZanardiZZ/sticker-bot.git
cd sticker-bot

# Install dependencies (REQUIRED: use this exact command)
PUPPETEER_SKIP_DOWNLOAD=true npm install --ignore-scripts

# Rebuild native modules (required for SQLite3 and Sharp)
npm rebuild sqlite3 sharp
```

**Never use regular `npm install`** - it will fail due to network blocks on Chrome downloads and other dependencies.

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

**Web Interface:**
```bash
npm run web
```
- Access at `http://localhost:3000`
- Default admin: `admin` (password shown on startup)

**WhatsApp Bot:**
```bash
node index.js
```
- Scan QR code with WhatsApp
- Bot will be ready after connection

## 🎮 Bot Commands

Send these commands to the bot in WhatsApp:

| Command | Description | Example |
|---------|-------------|---------|
| `#random` | Get a random sticker | `#random` |
| `#count` | Show total sticker count | `#count` |
| `#top10` | Top 10 most used stickers | `#top10` |
| `#top5users` | Top 5 users by sticker count | `#top5users` |
| `#123` | Get sticker by ID | `#456` |
| `#editar 123` | Edit sticker tags/description | `#editar 456` |
| `#forçar` | Force save next media (admin) | `#forçar` |

### Tag Editing Mode
After using `#editar ID`, send:
```
descricao: Your description; tags: tag1, tag2, tag3
```
Or just tags:
```
funny, cat, meme
```

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

**"Chrome download failed":**
```bash
# Always use this command
PUPPETEER_SKIP_DOWNLOAD=true npm install --ignore-scripts
```

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

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Make minimal, focused changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

ISC License

## 🆘 Support

- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions
- **Documentation:** This README and inline comments