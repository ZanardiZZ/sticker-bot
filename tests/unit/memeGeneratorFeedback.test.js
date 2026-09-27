const { assert, assertEqual, runTestSuite } = require('../helpers/testUtils');
const path = require('path');

const MODULE = path.resolve(__dirname, '../../src/plugins/memeGenerator.js');

const tests = [
  {
    name: 'exports meme feedback classification and directive helpers',
    fn: async () => {
      const feedback = require('../../src/services/memeFeedback');
      assertEqual(feedback.classifyMemeFeedback('🎯'), 'positive');
      assertEqual(feedback.classifyMemeFeedback('👎'), 'negative');
      assert(feedback.buildMemeFeedbackDirective({ positive: 1 }).includes('1 feedback'));
    }
  },
  {
    name: 'meme generator module remains loadable after feedback wiring',
    fn: async () => {
      const generator = require(MODULE);
      assert(typeof generator.registrarReacao === 'function');
      assert(typeof generator.gerarPromptMeme === 'function');
    }
  }
];

if (require.main === module) runTestSuite('Meme Generator Feedback Wiring Tests', tests).then(result => process.exit(result.failed ? 1 : 0));

module.exports = { tests };
