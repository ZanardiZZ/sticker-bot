#!/usr/bin/env node

const { runTestSuite, assertEqual } = require('../helpers/testUtils');
const { resolveNaturalCommand, extractThemeTerm } = require('../../src/utils/naturalCommandRouter');

const tests = [
  {
    name: 'maps explicit ping with bot cue in group',
    fn: async () => {
      const out = resolveNaturalCommand({
        text: 'Bot, você está online?',
        context: { isGroup: true }
      });
      assertEqual(out, '#ping');
    }
  },
  {
    name: 'does not map generic status in group without bot cue',
    fn: async () => {
      const out = resolveNaturalCommand({
        text: 'você está online?',
        context: { isGroup: true }
      });
      assertEqual(out, null);
    }
  },
  {
    name: 'maps explicit sticker ask to #tema with term',
    fn: async () => {
      const out = resolveNaturalCommand({
        text: 'manda figurinha de gato',
        context: { isGroup: true }
      });
      assertEqual(out, '#tema gato');
    }
  },
  {
    name: 'maps random sticker ask to #random',
    fn: async () => {
      const out = resolveNaturalCommand({
        text: 'bot me manda uma figurinha aleatória',
        context: { isGroup: true }
      });
      assertEqual(out, '#random');
    }
  },
  {
    name: 'maps help/menu ask to #comandos',
    fn: async () => {
      const out = resolveNaturalCommand({
        text: 'bot, quais comandos você tem? me ajuda',
        context: { isGroup: true }
      });
      assertEqual(out, '#comandos');
    }
  },
  {
    name: 'does not map conversational "ajudá-lo" sentence to #comandos',
    fn: async () => {
      const out = resolveNaturalCommand({
        text: 'Bot, o Blurk está viciado em te usar, como podemos ajudá-lo a se livrar do vício?',
        context: { isGroup: true }
      });
      assertEqual(out, null);
    }
  },
  {
    name: 'extractThemeTerm strips polite suffix',
    fn: async () => {
      const out = extractThemeTerm('quero figurinha de half life por favor');
      assertEqual(out, 'half life');
    }
  }
];

module.exports = { tests };

if (require.main === module) {
  runTestSuite('Natural Command Router Tests', tests)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
