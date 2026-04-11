#!/usr/bin/env node

const path = require('path');
const { runTestSuite, assertEqual } = require('../helpers/testUtils');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function resolveFromRoot(relativePath) {
  const normalized = /^(bot|commands|services|utils|client|database|web|plugins)\//.test(relativePath)
    ? path.join('src', relativePath)
    : relativePath;
  return require.resolve(path.join(PROJECT_ROOT, normalized));
}

async function withMockedCommands(testFn) {
  const cacheSnapshots = new Map();
  const pingHandlerPath = resolveFromRoot('src/commands/handlers/pinga.js');

  cacheSnapshots.set(pingHandlerPath, require.cache[pingHandlerPath]);
  require.cache[pingHandlerPath] = {
    id: pingHandlerPath,
    filename: pingHandlerPath,
    loaded: true,
    exports: {
      async handlePingaCommand() {
        throw new Error('ping handler should not run for media body text');
      }
    }
  };

  const commandsPath = resolveFromRoot('src/commands/index.js');
  const originalCommandsModule = require.cache[commandsPath];
  delete require.cache[commandsPath];

  try {
    const commandsModule = require(commandsPath);
    await testFn(commandsModule);
  } finally {
    delete require.cache[commandsPath];
    if (originalCommandsModule) {
      require.cache[commandsPath] = originalCommandsModule;
    }

    const originalPingModule = cacheSnapshots.get(pingHandlerPath);
    if (originalPingModule) {
      require.cache[pingHandlerPath] = originalPingModule;
    } else {
      delete require.cache[pingHandlerPath];
    }
  }
}

const tests = [
  {
    name: 'handleCommand ignores media body and only reads captions',
    fn: async () => {
      await withMockedCommands(async ({ handleCommand }) => {
        const message = {
          type: 'image',
          body: '#ping',
          caption: '',
          id: 'media-command-test'
        };

        const result = await handleCommand({}, message, '123@c.us');

        assertEqual(result, false, 'media body text should not be treated as a command');
      });
    }
  }
];

if (require.main === module) {
  runTestSuite('Command Media Body Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
