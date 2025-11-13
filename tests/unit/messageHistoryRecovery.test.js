#!/usr/bin/env node
/**
 * Unit tests for message history recovery service
 */

const { assert, assertEqual, runTestSuite } = require('../helpers/testUtils');

// Test suite
const tests = [
  {
    name: 'filterUnprocessedMessages should filter out processed messages',
    async fn() {
      // Mock getProcessedMessageIds
      const originalGetProcessedMessageIds = require('../../database').getProcessedMessageIds;
      const mockDb = require('../../database');
      
      mockDb.getProcessedMessageIds = async (messageIds) => {
        return new Set(['msg-1', 'msg-3']); // msg-1 and msg-3 are processed
      };

      const { filterUnprocessedMessages } = require('../../services/messageHistoryRecovery');

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

      // Restore original function
      mockDb.getProcessedMessageIds = originalGetProcessedMessageIds;
    }
  },

  {
    name: 'filterUnprocessedMessages should handle messages with key.id',
    async fn() {
      const originalGetProcessedMessageIds = require('../../database').getProcessedMessageIds;
      const mockDb = require('../../database');
      
      mockDb.getProcessedMessageIds = async (messageIds) => {
        return new Set(['msg-key-1']);
      };

      // Need to reload the module to get the updated mock
      delete require.cache[require.resolve('../../services/messageHistoryRecovery')];
      const { filterUnprocessedMessages } = require('../../services/messageHistoryRecovery');

      const messages = [
        { key: { id: 'msg-key-1' }, from: 'chat-A' },
        { key: { id: 'msg-key-2' }, from: 'chat-A' }
      ];

      const unprocessed = await filterUnprocessedMessages(messages);

      assertEqual(unprocessed.length, 1, 'Should return 1 unprocessed message');
      assertEqual(unprocessed[0].key.id, 'msg-key-2', 'Should be msg-key-2');

      mockDb.getProcessedMessageIds = originalGetProcessedMessageIds;
      // Reload module to restore original
      delete require.cache[require.resolve('../../services/messageHistoryRecovery')];
    }
  },

  {
    name: 'filterUnprocessedMessages should return empty array for empty input',
    async fn() {
      const { filterUnprocessedMessages } = require('../../services/messageHistoryRecovery');

      const unprocessed1 = await filterUnprocessedMessages([]);
      const unprocessed2 = await filterUnprocessedMessages(null);

      assertEqual(unprocessed1.length, 0, 'Should return empty array for empty input');
      assertEqual(unprocessed2.length, 0, 'Should return empty array for null input');
    }
  },

  {
    name: 'processBatch should process messages in batches',
    async fn() {
      const { processBatch } = require('../../services/messageHistoryRecovery');

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
      const { processBatch } = require('../../services/messageHistoryRecovery');

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
      const { HISTORY_RECOVERY_CONFIG } = require('../../services/messageHistoryRecovery');

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
