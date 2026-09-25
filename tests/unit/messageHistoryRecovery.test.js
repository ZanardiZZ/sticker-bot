#!/usr/bin/env node
/**
 * Unit tests for message history recovery service
 */

const { assert, assertEqual, runTestSuite } = require('../helpers/testUtils');

// Test suite
const tests = [
  {
    name: 'fetchChatHistory should use adapter socket RPC and honor the requested limit',
    async fn() {
      const calls = [];
      const client = {
        sock: {
          async fetchMessagesFromWA(chatId, limit) {
            calls.push({ chatId, limit });
            return [
              { id: 'msg-2', timestamp: 2 },
              { id: 'msg-1', timestamp: 1 }
            ];
          }
        }
      };
      const { fetchChatHistory } = require('../../src/services/messageHistoryRecovery');
      const messages = await fetchChatHistory(client, '123456@g.us', 25);
      assertEqual(calls.length, 1, 'should call the socket history RPC once');
      assertEqual(calls[0].chatId, '123456@g.us', 'should forward the chat ID');
      assertEqual(calls[0].limit, 25, 'should forward the requested limit');
      assertEqual(messages.length, 2, 'should return the messages received from the bridge');
    }
  },

  {
    name: 'recoverChatHistory should invoke the bot handler with client and message',
    async fn() {
      const calls = [];
      const client = {
        sock: {
          async fetchMessagesFromWA() {
            return [{ id: 'sig-1', key: { id: 'sig-1' }, type: 'chat', body: 'history' }];
          }
        }
      };
      const mockDb = require('../../src/database');
      const originalGetProcessedMessageIds = mockDb.getProcessedMessageIds;
      mockDb.getProcessedMessageIds = async () => new Set();
      delete require.cache[require.resolve('../../src/services/messageHistoryRecovery')];
      const { recoverChatHistory } = require('../../src/services/messageHistoryRecovery');
      const result = await recoverChatHistory(client, '123@g.us', async (...args) => calls.push(args));
      assertEqual(result.errors, 0, 'should recover without handler signature errors');
      assertEqual(calls.length, 1, 'should invoke the handler once');
      assertEqual(calls[0][0], client, 'should pass the client as the first argument');
      assertEqual(calls[0][1].id, 'sig-1', 'should pass the message as the second argument');
      mockDb.getProcessedMessageIds = originalGetProcessedMessageIds;
      delete require.cache[require.resolve('../../src/services/messageHistoryRecovery')];
    }
  },

  {
    name: 'filterUnprocessedMessages should filter out processed messages',
    async fn() {
      // Mock getProcessedMessageIds before loading the service module.
      const mockDb = require('../../src/database');
      const originalGetProcessedMessageIds = mockDb.getProcessedMessageIds;
      mockDb.getProcessedMessageIds = async () => new Set(['msg-1', 'msg-3']);
      delete require.cache[require.resolve('../../src/services/messageHistoryRecovery')];
      const { filterUnprocessedMessages } = require('../../src/services/messageHistoryRecovery');

      const messages = [
        { id: 'msg-1', from: 'chat-A' },
        { id: 'msg-2', from: 'chat-A' },
        { id: 'msg-3', from: 'chat-B' },
        { id: 'msg-4', from: 'chat-B' }
      ];

      const unprocessed = await filterUnprocessedMessages(messages);

      assertEqual(unprocessed.length, 2, 'Should return 2 unprocessed messages');
      assertEqual(unprocessed[0].id, 'msg-2', 'First unprocessed should be msg-2');
      assertEqual(unprocessed[1].id, 'msg-4', 'Second unprocessed should be msg-4');

      mockDb.getProcessedMessageIds = originalGetProcessedMessageIds;
      delete require.cache[require.resolve('../../src/services/messageHistoryRecovery')];
    }
  },

  {
    name: 'filterUnprocessedMessages should handle messages with key.id',
    async fn() {
      const originalGetProcessedMessageIds = require('../../src/database').getProcessedMessageIds;
      const mockDb = require('../../src/database');
      
      mockDb.getProcessedMessageIds = async (messageIds) => {
        return new Set(['msg-key-1']);
      };

      // Need to reload the module to get the updated mock
      delete require.cache[require.resolve('../../src/services/messageHistoryRecovery')];
      const { filterUnprocessedMessages } = require('../../src/services/messageHistoryRecovery');

      const messages = [
        { key: { id: 'msg-key-1' }, from: 'chat-A' },
        { key: { id: 'msg-key-2' }, from: 'chat-A' }
      ];

      const unprocessed = await filterUnprocessedMessages(messages);

      assertEqual(unprocessed.length, 1, 'Should return 1 unprocessed message');
      assertEqual(unprocessed[0].key.id, 'msg-key-2', 'Should be msg-key-2');

      mockDb.getProcessedMessageIds = originalGetProcessedMessageIds;
      // Reload module to restore original
      delete require.cache[require.resolve('../../src/services/messageHistoryRecovery')];
    }
  },

  {
    name: 'filterUnprocessedMessages should return empty array for empty input',
    async fn() {
      const { filterUnprocessedMessages } = require('../../src/services/messageHistoryRecovery');

      const unprocessed1 = await filterUnprocessedMessages([]);
      const unprocessed2 = await filterUnprocessedMessages(null);

      assertEqual(unprocessed1.length, 0, 'Should return empty array for empty input');
      assertEqual(unprocessed2.length, 0, 'Should return empty array for null input');
    }
  },

  {
    name: 'processBatch should process messages in batches',
    async fn() {
      const { processBatch } = require('../../src/services/messageHistoryRecovery');

      const processedMessages = [];
      const mockProcessor = async (message) => {
        processedMessages.push(message.id);
      };

      const messages = [
        { id: 'msg-1' },
        { id: 'msg-2' },
        { id: 'msg-3' },
        { id: 'msg-4' },
        { id: 'msg-5' }
      ];

      const { successCount, errorCount } = await processBatch(messages, mockProcessor, 2);

      assertEqual(successCount, 5, 'Should process 5 messages successfully');
      assertEqual(errorCount, 0, 'Should have no errors');
      assertEqual(processedMessages.length, 5, 'Should process all messages');
      assert(processedMessages.includes('msg-1'), 'Should process msg-1');
      assert(processedMessages.includes('msg-5'), 'Should process msg-5');
    }
  },

  {
    name: 'processBatch should handle processing errors gracefully',
    async fn() {
      const { processBatch } = require('../../src/services/messageHistoryRecovery');

      const mockProcessor = async (message) => {
        if (message.id === 'msg-error') {
          throw new Error('Processing failed');
        }
      };

      const messages = [
        { id: 'msg-1' },
        { id: 'msg-error' },
        { id: 'msg-3' }
      ];

      const { successCount, errorCount } = await processBatch(messages, mockProcessor, 3);

      assertEqual(successCount, 2, 'Should have 2 successful messages');
      assertEqual(errorCount, 1, 'Should have 1 error');
    }
  },

  {
    name: 'HISTORY_RECOVERY_CONFIG should have default values',
    fn() {
      const { HISTORY_RECOVERY_CONFIG } = require('../../src/services/messageHistoryRecovery');

      assert(HISTORY_RECOVERY_CONFIG.batchSize > 0, 'Batch size should be positive');
      assert(HISTORY_RECOVERY_CONFIG.maxMessagesPerChat > 0, 'Max messages should be positive');
      assertEqual(typeof HISTORY_RECOVERY_CONFIG.enabled, 'boolean', 'Enabled should be boolean');
    }
  }
];

// Run the tests if this file is executed directly
if (require.main === module) {
  runTestSuite('Message History Recovery Tests', tests);
}

// Export tests for test runner
module.exports = { tests };
