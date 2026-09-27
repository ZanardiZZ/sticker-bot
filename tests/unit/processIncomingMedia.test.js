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
const PROCESSOR_PATH = path.join(PROJECT_ROOT, 'src', 'bot', 'mediaProcessor.js');
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
  clone() { return new SharpMock(this.filePath); }
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
    'src/utils/typingIndicator.js': { withTyping: async (client, chatId, fn) => fn() },
    'src/services/nsfwFilter.js': { isNSFW: async () => false },
    'src/services/nsfwVideoFilter.js': { isVideoNSFW: async () => false },
    'src/services/ai.js': {
      getAiAnnotations: async () => ({ description: 'ai-desc', tags: ['tag-ai'] }),
      getAiAnnotationsFromPrompt: async () => ({ tags: [] }),
      getAiAnnotationsForGif: async () => ({ description: 'gif-desc', tags: ['gif-tag'] }),
      getTagsFromTextPrompt: async () => ({ tags: [] }),
      transcribeAudioBuffer: async () => ''
    },
    'src/services/videoProcessor.js': {
      processVideo: async () => ({ description: 'video-desc', tags: ['video-tag'] }),
      processGif: async () => ({ description: 'gif-desc', tags: ['gif-tag'] }),
      processAnimatedWebp: async () => ({ description: 'webp-desc', tags: ['webp-tag'] })
    },
    'src/commands/index.js': { forceMap: {}, MAX_TAGS_LENGTH: 500, clearDescriptionCmds: [] },
    'src/utils/messageUtils.js': {
      cleanDescriptionTags: (description, tags) => ({
        description: description || '',
        tags: Array.isArray(tags)
          ? tags
          : typeof tags === 'string' && tags.trim().length
            ? tags.split(',').map(t => t.trim()).filter(Boolean)
            : []
      })
    },
    'src/utils/responseMessage.js': { generateResponseMessage: () => 'BASE\n' },
    'src/bot/stickers.js': {
      isAnimatedWebpBuffer: () => false,
      sendStickerForMediaRecord: async () => {}
    },
    'src/utils/gifDetection.js': { isGifLikeVideo: async () => false },
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
  const tempDir = path.join(PROJECT_ROOT, 'storage', 'temp', 'bot');
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
          'src/database/index.js': {
            getMD5: () => 'md5-dup',
            getHashVisual: async () => 'hash-dup',
            findByHashVisual: async () => ({ id: 999 }),
            findById: async () => null,
            saveMedia: async (payload) => { saveMediaCalls.push(payload); return 1; },
            getTagsForMedia: async () => [],
            updateMediaDescription: async () => {},
            updateMediaTags: async () => {}
          },
          'src/utils/mediaDownload.js': {
            downloadMediaForMessage: async (client, message) => {
              downloadCalls.push({ client, message });
              return { buffer: Buffer.from('duplicate-image'), mimetype: 'image/png' };
            }
          },
          'src/utils/safeMessaging.js': {
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

      const mediaDir = path.join(PROJECT_ROOT, 'storage', 'media', 'bot');
      const existingFiles = new Set(fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : []);

      await withProcessIncomingMedia({
        modules: {
          'src/database/index.js': {
            getMD5: () => 'md5-new',
            getHashVisual: async () => 'hash-new',
            findByHashVisual: async () => null,
            findById: async (id) => {
              findByIdCalls.push(id);
              return { id, description: 'saved-desc', file_path: path.join(PROJECT_ROOT, 'storage', 'media', 'bot', `media-saved-${id}.webp`), mimetype: 'image/webp' };
            },
            saveMedia: async (payload) => {
              saveMediaCalls.push(payload);
              return 55;
            },
            getTagsForMedia: async () => ['tag1', 'tag2'],
            updateMediaDescription: async () => {},
            updateMediaTags: async () => {}
          },
          'src/utils/mediaDownload.js': {
            downloadMediaForMessage: async (client, message) => {
              downloadCalls.push({ client, message });
              return { buffer: Buffer.from('new-image-data'), mimetype: 'image/png' };
            }
          },
          'src/services/ai.js': {
            getAiAnnotations: async () => ({
              description: 'ai-desc',
              text: 'TEXTO VISÍVEL',
              tags: ['tag-ai'],
              metadata: {
                visual_action: 'acena para a câmera',
                emotion: 'alegria',
                ocr_text: 'TEXTO VISÍVEL',
                cultural_reference: 'referência de teste',
                usage_intent: 'saudação',
                context_signals: 'ambiente externo'
              }
            }),
            getAiAnnotationsFromPrompt: async () => ({ tags: [] }),
            getAiAnnotationsForGif: async () => ({ description: 'gif-desc', tags: ['gif-tag'] }),
            getTagsFromTextPrompt: async () => ({ tags: [] }),
            transcribeAudioBuffer: async () => ''
          },
          'src/utils/safeMessaging.js': {
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
      assertEqual(savedPayload.description, 'ai-desc', 'public description must remain concise and must not include OCR');
      assertEqual(savedPayload.extractedText, 'TEXTO VISÍVEL', 'OCR should be persisted in its dedicated legacy field');
      assertEqual(savedPayload.metadata.visual_action, 'acena para a câmera', 'visual action should be propagated');
      assertEqual(savedPayload.metadata.emotion, 'alegria', 'emotion should be propagated');
      assertEqual(savedPayload.metadata.ocr_text, 'TEXTO VISÍVEL', 'OCR should be propagated as rich metadata');
      assertEqual(savedPayload.metadata.cultural_reference, 'referência de teste', 'cultural reference should be propagated');
      assertEqual(savedPayload.metadata.usage_intent, 'saudação', 'usage intent should be propagated');
      assertEqual(savedPayload.metadata.context_signals, 'ambiente externo', 'context signals should be propagated');
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
    name: 'GIF-like processing propagates rich metadata without exposing OCR in description',
    fn: async () => {
      const saveMediaCalls = [];
      const mediaDir = path.join(PROJECT_ROOT, 'storage', 'media', 'bot');
      const existingFiles = new Set(fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : []);

      await withProcessIncomingMedia({
        modules: {
          'src/database/index.js': {
            getMD5: () => 'md5-gif-rich',
            getHashVisual: async () => 'hash-gif-rich',
            findByHashVisual: async () => null,
            findById: async (id) => ({ id, description: 'gif público', file_path: path.join(mediaDir, `media-gif-${id}.webp`), mimetype: 'image/webp' }),
            saveMedia: async (payload) => { saveMediaCalls.push(payload); return 56; },
            getTagsForMedia: async () => ['gif'],
            updateMediaDescription: async () => {},
            updateMediaTags: async () => {}
          },
          'src/utils/mediaDownload.js': {
            downloadMediaForMessage: async () => ({ buffer: Buffer.from('gif-rich-data'), mimetype: 'image/gif' })
          },
          'src/services/videoProcessor.js': {
            processVideo: async () => ({}),
            processGif: async () => ({
              description: 'gif público',
              text: 'OCR PRIVADO',
              tags: ['gif'],
              metadata: { visual_action: 'faz sinal positivo', emotion: 'alegria', usage_intent: 'aprovação' }
            }),
            processAnimatedWebp: async () => ({})
          },
          'src/utils/gifDetection.js': { isGifLikeVideo: async () => true },
          'src/utils/safeMessaging.js': { safeReply: async () => {} },
          'src/bot/stickers.js': { isAnimatedWebpBuffer: () => true, sendStickerForMediaRecord: async () => {} }
        }
      }, async (processIncomingMedia, moduleExports) => {
        moduleExports.__setFfmpegFactory(createFfmpegStub([Buffer.from('gif-webp-output')]));
        await processIncomingMedia(new MockBaileysClient(), {
          from: 'gif@c.us',
          id: 'msg-gif-rich',
          mimetype: 'image/gif',
          sender: { id: 'author@c.us' }
        });
      });

      assertEqual(saveMediaCalls.length, 1, 'GIF-like media should be saved');
      const payload = saveMediaCalls[0];
      assertEqual(payload.description, 'gif público', 'public GIF description must not include OCR');
      assertEqual(payload.extractedText, 'OCR PRIVADO', 'GIF OCR should remain separate');
      assertEqual(payload.metadata.visual_action, 'faz sinal positivo');
      assertEqual(payload.metadata.emotion, 'alegria');
      assertEqual(payload.metadata.ocr_text, 'OCR PRIVADO');
      assertEqual(payload.metadata.usage_intent, 'aprovação');

      if (fs.existsSync(mediaDir)) {
        for (const fileName of fs.readdirSync(mediaDir)) {
          if (!existingFiles.has(fileName) && fileName.startsWith('media-')) {
            try { fs.unlinkSync(path.join(mediaDir, fileName)); } catch {}
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
          'src/database/index.js': {
            getMD5: () => 'md5-nsfw',
            getHashVisual: async () => 'hash-nsfw',
            findByHashVisual: async () => null,
            findById: async (id) => ({ id, description: '', file_path: path.join(PROJECT_ROOT, 'storage', 'media', 'bot', `media-nsfw-${id}.webp`), mimetype: 'image/webp' }),
            saveMedia: async (payload) => { saveMediaCalls.push(payload); return 77; },
            getTagsForMedia: async () => [],
            updateMediaDescription: async () => {},
            updateMediaTags: async () => {}
          },
          'src/utils/mediaDownload.js': {
            downloadMediaForMessage: async () => {
              downloadCalls.push(true);
              return { buffer: Buffer.from('nsfw-image-data'), mimetype: 'image/png' };
            }
          },
          'src/services/nsfwFilter.js': {
            isNSFW: async () => true
          },
          'src/services/ai.js': {
            getAiAnnotations: async () => { aiCalled = true; return { description: 'should-not-run', tags: [] }; },
            getAiAnnotationsFromPrompt: async () => ({}),
            getAiAnnotationsForGif: async () => ({}),
            getTagsFromTextPrompt: async () => ({ tags: [] }),
            transcribeAudioBuffer: async () => ''
          },
          'src/utils/safeMessaging.js': {
            safeReply: async (client, chatId, text, messageId) => {
              safeReplies.push({ chatId, text, messageId });
            }
          },
          'src/bot/stickers.js': {
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
    name: 'Animated WebP processing propagates rich metadata without exposing OCR in description',
    fn: async () => {
      const saveMediaCalls = [];
      const mediaDir = path.join(PROJECT_ROOT, 'storage', 'media', 'bot');
      const existingFiles = new Set(fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : []);
      await withProcessIncomingMedia({
        modules: {
          'src/database/index.js': {
            getMD5: () => 'md5-webp-rich', getHashVisual: async () => 'hash-webp-rich', findByHashVisual: async () => null,
            findById: async (id) => ({ id, description: 'sticker público', file_path: path.join(mediaDir, `media-webp-${id}.webp`), mimetype: 'image/webp' }),
            saveMedia: async (payload) => { saveMediaCalls.push(payload); return 58; }, getTagsForMedia: async () => ['sticker'],
            updateMediaDescription: async () => {}, updateMediaTags: async () => {}
          },
          'src/utils/mediaDownload.js': { downloadMediaForMessage: async () => ({ buffer: Buffer.from('webp-rich-data'), mimetype: 'image/webp' }) },
          'src/services/videoProcessor.js': {
            processVideo: async () => ({}), processGif: async () => ({}),
            processAnimatedWebp: async () => ({ description: 'sticker público', text: 'OCR WEBP', tags: ['sticker'], metadata: { visual_action: 'dança', emotion: 'alegria', cultural_reference: 'meme conhecido', usage_intent: 'comemoração', context_signals: 'animação' } })
          },
          'src/utils/safeMessaging.js': { safeReply: async () => {} },
          'src/bot/stickers.js': { isAnimatedWebpBuffer: () => true, sendStickerForMediaRecord: async () => {} },
          'sharp': Object.assign(createSharpStub(), { cache() {} })
        }
      }, async (processIncomingMedia) => {
        await processIncomingMedia(new MockBaileysClient(), { from: 'webp@c.us', id: 'msg-webp-rich', mimetype: 'image/webp', type: 'sticker', isSticker: true, sender: { id: 'author@c.us' } });
      });
      assertEqual(saveMediaCalls.length, 1, 'animated WebP should be saved');
      const payload = saveMediaCalls[0];
      assertEqual(payload.description, 'sticker público');
      assertEqual(payload.extractedText, 'OCR WEBP');
      assertEqual(payload.metadata.visual_action, 'dança');
      assertEqual(payload.metadata.emotion, 'alegria');
      assertEqual(payload.metadata.ocr_text, 'OCR WEBP');
      assertEqual(payload.metadata.cultural_reference, 'meme conhecido');
      assertEqual(payload.metadata.usage_intent, 'comemoração');
      assertEqual(payload.metadata.context_signals, 'animação');
      if (fs.existsSync(mediaDir)) for (const fileName of fs.readdirSync(mediaDir)) if (!existingFiles.has(fileName) && fileName.startsWith('media-')) { try { fs.unlinkSync(path.join(mediaDir, fileName)); } catch {} }
      cleanTempArtifacts();
    }
  },
  {
    name: 'Video processing propagates rich metadata without exposing OCR in description',
    fn: async () => {
      const saveMediaCalls = [];
      const mediaDir = path.join(PROJECT_ROOT, 'storage', 'media', 'bot');
      const existingFiles = new Set(fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : []);
      await withProcessIncomingMedia({
        modules: {
          'src/database/index.js': {
            getMD5: () => 'md5-video-rich', getHashVisual: async () => null,
            findByHashVisual: async () => null,
            findById: async (id) => ({ id, description: 'vídeo público', file_path: path.join(mediaDir, `media-video-${id}.mp4`), mimetype: 'video/mp4' }),
            saveMedia: async (payload) => { saveMediaCalls.push(payload); return 57; },
            getTagsForMedia: async () => ['video'], updateMediaDescription: async () => {}, updateMediaTags: async () => {}
          },
          'src/utils/mediaDownload.js': { downloadMediaForMessage: async () => ({ buffer: Buffer.from('video-rich-data'), mimetype: 'video/mp4' }) },
          'src/services/videoProcessor.js': {
            processVideo: async () => ({ description: 'vídeo público', text: 'OCR VÍDEO', tags: ['video'], metadata: { visual_action: 'corre', emotion: 'entusiasmo', usage_intent: 'comemoração' } }),
            processGif: async () => ({}), processAnimatedWebp: async () => ({})
          },
          'src/utils/gifDetection.js': { isGifLikeVideo: async () => false },
          'src/services/nsfwVideoFilter.js': { isVideoNSFW: async () => false },
          'src/utils/safeMessaging.js': { safeReply: async () => {} },
          'src/bot/stickers.js': { isAnimatedWebpBuffer: () => false, sendStickerForMediaRecord: async () => {} }
        }
      }, async (processIncomingMedia) => {
        await processIncomingMedia(new MockBaileysClient(), { from: 'video@c.us', id: 'msg-video-rich', mimetype: 'video/mp4', sender: { id: 'author@c.us' } });
      });
      assertEqual(saveMediaCalls.length, 1, 'video should be saved');
      const payload = saveMediaCalls[0];
      assertEqual(payload.description, 'vídeo público', 'public video description must not include OCR');
      assertEqual(payload.extractedText, 'OCR VÍDEO');
      assertEqual(payload.metadata.visual_action, 'corre');
      assertEqual(payload.metadata.emotion, 'entusiasmo');
      assertEqual(payload.metadata.ocr_text, 'OCR VÍDEO');
      assertEqual(payload.metadata.usage_intent, 'comemoração');
      if (fs.existsSync(mediaDir)) for (const fileName of fs.readdirSync(mediaDir)) if (!existingFiles.has(fileName) && fileName.startsWith('media-')) { try { fs.unlinkSync(path.join(mediaDir, fileName)); } catch {} }
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
          'src/database/index.js': {
            getMD5: () => 'md5-audio',
            getHashVisual: async () => 'hash-audio',
            findByHashVisual: async () => null,
            findById: async (id) => {
              findByIdCalls.push(id);
              return {
                id,
                description: 'Audio transcription',
                file_path: path.join(PROJECT_ROOT, 'storage', 'media', 'bot', `media-audio-${id}.ogg`),
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
          'src/utils/mediaDownload.js': {
            downloadMediaForMessage: async () => {
              downloadCalls.push(true);
              return { buffer: Buffer.from('audio-bytes'), mimetype: 'audio/ogg' };
            }
          },
          'src/services/ai.js': {
            getAiAnnotations: async () => ({ description: 'ai-desc', tags: ['tag-ai'] }),
            getAiAnnotationsFromPrompt: async () => ({ tags: ['spoken', 'note'] }),
            getTagsFromTextPrompt: async () => ({ tags: ['spoken', 'note'] }),
            getAiAnnotationsForGif: async () => ({ description: 'gif-desc', tags: ['gif-tag'] }),
            transcribeAudioBuffer: async () => 'Audio transcription'
          },
          'src/utils/safeMessaging.js': {
            safeReply: async (client, chatId, text, messageId) => {
              safeReplies.push({ chatId, text, messageId });
            }
          },
          'src/bot/stickers.js': {
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
          'src/database/index.js': {
            getMD5: () => 'md5-audio-fail',
            getHashVisual: async () => 'hash-audio-fail',
            findByHashVisual: async () => null,
            findById: async (id) => ({ id, description: '', file_path: path.join(PROJECT_ROOT, 'storage', 'media', 'bot', `media-audio-fail-${id}.ogg`), mimetype: 'audio/ogg' }),
            saveMedia: async (payload) => { saveMediaCalls.push(payload); return 111; },
            getTagsForMedia: async () => [],
            updateMediaDescription: async () => {},
            updateMediaTags: async () => {}
          },
          'src/utils/mediaDownload.js': {
            downloadMediaForMessage: async () => {
              downloadCalls.push(true);
              return { buffer: Buffer.from('audio-bytes-error'), mimetype: 'audio/ogg' };
            }
          },
          'src/services/ai.js': {
            getAiAnnotations: async () => ({ description: 'ai-desc', tags: ['tag-ai'] }),
            getAiAnnotationsFromPrompt: async () => ({ tags: [] }),
            getAiAnnotationsForGif: async () => ({ description: 'gif-desc', tags: ['gif-tag'] }),
            getTagsFromTextPrompt: async () => ({ tags: [] }),
            transcribeAudioBuffer: async () => { throw new Error('transcription failed'); }
          },
          'src/utils/safeMessaging.js': {
            safeReply: async (client, chatId, text, messageId) => {
              safeReplies.push({ chatId, text, messageId });
            }
          },
          'src/bot/stickers.js': {
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
