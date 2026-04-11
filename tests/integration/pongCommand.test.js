#!/usr/bin/env node

const path = require('path');
const { runTestSuite, assertEqual, assert } = require('../helpers/testUtils');
const { MockBaileysClient } = require('../helpers/mockBaileysClient');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
function resolveFromRoot(relativePath) {
  const normalized = /^(bot|commands|services|utils|client|database|web|plugins)\//.test(relativePath)
    ? path.join('src', relativePath)
    : relativePath;
  return require.resolve(path.join(PROJECT_ROOT, normalized));
}

const tests = [
  {
    name: '#pong should reply with quick diagnostics',
    fn: async () => {
      const commandsPath = resolveFromRoot('commands/index.js');
      delete require.cache[commandsPath];
      const commands = require(commandsPath);

      const client = new MockBaileysClient();
      const message = {
        from: '123@c.us',
        body: '#pong',
        id: 'MSG2',
        isGroupMsg: false,
        type: 'chat'
      };

      await commands.handleCommand(client, message, message.from, {
        resolvedSenderId: message.from,
        groupId: message.from,
        isGroup: false
      });

      assert(client.sent.length >= 1, 'should send at least one outgoing message for #pong');
      const payload = String(client.sent[client.sent.length - 1].payload || '');
      assert(payload.includes('PONG'), 'payload should include PONG');
      assert(payload.toLowerCase().includes('latência') || payload.toLowerCase().includes('latencia'), 'payload should include latency field');
      assert(payload.includes('ws:'), 'payload should include ws status');
      assert(payload.includes('fila_mídia:') || payload.includes('fila_midia:'), 'payload should include queue field');
      assert(payload.includes('uptime:'), 'payload should include uptime field');
    }
  },
  {
    name: '#pong should include rare easter egg',
    fn: async () => {
      const commandsPath = resolveFromRoot('commands/index.js');
      delete require.cache[commandsPath];
      const commands = require(commandsPath);

      const client = new MockBaileysClient();
      const message = {
        from: '123@c.us',
        body: '#pong',
        id: 'MSG3',
        isGroupMsg: false,
        type: 'chat'
      };

      const originalRandom = Math.random;
      Math.random = () => 0.01; // force rare branch
      try {
        await commands.handleCommand(client, message, message.from, {
          resolvedSenderId: message.from,
          groupId: message.from,
          isGroup: false
        });
      } finally {
        Math.random = originalRandom;
      }

      assert(client.sent.length >= 1, 'should send at least one outgoing message for #pong easter egg');
      const payload = String(client.sent[client.sent.length - 1].payload || '');
      assert(payload.includes('Mr. Freeman'), 'payload should include easter egg text');
    }
  }
];

if (require.main === module) {
  runTestSuite('Pong Command Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };

