# Sticker Bot

A WhatsApp bot for managing and automatically sending stickers.

## Configuration

The bot uses environment variables for configuration. Create a `.env` file with the following variables:

### Required Variables
- `AUTO_SEND_GROUP_ID` - WhatsApp group ID where the bot will automatically send stickers
- `ADMIN_NUMBER` - WhatsApp number of the admin user (format: "5511999999999@c.us")

### Optional Variables
- `TIMEZONE` - Timezone for automatic sending schedule (default: `America/Sao_Paulo`)
  - Examples: `America/Sao_Paulo`, `America/New_York`, `Europe/London`, `UTC`
  - Falls back to `TZ` environment variable if not set
  - Brazil currently does not observe Daylight Saving Time (DST)
- `TZ` - Alternative timezone setting (used if `TIMEZONE` is not set)

### Auto-send Schedule
The bot automatically sends random stickers every hour from 08:00 to 21:00 in the configured timezone.

## Installation

```bash
npm install
```

## Usage

```bash
node index.js
```

## Commands

Available commands when messaging the bot:
- `#random` - Get a random sticker
- `#top10` - Show top 10 most used stickers  
- `#top5users` - Show top 5 users by sticker count
- `#count` - Show total number of saved stickers
- `#editar` - Enter tag editing mode
- `#ID` - Get specific sticker by ID
- `#forçar` - Force send (admin only)

## Database Migration

If you have an existing database with stickers but the user rankings are not showing historical submissions correctly, you may need to run the historical contacts migration:

```bash
node scripts/migrate-historical-contacts.js
```

This script will:
- Analyze your existing media entries
- Create contact entries for all sender IDs that don't have corresponding contacts
- Enable historical submissions to be counted in user rankings

The migration is safe to run multiple times - it will only process entries that haven't been migrated yet.