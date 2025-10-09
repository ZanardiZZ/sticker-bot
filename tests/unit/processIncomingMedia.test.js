#!/usr/bin/env node
/**
 * Unit tests for processIncomingMedia using mockable dependencies
 */

const path = require('path');
const fs = require('fs');
const Module = require('module');
const { runTestSuite, assert, assertEqual } = require('../helpers/testUtils');
const { MockBaileysClient } = require('../helpers/mockBaileysClient');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PROCESSOR_PATH = path.join(PROJECT_ROOT, 'bot', 'mediaProcessor.js');
const MAX_STICKER_BYTES = 1024 * 1024;

function resolveModule(relativePath) {
  return require.resolve(path.join(PROJECT_ROOT, relativePath));
}

function createSharpStub() {
  return function sharp(filePath) {
    return new SharpMock(filePath);
  };
}

function createFfmpegStub(buffers) {
  const queue = buffers.slice();
  const fallback = buffers.length > 0 ? buffers[buffers.length - 1] : Buffer.alloc(0);

  const stub = function ffmpegStub() {
    const handlers = { end: null, error: null };

    return {
      outputOptions() { return this; },
      toFormat() { return this; },
      save(outPath) {
        setTimeout(() => {
          const buffer = queue.length > 0 ? queue.shift() : fallback;
          if (!buffer || buffer.length === 0) {
            if (handlers.error) handlers.error(new Error('ffmpeg_no_output'));
            return;
          }
          fs.writeFileSync(outPath, buffer);
          if (handlers.end) handlers.end();
        }, 0);
        return this;
      },
      on(event, handler) {
        if (event === 'end') handlers.end = handler;
        if (event === 'error') handlers.error = handler;
        return this;
      }
    };
  };

  stub.setFfmpegPath = () => {};

  return stub;
}

class SharpMock {
  constructor(filePath) {
    this.filePath = filePath;
    this._lastOp = null;
  }
  png() {
    this._lastOp = 'png';
    return this;
  }
  webp() {
    this._lastOp = 'webp';
    return this;
  }
  extend() { return this; }
  resize() { return this; }
  metadata() {
    return Promise.resolve({ width: 512, height: 512 });
  }
  toBuffer() {
    const suffix = this._lastOp === 'png' ? 'png' : 'webp';
    return Promise.resolve(Buffer.from(`${suffix}:${path.basename(this.filePath)}`));
  }
}

function withProcessIncomingMedia(overrides, testFn) {
  const cacheSnapshots = new Map();
  const mockModule = (moduleId, exportsValue) => {
    cacheSnapshots.set(moduleId, require.cache[moduleId]);
    if (exportsValue === null) {
      delete require.cache[moduleId];
    } else {
      const stubModule = new Module(moduleId);
      stubModule.filename = moduleId;
      stubModule.paths = Module._nodeModulePaths(path.dirname(moduleId));
      stubModule.loaded = true;
      stubModule.exports = exportsValue;
      require.cache[moduleId] = stubModule;
    }
  };

  const defaultModules = {
    'utils/typingIndicator.js': { withTyping: async (client, chatId, fn) => fn() },
    'services/nsfwFilter.js': { isNSFW: async () => false },
    'services/nsfwVideoFilter.js': { isVideoNSFW: async () => false },
    'services/ai.js': {
      getAiAnnotations: async () => ({ description: 'ai-desc', tags: ['tag-ai'] }),
      getAiAnnotationsFromPrompt: async () => ({ tags: [] }),
      getAiAnnotationsForGif: async () => ({ description: 'gif-desc', tags: ['gif-tag'] }),
      transcribeAudioBuffer: async () => ''
    },
    'services/videoProcessor.js': {
      processVideo: async () => ({ description: 'video-desc', tags: ['video-tag'] }),
      processGif: async () => ({ description: 'gif-desc', tags: ['gif-tag'] }),
      processAnimatedWebp: async () => ({ description: 'webp-desc', tags: ['webp-tag'] })
    },
    'commands.js': { forceMap: {}, MAX_TAGS_LENGTH: 500, clearDescriptionCmds: [] },
    'utils/messageUtils.js': {
      cleanDescriptionTags: (description, tags) => ({
        description: description || '',
        tags: Array.isArray(tags)
          ? tags
          : typeof tags === 'string' && tags.trim().length
            ? tags.split(',').map(t => t.trim()).filter(Boolean)
            : []
      })
    },
    'utils/responseMessage.js': { generateResponseMessage: () => 'BASE\n' },
    'bot/stickers.js': {
      isAnimatedWebpBuffer: () => false,
      sendStickerForMediaRecord: async () => {}
    },
    'utils/gifDetection.js': { isGifLikeVideo: async () => false },
    'sharp': createSharpStub()
  };

  const modulesToMock = { ...defaultModules, ...overrides.modules };

  let moduleExports = null;
  try {
    for (const [relative, exportsValue] of Object.entries(modulesToMock)) {
      const moduleId =
        relative === 'sharp' ? require.resolve('sharp') :
        resolveModule(relative);
      mockModule(moduleId, exportsValue);
    }

    cacheSnapshots.set(PROCESSOR_PATH, require.cache[PROCESSOR_PATH]);
    delete require.cache[PROCESSOR_PATH];
    moduleExports = require(PROCESSOR_PATH);

    return testFn(moduleExports.processIncomingMedia, moduleExports);
  } finally {
    if (moduleExports && typeof moduleExports.__setFfmpegFactory === 'function') {
      moduleExports.__setFfmpegFactory(null);
    }
    for (const [moduleId, snapshot] of cacheSnapshots.entries()) {
      if (snapshot) {
        require.cache[moduleId] = snapshot;
      } else {
        delete require.cache[moduleId];
      }
    }

  }
}

function cleanTempArtifacts() {
  const tempDir = path.join(PROJECT_ROOT, 'temp');
  if (fs.existsSync(tempDir)) {
    for (const name of fs.readdirSync(tempDir)) {
      if (name.startsWith('media-tmp-')) {
        try {
          fs.unlinkSync(path.join(tempDir, name));
        } catch {}
      }
    }
  }
}

const tests = [
  {
    name: 'Duplicate hash triggers safe reply without saving',
    fn: async () => {
      const safeReplies = [];
      const saveMediaCalls = [];
      const downloadCalls = [];

      await withProcessIncomingMedia({
        modules: {
          'database/index.js': {
            getMD5: () => 'md5-dup',
            getHashVisual: async () => 'hash-dup',
            findByHashVisual: async () => ({ id: 999 }),
            findById: async () => null,
            saveMedia: async (payload) => { saveMediaCalls.push(payload); return 1; },
            getTagsForMedia: async () => [],
            updateMediaDescription: async () => {},
            updateMediaTags: async () => {}
          },
          'utils/mediaDownload.js': {
            downloadMediaForMessage: async (client, message) => {
              downloadCalls.push({ client, message });
              return { buffer: Buffer.from('duplicate-image'), mimetype: 'image/png' };
            }
          },
          'utils/safeMessaging.js': {
            safeReply: async (client, chatId, text, messageId) => {
              safeReplies.push({ chatId, text, messageId });
            }
          }
        }
      }, async (processIncomingMedia) => {
        const client = new MockBaileysClient();
        const message = {
          from: '123@c.us',
          id: 'msg-dup',
          mimetype: 'image/png',
          sender: { id: 'user@c.us' }
        };

        await processIncomingMedia(client, message);
      });

      assertEqual(downloadCalls.length, 1, 'Media should be downloaded once');
      assertEqual(saveMediaCalls.length, 0, 'Duplicate should not call saveMedia');
      assertEqual(safeReplies.length, 1, 'Duplicate path should send a reply');
      assert(safeReplies[0].text.includes('Mídia visualmente semelhante'), 'Reply should mention duplicate media');

      cleanTempArtifacts();
    }
  },
  {
    name: 'Successful image processing saves media and replies with details',
    fn: async () => {
      const safeReplies = [];
      const saveMediaCalls = [];
      const downloadCalls = [];
      const findByIdCalls = [];

      const mediaDir = path.join(PROJECT_ROOT, 'media');
      const existingFiles = new Set(fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : []);

      await withProcessIncomingMedia({
        modules: {
          'database/index.js': {
            getMD5: () => 'md5-new',
            getHashVisual: async () => 'hash-new',
            findByHashVisual: async () => null,
            findById: async (id) => {
              findByIdCalls.push(id);
              return { id, description: 'saved-desc', file_path: path.join(PROJECT_ROOT, 'media', `media-saved-${id}.webp`), mimetype: 'image/webp' };
            },
            saveMedia: async (payload) => {
              saveMediaCalls.push(payload);
              return 55;
            },
            getTagsForMedia: async () => ['tag1', 'tag2'],
            updateMediaDescription: async () => {},
            updateMediaTags: async () => {}
          },
          'utils/mediaDownload.js': {
            downloadMediaForMessage: async (client, message) => {
              downloadCalls.push({ client, message });
              return { buffer: Buffer.from('new-image-data'), mimetype: 'image/png' };
            }
          },
          'utils/safeMessaging.js': {
            safeReply: async (client, chatId, text, messageId) => {
              safeReplies.push({ chatId, text, messageId });
            }
          }
        }
      }, async (processIncomingMedia) => {
        const client = new MockBaileysClient();
        const message = {
          from: '987@c.us',
          id: 'msg-new',
          mimetype: 'image/png',
          sender: { id: 'author@c.us' }
        };

        await processIncomingMedia(client, message);
      });

      assertEqual(downloadCalls.length, 1, 'Media should be downloaded once');
      assertEqual(saveMediaCalls.length, 1, 'New media should be saved');
      const savedPayload = saveMediaCalls[0];
      assertEqual(savedPayload.chatId, '987@c.us', 'chatId should be stored');
      assertEqual(savedPayload.mimetype, 'image/webp', 'mimetype should be converted to webp');
      assertEqual(savedPayload.description, 'ai-desc', 'description should come from AI annotations');
      assertEqual(savedPayload.tags, 'tag-ai', 'tags should be stored as comma-separated string');
      assertEqual(findByIdCalls[0], 55, 'fetch saved media by returned ID');

      assertEqual(safeReplies.length, 1, 'Should reply once after saving media');
      const replyText = safeReplies[0].text;
      assert(replyText.includes('BASE'), 'Reply should include base response message');
      assert(replyText.includes('saved-desc'), 'Reply should include cleaned description');
      assert(replyText.includes('#tag1 #tag2'), 'Reply should list tags with hash prefix');
      assert(replyText.includes('🆔 55'), 'Reply should include media ID');

      if (fs.existsSync(mediaDir)) {
        const currentFiles = fs.readdirSync(mediaDir);
        for (const fileName of currentFiles) {
          if (!existingFiles.has(fileName) && fileName.startsWith('media-')) {
            try {
              fs.unlinkSync(path.join(mediaDir, fileName));
            } catch (err) {
              console.warn('Falha ao limpar arquivo de teste:', err.message);
            }
          }
        }
      }

      cleanTempArtifacts();
    }
  },
  {
    name: 'NSFW image skips AI enrichment but still saves with nsfw flag',
    fn: async () => {
      const safeReplies = [];
      const saveMediaCalls = [];
      const downloadCalls = [];
      let aiCalled = false;

      await withProcessIncomingMedia({
        modules: {
          'database/index.js': {
            getMD5: () => 'md5-nsfw',
            getHashVisual: async () => 'hash-nsfw',
            findByHashVisual: async () => null,
            findById: async (id) => ({ id, description: '', file_path: path.join(PROJECT_ROOT, 'media', `media-nsfw-${id}.webp`), mimetype: 'image/webp' }),
            saveMedia: async (payload) => { saveMediaCalls.push(payload); return 77; },
            getTagsForMedia: async () => [],
            updateMediaDescription: async () => {},
            updateMediaTags: async () => {}
          },
          'utils/mediaDownload.js': {
            downloadMediaForMessage: async () => {
              downloadCalls.push(true);
              return { buffer: Buffer.from('nsfw-image-data'), mimetype: 'image/png' };
            }
          },
          'services/nsfwFilter.js': {
            isNSFW: async () => true
          },
          'services/ai.js': {
            getAiAnnotations: async () => { aiCalled = true; return { description: 'should-not-run', tags: [] }; },
            getAiAnnotationsFromPrompt: async () => ({}),
            getAiAnnotationsForGif: async () => ({}),
            transcribeAudioBuffer: async () => ''
          },
          'utils/safeMessaging.js': {
            safeReply: async (client, chatId, text, messageId) => {
              safeReplies.push({ chatId, text, messageId });
            }
          },
          'bot/stickers.js': {
            isAnimatedWebpBuffer: () => false,
            sendStickerForMediaRecord: async () => {}
          }
        }
      }, async (processIncomingMedia) => {
        const client = new MockBaileysClient();
        const message = {
          from: 'nsfw@c.us',
          id: 'msg-nsfw',
          mimetype: 'image/png',
          sender: { id: 'user@c.us' }
        };

        await processIncomingMedia(client, message);
      });

      assertEqual(downloadCalls.length, 1, 'Media should be downloaded once');
      assertEqual(saveMediaCalls.length, 1, 'NSFW media should still be saved');
      const payload = saveMediaCalls[0];
      assertEqual(payload.nsfw, 1, 'NSFW flag should be persisted');
      assertEqual(payload.description, '', 'Description should remain empty for NSFW');
      assertEqual(payload.tags, '', 'Tags should remain empty for NSFW');
      assert(!aiCalled, 'AI annotation should not run when NSFW detected');
      assertEqual(safeReplies.length, 1, 'NSFW flow should still reply');
      assert(safeReplies[0].text.includes('BASE'), 'Reply should include generated base message');

      cleanTempArtifacts();
    }
  },
  {
    name: 'Video media processed with GIF-like conversion and sticker response',
    fn: async () => {
      const safeReplies = [];
      const saveMediaCalls = [];
      const downloadCalls = [];
      const findByIdCalls = [];
      const stickerCalls = [];
      let processVideoCalled = 0;
      let processGifCalled = 0;
      let videoNsfwChecks = 0;

      const mediaDir = path.join(PROJECT_ROOT, 'media');
      const existingFiles = new Set(fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : []);

      await withProcessIncomingMedia({
        modules: {
          'database/index.js': {
            getMD5: () => 'md5-video',
            getHashVisual: async () => 'hash-video',
            findByHashVisual: async () => null,
            findById: async (id) => {
              findByIdCalls.push(id);
              return { id, description: 'video-saved', file_path: path.join(PROJECT_ROOT, 'media', `media-video-${id}.webp`), mimetype: 'image/webp' };
            },
            saveMedia: async (payload) => {
              saveMediaCalls.push(payload);
              return 88;
            },
            getTagsForMedia: async () => ['giflike', 'converted'],
            updateMediaDescription: async () => {},
            updateMediaTags: async () => {}
          },
          'utils/mediaDownload.js': {
            downloadMediaForMessage: async () => {
              downloadCalls.push(true);
              const videoPath = path.join(PROJECT_ROOT, 'tests/fixtures/test-video.mp4');
              return { buffer: fs.readFileSync(videoPath), mimetype: 'video/mp4' };
            }
          },
          'services/videoProcessor.js': {
            processVideo: async () => {
              processVideoCalled++;
              return { description: 'video-desc', text: 'captions', tags: ['video-tag'] };
            },
            processGif: async () => {
              processGifCalled++;
              return { description: 'gif-desc', tags: ['gif-tag'] };
            },
            processAnimatedWebp: async () => ({ description: 'webp-desc', tags: ['webp-tag'] })
          },
          'services/nsfwVideoFilter.js': {
            isVideoNSFW: async () => {
              videoNsfwChecks++;
              return false;
            }
          },
          'services/nsfwFilter.js': {
            isNSFW: async () => false
          },
          'services/ai.js': {
            getAiAnnotations: async () => ({ description: 'ai-desc', tags: ['tag-ai'] }),
            getAiAnnotationsFromPrompt: async () => ({}),
            getAiAnnotationsForGif: async () => ({ description: 'gif-desc', tags: ['gif-tag'] }),
            transcribeAudioBuffer: async () => ''
          },
          'bot/stickers.js': {
            isAnimatedWebpBuffer: () => false,
            sendStickerForMediaRecord: async (client, chatId, media) => {
              stickerCalls.push({ chatId, mediaId: media.id });
            }
          },
          'utils/gifDetection.js': {
            isGifLikeVideo: async () => true
          },
          'utils/safeMessaging.js': {
            safeReply: async (client, chatId, text, messageId) => {
              safeReplies.push({ chatId, text, messageId });
            }
          }
        }
      }, async (processIncomingMedia, moduleExports) => {
        const client = new MockBaileysClient();
        const message = {
          from: 'video@c.us',
          id: 'msg-video',
          mimetype: 'video/mp4',
          sender: { id: 'author@c.us' }
        };

        if (moduleExports && typeof moduleExports.__setFfmpegFactory === 'function') {
          const ffmpegStubModule = createFfmpegStub([
            Buffer.alloc(MAX_STICKER_BYTES + 200000),
            Buffer.alloc(MAX_STICKER_BYTES - 50000)
          ]);
          moduleExports.__setFfmpegFactory(() => ffmpegStubModule);
        }

        const originalReadFileSync = fs.readFileSync;
        fs.readFileSync = (pathToRead, ...args) => {
          if (typeof pathToRead === 'string' && pathToRead.endsWith('.webp')) {
            return Buffer.alloc(MAX_STICKER_BYTES + 200000);
          }
          return originalReadFileSync(pathToRead, ...args);
        };

        try {
          await processIncomingMedia(client, message);
        } finally {
          fs.readFileSync = originalReadFileSync;
        }
      });

      assertEqual(downloadCalls.length, 1, 'Video should be downloaded once');
      assertEqual(processVideoCalled, 0, 'Video processor should not run for gif-like videos');
      assertEqual(processGifCalled, 1, 'Gif-like videos should use GIF processor');
      assertEqual(videoNsfwChecks, 0, 'Video NSFW check should not run after conversion to webp');
      assertEqual(saveMediaCalls.length, 1, 'Converted video should be saved');
      const payload = saveMediaCalls[0];
      assertEqual(payload.mimetype, 'image/webp', 'Converted media should be stored as webp');
      assert(payload.description.includes('gif-desc'), 'Gif-like description should derive from GIF processor');
      assertEqual(payload.tags, 'gif-tag', 'Gif-like tags should join into string');
      assertEqual(findByIdCalls[0], 88, 'Should fetch saved media by ID');
      assertEqual(stickerCalls.length, 1, 'Gif-like conversion should send sticker response before text');
      assertEqual(safeReplies.length, 2, 'Gif-like flow should notify compression and send final reply');
      const [notice, reply] = safeReplies.map((entry) => entry.text);
      assert(notice.toLowerCase().includes('compactando'), 'Compression notice should mention compactação');
      assert(reply.includes('#giflike #converted'), 'Reply should include tag list');
      assert(reply.includes('🆔 88'), 'Reply should include media ID');

      if (fs.existsSync(mediaDir)) {
        const currentFiles = fs.readdirSync(mediaDir);
        for (const fileName of currentFiles) {
          if (!existingFiles.has(fileName) && fileName.startsWith('media-')) {
            try {
              fs.unlinkSync(path.join(mediaDir, fileName));
            } catch {}
          }
        }
      }

      cleanTempArtifacts();
    }
  },
  {
    name: 'Audio media is transcribed and tagged',
    fn: async () => {
      const safeReplies = [];
      const saveMediaCalls = [];
      const downloadCalls = [];
      const findByIdCalls = [];

      await withProcessIncomingMedia({
        modules: {
          'database/index.js': {
            getMD5: () => 'md5-audio',
            getHashVisual: async () => 'hash-audio',
            findByHashVisual: async () => null,
            findById: async (id) => {
              findByIdCalls.push(id);
              return {
                id,
                description: 'Audio transcription',
                file_path: path.join(PROJECT_ROOT, 'media', `media-audio-${id}.ogg`),
                mimetype: 'audio/ogg'
              };
            },
            saveMedia: async (payload) => {
              saveMediaCalls.push(payload);
              return 99;
            },
            getTagsForMedia: async () => ['spoken', 'note'],
            updateMediaDescription: async () => {},
            updateMediaTags: async () => {}
          },
          'utils/mediaDownload.js': {
            downloadMediaForMessage: async () => {
              downloadCalls.push(true);
              return { buffer: Buffer.from('audio-bytes'), mimetype: 'audio/ogg' };
            }
          },
          'services/ai.js': {
            getAiAnnotations: async () => ({ description: 'ai-desc', tags: ['tag-ai'] }),
            getAiAnnotationsFromPrompt: async () => ({ tags: ['spoken', 'note'] }),
            getAiAnnotationsForGif: async () => ({ description: 'gif-desc', tags: ['gif-tag'] }),
            transcribeAudioBuffer: async () => 'Audio transcription'
          },
          'utils/safeMessaging.js': {
            safeReply: async (client, chatId, text, messageId) => {
              safeReplies.push({ chatId, text, messageId });
            }
          },
          'bot/stickers.js': {
            isAnimatedWebpBuffer: () => false,
            sendStickerForMediaRecord: async () => {}
          }
        }
      }, async (processIncomingMedia) => {
        const client = new MockBaileysClient();
        const message = {
          from: 'audio@c.us',
          id: 'msg-audio',
          mimetype: 'audio/ogg',
          sender: { id: 'speaker@c.us' }
        };

        await processIncomingMedia(client, message);
      });

      assertEqual(downloadCalls.length, 1, 'Audio should be downloaded once');
      assertEqual(saveMediaCalls.length, 1, 'Audio media should be saved');
      const payload = saveMediaCalls[0];
      assertEqual(payload.mimetype, 'audio/ogg', 'Audio should retain original mimetype');
      assertEqual(payload.description, 'Audio transcription', 'Description should use transcription result');
      assertEqual(payload.tags, 'spoken,note', 'Audio tags should be persisted as comma string');
      assertEqual(findByIdCalls[0], 99, 'Should fetch saved audio media by ID');
      assertEqual(safeReplies.length, 1, 'Audio flow should reply once');
      const reply = safeReplies[0].text;
      assert(reply.includes('Audio transcription'), 'Reply should include transcription text');
      assert(reply.includes('#spoken #note'), 'Reply should include formatted tags');

      cleanTempArtifacts();
    }
  },
  {
    name: 'Audio transcription failures still respond gracefully',
    fn: async () => {
      const safeReplies = [];
      const saveMediaCalls = [];
      const downloadCalls = [];

      await withProcessIncomingMedia({
        modules: {
          'database/index.js': {
            getMD5: () => 'md5-audio-fail',
            getHashVisual: async () => 'hash-audio-fail',
            findByHashVisual: async () => null,
            findById: async (id) => ({ id, description: '', file_path: path.join(PROJECT_ROOT, 'media', `media-audio-fail-${id}.ogg`), mimetype: 'audio/ogg' }),
            saveMedia: async (payload) => { saveMediaCalls.push(payload); return 111; },
            getTagsForMedia: async () => [],
            updateMediaDescription: async () => {},
            updateMediaTags: async () => {}
          },
          'utils/mediaDownload.js': {
            downloadMediaForMessage: async () => {
              downloadCalls.push(true);
              return { buffer: Buffer.from('audio-bytes-error'), mimetype: 'audio/ogg' };
            }
          },
          'services/ai.js': {
            getAiAnnotations: async () => ({ description: 'ai-desc', tags: ['tag-ai'] }),
            getAiAnnotationsFromPrompt: async () => ({ tags: [] }),
            getAiAnnotationsForGif: async () => ({ description: 'gif-desc', tags: ['gif-tag'] }),
            transcribeAudioBuffer: async () => { throw new Error('transcription failed'); }
          },
          'utils/safeMessaging.js': {
            safeReply: async (client, chatId, text, messageId) => {
              safeReplies.push({ chatId, text, messageId });
            }
          },
          'bot/stickers.js': {
            isAnimatedWebpBuffer: () => false,
            sendStickerForMediaRecord: async () => {}
          }
        }
      }, async (processIncomingMedia) => {
        const client = new MockBaileysClient();
        const message = {
          from: 'audio-error@c.us',
          id: 'msg-audio-error',
          mimetype: 'audio/ogg',
          sender: { id: 'speaker@c.us' }
        };

        await processIncomingMedia(client, message);
      });

      assertEqual(downloadCalls.length, 1, 'Audio should be downloaded once even when transcription fails');
      assertEqual(saveMediaCalls.length, 1, 'Audio should still be saved even if transcription fails');
      const payload = saveMediaCalls[0];
      assertEqual(payload.description, '', 'Failed transcription should result in empty description');
      assertEqual(payload.tags, '', 'Failed transcription should result in empty tags');
      assertEqual(safeReplies.length, 1, 'User should still receive a reply');
      assert(safeReplies[0].text.includes('BASE'), 'Reply should fall back to base messaging even on error');

      cleanTempArtifacts();
    }
  }
];

if (require.main === module) {
  runTestSuite('Process Incoming Media Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
