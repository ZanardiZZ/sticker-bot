#!/usr/bin/env node
/**
 * Unit tests for the persistent memory client bridge.
 */

const path = require('path');
const { assert, assertEqual, runTestSuite } = require('../helpers/testUtils');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function resolveFromRoot(relativePath) {
  const normalized = /^(bot|commands|services|utils|client|database|web|plugins)\//.test(relativePath)
    ? path.join('src', relativePath)
    : relativePath;
  return require.resolve(path.join(PROJECT_ROOT, normalized));
}

async function withMockedModules(mocks, testFn) {
  const originalCache = new Map();
  const targetModules = Object.keys(mocks);

  for (const moduleId of targetModules) {
    const resolved = moduleId.includes('/')
      ? resolveFromRoot(moduleId)
      : require.resolve(moduleId, { paths: [PROJECT_ROOT] });
    originalCache.set(resolved, require.cache[resolved]);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: mocks[moduleId]
    };
  }

  const clientPath = resolveFromRoot('src/client/memory-client.js');
  const originalClientModule = require.cache[clientPath];
  delete require.cache[clientPath];

  try {
    const memory = require(clientPath);
    await testFn(memory);
  } finally {
    delete require.cache[clientPath];
    if (originalClientModule) {
      require.cache[clientPath] = originalClientModule;
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

const originalEnv = {
  MEMORY_ENABLED: process.env.MEMORY_ENABLED,
  MEMORY_API_URL: process.env.MEMORY_API_URL,
  MEMORY_TIMEOUT_MS: process.env.MEMORY_TIMEOUT_MS,
  MEMORY_RETRY_COUNT: process.env.MEMORY_RETRY_COUNT
};

const TEST_MEMORY_API_URL = 'http://memory.test:9999';

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const tests = [
  {
    name: 'memory client uses configured URL and timeout when enabled',
    fn: async () => {
      process.env.MEMORY_ENABLED = '1';
      process.env.MEMORY_API_URL = TEST_MEMORY_API_URL;
      process.env.MEMORY_TIMEOUT_MS = '4321';
      process.env.MEMORY_RETRY_COUNT = '1';

      const calls = [];
      await withMockedModules({
        axios: async (config) => {
          calls.push(config);
          return { data: { ok: true } };
        }
      }, async (memory) => {
        memory.init();
        const result = await memory.getUser('abc');
        assertEqual(result.ok, true, 'request should return mocked response data');
        assertEqual(calls.length, 1, 'axios should be called once');
        assertEqual(calls[0].url, 'http://memory.test:9999/api/user/abc', 'should use configured base URL');
        assertEqual(calls[0].timeout, 4321, 'should use configured timeout');
      });
    }
  },
  {
    name: 'memory client skips requests when disabled',
    fn: async () => {
      process.env.MEMORY_ENABLED = '0';
      delete process.env.MEMORY_API_URL;

      let called = false;
      await withMockedModules({
        axios: async () => {
          called = true;
          return { data: {} };
        }
      }, async (memory) => {
        memory.init();
        const result = await memory.getUser('disabled-user');
        assertEqual(result, null, 'disabled memory client should return null');
        assertEqual(called, false, 'axios should not be called when disabled');
        const health = await memory.healthcheck();
        assertEqual(health.disabled, true, 'healthcheck should report disabled state');
      });
    }
  },
  {
    name: 'memory client returns null after request failures',
    fn: async () => {
      process.env.MEMORY_ENABLED = '1';
      process.env.MEMORY_API_URL = TEST_MEMORY_API_URL;
      process.env.MEMORY_RETRY_COUNT = '1';
      let attempts = 0;

      await withMockedModules({
        axios: async () => {
          attempts += 1;
          const error = new Error('timeout');
          error.code = 'ECONNABORTED';
          throw error;
        }
      }, async (memory) => {
        memory.init();
        const result = await memory.buildContext('group-1', ['user-1']);
        assertEqual(result.users && Object.keys(result.users).length, 0, 'failed requests should produce empty context');
        assertEqual(attempts, 2, 'buildContext should attempt insights and events once each when retry count is disabled');
      });
    }
  },
  {
    name: 'learnFromMessage extracts multiple heuristic facts from natural sentences',
    fn: async () => {
      process.env.MEMORY_ENABLED = '1';
      process.env.MEMORY_API_URL = TEST_MEMORY_API_URL;

      const calls = [];
      await withMockedModules({
        axios: async (config) => {
          calls.push(config);
          return { data: { ok: true } };
        },
        'src/services/ai.js': {
          async extractMemoryFactsFromText() {
            return [];
          }
        }
      }, async (memory) => {
        memory.init();
        const learned = await memory.learnFromMessage(
          'user-1',
          'Meu nome é Daniel, moro em Campinas, trabalho com TI e adoro café.',
          'group-1'
        );

        const factWrites = calls.filter((entry) => entry.url.includes('/fact'));
        assertEqual(learned.length >= 4, true, 'should extract at least four useful facts');
        assertEqual(factWrites.length >= 4, true, 'should persist extracted facts');
        assert(factWrites.some((entry) => entry.data.fact === 'nome é Daniel'), 'should save the user name');
        assert(factWrites.some((entry) => entry.data.fact === 'mora em Campinas'), 'should save the user location');
        assert(factWrites.some((entry) => entry.data.fact === 'trabalha com TI'), 'should save the user profession');
        assert(factWrites.some((entry) => entry.data.fact === 'gosta de café'), 'should save the user interest');
      });
    }
  },
  {
    name: 'learnFromMessage merges AI facts with heuristics without duplicates',
    fn: async () => {
      process.env.MEMORY_ENABLED = '1';
      process.env.MEMORY_API_URL = TEST_MEMORY_API_URL;

      const calls = [];
      await withMockedModules({
        axios: async (config) => {
          calls.push(config);
          return { data: { ok: true } };
        },
        'src/services/ai.js': {
          async extractMemoryFactsFromText() {
            return [
              { fact: 'gosta de café', category: 'interest', confidence: 0.91 },
              { fact: 'trabalha com dados', category: 'profession', confidence: 0.88 }
            ];
          }
        }
      }, async (memory) => {
        memory.init();
        const learned = await memory.learnFromMessage(
          'user-2',
          'Eu adoro café e hoje trabalho com dados.',
          'group-1'
        );

        const factWrites = calls.filter((entry) => entry.url.includes('/fact'));
        assertEqual(learned.length, 2, 'duplicate facts should be merged');
        assertEqual(factWrites.length, 2, 'only unique facts should be persisted');
        assert(factWrites.some((entry) => entry.data.source === 'whatsapp_bot_ai'), 'should preserve AI-originated facts');
        assert(factWrites.some((entry) => entry.data.category.startsWith('confirmed:') || entry.data.category.startsWith('soft:') || entry.data.category.startsWith('provisional:')), 'should persist memory layers through encoded categories');
      });
    }
  },
  {
    name: 'learnFromMessage only saves running jokes when there is recurrence in recent group messages',
    fn: async () => {
      process.env.MEMORY_ENABLED = '1';
      process.env.MEMORY_API_URL = TEST_MEMORY_API_URL;

      const calls = [];
      await withMockedModules({
        axios: async (config) => {
          calls.push(config);
          if (config.url.includes('/api/events')) {
            return {
              data: {
                events: [
                  { type: 'message', content: 'kkkk o Daniel é o rei do café mesmo' },
                  { type: 'message', content: 'lá vem o rei do café de novo' }
                ]
              }
            };
          }
          return { data: { ok: true } };
        },
        'src/services/ai.js': {
          async extractMemoryFactsFromText() {
            return [];
          },
          async extractRunningJokeFromText() {
            return null;
          }
        }
      }, async (memory) => {
        memory.init();
        await memory.learnFromMessage(
          'user-3',
          'Agora o Daniel virou rei do café',
          'group-1'
        );

        const jokeWrites = calls.filter((entry) => entry.url.includes('/joke'));
        assertEqual(jokeWrites.length, 1, 'should persist a running joke after detecting recurrence');
        assertEqual(jokeWrites[0].data.name, 'rei do café', 'should persist the detected joke name');
      });
    }
  },
  {
    name: 'learnFromMessage does not save isolated running joke suggestions',
    fn: async () => {
      process.env.MEMORY_ENABLED = '1';
      process.env.MEMORY_API_URL = TEST_MEMORY_API_URL;

      const calls = [];
      await withMockedModules({
        axios: async (config) => {
          calls.push(config);
          if (config.url.includes('/api/events')) {
            return { data: { events: [] } };
          }
          return { data: { ok: true } };
        },
        'src/services/ai.js': {
          async extractMemoryFactsFromText() {
            return [];
          },
          async extractRunningJokeFromText() {
            return null;
          }
        }
      }, async (memory) => {
        memory.init();
        await memory.learnFromMessage(
          'user-4',
          'Agora o Daniel virou rei do café',
          'group-1'
        );

        const jokeWrites = calls.filter((entry) => entry.url.includes('/joke'));
        assertEqual(jokeWrites.length, 0, 'should not persist a running joke from a single isolated message');
      });
    }
  },
  {
    name: 'buildContext returns layered user memory and derived group context',
    fn: async () => {
      process.env.MEMORY_ENABLED = '1';
      process.env.MEMORY_API_URL = TEST_MEMORY_API_URL;

      await withMockedModules({
        axios: async (config) => {
          if (config.url.includes('/api/insights/')) {
            return {
              data: {
                group: { name: 'Grupo Teste', runningJokes: [{ name: 'rei do café' }], activeTopics: [] },
                users: {
                  'user-1': { name: 'Daniel', recentFacts: [] }
                }
              }
            };
          }
          if (config.url.includes('/api/user/user-1/facts')) {
            return {
              data: {
                facts: [
                  { fact: 'gosta de café', category: 'confirmed:interest', confidence: 0.91 },
                  { fact: 'fala de deploy com frequência', category: 'soft:technology', confidence: 0.67 },
                  { fact: 'talvez curta rust', category: 'provisional:technology', confidence: 0.45 }
                ]
              }
            };
          }
          if (config.url.includes('/api/events')) {
            return {
              data: {
                events: [
                  { type: 'message', content: 'o Daniel falou de deploy hoje' },
                  { type: 'message', content: 'deploy de novo no grupo' },
                  { type: 'group_dynamic', description: 'Daniel é associado a deploy no grupo', topic: 'deploy' }
                ]
              }
            };
          }
          return { data: {} };
        }
      }, async (memory) => {
        memory.init();
        const context = await memory.buildContext('group-1', ['user-1']);

        assertEqual(context.users['user-1'].confirmedFacts.length, 1, 'should expose confirmed facts separately');
        assertEqual(context.users['user-1'].softSignals.length, 1, 'should expose soft signals separately');
        assertEqual(context.users['user-1'].provisionalMemories.length, 1, 'should expose provisional memories separately');
        assertEqual(context.groupDynamics.length, 1, 'should expose stored group dynamics');
        assert(context.activeTopics.some((item) => (item.topic || item) === 'deploy'), 'should derive active topics from recent messages');
      });
    }
  }
];

if (require.main === module) {
  runTestSuite('Memory Client Tests', tests)
    .then(() => {
      restoreEnv();
      process.exit(0);
    })
    .catch(() => {
      restoreEnv();
      process.exit(1);
    });
} else {
  process.on('exit', restoreEnv);
}

module.exports = { tests };
