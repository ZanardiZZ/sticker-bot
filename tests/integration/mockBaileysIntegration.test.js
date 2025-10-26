#!/usr/bin/env node

const path = require('path');
const { runTestSuite, assert, assertEqual } = require('../helpers/testUtils');
const { MockBaileysClient } = require('../helpers/mockBaileysClient');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function resolveFromRoot(relativePath) {
  return require.resolve(path.join(PROJECT_ROOT, relativePath));
}

async function withMockedMessageHandler(mocks, testFn) {
  const originalCache = new Map();
  const targetModules = Object.keys(mocks);

  // Install mocks before requiring the handler module
  for (const relPath of targetModules) {
    const resolved = resolveFromRoot(relPath);
    originalCache.set(resolved, require.cache[resolved]);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: mocks[relPath]
    };
  }

  const handlerPath = resolveFromRoot('bot/messageHandler.js');
  const originalHandlerModule = require.cache[handlerPath];
  delete require.cache[handlerPath];

  try {
    const handlerModule = require(handlerPath);
    await testFn(handlerModule);
  } finally {
    delete require.cache[handlerPath];
    if (originalHandlerModule) {
      require.cache[handlerPath] = originalHandlerModule;
    }

    for (const [resolved, original] of originalCache.entries()) {
      if (original) {
        require.cache[resolved] = original;
      } else {
        delete require.cache[resolved];
      }
    }
  }
}

const tests = [
  {
    name: 'setupMessageHandler attaches to mock client listeners',
    fn: async () => {
      const client = new MockBaileysClient();
      const handled = [];
      const handlerPath = resolveFromRoot('bot/messageHandler.js');
      delete require.cache[handlerPath];
      const { setupMessageHandler } = require(handlerPath);

      setupMessageHandler(client, (instance, message) => {
        handled.push(message);
        assert(instance === client, 'should pass through the same client instance');
      });

      const message = { id: 'msg-1', body: 'hello', from: '123@c.us' };
      await client.emitIncoming(message);

      assertEqual(handled.length, 1, 'listener should be invoked exactly once');
      assert(handled[0] === message, 'listener receives the mock message reference');
    }
  },
  {
    name: 'handleMessage integrates commands, media queue and safe reply using mocks',
    fn: async () => {
      const commandCalls = [];
      const mediaCalls = [];
      const safeReplies = [];
      const typingSessions = [];

      const mockCommands = {
        taggingMap: new Map(),
        async handleCommand(client, message, chatId, context) {
          commandCalls.push({ client, message, chatId, context });
          if (message.body === '#handled') {
            return true;
          }
          if (message.body === '#boom') {
            throw new Error('command failure');
          }
          return false;
        },
        async handleTaggingMode() {
          return false;
        }
      };

      const mockSafeMessaging = {
        async safeReply(client, chatId, text, quotedId) {
          safeReplies.push({ client, chatId, text, quotedId });
        }
      };

      const mockTyping = {
        async withTyping(client, chatId, fn) {
          typingSessions.push(chatId);
          return await fn();
        }
      };

      const mockLogging = {
        async logReceivedMessage() {/* no-op for tests */}
      };

      const mockContacts = {
        upsertContactFromMessage() {/* no-op for tests */},
        upsertGroupFromMessage() {/* no-op for tests */}
      };

      const mockMediaProcessor = {
        async processIncomingMedia(client, message) {
          mediaCalls.push({ client, message });
          if (message.body === 'media-error') {
            throw new Error('media failure');
          }
          return { ok: true };
        }
      };

      class ImmediateMediaQueue {
        constructor() {
          this.listeners = new Map();
        }
        on(event, handler) {
          if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
          }
          this.listeners.get(event).push(handler);
        }
        emit(event, ...args) {
          const handlers = this.listeners.get(event) || [];
          handlers.forEach((fn) => {
            try {
              fn(...args);
            } catch (error) {
              console.error(`[ImmediateMediaQueue] listener error on ${event}:`, error);
            }
          });
        }
        getStats() {
          return { waiting: 0, processing: 0 };
        }
        async add(job) {
          const jobId = `mock-${Date.now()}`;
          this.emit('jobAdded', jobId);
          try {
            const result = await job();
            this.emit('jobCompleted', jobId, result);
            return result;
          } catch (error) {
            this.emit('jobFailed', jobId, error);
            throw error;
          }
        }
      }

      const groupJid = '123456@g.us';
      const participantJid = 'participant@c.us';

      await withMockedMessageHandler({
        'commands.js': mockCommands,
        'utils/safeMessaging.js': mockSafeMessaging,
        'utils/typingIndicator.js': mockTyping,
        'bot/logging.js': mockLogging,
        'bot/contacts.js': mockContacts,
        'bot/mediaProcessor.js': mockMediaProcessor,
        'services/mediaQueue.js': ImmediateMediaQueue,
        'web/dataAccess.js': {
          async getDmUser() {
            return { user_id: participantJid, allowed: 1, blocked: 0 };
          },
          async upsertDmUser() { /* noop */ }
        },
        'database/index.js': {
          async resolveSenderId(_client, sender) {
            return sender || participantJid;
          }
        },
        'services/permissionEvaluator.js': {
          async evaluateGroupCommandPermission() {
            return { allowed: true, meta: { groupId: groupJid, userId: participantJid } };
          }
        }
      }, async ({ handleMessage, setupMessageHandler }) => {
        const client = new MockBaileysClient();
        const messagesHandled = [];

        setupMessageHandler(client, async (instance, message) => {
          messagesHandled.push(message);
          await handleMessage(instance, message);
        });

        const baseMessage = {
          from: groupJid,
          id: 'ABC',
          chatId: groupJid,
          sender: { id: participantJid },
          key: { remoteJid: groupJid, participant: participantJid },
          isGroupMsg: true
        };

        await client.emitIncoming({ ...baseMessage, body: '#handled', type: 'chat', isMedia: false });
        assertEqual(commandCalls.length, 1, 'command handler should be invoked');
        assertEqual(mediaCalls.length, 0, 'media processor should not be touched for handled command');

        await client.emitIncoming({ ...baseMessage, body: 'random text', type: 'chat', isMedia: false, id: 'DEF' });
        assertEqual(commandCalls.length, 2, 'command handler should be invoked for non-command text');
        assertEqual(mediaCalls.length, 0, 'non-media message should not enqueue media processing');

        await client.emitIncoming({ ...baseMessage, body: 'media payload', type: 'image', isMedia: true, id: 'GHI' });
        assertEqual(mediaCalls.length, 1, 'media processing should run for media messages');

        try {
          await handleMessage(client, { ...baseMessage, body: 'media-error', type: 'image', isMedia: true, id: 'JKL' });
        } catch {
          // handleMessage should swallow the error, so this block should not run
          assert(false, 'handleMessage should catch media errors internally');
        }

        assertEqual(safeReplies.length, 1, 'safeReply should be triggered after media failure');
        assertEqual(typingSessions.length, 1, 'withTyping wrapper should be used during error reply');
        assertEqual(messagesHandled.length, 3, 'all emitted messages should pass through the handler');
      });
    }
  }
];

if (require.main === module) {
  runTestSuite('Mock Baileys Integration Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
