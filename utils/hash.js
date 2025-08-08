// utils/hash.js
const sharp = require('sharp');

/** Gera pHash (8×8) em HEX */
async function gerarHashVisual(buffer) {
  try {
    const raw = await sharp(buffer)
      .grayscale()
      .resize(8, 8, { fit: 'fill' })
      .raw()
      .toBuffer(); // 64 bytes

    const avg = raw.reduce((s, v) => s + v, 0) / raw.length;
    let bits = '';
    for (let i = 0; i < raw.length; i++) bits += raw[i] > avg ? '1' : '0';

    return BigInt('0b' + bits).toString(16).padStart(16, '0');
  } catch (err) {
    console.warn('⚠️ gerarHashVisual falhou:', err.message);
    return null;
  }
}

/** Distância de Hamming entre dois hashes HEX */
function hammingDistance(ha, hb) {
  if (!ha || !hb) return Number.MAX_SAFE_INTEGER;
  const norm = h => String(h).replace(/^0x/i, '').toLowerCase();
  let a = norm(ha), b = norm(hb);
  if (!a || !b) return Number.MAX_SAFE_INTEGER;

  const len = Math.min(a.length, b.length);
  a = a.slice(-len); b = b.slice(-len);

  const A = Buffer.from(a, 'hex');
  const B = Buffer.from(b, 'hex');
  let dist = 0;

  for (let i = 0; i < A.length; i++) {
    let x = A[i] ^ B[i];
    x = x - ((x >> 1) & 0x55);
    x = (x & 0x33) + ((x >> 2) & 0x33);
    dist += ((x + (x >> 4)) & 0x0F);
  }
  return dist;
}

module.exports = {
  gerarHashVisual,
  hammingDistance
};
