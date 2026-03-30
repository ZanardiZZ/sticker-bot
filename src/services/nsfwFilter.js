const nsfwjs = require('nsfwjs');
const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');
const { classifyImage: classifyWithExternalService } = require('./nsfwExternal');

const DEBUG = process.env.DEBUG_NSFWMODEL === '1';

function logDebug(...args) {
  if (DEBUG) {
    console.log('[NSFW Local]', ...args);
  }
}

let model;
const MODEL_INPUT_WIDTH = 224;
const MODEL_INPUT_HEIGHT = 224;
const MODEL_INPUT_QUALITY = 80;

const LOCAL_LABEL_THRESHOLDS = [
  { label: 'Porn', threshold: Number(process.env.NSFW_LOCAL_PORN_THRESHOLD) || 0.6 },
  { label: 'Hentai', threshold: Number(process.env.NSFW_LOCAL_HENTAI_THRESHOLD) || 0.6 },
  { label: 'Sexy', threshold: Number(process.env.NSFW_LOCAL_SEXY_THRESHOLD) || 0.85 }
];

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
 * @param {{ mimeType?: string, source?: string }} [options]
 * @returns {Promise<boolean>}
 */
async function isNSFW(buffer, options = {}) {
  try {
    // Validação básica do buffer
    if (!buffer || buffer.length < 10) {
      console.warn('Buffer muito pequeno ou inválido para análise NSFW');
      return false;
    }

    // Try external provider first if configured
    try {
      const externalResult = await classifyWithExternalService(buffer, { mimeType: options.mimeType });
      if (externalResult) {
        logDebug('Detecção via serviço externo', externalResult);
        return Boolean(externalResult.nsfw);
      }
    } catch (externalErr) {
      console.warn('Erro ao consultar serviço externo de NSFW:', externalErr.message);
    }

    const nsfwModel = await loadModel();
    if (!nsfwModel) {
      console.warn('Modelo NSFW local indisponível, assumindo conteúdo seguro');
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
    const predictions = await nsfwModel.classify(imageTensor);
    imageTensor.dispose();

    let flaggedPrediction = null;
    const isFlagged = predictions.some(pred => {
      const rule = LOCAL_LABEL_THRESHOLDS.find(item => item.label === pred.className);
      if (!rule) return false;
      const hit = pred.probability >= rule.threshold;
      if (hit && !flaggedPrediction) {
        flaggedPrediction = { ...pred, threshold: rule.threshold };
      }
      return hit;
    });

    if (isFlagged && flaggedPrediction) {
      console.log('[NSFW Local] Conteúdo marcado como NSFW:', {
        label: flaggedPrediction.className,
        probability: flaggedPrediction.probability,
        threshold: flaggedPrediction.threshold,
        source: options?.source || 'image'
      });
    }

    logDebug('Resultado modelo local', predictions, { flagged: isFlagged, flaggedPrediction });
    return isFlagged;
  } catch (err) {
    console.error('Erro no filtro NSFW local:', err.message);
    // Caso erro, retorna false para não bloquear o processamento
    return false;
  }
}

module.exports = { isNSFW };
