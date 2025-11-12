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
    name: '#fotohd replying to sticker sends enhanced file',
    fn: async () => {
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const originalBuffer = Buffer.from('original-image-data');
      const storedFilePath = path.join(tempDir, 'fotohd-source.webp');
      fs.writeFileSync(storedFilePath, originalBuffer);

      const databasePath = resolveFromRoot('database/index.js');
      const mediaDownloadPath = resolveFromRoot('utils/mediaDownload.js');
      const enhancerPath = resolveFromRoot('services/imageEnhancer.js');
      const handlerPath = resolveFromRoot('commands/handlers/fotohd.js');
      const commandsPath = resolveFromRoot('commands/index.js');

      delete require.cache[databasePath];
      delete require.cache[mediaDownloadPath];
      delete require.cache[enhancerPath];
      delete require.cache[handlerPath];

      const database = require(databasePath);
      const mediaDownload = require(mediaDownloadPath);
      const enhancer = require(enhancerPath);

      const originalGetHashVisual = database.getHashVisual;
      const originalFindByHashVisual = database.findByHashVisual;
      const originalDownloadMedia = mediaDownload.downloadMediaForMessage;
      const originalEnhanceImage = enhancer.enhanceImage;

      let enhanceCall = null;

      database.getHashVisual = async () => 'hash-match';
      database.findByHashVisual = async (hash) => {
        assertEqual(hash, 'hash-match', 'Should search with visual hash');
        return {
          id: 321,
          file_path: storedFilePath,
          mimetype: 'image/webp'
        };
      };

      mediaDownload.downloadMediaForMessage = async () => ({
        buffer: Buffer.from('quoted-buffer'),
        mimetype: 'image/webp'
      });

      if (require.cache[mediaDownloadPath]) {
        require.cache[mediaDownloadPath].exports.downloadMediaForMessage = mediaDownload.downloadMediaForMessage;
      }

      enhancer.enhanceImage = async (buffer, options) => {
        enhanceCall = { buffer, options };
        return {
          buffer: Buffer.from('enhanced-image'),
          info: { format: 'png', width: 200, height: 200, scaleFactor: options?.factor || 2, engine: 'ai' }
        };
      };

      delete require.cache[commandsPath];
      const commands = require(commandsPath);

      const client = new MockBaileysClient();
      client.getQuotedMessage = async () => ({
        id: 'quoted',
        isMedia: true,
        mimetype: 'image/webp'
      });

      const message = {
        id: 'msg-1',
        body: '#fotohd',
        hasQuotedMsg: true
      };

      const chatId = '5511999999999@c.us';

      try {
        await commands.handleCommand(client, message, chatId, {});

        assert(enhanceCall, 'Enhance should be called');
        assert(enhanceCall.buffer.equals(originalBuffer), 'Enhancer should receive stored buffer');
        assertEqual(enhanceCall.options.factor, 2, 'Default factor should be 2x');

        const sentFile = client.sent.find(item => item.type === 'file');
        assert(sentFile, 'Should send enhanced file');
        const tempOutput = sentFile.payload.filePath;
        assert(!fs.existsSync(tempOutput), 'Temporary file should be cleaned up after sending');

        const confirmationMessage = client.sent.find(item => item.type === 'text' && item.payload.includes('Ampliei a imagem'));
        assert(confirmationMessage, 'Should send confirmation message');
      } finally {
        database.getHashVisual = originalGetHashVisual;
        database.findByHashVisual = originalFindByHashVisual;
        mediaDownload.downloadMediaForMessage = originalDownloadMedia;
        enhancer.enhanceImage = originalEnhanceImage;

        if (fs.existsSync(storedFilePath)) {
          fs.unlinkSync(storedFilePath);
        }
      }
    }
  }
];

if (require.main === module) {
  runTestSuite('Foto HD Command Integration Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
