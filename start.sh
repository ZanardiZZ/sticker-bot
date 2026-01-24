#!/bin/bash
# Sticker Bot - Start Script
# Starts all services using PM2

set -e

echo "🤖 Starting Sticker Bot..."
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 not found"
    echo "   Installing PM2 globally..."
    npm install -g pm2
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found"
    echo ""
    echo "Please run the setup first:"
    echo "  bash install.sh"
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
pm2 start ecosystem.config.js

echo ""
echo "✓ Services started successfully!"
echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "📝 Useful commands:"
echo "  pm2 status          - Check status"
echo "  pm2 logs            - View logs"
echo "  pm2 logs --lines 50 - View last 50 lines"
echo "  pm2 restart all     - Restart all services"
echo "  pm2 stop all        - Stop all services"
echo "  bash stop.sh        - Stop services (convenience script)"
echo ""
echo "🌐 Web Interface:"
echo "  http://localhost:3000"
echo ""
