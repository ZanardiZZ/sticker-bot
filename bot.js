// bot.cjs
require('dotenv').config();
const venom = require('venom-bot');
const { processarComando } = require('./handlers/comandos.js');
const { startRandomScheduler } = require('./services/randomScheduler.js');
const { tratarErro } = require('./utils/erro.js');
const handleSticker = require('./handlers/stickerHandler.js');
const handleImage   = require('./handlers/imageHandler.js');
const handleVideo   = require('./handlers/videoHandler.js');
const comandosAceitos = ['#random', '#id', '#top10', '#forçar'];
venom
  .create({
    session: 'sticker-bot',
    headless: true,
    browserArgs: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-dev-tools',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--disable-notifications',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-infobars'
    ],
    autoClose: 60000
  })
  .then(start)
  .catch(err => console.error('❌ Erro ao iniciar o bot:', err));

function start(client) {
  console.log('🤖 Bot iniciado e aguardando mensagens...');
  startRandomScheduler(client);

  client.onMessage(async message => {
    try {
      const body = (message.body || '').trim().toLowerCase();

      // Comando para descobrir o ID do grupo
      //if (body === '#id' && message.isGroupMsg) {
      //  await client.sendText(message.from, `🆔 ID do grupo: *${message.from}*`);
      //  return;
      //}

      // 1. Comandos (#random, #id, #forçar, etc.)
      if (message.type === 'chat' && comandosAceitos.some(cmd => texto.startsWith(cmd))) { 
            if (await processarComando(client, message)) 
            return;
          }

      // 2. Stickers
      if (message.type === 'sticker') {
        await handleSticker(client, message);
        return;
      }

      // 3. Imagens (se ativo)
      // if (message.type === 'image') {
      //   await handleImage(client, message);
      //   return;
      // }

      // 4. Vídeos
      if (message.type === 'video') {
        await handleVideo(client, message);
        return;
      }
    } catch (err) {
      await tratarErro(client, message, err);
    }
  });
}
