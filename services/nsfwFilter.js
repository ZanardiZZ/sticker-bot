const nsfwjs = require('nsfwjs');
const tf = require('@tensorflow/tfjs-node');
const { createCanvas, loadImage } = require('canvas');

let model;

async function loadModel() {
  if (!model) {
    model = await nsfwjs.load(); // Carrega o modelo padrão NSFWJS
  }
  return model;
}

/**
 * Recebe um buffer de imagem e retorna true se for conteúdo NSFW.
 * @param {Buffer} buffer
 * @returns {Promise<boolean>}
 */
async function isNSFW(buffer) {
  try {
    const model = await loadModel();
    const img = await loadImage(buffer);

    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const predictions = await model.classify(canvas);
    // labels típicos: 'Porn', 'Hentai', 'Sexy', 'Neutral', 'Drawing'
    // Consideramos NSFW se Porn ou Hentai > 0.7

    const nsfwLabels = ['Porn', 'Hentai'];
    const threshold = 0.7;

    const isNSFW = predictions.some(
      pred => nsfwLabels.includes(pred.className) && pred.probability > threshold
    );

    return isNSFW;
  } catch (err) {
    console.error('Erro no filtro NSFW local:', err);
    // Caso erro, retorna false para não bloquear
    return false;
  }
}

module.exports = { isNSFW };