module.exports = {
  apps: [
    {
      name: 'sticker-bot',
      script: './bot.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/error.log',
      out_file: './logs/output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'sticker-server',
      script: './server.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/server-error.log',
      out_file: './logs/server-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
