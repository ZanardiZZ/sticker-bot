// utils/ensureStickerWebp.js
import axios from 'axios';
import { isAnimatedWebp } from './isAnimatedWebp.js';

/**
 * Converte buffer para WebP estático ***somente se necessário***.
 * Mantém WebP animado intocado.
 */
export async function ensureStickerWebp(buf) {
  if (isAnimatedWebp(buf)) return buf;           // já é WebP animado

  const { data } = await axios.post(
    'http://192.168.0.250:9000/convert?type=webp',
    buf,
    {
      headers: { 'Content-Type': 'application/octet-stream' },
      responseType: 'arraybuffer',
      timeout: 15000
    }
  );
  return Buffer.from(data);
}
