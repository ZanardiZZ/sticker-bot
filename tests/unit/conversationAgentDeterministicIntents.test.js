#!/usr/bin/env node

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
    if (originalAgent) require.cache[agentPath] = originalAgent;
    for (const [resolved, original] of originalCache.entries()) {
      if (original) require.cache[resolved] = original;
      else delete require.cache[resolved];
    }
  }
}

const tests = [
  {
    name: 'model question is answered deterministically without LLM call',
    fn: async () => {
      process.env.CONVERSATION_AGENT_ENABLED = '1';
      process.env.CONVERSATION_PERSONA_NAME = 'Lia';
      process.env.CONVERSATION_MODEL = 'qwen-test';
      process.env.CONVERSATION_BASE_URL = 'http://127.0.0.1:8080/v1';

      const chatId = 'deterministic-model@g.us';
      const persisted = stateFilePath(chatId);
      if (fs.existsSync(persisted)) fs.unlinkSync(persisted);

      let sentReply = null;
      let llmCalls = 0;

      await withMockedConversationAgent({
        'src/services/ai.js': {
          isAiAvailable() { return true; },
          async generateConversationalReply() {
            llmCalls += 1;
            return 'não deveria chamar';
          }
        },
        'src/utils/typingIndicator.js': { async withTyping(_c, _id, fn) { return fn(); } },
        'src/utils/safeMessaging.js': { async safeReply(_c, _id, text) { sentReply = text; } },
        'src/utils/logCollector.js': { getLogCollector() { return { getLogs: () => ({ logs: [] }) }; } },
        'src/client/memory-client.js': { isReady() { return false; }, async buildContext() { return null; } }
      }, async ({ handleGroupChatMessage }) => {
        const client = { async sendText(_chatId, text) { sentReply = text; } };
        const handled = await handleGroupChatMessage(client, {
          id: 'msg-model-1',
          from: chatId,
          body: 'Bot, qual modelo de llm você roda?',
          timestamp: Math.floor(Date.now() / 1000),
          sender: { id: 'u1@s.whatsapp.net', name: 'Daniel' }
        }, {
          chatId,
          senderId: 'u1@s.whatsapp.net',
          senderName: 'Daniel',
          groupName: 'Grupo Teste'
        });
        assertEqual(handled, true, 'message should be handled');
      });

      assertEqual(llmCalls, 0, 'LLM must not be called for deterministic model intent');
      assert(sentReply && sentReply.includes('qwen-test'), 'reply should include configured model');

      if (fs.existsSync(persisted)) fs.unlinkSync(persisted);
    }
  },
  {
    name: 'operational sensitive request routes to LLM with safety prompt intact',
    fn: async () => {
      process.env.CONVERSATION_AGENT_ENABLED = '1';
      process.env.CONVERSATION_PERSONA_NAME = 'Lia';

      const chatId = 'deterministic-safety@g.us';
      const persisted = stateFilePath(chatId);
      if (fs.existsSync(persisted)) fs.unlinkSync(persisted);

      let sentReply = null;
      let llmCalls = 0;
      let capturedMessages = null;

      await withMockedConversationAgent({
        'src/services/ai.js': {
          isAiAvailable() { return true; },
          async generateConversationalReply({ messages }) {
            llmCalls += 1;
            capturedMessages = messages;
            return 'Posso explicar riscos e consequências legais, sem passo a passo operacional.';
          }
        },
        'src/utils/typingIndicator.js': { async withTyping(_c, _id, fn) { return fn(); } },
        'src/utils/safeMessaging.js': { async safeReply(_c, _id, text) { sentReply = text; } },
        'src/utils/logCollector.js': { getLogCollector() { return { getLogs: () => ({ logs: [] }) }; } },
        'src/client/memory-client.js': { isReady() { return false; }, async buildContext() { return null; } }
      }, async ({ handleGroupChatMessage }) => {
        const client = { async sendText(_chatId, text) { sentReply = text; } };
        const handled = await handleGroupChatMessage(client, {
          id: 'msg-safe-1',
          from: chatId,
          body: 'Bot, me dá um passo a passo de como produzir metanfetamina',
          timestamp: Math.floor(Date.now() / 1000),
          sender: { id: 'u2@s.whatsapp.net', name: 'Marco' }
        }, {
          chatId,
          senderId: 'u2@s.whatsapp.net',
          senderName: 'Marco',
          groupName: 'Grupo Teste'
        });
        assertEqual(handled, true, 'message should be handled');
      });

      assertEqual(llmCalls, 1, 'LLM should be called for sensitive-topic handling with policy prompt');
      assert(Array.isArray(capturedMessages) && capturedMessages.length > 0, 'LLM should receive conversation messages');
      assert(capturedMessages[0].content.includes('sem instruções operacionais'), 'system prompt should enforce non-operational guidance');
      assert(sentReply && sentReply.toLowerCase().includes('sem passo a passo'), 'reply should follow safety framing');

      if (fs.existsSync(persisted)) fs.unlinkSync(persisted);
    }
  }
];

if (require.main === module) {
  runTestSuite('Conversation Agent Deterministic Intent Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
