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

    // Validação básica do buffer
    if (!buffer || buffer.length < 10) {
      console.warn('Buffer muito pequeno ou inválido para análise NSFW');
      return false;
    }

    // Converte imagem para png de forma mais robusta
    let pngBuffer;
    try {
      // Primeiro tenta detectar o formato e converter
      const metadata = await sharp(buffer).metadata();
      if (!metadata.format) {
        console.warn('Formato de imagem não detectado, assumindo como segura');
        return false;
      }
      
      pngBuffer = await sharp(buffer).png().toBuffer();
    } catch (sharpErr) {
      console.warn('Erro ao processar imagem com sharp:', sharpErr.message);
      return false;
    }

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
    console.error('Erro no filtro NSFW local:', err.message);
    // Caso erro, retorna false para não bloquear o processamento
    return false;
  }
}

module.exports = { isNSFW };