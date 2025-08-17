const { extractFrames } = require('./videoProcessor');
const fs = require('fs');
const sharp = require('sharp');
const nsfwjs = require('nsfwjs');
const tf = require('@tensorflow/tfjs-node');

let model = null;

async function loadModel() {
  if (!model) {
    model = await nsfwjs.load();
  }
  return model;
}

async function isImageNSFW(buffer) {
  const loadedModel = await loadModel();
  const image = await sharp(buffer).resize(224,224).toBuffer();
  const tfimage = tf.node.decodeImage(image, 3);
  const predictions = await loadedModel.classify(tfimage);
  tfimage.dispose();

  const nsfwPrediction = predictions.find(p => ['Porn', 'Hentai', 'Sexy'].includes(p.className));
  if (nsfwPrediction && nsfwPrediction.probability > 0.7) {
    return true;
  }
  return false;
}

async function isVideoNSFW(filePath) {
  try {
    // Extrair frames 10%, 50%, 90%
    const duration = await new Promise((res, rej) => {
      const ffmpeg = require('fluent-ffmpeg');
      ffmpeg.ffprobe(filePath, (err, meta) => {
        if (err) return rej(err);
        else return res(meta.format.duration);
      });
    });

    const timestamps = [duration * 0.1, duration * 0.5, duration * 0.9];
    const framesPaths = await extractFrames(filePath, timestamps);

    for (const fp of framesPaths) {
      const buffer = fs.readFileSync(fp);
      const nsfw = await isImageNSFW(buffer);
      // Remover frame
      fs.unlinkSync(fp);
      if (nsfw) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Erro na análise NSFW do vídeo:', error);
    // Em caso de erro, considerar não nsfw para não bloquear mídia por falha
    return false;
  }
}

module.exports = {
  isVideoNSFW
};
