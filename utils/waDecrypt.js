// utils/waDecrypt.js
const axios = require('axios');
const crypto = require('crypto');

const MEDIA_INFO = {
  image:    'WhatsApp Image Keys',
  sticker:  'WhatsApp Image Keys',
  video:    'WhatsApp Video Keys',
  audio:    'WhatsApp Audio Keys',
  document: 'WhatsApp Document Keys',
};

function normalizeB64(b64) {
  b64 = String(b64 || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/\s/g, '');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  return b64;
}

function b64ToBuf(b64) {
  return Buffer.from(normalizeB64(b64), 'base64');
}

function hkdfSha256(ikm, salt, info, len) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  let t = Buffer.alloc(0);
  let okm = Buffer.alloc(0);
  for (let i = 1; okm.length < len; i++) {
    t = crypto.createHmac('sha256', prk)
      .update(Buffer.concat([t, info, Buffer.from([i])]))
      .digest();
    okm = Buffer.concat([okm, t]);
  }
  return okm.slice(0, len);
}

function deriveKeys(mediaKeyB64, type = 'image') {
  const infoStr = MEDIA_INFO[type] || MEDIA_INFO.image;
  const ikm = b64ToBuf(mediaKeyB64);
  const salt = Buffer.alloc(32, 0);
  const info = Buffer.from(infoStr, 'utf8');
  const okm = hkdfSha256(ikm, salt, info, 112);
  return {
    iv:     okm.slice(0, 16),
    cipher: okm.slice(16, 48),
    macKey: okm.slice(48, 80),
  };
}

function decryptEnc(encBuffer, mediaKeyB64, type = 'image') {
  if (!Buffer.isBuffer(encBuffer) || encBuffer.length <= 10) {
    throw new Error('Encrypted payload too small');
  }
  const { iv, cipher, macKey } = deriveKeys(mediaKeyB64, type);
  const mac     = encBuffer.subarray(encBuffer.length - 10);
  const payload = encBuffer.subarray(0, encBuffer.length - 10);
  const calcMac = crypto.createHmac('sha256', macKey)
    .update(Buffer.concat([iv, payload]))
    .digest()
    .subarray(0, 10);

  if (!crypto.timingSafeEqual(mac, calcMac)) {
    throw new Error('Bad media MAC (integrity check failed)');
  }
  const decipher = crypto.createDecipheriv('aes-256-cbc', cipher, iv);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

async function downloadAndDecrypt(urlEnc, mediaKeyB64, type = 'image') {
  let res;
  try {
    res = await axios.get(urlEnc, {
      responseType: 'arraybuffer',
      validateStatus: () => true
    });
  } catch (e) {
    throw new Error(`Download failed: ${e.message}`);
  }
  if (res.status !== 200) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.url = urlEnc;
    throw err;
  }
  return decryptEnc(Buffer.from(res.data), mediaKeyB64, type);
}

module.exports = {
  deriveKeys,
  decryptEnc,
  downloadAndDecrypt
};
