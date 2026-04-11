#!/bin/bash
# Sticker Bot - Start Script
# Starts all services using PM2

set -e

APP_USER="${APP_USER:-dev}"
APP_GROUP="${APP_GROUP:-$(id -gn "$APP_USER" 2>/dev/null || echo "$APP_USER")}"

pm2_dev() {
    if [ "$(id -un)" = "$APP_USER" ]; then
        pm2 "$@"
    else
        sudo -u "$APP_USER" pm2 "$@"
    fi
}

echo "🤖 Starting Sticker Bot..."
echo ""

# Check if PM2 is installed
if [ "$(id -un)" = "$APP_USER" ]; then
    if ! command -v pm2 &> /dev/null; then
        echo "❌ PM2 not found"
        echo "   Installing PM2 globally..."
        npm install -g pm2
    fi
else
    if ! sudo -u "$APP_USER" bash -lc 'command -v pm2 >/dev/null 2>&1'; then
        echo "❌ PM2 not found for user $APP_USER"
        echo "   Installing PM2 globally..."
        sudo -u "$APP_USER" npm install -g pm2
    fi
fi

# Create runtime directories if they don't exist and fix ownership on stateful paths
if [ "$(id -u)" -eq 0 ] && id "$APP_USER" &> /dev/null; then
    install -d -o "$APP_USER" -g "$APP_GROUP" \
        storage/logs \
        storage/temp \
        storage/temp/bot \
        storage/temp/bot/fixed-webp \
        storage/auth_info_baileys \
        storage/media/old-stickers
    chown -R "$APP_USER:$APP_GROUP" \
        storage/logs \
        storage/temp \
        storage/auth_info_baileys \
        storage/media/old-stickers 2>/dev/null || true
else
    mkdir -p \
        storage/logs \
        storage/temp \
        storage/temp/bot \
        storage/temp/bot/fixed-webp \
        storage/auth_info_baileys \
        storage/media/old-stickers
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found"
    echo ""
    echo "Please run the setup first:"
    echo "  bash scripts/ops/install.sh"
    echo ""
    exit 1
fi

# Check if SETUP_MODE is still enabled
if grep -q "SETUP_MODE=true" .env 2>/dev/null; then
    echo "⚠️  Setup mode is still enabled"
    echo ""
    echo "Please complete the setup wizard first:"
    echo "  npm run web"
    echo "  Then visit: http://localhost:3000/setup"
    echo ""
    exit 1
fi

# Start services with PM2
echo "Starting services with PM2..."
pm2_dev start ecosystem.config.js

echo ""
echo "✓ Services started successfully!"
echo ""
echo "📊 Status:"
pm2_dev status

echo ""
echo "📝 Useful commands:"
echo "  sudo -u $APP_USER pm2 status          - Check status"
echo "  sudo -u $APP_USER pm2 logs            - View logs"
echo "  sudo -u $APP_USER pm2 logs --lines 50 - View last 50 lines"
echo "  sudo -u $APP_USER pm2 restart all     - Restart all services"
echo "  sudo -u $APP_USER pm2 stop all        - Stop all services"
echo "  bash scripts/ops/stop.sh - Stop services (convenience script)"
echo ""
echo "🌐 Web Interface:"
echo "  http://localhost:3000"
echo ""
