/* global __dirname */
module.exports = {
  apps: [
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
        STICKER_GIF_AI_FRAMES: '3',
        // Keep the runtime configuration explicit when PM2 refreshes this app.
        // The dedicated OmniRoute secret remains only in .env (mode 600), never here.
        DOTENV_CONFIG_PATH: '/home/dev/work/sticker-bot2/.env',
        OPENAI_MULTIMODAL_BASE_URL: 'http://192.168.20.111:20128/v1',
        OPENAI_MULTIMODAL_MODEL: 'stickerbot',
        VISION_MODEL_CHAIN: 'stickerbot',
        MEMORY_LLM_MODEL: 'stickerbot',
        MEMORY_FACT_MODEL: 'stickerbot'
      }
    },
    {
      name: 'WS-Socket-Server-Baileys',
      script: 'src/server/baileysBridge.js',
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
        BAILEYS_WS_PORT: globalThis.process?.env?.BAILEYS_WS_PORT || 8765,
        BAILEYS_AUTH_DIR: globalThis.process?.env?.BAILEYS_AUTH_DIR || '/home/dev/work/sticker-bot2-baileys-canary/storage/baileys-auth',
        NODE_OPTIONS: '--network-family-autoselection-attempt-timeout=1000',
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
