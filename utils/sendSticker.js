// utils/sendSticker.cjs
const fs     = require('fs/promises');
const sharp  = require('sharp');
const crypto = require('node:crypto');
const { Sticker } = require('wa-sticker-formatter');

const { ensureStickerWebp } = require('../utils/ensureStickerWebp.js');
const { isAnimatedWebp }    = require('../utils/isAnimatedWebp.js');
const { webpToGif }         = require('../utils/webpToGif.js');

const MAX_SIZE = 1.8 * 1024 * 1024;

async function sendSticker(client, chatId, filePath) {
  let buf = await fs.readFile(filePath);

  if (isAnimatedWebp(buf)) {
    const gifPath = await webpToGif(filePath);
    await client.sendImageAsStickerGif(chatId, gifPath);
    return;
  }

  buf = await ensureStickerWebp(buf);

  if (buf.length > MAX_SIZE) {
    buf = await sharp(buf)
      .resize(512, 512, { fit: 'inside' })
      .webp({ quality: 80 })
      .toBuffer();
  }

  const sticker = new Sticker(buf, {
    pack:   'Figurinhas',
    author: 'Bot',
    id:     crypto.randomUUID()
  });

  await client.sendImageAsSticker(chatId, await sticker.toBuffer());
}

module.exports = { sendSticker };
