#!/usr/bin/env node
/**
 * Unit tests for media sending helpers using the MockBaileysClient
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { runTestSuite, assert, assertEqual } = require('../helpers/testUtils');
const { MockBaileysClient } = require('../helpers/mockBaileysClient');

const MEDIA_MODULE_PATH = path.resolve(__dirname, '..', '..', 'commands/media.js');
const STICKER_MODULE_ID = (() => {
  try {
    return require.resolve('wa-sticker-formatter');
  } catch {
    return null;
  }
})();
const GIF_DETECTION_PATH = path.resolve(__dirname, '..', '..', 'utils/gifDetection.js');

function withMediaModule(overrides, fn) {
  const cacheSnapshots = new Map();

  const setCache = (moduleId, exportsValue) => {
    if (!moduleId) return;
    cacheSnapshots.set(moduleId, require.cache[moduleId]);
    if (exportsValue === null) {
      delete require.cache[moduleId];
    } else {
      require.cache[moduleId] = {
        id: moduleId,
        filename: moduleId,
        loaded: true,
        exports: exportsValue
      };
    }
  };

  try {
    if (overrides.stickerModule && STICKER_MODULE_ID) {
      setCache(STICKER_MODULE_ID, overrides.stickerModule);
    } else if (STICKER_MODULE_ID) {
      setCache(STICKER_MODULE_ID, null);
    }

    if (overrides.gifDetection) {
      setCache(GIF_DETECTION_PATH, overrides.gifDetection);
    } else {
      setCache(GIF_DETECTION_PATH, null);
    }

    cacheSnapshots.set(MEDIA_MODULE_PATH, require.cache[MEDIA_MODULE_PATH]);
    delete require.cache[MEDIA_MODULE_PATH];

    const mediaModule = require(MEDIA_MODULE_PATH);
    return fn(mediaModule);
  } finally {
    // Restore mutated caches
    for (const [moduleId, snapshot] of cacheSnapshots.entries()) {
      if (!moduleId) continue;
      if (snapshot) {
        require.cache[moduleId] = snapshot;
      } else {
        delete require.cache[moduleId];
      }
    }
  }
}

function createStickerStub() {
  class StickerStub {
    constructor(filePath, options) {
      this.filePath = filePath;
      this.options = options;
    }
    async build() {
      return Buffer.from(`webp:${this.filePath}`);
    }
  }
  return {
    Sticker: StickerStub,
    StickerTypes: { FULL: 'FULL' }
  };
}

const tests = [
  {
    name: 'sendMediaByType sends GIF as animated sticker',
    fn: async () => {
      await withMediaModule({ stickerModule: createStickerStub() }, async ({ sendMediaByType }) => {
        const client = new MockBaileysClient();
        await sendMediaByType(client, 'chat-1', { file_path: '/tmp/test.gif', mimetype: 'image/gif' });

        assertEqual(client.sent.length, 1, 'One send operation should be recorded');
        assertEqual(client.sent[0].type, 'sticker-mp4', 'GIF should use sendMp4AsSticker');
      });
    }
  },
  {
    name: 'sendMediaByType falls back to sendFile for videos',
    fn: async () => {
      await withMediaModule({ stickerModule: createStickerStub() }, async ({ sendMediaByType }) => {
        const client = new MockBaileysClient();
        await sendMediaByType(client, 'chat-vid', { file_path: '/tmp/video.mp4', mimetype: 'video/mp4' });

        assertEqual(client.sent.length, 1, 'One send operation should be recorded for video');
        assertEqual(client.sent[0].type, 'file', 'Video should be sent as a file');
      });
    }
  },
  {
    name: 'sendMediaByType uses wa-sticker-formatter for images when available',
    fn: async () => {
      await withMediaModule({ stickerModule: createStickerStub() }, async ({ sendMediaByType }) => {
        const client = new MockBaileysClient();
        await sendMediaByType(client, 'chat-img', { file_path: '/tmp/image.png', mimetype: 'image/png' });

        assertEqual(client.sent.length, 1, 'Image should trigger one send operation');
        assertEqual(client.sent[0].type, 'sticker-raw', 'Image should be sent as raw webp via wa-sticker-formatter');
      });
    }
  },
  {
    name: 'sendMediaAsOriginal throws when file does not exist',
    fn: async () => {
      await withMediaModule({ stickerModule: createStickerStub(), gifDetection: { isGifLikeVideo: async () => false } }, async ({ sendMediaAsOriginal }) => {
        const client = new MockBaileysClient();
        let errorCaught = null;
        try {
          await sendMediaAsOriginal(client, 'chat-missing', { file_path: '/path/does/not/exist.webp', mimetype: 'image/webp' });
        } catch (error) {
          errorCaught = error;
        }
        assert(errorCaught, 'An error should be thrown for missing files');
        assertEqual(client.sent.length, 0, 'No media should be sent when file is missing');
      });
    }
  },
  {
    name: 'sendMediaAsOriginal sends GIF via sendMp4AsSticker',
    fn: async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-test-'));
      const gifPath = path.join(tempDir, 'dummy.gif');
      fs.writeFileSync(gifPath, Buffer.from('GIF89a'));

      try {
        await withMediaModule({ stickerModule: createStickerStub(), gifDetection: { isGifLikeVideo: async () => false } }, async ({ sendMediaAsOriginal }) => {
          const client = new MockBaileysClient();
          await sendMediaAsOriginal(client, 'chat-gif', { file_path: gifPath, mimetype: 'image/gif' });

          assertEqual(client.sent.length, 1, 'One send operation expected for GIF');
          assertEqual(client.sent[0].type, 'sticker-mp4', 'GIF should be sent via sendMp4AsSticker');
        });
      } finally {
        try { fs.unlinkSync(gifPath); } catch {}
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      }
    }
  }
];

if (require.main === module) {
  runTestSuite('Media Sending Helper Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
