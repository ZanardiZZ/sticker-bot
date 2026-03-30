#!/usr/bin/env node
/**
 * Unit tests for conversation agent memory-aware prompting.
 */

const fs = require('fs');
const path = require('path');
const { assert, assertEqual, runTestSuite } = require('../helpers/testUtils');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const STORAGE_DIR = path.join(PROJECT_ROOT, 'storage', 'data', 'conversations');

function resolveFromRoot(relativePath) {
  const normalized = /^(bot|commands|services|utils|client|database|web|plugins)\//.test(relativePath)
    ? path.join('src', relativePath)
    : relativePath;
  return require.resolve(path.join(PROJECT_ROOT, normalized));
}

function stateFilePath(chatId) {
  const safeId = String(chatId || 'unknown').replace(/[^a-z0-9@._-]/gi, '_');
  return path.join(STORAGE_DIR, `${safeId}.json`);
}

async function withMockedConversationAgent(mocks, testFn) {
  const originalCache = new Map();
  const targetModules = Object.keys(mocks);

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

  const agentPath = resolveFromRoot('src/services/conversationAgent.js');
  const originalAgent = require.cache[agentPath];
  delete require.cache[agentPath];

  try {
    const agent = require(agentPath);
    await testFn(agent);
  } finally {
    delete require.cache[agentPath];
    if (originalAgent) {
      require.cache[agentPath] = originalAgent;
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
  CONVERSATION_AGENT_ENABLED: process.env.CONVERSATION_AGENT_ENABLED,
  CONVERSATION_PERSONA_NAME: process.env.CONVERSATION_PERSONA_NAME
};

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
    name: 'conversation agent includes memory context in AI prompt',
    fn: async () => {
      process.env.CONVERSATION_AGENT_ENABLED = '1';
      process.env.CONVERSATION_PERSONA_NAME = 'Lia';

      const chatId = 'memory-test@g.us';
      const persistedState = stateFilePath(chatId);
      if (fs.existsSync(persistedState)) {
        fs.unlinkSync(persistedState);
      }

      let capturedMessages = null;
      let sentReply = null;

      await withMockedConversationAgent({
        'src/services/ai.js': {
          isAiAvailable() {
            return true;
          },
          async generateConversationalReply({ messages }) {
            capturedMessages = messages;
            return 'Resposta com memória';
          }
        },
        'src/utils/typingIndicator.js': {
          async withTyping(_client, _chatId, fn) {
            return fn();
          }
        },
        'src/utils/safeMessaging.js': {
          async safeReply(_client, _chatId, text) {
            sentReply = text;
          }
        },
        'src/utils/logCollector.js': {
          getLogCollector() {
            return { getLogs: () => ({ logs: [] }) };
          }
        },
        'src/client/memory-client.js': {
          isReady() {
            return true;
          },
          async buildContext() {
            return {
              users: {
                'user-1@s.whatsapp.net': {
                  confirmedFacts: [
                    { fact: 'gosta de café' }
                  ],
                  softSignals: [
                    { fact: 'fala bastante sobre deploy' }
                  ],
                  provisionalMemories: [
                    { fact: 'talvez curta rust' }
                  ],
                  recentFacts: [
                    { fact: 'gosta de café' },
                    { fact: 'trabalha com TI' }
                  ]
                }
              },
              runningJokes: [{ name: 'piada do café' }],
              activeTopics: [{ topic: 'deploy', mentions: 3 }, { topic: 'memória', mentions: 2 }],
              groupDynamics: [{ description: 'Daniel é associado a deploy no grupo' }]
            };
          }
        }
      }, async ({ handleGroupChatMessage }) => {
        const client = {
          async sendText(_chatId, text) {
            sentReply = text;
          }
        };

        const handled = await handleGroupChatMessage(client, {
          id: 'msg-123',
          from: chatId,
          body: 'Lia, responde aí',
          timestamp: Math.floor(Date.now() / 1000),
          sender: { id: 'user-1@s.whatsapp.net', name: 'Joana' }
        }, {
          chatId,
          senderId: 'user-1@s.whatsapp.net',
          senderName: 'Joana',
          groupName: 'Grupo Memória'
        });

        assertEqual(handled, true, 'conversation agent should reply when AI is available');
      });

      assert(Array.isArray(capturedMessages), 'AI call should receive a messages array');
      assert(capturedMessages[0].content.includes('Memórias confirmadas do usuário atual'), 'system prompt should include confirmed memory section');
      assert(capturedMessages[0].content.includes('gosta de café'), 'system prompt should include remembered user facts');
      assert(capturedMessages[0].content.includes('fala bastante sobre deploy'), 'system prompt should include soft signals');
      assert(capturedMessages[0].content.includes('talvez curta rust'), 'system prompt should include provisional memory hints');
      assert(capturedMessages[0].content.includes('piada do café'), 'system prompt should include running jokes');
      assert(capturedMessages[0].content.includes('deploy'), 'system prompt should include active topics');
      assert(capturedMessages[0].content.includes('Dinâmica social recente do grupo'), 'system prompt should include group dynamics');
      assertEqual(sentReply, 'Resposta com memória', 'generated reply should be sent back to the chat');

      if (fs.existsSync(persistedState)) {
        fs.unlinkSync(persistedState);
      }
    }
  }
];

if (require.main === module) {
  runTestSuite('Conversation Agent Memory Tests', tests)
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
