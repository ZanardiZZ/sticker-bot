module.exports = {
  apps: [
    {
      name: 'WS-Socket-Server',
      script: '<PROJECT_ROOT>/server.js',
      cwd: '<PROJECT_ROOT>',
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
