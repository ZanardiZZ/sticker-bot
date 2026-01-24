/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 status
 *   pm2 logs
 *   pm2 restart all
 *   pm2 stop all
 */

module.exports = {
  apps: [
    // Baileys WebSocket Bridge - Must start first
    {
      name: 'baileys-bridge',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/baileys-error.log',
      out_file: 'logs/baileys-out.log',
      time: true
    },

    // Sticker Bot - Depends on baileys-bridge
    {
      name: 'sticker-bot',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/bot-error.log',
      out_file: 'logs/bot-out.log',
      time: true,
      // Wait for baileys-bridge to start
      wait_ready: true,
      listen_timeout: 10000
    },

    // Web Interface
    {
      name: 'web-interface',
      script: 'web/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000
      },
      error_file: 'logs/web-error.log',
      out_file: 'logs/web-out.log',
      time: true
    }
  ]
};
