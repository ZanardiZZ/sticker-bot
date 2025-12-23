#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const { runTestSuite, assert, assertEqual } = require('../helpers/testUtils');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MEDIA_DIR = path.join(PROJECT_ROOT, 'bot', 'media');

class MockClient {
  constructor() {
    this.sent = [];
    this.typing = [];
  }

  async sendText(chatId, payload) {
    this.sent.push({ type: 'text', chatId, payload });
  }

  async sendFile(chatId, filePath, fileName, ...extraArgs) {
    this.sent.push({
      type: 'file',
      chatId,
      payload: { filePath, fileName, extraArgs }
    });
  }

  async simulateTyping(chatId, on) {
    this.typing.push({ chatId, on });
  }
}

function withMockedDownloadAudio(mockImplementation, testFn) {
  const servicePath = require.resolve('../../services/videoDownloader');
  const converterPath = require.resolve('../../services/audioConverter');
  const handlerPath = require.resolve('../../commands/handlers/downloadMp3');

  const videoDownloader = require(servicePath);
  const audioConverter = require(converterPath);
  const originalDownloadAudio = videoDownloader.downloadAudio;
  const originalConvertMp3ToOpusAuto = audioConverter.convertMp3ToOpusAuto;

  videoDownloader.downloadAudio = mockImplementation;
  
  // Mock audio converter to simulate conversion failure (fallback to document send)
  audioConverter.convertMp3ToOpusAuto = async () => {
    throw new Error('Mock conversion failure - testing fallback');
  };

  delete require.cache[handlerPath];
  const handlerModule = require(handlerPath);

  return Promise.resolve()
    .then(() => testFn(handlerModule))
    .finally(() => {
      videoDownloader.downloadAudio = originalDownloadAudio;
      audioConverter.convertMp3ToOpusAuto = originalConvertMp3ToOpusAuto;
      delete require.cache[handlerPath];
    });
}

const tests = [
  {
    name: '#downloadmp3 converts audio and sends file (with fallback to document on conversion failure)',
    fn: async () => {
      const client = new MockClient();
      const chatId = '123@c.us';

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'download-audio-'));
      const tempFile = path.join(tempDir, 'temp-audio.mp3');
      fs.writeFileSync(tempFile, 'fake-mp3-content');

      const existingFiles = new Set();
      if (fs.existsSync(MEDIA_DIR)) {
        fs.readdirSync(MEDIA_DIR).forEach(file => existingFiles.add(file));
      } else {
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
      }

      const message = {
        body: '#downloadmp3 https://youtube.com/watch?v=abcd',
        id: 'MSG-DL-AUDIO'
      };

      await withMockedDownloadAudio(async () => ({
        filePath: tempFile,
        mimetype: 'audio/mpeg',
        metadata: {
          title: 'Sample Audio Title That Is Quite Long And Descriptive',
          duration: 123,
          source: 'YouTube',
          url: 'https://youtube.com/watch?v=abcd',
          fileExt: 'mp3'
        }
      }), async ({ handleDownloadMp3Command }) => {
        await handleDownloadMp3Command(client, message, chatId, 'https://youtube.com/watch?v=abcd');
      });

      const textMessages = client.sent.filter(entry => entry.type === 'text');
      const fileMessages = client.sent.filter(entry => entry.type === 'file');

      assertEqual(textMessages.length, 2, 'Should send two text updates (start + success)');
      assert(textMessages[0].payload.includes('Baixando áudio'), 'First message should mention download start');
      assert(textMessages[1].payload.includes('Áudio pronto'), 'Success message should confirm completion');

      assertEqual(fileMessages.length, 1, 'Should send one audio file');
      const filePayload = fileMessages[0].payload;
      assert(filePayload.filePath.endsWith('.mp3'), 'Saved file should use mp3 extension (fallback)');
      assert(path.dirname(filePayload.filePath) === MEDIA_DIR, 'Audio should be stored in bot/media directory');

      const extraArgs = filePayload.extraArgs || [];
      const optionsArg = extraArgs[extraArgs.length - 1];
      assert(optionsArg && optionsArg.mimetype === 'audio/mpeg', 'sendFile should receive audio/mpeg mimetype option');
      assert(optionsArg && optionsArg.asDocument === true, 'sendFile should send as document when conversion fails');

      try {
        const newFiles = fs.readdirSync(MEDIA_DIR).filter(name => !existingFiles.has(name));
        newFiles.forEach(name => {
          const target = path.join(MEDIA_DIR, name);
          if (fs.existsSync(target)) {
            fs.unlinkSync(target);
          }
        });
      } finally {
        if (fs.existsSync(tempDir)) {
          fs.readdirSync(tempDir).forEach(file => {
            const target = path.join(tempDir, file);
            if (fs.existsSync(target)) {
              fs.unlinkSync(target);
            }
          });
          fs.rmdirSync(tempDir, { recursive: false });
        }
      }
    }
  }
];

if (require.main === module) {
  runTestSuite('Download MP3 Command Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
