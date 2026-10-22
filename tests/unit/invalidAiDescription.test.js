const assert = require('assert');
const { isInvalidAiDescription } = require('../../src/services/ai');
const { isDescriptionMissing } = require('../../scripts/reprocess-media-batch');
assert.strictEqual(isInvalidAiDescription('Como não foi fornecida uma imagem real para análise no prompt (apenas um marcador de texto [Image 1]), não é possível gerar a descrição.'), true);
assert.strictEqual(isInvalidAiDescription('Homem sorrindo em um sofá.'), false);
assert.strictEqual(isDescriptionMissing('Como não foi fornecida uma imagem real para análise no prompt (apenas um marcador de texto [Image 1]), não é possível gerar a descrição.'), true);
console.log('invalidAiDescription: PASS');
