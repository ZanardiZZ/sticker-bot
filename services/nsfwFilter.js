const nsfwjs = require('nsfwjs');
const tf = require('@tensorflow/tfjs-node');
const { createCanvas, loadImage } = require('canvas');
const sharp = require('sharp');

let model;

async function loadModel() {
  if (!model) {
    model = await nsfwjs.load('MobileNetV2'); // Default model
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

    // Converte imagem webp para png (ou qualquer formato suportado) antes de carregar
    const pngBuffer = await sharp(buffer).png().toBuffer();
    const img = await loadImage(`data:image/png;base64,${pngBuffer.toString('base64')}`);

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