#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { runTestSuite, assert, assertEqual } = require('../helpers/testUtils');
const { MockBaileysClient } = require('../helpers/mockBaileysClient');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function resolveFromRoot(relativePath) {
  return require.resolve(path.join(PROJECT_ROOT, relativePath));
}

const tests = [
  {
    name: '#removebg replying to sticker sends transparent PNG',
    fn: async () => {
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const storedFilePath = path.join(tempDir, 'removebg-source.webp');
      fs.writeFileSync(storedFilePath, Buffer.from('stored-image'));

      const servicePath = resolveFromRoot('services/backgroundRemoval.js');
      const databasePath = resolveFromRoot('database/index.js');
      const mediaDownloadPath = resolveFromRoot('utils/mediaDownload.js');
      const handlerPath = resolveFromRoot('commands/handlers/removebg.js');
      const commandsPath = resolveFromRoot('commands/index.js');

      delete require.cache[servicePath];
      delete require.cache[databasePath];
      delete require.cache[mediaDownloadPath];
      delete require.cache[handlerPath];

      const service = require(servicePath);
      const database = require(databasePath);
      const mediaDownload = require(mediaDownloadPath);

      const originalRemoveBackground = service.removeBackground;
      const originalGetHashVisual = database.getHashVisual;
      const originalFindByHashVisual = database.findByHashVisual;
      const originalDownloadMedia = mediaDownload.downloadMediaForMessage;

      service.removeBackground = async () => Buffer.from('transparent-output');
      database.getHashVisual = async () => 'hash-match';
      database.findByHashVisual = async () => ({ id: 77, file_path: storedFilePath, mimetype: 'image/webp' });
      mediaDownload.downloadMediaForMessage = async () => ({ buffer: Buffer.from('quoted'), mimetype: 'image/webp' });

      delete require.cache[commandsPath];
      const commands = require(commandsPath);

      const client = new MockBaileysClient();
      client.getQuotedMessage = async () => ({ id: 'quoted', isMedia: true, mimetype: 'image/webp' });

      const message = { id: 'msg-1', body: '#removebg', hasQuotedMsg: true };
      const chatId = '5511999999999@c.us';

      try {
        await commands.handleCommand(client, message, chatId, {});

        const fileMessage = client.sent.find(item => item.type === 'file');
        assert(fileMessage, 'Should send masked image');
        assert(fileMessage.payload.fileName.endsWith('.png'), 'Result must be PNG');
        assert(!fs.existsSync(fileMessage.payload.filePath), 'Temporary file should be removed after sending');

        const confirmation = client.sent
          .filter(item => item.type === 'text')
          .map(item => item.payload)
          .find(text => text.includes('Fundo removido'));
        assert(confirmation, 'Should send confirmation text');
      } finally {
        service.removeBackground = originalRemoveBackground;
        database.getHashVisual = originalGetHashVisual;
        database.findByHashVisual = originalFindByHashVisual;
        mediaDownload.downloadMediaForMessage = originalDownloadMedia;
        delete require.cache[commandsPath];

        if (fs.existsSync(storedFilePath)) {
          fs.unlinkSync(storedFilePath);
        }
      }
    }
  },
  {
    name: '#removebg rejects non-image media with friendly error',
    fn: async () => {
      const servicePath = resolveFromRoot('services/backgroundRemoval.js');
      const databasePath = resolveFromRoot('database/index.js');
      const mediaDownloadPath = resolveFromRoot('utils/mediaDownload.js');
      const handlerPath = resolveFromRoot('commands/handlers/removebg.js');
      const commandsPath = resolveFromRoot('commands/index.js');

      delete require.cache[servicePath];
      delete require.cache[databasePath];
      delete require.cache[mediaDownloadPath];
      delete require.cache[handlerPath];

      const service = require(servicePath);
      const database = require(databasePath);
      const mediaDownload = require(mediaDownloadPath);

      const originalRemoveBackground = service.removeBackground;
      const originalGetHashVisual = database.getHashVisual;
      const originalFindByHashVisual = database.findByHashVisual;
      const originalDownloadMedia = mediaDownload.downloadMediaForMessage;

      service.removeBackground = async () => { throw new Error('should-not-be-called'); };
      database.getHashVisual = async () => null;
      database.findByHashVisual = async () => null;
      mediaDownload.downloadMediaForMessage = async () => { throw new Error('download-should-not-happen'); };

      delete require.cache[commandsPath];
      const commands = require(commandsPath);

      const client = new MockBaileysClient();
      client.getQuotedMessage = async () => ({ id: 'quoted', isMedia: true, mimetype: 'video/mp4' });

      const message = { id: 'msg-2', body: '#removebg', hasQuotedMsg: true };
      const chatId = '5511000000000@c.us';

      try {
        await commands.handleCommand(client, message, chatId, {});

        const errorMessage = client.sent
          .filter(item => item.type === 'text')
          .map(item => item.payload)
          .find(text => text.includes('Responda a uma figurinha ou imagem para usar #removebg.'));

        assert(errorMessage, 'Should instruct user to reply with image');
        const fileMessage = client.sent.find(item => item.type === 'file');
        assert(!fileMessage, 'Should not send file for invalid media');
      } finally {
        service.removeBackground = originalRemoveBackground;
        database.getHashVisual = originalGetHashVisual;
        database.findByHashVisual = originalFindByHashVisual;
        mediaDownload.downloadMediaForMessage = originalDownloadMedia;
        delete require.cache[commandsPath];
      }
    }
  }
];

if (require.main === module) {
  runTestSuite('Remove Background Command Integration Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
