const path = require('path');
const Module = require('module');
const { assert, assertEqual, runTestSuite } = require('../helpers/testUtils');

const ROOT = path.resolve(__dirname, '..', '..');
const handlerPath = require.resolve('../../src/bot/messageHandler');

function resolve(relativePath) {
  return require.resolve(path.join(ROOT, relativePath));
}

async function withHandler({ enabled, quotedMedia }, testFn) {
  const previousEnv = process.env.CONVERSATION_QUOTED_MEDIA_CONTEXT_ENABLED;
  if (enabled) process.env.CONVERSATION_QUOTED_MEDIA_CONTEXT_ENABLED = '1';
  else delete process.env.CONVERSATION_QUOTED_MEDIA_CONTEXT_ENABLED;

  const mocks = {
    'src/commands/index.js': {
      handleCommand: async () => false,
      handleTaggingMode: async () => false,
      taggingMap: new Map()
    },
    'src/bot/logging.js': { logReceivedMessage: async () => {} },
    'src/bot/contacts.js': {
      upsertContactFromMessage: () => {},
      upsertGroupFromMessage: () => {},
      upsertGroupUser: () => {}
    },
    'src/bot/mediaProcessor.js': { processIncomingMedia: async () => ({}) },
    'src/utils/typingIndicator.js': { withTyping: async (_client, _chat, work) => work() },
    'src/utils/safeMessaging.js': { safeReply: async () => {} },
    'src/utils/mediaDownload.js': { downloadMediaForMessage: async () => ({}) },
    'src/database/index.js': {
      resolveSenderId: async (_client, sender) => sender,
      isMessageProcessed: async () => false,
      markMessageAsProcessed: async () => {},
      getQuotedMediaContext: async () => quotedMedia
    },
    'src/services/persistentMediaQueue.js': class {
      on() {}
      setExecutor() {}
      async getStats() { return { waiting: 0, processing: 0 }; }
      async add() {}
    },
    'src/web/dataAccess.js': {
      getDmUser: async () => null,
      upsertDmUser: async () => {}
    },
    'src/services/conversationAgent.js': {
      handleGroupChatMessage: async (_client, _message, context) => {
        testFn.context = context;
        return true;
      }
    },
    'src/client/memory-client.js': {
      isReady: () => false,
      syncMemoryForGroupMessage: async () => ({})
    },
    'src/commands/handlers/id.js': { handleIdCommand: async () => false },
    'src/utils/whatsappRouting.js': {
      getAllowedGroupJids: () => ['test@g.us'],
      getAllowedDmJids: () => [],
      isJidAllowed: () => true
    },
    'src/services/publicDmStickerAccess.js': {
      normalizeIdentity: value => value,
      evaluateAccess: async () => ({ eligible: true, blocked: false })
    },
    'src/services/mercadoPagoPayment.js': {}
  };

  const originals = new Map();
  for (const [relative, exports] of Object.entries(mocks)) {
    const filename = resolve(relative);
    originals.set(filename, require.cache[filename]);
    const mock = new Module(filename);
    mock.filename = filename;
    mock.loaded = true;
    mock.exports = exports;
    require.cache[filename] = mock;
  }

  const originalHandler = require.cache[handlerPath];
  delete require.cache[handlerPath];
  try {
    await testFn(require(handlerPath));
  } finally {
    delete require.cache[handlerPath];
    if (originalHandler) require.cache[handlerPath] = originalHandler;
    for (const [filename, original] of originals) {
      if (original) require.cache[filename] = original;
      else delete require.cache[filename];
    }
    if (previousEnv === undefined) delete process.env.CONVERSATION_QUOTED_MEDIA_CONTEXT_ENABLED;
    else process.env.CONVERSATION_QUOTED_MEDIA_CONTEXT_ENABLED = previousEnv;
  }
}

const message = {
  id: 'text-1',
  from: 'test@g.us',
  type: 'chat',
  body: 'bot, o que isso significa?',
  quotedMsgId: 'media-message-1',
  isMedia: false,
  isGroupMsg: true,
  key: { remoteJid: 'test@g.us', participant: 'user@c.us' },
  sender: { id: 'user@c.us', name: 'User' }
};

const tests = [
  {
    name: 'quoted media resolver is not called when opt-in flag is disabled',
    fn: async () => {
      let resolverCalls = 0;
      await withHandler({ enabled: false, quotedMedia: null }, async function disabledCase({ handleMessage }) {
        await handleMessage({}, { ...message, id: 'disabled-1' });
        assertEqual(resolverCalls, 0, 'disabled opt-in must not resolve quoted media');
        assertEqual(disabledCase.context.quotedMedia, null, 'conversation receives no quoted context');
      });
    }
  },
  {
    name: 'enabled opt-in resolves quoted media and forwards it to conversation',
    fn: async () => {
      const media = { mediaId: 77, description: 'cachorro surpreso' };
      await withHandler({ enabled: true, quotedMedia: media }, async function enabledCase({ handleMessage }) {
        await handleMessage({}, { ...message, id: 'enabled-1' });
        assertEqual(enabledCase.context.quotedMedia, media, 'resolved context must reach conversation agent');
      });
    }
  }
];

if (require.main === module) {
  runTestSuite('Quoted Media Handler Opt-in Tests', tests).then(result => process.exit(result.failed ? 1 : 0));
}

module.exports = { tests };
