#!/usr/bin/env node

const path = require('path');
const { runTestSuite, assert, assertEqual } = require('../helpers/testUtils');
const { MockBaileysClient } = require('../helpers/mockBaileysClient');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function resolveFromRoot(relativePath) {
  return require.resolve(path.join(PROJECT_ROOT, relativePath));
}

const tests = [
  {
    name: '#downloadmp3 invalid URL shows help message',
    fn: async () => {
      const commandsPath = resolveFromRoot('commands/index.js');
      delete require.cache[commandsPath];
      const commands = require(commandsPath);

      const client = new MockBaileysClient();
      const message = {
        from: '5511999999999@c.us',
        body: '#downloadmp3 isso-nao-e-um-link',
        id: 'MSG-DOWNLOAD-MP3-1',
        isGroupMsg: false
      };

      await commands.handleCommand(client, message, message.from, {
        resolvedSenderId: message.from,
        groupId: message.from,
        isGroup: false
      });

      assert(client.sent.length > 0, 'Should send at least one response');
      const lastSent = client.sent[client.sent.length - 1];
      assertEqual(lastSent.type, 'text', 'Response should be text');
      assert(lastSent.payload.includes('URL inválida'), 'Help message should mention invalid URL');
      assert(lastSent.payload.includes('#downloadmp3 <URL>'), 'Help message should provide usage instructions');
      assert(lastSent.payload.includes('Plataformas suportadas'), 'Help message should include platform guidance');
    }
  }
];

if (require.main === module) {
  runTestSuite('Download MP3 Command Integration Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
