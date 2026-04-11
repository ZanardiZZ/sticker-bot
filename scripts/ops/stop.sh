#!/bin/bash
# Sticker Bot - Stop Script
# Stops all services managed by PM2

set -e

APP_USER="${APP_USER:-dev}"

pm2_dev() {
    if [ "$(id -un)" = "$APP_USER" ]; then
        pm2 "$@"
    else
        sudo -u "$APP_USER" pm2 "$@"
    fi
}

echo "🛑 Stopping Sticker Bot services..."
echo ""

# Check if PM2 is installed for the app user
if [ "$(id -un)" = "$APP_USER" ]; then
    if ! command -v pm2 &> /dev/null; then
        echo "❌ PM2 not found - services may not be running"
        exit 1
    fi
else
    if ! sudo -u "$APP_USER" bash -lc 'command -v pm2 >/dev/null 2>&1'; then
        echo "❌ PM2 not found for user $APP_USER - services may not be running"
        exit 1
    fi
fi

# Stop all services in the dev PM2 daemon
pm2_dev stop ecosystem.config.js

echo ""
echo "✓ Services stopped successfully!"
echo ""
echo "📊 Status:"
pm2_dev status

echo ""
echo "To start again, run: bash scripts/ops/start.sh"
echo ""
