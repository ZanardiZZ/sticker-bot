module.exports = {
  apps: [
    {
      name: 'WS-Socket-Server',
      script: 'server.js',
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
    },
    {
      name: 'Bot-Client',
      script: 'index.js',
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
        PM2_DISABLE_MONIT: 'true',
        OPENAI_MULTIMODAL_BASE_URL: 'http://YOUR_LLM_HOST:8080/v1',
        OPENAI_MULTIMODAL_MODEL: 'C:\\Users\\Zanardi\\Downloads\\LLM_Models\\gemma-4-12B-it-qat-UD-Q4_K_XL.gguf'
      }
    },
    {
      name: 'WebServer',
      script: 'src/web/server.js',
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
        PM2_DISABLE_MONIT: 'true',
        PORT: globalThis.process?.env?.PORT || 3000
      }
    },
    {
      name: 'Memory-Bridge',
      script: 'src/memory-bridge/server.js',
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
