#!/usr/bin/env node
/**
 * Unit tests for bot/stickers path resolution on legacy media paths
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { runTestSuite, assertEqual } = require('../helpers/testUtils');
const { MockBaileysClient } = require('../helpers/mockBaileysClient');

const STICKERS_MODULE_PATH = path.resolve(__dirname, '..', '..', 'src', 'bot', 'stickers.js');
const STICKER_MODULE_ID = require.resolve('../../src/utils/stickerFormatter');

function withStickersModule(overrides, fn) {
  const cacheSnapshots = new Map();

  const setCache = (moduleId, exportsValue) => {
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
    if (overrides.stickerModule) {
      setCache(STICKER_MODULE_ID, overrides.stickerModule);
    }

    cacheSnapshots.set(STICKERS_MODULE_PATH, require.cache[STICKERS_MODULE_PATH]);
    delete require.cache[STICKERS_MODULE_PATH];

    const stickersModule = require(STICKERS_MODULE_PATH);
    return fn(stickersModule);
  } finally {
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
    constructor(filePath) {
      this.filePath = filePath;
    }
    async build() {
      return Buffer.from(`webp:${this.filePath}`);
    }
  }
  return {
    Sticker: StickerStub,
    StickerTypes: { FULL: 'full' }
  };
}

const tests = [
  {
    name: 'sendStickerForMediaRecord resolves legacy old-stickers paths',
    fn: async () => {
      const repoRoot = path.resolve(__dirname, '..', '..');
      const storageOldStickersDir = path.join(repoRoot, 'storage', 'media', 'old-stickers');
      const legacyOldStickersDir = path.join(repoRoot, 'media', 'old-stickers');
      const fileName = `legacy-bot-sticker-${Date.now()}.png`;
      const storagePath = path.join(storageOldStickersDir, fileName);
      const legacyPath = path.join(legacyOldStickersDir, fileName);

      fs.mkdirSync(storageOldStickersDir, { recursive: true });
      fs.writeFileSync(storagePath, Buffer.from('fake image content'));

      try {
        await withStickersModule({ stickerModule: createStickerStub() }, async ({ sendStickerForMediaRecord }) => {
          const calls = [];
          const client = new MockBaileysClient();
          client.sendRawWebpAsSticker = async (chatId, dataUrl, options = {}) => {
            calls.push({ chatId, dataUrl, options });
            return { messageId: 'msg-123' };
          };
          await sendStickerForMediaRecord(client, 'chat-legacy', {
            id: 123,
            file_path: legacyPath,
            mimetype: 'image/png'
          });

          assertEqual(calls.length, 1, 'Legacy old-stickers path should send one sticker');
          assertEqual(calls[0].chatId, 'chat-legacy', 'Sticker should target the requested chat');
        });
      } finally {
        try { fs.unlinkSync(storagePath); } catch {}
      }
    }
  }
];

if (require.main === module) {
  runTestSuite('Bot Stickers Path Resolution Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
