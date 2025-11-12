#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { runTestSuite, assert } = require('../helpers/testUtils');

const handlerPath = require.resolve('../../commands/handlers/removebg');
const servicePath = require.resolve('../../services/backgroundRemoval');
const mediaDownloadPath = require.resolve('../../utils/mediaDownload');
const databasePath = require.resolve('../../database/index.js');

delete require.cache[handlerPath];

const serviceModule = require(servicePath);
const mediaDownloadModule = require(mediaDownloadPath);
const databaseModule = require(databasePath);

class MockClient {
  constructor() {
    this.sent = [];
    this.typing = [];
    this.quotedResponse = null;
  }

  async sendText(chatId, payload) {
    this.sent.push({ type: 'text', chatId, payload });
  }

  async sendFile(chatId, filePath, fileName) {
    this.sent.push({ type: 'file', chatId, payload: { filePath, fileName } });
  }

  async simulateTyping(chatId, on) {
    this.typing.push({ chatId, on });
  }

  async getQuotedMessage() {
    if (typeof this.quotedResponse === 'function') {
      return this.quotedResponse();
    }
    return this.quotedResponse;
  }
}

function withRemoveBgHandler(overrides, testFn) {
  const originals = {
    removeBackground: serviceModule.removeBackground,
    downloadMediaForMessage: mediaDownloadModule.downloadMediaForMessage,
    getHashVisual: databaseModule.getHashVisual,
    findByHashVisual: databaseModule.findByHashVisual,
    findById: databaseModule.findById
  };

  if (overrides.removeBackground) {
    serviceModule.removeBackground = overrides.removeBackground;
  }
  if (overrides.downloadMediaForMessage) {
    mediaDownloadModule.downloadMediaForMessage = overrides.downloadMediaForMessage;
  }
  if (overrides.getHashVisual) {
    databaseModule.getHashVisual = overrides.getHashVisual;
  }
  if (overrides.findByHashVisual) {
    databaseModule.findByHashVisual = overrides.findByHashVisual;
  }
  if (overrides.findById) {
    databaseModule.findById = overrides.findById;
  }

  delete require.cache[handlerPath];
  const handlerModule = require(handlerPath);

  return Promise.resolve()
    .then(() => testFn(handlerModule))
    .finally(() => {
      serviceModule.removeBackground = originals.removeBackground;
      mediaDownloadModule.downloadMediaForMessage = originals.downloadMediaForMessage;
      databaseModule.getHashVisual = originals.getHashVisual;
      databaseModule.findByHashVisual = originals.findByHashVisual;
      databaseModule.findById = originals.findById;
      delete require.cache[handlerPath];
    });
}

const tests = [
  {
    name: '#removebg envia imagem com fundo transparente quando responde figurinha',
    fn: async () => {
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const storedPath = path.join(tempDir, 'removebg-source.webp');
      const pngBuffer = await sharp({
        create: { width: 3, height: 3, channels: 3, background: { r: 240, g: 10, b: 10 } }
      }).png().toBuffer();

      fs.writeFileSync(storedPath, pngBuffer);

      const client = new MockClient();
      client.quotedResponse = async () => ({
        id: 'quoted-1',
        isMedia: true,
        mimetype: 'image/webp'
      });

      const message = {
        id: 'msg-1',
        body: '#removebg',
        hasQuotedMsg: true
      };

      const chatId = '5511999999999@c.us';

      await withRemoveBgHandler({
        removeBackground: async () => Buffer.from('png-output'),
        downloadMediaForMessage: async () => ({ buffer: pngBuffer, mimetype: 'image/png' }),
        getHashVisual: async () => 'hash-match',
        findByHashVisual: async () => ({ id: 10, file_path: storedPath, mimetype: 'image/webp' })
      }, async ({ handleRemoveBackgroundCommand }) => {
        await handleRemoveBackgroundCommand(client, message, chatId, {});
      });

      const fileMessage = client.sent.find(item => item.type === 'file');
      assert(fileMessage, 'Comando deve enviar arquivo resultante');
      assert(fileMessage.payload.fileName.endsWith('.png'), 'Arquivo enviado deve ser PNG');
      assert(!fs.existsSync(fileMessage.payload.filePath), 'Arquivo temporário precisa ser removido após envio');

      const texts = client.sent.filter(item => item.type === 'text').map(item => item.payload);
      assert(texts.some(text => text.includes('Removendo o fundo')), 'Mensagem inicial deve informar processamento');
      assert(texts.some(text => text.includes('Fundo removido')), 'Mensagem final deve confirmar sucesso');

      if (fs.existsSync(storedPath)) {
        fs.unlinkSync(storedPath);
      }
    }
  },
  {
    name: '#removebg informa uso correto quando não há mídia',
    fn: async () => {
      const client = new MockClient();
      const message = { id: 'msg-2', body: '#removebg', hasQuotedMsg: false };
      const chatId = 'chat@c.us';

      await withRemoveBgHandler({}, async ({ handleRemoveBackgroundCommand }) => {
        await handleRemoveBackgroundCommand(client, message, chatId, {});
      });

      const usageMessage = client.sent.find(item => item.type === 'text');
      assert(usageMessage, 'Deve enviar mensagem de uso');
      assert(usageMessage.payload.includes('#removebg'), 'Mensagem deve citar o comando');
    }
  },
  {
    name: '#removebg responde com erro amigável quando serviço falha',
    fn: async () => {
      const client = new MockClient();
      client.quotedResponse = async () => ({ id: 'quoted-err', isMedia: true, mimetype: 'image/png' });
      const message = { id: 'msg-3', body: '#removebg', hasQuotedMsg: true };
      const chatId = 'chat@c.us';

      await withRemoveBgHandler({
        removeBackground: async () => { throw new Error('service-error'); },
        downloadMediaForMessage: async () => ({ buffer: Buffer.from('quoted'), mimetype: 'image/png' }),
        getHashVisual: async () => null,
        findByHashVisual: async () => null
      }, async ({ handleRemoveBackgroundCommand }) => {
        await handleRemoveBackgroundCommand(client, message, chatId, {});
      });

      const failureMessage = client.sent
        .filter(item => item.type === 'text')
        .map(item => item.payload)
        .find(text => text.includes('Não consegui remover o fundo agora'));

      assert(failureMessage, 'Deve enviar mensagem de falha amigável');
    }
  }
];

if (require.main === module) {
  runTestSuite('Remove Background Command Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
