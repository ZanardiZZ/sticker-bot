const assert = require('assert');
const { normalizeAiTags } = require('../../src/services/ai');

assert.strictEqual(typeof normalizeAiTags, 'function');
assert.deepStrictEqual(
  normalizeAiTags(['#n', '#o', '#foi', '#quadrado', '#quadrado'], 'Quadrado preto com formas desfocadas'),
  ['#foi', '#quadrado', '#preto', '#formas', '#desfocadas']
);
assert.deepStrictEqual(
  normalizeAiTags(['json', 'description', '#a', ''], 'Gato preto sorrindo'),
  ['#gato', '#preto', '#sorrindo']
);
console.log('aiTagNormalization: PASS');
