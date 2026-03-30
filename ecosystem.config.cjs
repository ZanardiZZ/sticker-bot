module.exports = {
  apps: [
    {
      name: 'WS-Socket-Server',
      script: '/home/dev/work/sticker-bot2/server.js',
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
