const fs = require('fs/promises');
const sharp = require('sharp');
const { Image } = require('node-webpmux');
const { randomUUID } = require('crypto');

const DEFAULT_BACKGROUND = { r: 0, g: 0, b: 0, alpha: 0 };

const StickerTypes = {
  DEFAULT: 'default',
  CROPPED: 'crop',
  FULL: 'full',
  CIRCLE: 'circle',
  ROUNDED: 'rounded'
};

async function loadInput(source) {
  if (Buffer.isBuffer(source)) {
    return source;
  }

  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (trimmed.startsWith('<svg')) {
      return Buffer.from(source);
    }
    return fs.readFile(source);
  }

  throw new Error('Unsupported sticker source');
}

function normaliseBackground(background) {
  if (!background) {
    return DEFAULT_BACKGROUND;
  }
  if (typeof background === 'string') {
    return background;
  }
  const { r = 0, g = 0, b = 0, alpha = 0 } = background;
  return { r, g, b, alpha };
}

function buildExif(metadata) {
  const exifPayload = {
    'sticker-pack-id': metadata.id || randomUUID(),
    'sticker-pack-name': metadata.pack || '',
    'sticker-pack-publisher': metadata.author || '',
    emojis: Array.isArray(metadata.categories) ? metadata.categories : []
  };
  const json = Buffer.from(JSON.stringify(exifPayload), 'utf8');
  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x41, 0x57,
    0x07, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x16, 0x00, 0x00, 0x00
  ]);
  const exif = Buffer.concat([header, json]);
  exif.writeUInt32LE(json.length, 14);
  return exif;
}

async function addMetadataToWebp(buffer, metadata) {
  const img = new Image();
  await img.load(buffer);
  img.exif = buildExif(metadata);
  return img.save(null);
}

function resizeOptionsFor(type, background) {
  switch (type) {
    case StickerTypes.FULL:
      return { fit: sharp.fit.contain, background: normaliseBackground(background) };
    case StickerTypes.CROPPED:
    case StickerTypes.CIRCLE:
    case StickerTypes.ROUNDED:
    default:
      return { fit: sharp.fit.cover };
  }
}

class Sticker {
  constructor(source, options = {}) {
    this.source = source;
    this.options = {
      pack: options.pack || '',
      author: options.author || '',
      id: options.id,
      categories: Array.isArray(options.categories) ? options.categories : [],
      quality: Number.isFinite(options.quality) ? Math.min(100, Math.max(1, options.quality)) : 70,
      type: Object.values(StickerTypes).includes(options.type) ? options.type : StickerTypes.DEFAULT,
      background: options.background || DEFAULT_BACKGROUND
    };
  }

  async build() {
    const input = await loadInput(this.source);
    const resizeOptions = resizeOptionsFor(this.options.type, this.options.background);
    const webpBuffer = await sharp(input)
      .resize(512, 512, resizeOptions)
      .webp({ quality: this.options.quality, lossless: false })
      .toBuffer();

    return addMetadataToWebp(webpBuffer, this.options);
  }
}

module.exports = {
  Sticker,
  StickerTypes
};
