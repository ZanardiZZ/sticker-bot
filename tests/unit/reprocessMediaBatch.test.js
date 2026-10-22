const assert = require('assert');
const {
  isDescriptionMissing,
  hasBadTags,
  selectProcessor
} = require('../../scripts/reprocess-media-batch');

assert.strictEqual(isDescriptionMissing(null), true);
assert.strictEqual(isDescriptionMissing('Análise automática indisponível para o GIF no momento.'), true);
assert.strictEqual(isDescriptionMissing('Uma descrição válida da figurinha.'), false);
assert.strictEqual(hasBadTags(['n', 'o', 'json', 'description']), true);
assert.strictEqual(hasBadTags(['gato', 'preto', 'meme']), false);
assert.strictEqual(selectProcessor('image/gif'), 'gif');
assert.strictEqual(selectProcessor('video/mp4'), 'gif');
assert.strictEqual(selectProcessor('image/webp'), 'image');
console.log('reprocessMediaBatch: PASS');
