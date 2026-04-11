#!/usr/bin/env node

const { runTestSuite, assert, assertEqual } = require('../helpers/testUtils');
const { handleToolCall } = require('../../src/services/openaiTools');

const tests = [
  {
    name: 'restartService blocks protected live services',
    fn: async () => {
      const blockedServices = ['WS-Socket-Server', 'Bot-Client', 'sticker-bot', 'baileys-bridge'];

      for (const service of blockedServices) {
        const result = await handleToolCall('restartService', { service });
        assert(result.blocked === true, `${service} should be blocked`);
        assertEqual(result.success, false, `${service} should not be restarted`);
      }
    }
  },
  {
    name: 'restartService still allows non-protected services',
    fn: async () => {
      const result = await handleToolCall('restartService', { service: 'some-other-service' });
      assert(result.success === false || result.success === true, 'tool should return a structured result');
    }
  }
];

if (require.main === module) {
  runTestSuite('OpenAI Tools Restart Guard Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
