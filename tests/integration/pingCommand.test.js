#!/usr/bin/env node

const path = require('path');
const { runTestSuite, assertEqual, assert } = require('../helpers/testUtils');
const { MockBaileysClient } = require('../helpers/mockBaileysClient');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
function resolveFromRoot(relativePath) {
  return require.resolve(path.join(PROJECT_ROOT, relativePath));
}

const tests = [
  {
    name: '#ping should reply with uptime, latency, cron and version',
    fn: async () => {
      // Load the real commands module (it depends on package.json)
      const commandsPath = resolveFromRoot('commands/index.js');
      delete require.cache[commandsPath];
      const commands = require(commandsPath);

      const client = new MockBaileysClient();
      const message = {
        from: '123@c.us',
        body: '#ping',
        id: 'MSG1',
        isGroupMsg: false
      };

      // Ensure environment cron is deterministic for test
      process.env.BOT_CRON_SCHEDULE = '0 0-23 * * *';

      await commands.handleCommand(client, message, message.from, {
        resolvedSenderId: message.from,
        groupId: message.from,
        isGroup: false
      });

      // The mock safeReply falls back to sendText, so check sent messages
      assertEqual(client.sent.length, 1, 'should send exactly one outgoing message');
      const sent = client.sent[0];
      assert(sent.type === 'text', 'should use sendText fallback');
      assert(sent.chatId === message.from, 'should send to same chat');
      const payload = sent.payload;
      assert(payload.includes('🤖') && payload.includes('Uptime'), 'payload should contain uptime header');
      assert(payload.includes('Latência') || payload.includes('Latencia'), 'payload should contain latency label');
      assert(payload.includes('CRON'), 'payload should contain CRON');
      assert(payload.includes('Vers'), 'payload should contain version label');
    }
  }
];

if (require.main === module) {
  runTestSuite('Ping Command Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
