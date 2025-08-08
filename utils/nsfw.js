// utils/nsfw.js
const tf = require('@tensorflow/tfjs-node');
const nsfw = require('nsfwjs');
const sharp = require('sharp');

let cachedModel = null;
let cachedSize = null;

async function ensureFetch() {
  if (typeof fetch === 'undefined') {
    const fetchFn = require('node-fetch').default;
    global.fetch = fetchFn;
  }
}

async function isImageNSFW(imageBuffer, modelName = 'mobilenet_v2') {
  if (!cachedModel) {
    const size = modelName === 'inception_v3' ? 299 : 224;
    cachedSize = size;
    await ensureFetch();
    const modelUrl = process.env.NSFW_MODEL_URL || undefined;
    cachedModel = await nsfw.load(modelUrl, { size });
  }

  const pngBuffer = await sharp(imageBuffer)
    .resize(cachedSize, cachedSize, { fit: 'cover' })
    .png()
    .toBuffer();

  const imageTensor = tf.node.decodeImage(pngBuffer, 3);
  try {
    const preds = await cachedModel.classify(imageTensor);
    return preds.some(p =>
      ['porn','hentai','sexy'].some(tag => p.className.toLowerCase().includes(tag))
      && p.probability > 0.7
    );
  } finally {
    imageTensor.dispose();
  }
}

module.exports = { isImageNSFW };
