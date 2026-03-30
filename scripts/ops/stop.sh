#!/bin/bash
# Sticker Bot - Stop Script
# Stops all services managed by PM2

echo "🛑 Stopping Sticker Bot services..."
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 not found - services may not be running"
    exit 1
fi

# Stop all services
pm2 stop ecosystem.config.js

echo ""
echo "✓ Services stopped successfully!"
echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "To start again, run: bash scripts/ops/start.sh"
echo ""
