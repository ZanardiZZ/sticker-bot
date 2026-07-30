/* global __dirname */
module.exports = {
  apps: [
    {
      name: 'WS-Socket-Server',
      script: 'server.js',
      cwd: __dirname,
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
        // WPPConnect can intermittently stop delivering onMessage while
        // the browser remains MAIN (NORMAL). Poll only unread/new messages as a
        // bounded transport fallback; deduplication and age limits live in bridge.js.
        WS_UNREAD_POLL_INTERVAL_MS: '3000',
        WS_FALLBACK_POLL_SILENCE_MS: '0',
        WS_FALLBACK_MAX_MESSAGE_AGE_MS: '30000'
      }
    },
    {
      name: 'Bot-Client',
      script: 'index.js',
      cwd: __dirname,
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
        GEMMA_PROMPT_TIMEOUT_MS: '30000'
      }
    },
    {
      name: 'WebServer',
      script: 'src/web/server.js',
      cwd: __dirname,
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
        PORT: globalThis.process?.env?.PORT || 3000
      }
    },
  ]
};
