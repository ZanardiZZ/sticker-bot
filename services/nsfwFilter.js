const nsfwjs = require('nsfwjs');
const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');

let model;
const MODEL_INPUT_WIDTH = 224;
const MODEL_INPUT_HEIGHT = 224;
const MODEL_INPUT_QUALITY = 80;

async function loadModel() {
  if (!model) {
    if (typeof tf.enableProdMode === 'function') {
      tf.enableProdMode();
    }
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

    // Converte imagem para um formato menor e estável antes da inferência
    let processedBuffer;
    try {
      // Primeiro tenta detectar o formato e converter
      const metadata = await sharp(buffer).metadata();
      if (!metadata.format) {
        console.warn('Formato de imagem não detectado, assumindo como segura');
        return false;
      }
      processedBuffer = await sharp(buffer)
        .resize(MODEL_INPUT_WIDTH, MODEL_INPUT_HEIGHT, { fit: 'cover', position: 'center' })
        .jpeg({ quality: MODEL_INPUT_QUALITY })
        .toBuffer();
    } catch (sharpErr) {
      console.warn('Erro ao processar imagem com sharp:', sharpErr.message);
      return false;
    }

    const imageTensor = tf.node.decodeImage(processedBuffer, 3);
    const predictions = await model.classify(imageTensor);
    imageTensor.dispose();
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
