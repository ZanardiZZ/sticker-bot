const nsfw = require("nsfwjs");
const tf = require("@tensorflow/tfjs-node");
const sharp = require("sharp");

/**
 * Verifica se a imagem WebP é NSFW convertendo-a para JPEG.
 * @param {Buffer} imageBuffer
 * @returns {Promise<boolean>}
 */
async function isImageNSFW(imageBuffer) {
  // converte WebP para JPEG usando sharp
  const jpegBuffer = await sharp(imageBuffer)
    .jpeg()
    .toBuffer();

  const image = tf.node.decodeImage(jpegBuffer, 3);
  const model = await nsfw.load();

  const predictions = await model.classify(image);
  image.dispose();

  const nsfwScore = predictions
    .filter(p => ["Porn", "Hentai", "Sexy"].includes(p.className))
    .reduce((acc, cur) => acc + cur.probability, 0);

  return nsfwScore > 0.7;
}

module.exports = isImageNSFW;
