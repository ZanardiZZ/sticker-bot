#!/usr/bin/env node

const { assert, assertEqual, runTestSuite } = require('../helpers/testUtils');
const { normalizeConversationMessages } = require('../../src/services/ai');

const tests = [
  {
    name: 'normalizeConversationMessages keeps a single system message at index 0',
    fn: async () => {
      const input = [
        { role: 'user', content: 'Oi' },
        { role: 'system', content: 'S1' },
        { role: 'assistant', content: 'A1' },
        { role: 'system', content: 'S2' },
        { role: 'tool', content: 'T1' },
        { role: 'user', content: '   ' }
      ];

      const out = normalizeConversationMessages(input, { forceNoThink: false });
      assert(Array.isArray(out), 'output must be an array');
      assertEqual(out[0].role, 'system', 'first message must be system');
      assert(out[0].content.includes('S1'), 'system content should include first system block');
      assert(out[0].content.includes('S2'), 'system content should include merged system block');
      assertEqual(out.filter(m => m.role === 'system').length, 1, 'must have exactly one system message');
      assertEqual(out[1].role, 'user', 'first non-system should remain user');
      assertEqual(out[2].role, 'assistant', 'assistant message should be preserved');
      assertEqual(out[3].role, 'user', 'unknown roles should be converted to user');
    }
  },
  {
    name: 'normalizeConversationMessages applies /no_think only to the latest user turn',
    fn: async () => {
      const input = [
        { role: 'system', content: 'Base rules' },
        { role: 'user', content: 'primeira pergunta' },
        { role: 'assistant', content: 'resposta' },
        { role: 'user', content: 'segunda pergunta' }
      ];

      const out = normalizeConversationMessages(input, { forceNoThink: true });
      const userTurns = out.filter(m => m.role === 'user');
      assertEqual(userTurns.length, 2, 'expected two user turns');
      assertEqual(userTurns[0].content, 'primeira pergunta', 'older user turn must not be modified');
      assert(userTurns[1].content.startsWith('/no_think '), 'latest user turn must receive /no_think prefix');
    }
  }
];

if (require.main === module) {
  runTestSuite('Conversation Message Normalization Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { tests };
