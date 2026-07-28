const Module = require('module');
const originalLoad = Module._load;
let gemmaResponse = { decision: 'safe', confidence: 0.99, reason: 'fixture' };

class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { content: JSON.stringify(gemmaResponse) } }]
        })
      }
    };
  }
}

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'openai') return FakeOpenAI;
  return originalLoad.call(this, request, parent, isMain);
};

process.env.NSFW_EXTERNAL_PROVIDER = 'gemma';
process.env.GEMMA_NSFW_BASE_URL = 'http://127.0.0.1:9999/v1';
process.env.GEMMA_NSFW_MODEL = 'fixture-gemma';
process.env.NSFW_GEMMA_MIN_CONFIDENCE = '0.65';

const { classifyImage, isExternalModerationEnabled } = require('../../src/services/nsfwExternal');
const fixture = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const tests = [
  {
    name: 'Gemma provider is enabled from configured model',
    fn: async () => {
      if (!isExternalModerationEnabled()) throw new Error('Gemma moderation should be enabled');
    }
  },
  {
    name: 'Gemma safe JSON maps to compatible safe result',
    fn: async () => {
      gemmaResponse = { decision: 'safe', confidence: 0.98, reason: 'safe fixture' };
      const result = await classifyImage(fixture, { mimeType: 'image/png' });
      if (!result || result.nsfw !== false || result.provider !== 'gemma') {
        throw new Error(`unexpected result: ${JSON.stringify(result)}`);
      }
    }
  },
  {
    name: 'Gemma explicit NSFW above threshold maps to blocked result',
    fn: async () => {
      gemmaResponse = { decision: 'nsfw', confidence: 0.91, reason: 'explicit fixture' };
      const result = await classifyImage(fixture, { mimeType: 'image/png' });
      if (!result || result.nsfw !== true || result.label !== 'nsfw') {
        throw new Error(`unexpected result: ${JSON.stringify(result)}`);
      }
    }
  },
  {
    name: 'Gemma low-confidence NSFW is delegated to fallback',
    fn: async () => {
      gemmaResponse = { decision: 'nsfw', confidence: 0.4, reason: 'uncertain fixture' };
      const result = await classifyImage(fixture, { mimeType: 'image/png' });
      if (result !== null) throw new Error(`expected null fallback signal, got ${JSON.stringify(result)}`);
    }
  }
];

module.exports = { tests };
