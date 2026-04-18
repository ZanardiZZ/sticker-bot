module.exports = {
  apps: [
    {
      name: 'WS-Socket-Server',
      script: 'server.js',
      cwd: '/home/dev/work/sticker-bot2',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      autorestart: true,
      merge_logs: true,
      pmx: false,
      automation: false,
      vizion: false,
      env: {
        PM2_DISABLE_MONIT: 'true'
      }
    },
    {
      name: 'Bot-Client',
      script: 'index.js',
      cwd: '/home/dev/work/sticker-bot2',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      autorestart: true,
      merge_logs: true,
      pmx: false,
      automation: false,
      vizion: false,
      env: {
        PM2_DISABLE_MONIT: 'true'
      }
    },
    {
      name: 'WebServer',
      script: 'src/web/server.js',
      cwd: '/home/dev/work/sticker-bot2',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      autorestart: true,
      merge_logs: true,
      pmx: false,
      automation: false,
      vizion: false,
      env: {
        PM2_DISABLE_MONIT: 'true',
        PORT: process.env.PORT || 3000
      }
    },
    {
      name: 'Memory-Bridge',
      script: 'src/memory-bridge/server.js',
      cwd: '/home/dev/work/sticker-bot2',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      autorestart: true,
      merge_logs: true,
      pmx: false,
      automation: false,
      vizion: false,
      env: {
        PM2_DISABLE_MONIT: 'true'
      }
    }
  ]
};
