// utils/frames.js
const sharp = require('sharp');

const HAS_EXTRACT = typeof sharp.prototype.extractFrame === 'function';

async function getRepresentativeFrame(buffer) {
  const meta = await sharp(buffer, { animated: true }).metadata();
  const pages = meta.pages || 1;

  if (pages > 1) {
    const mid = Math.floor(pages / 2);
    if (HAS_EXTRACT) {
      return await sharp(buffer, { animated: true })
        .extractFrame(mid)
        .png()
        .toBuffer();
    }
    return await sharp(buffer, { animated: true, page: mid, pages: 1 })
      .png()
      .toBuffer();
  }

  return await sharp(buffer).png().toBuffer();
}

module.exports = { getRepresentativeFrame };
