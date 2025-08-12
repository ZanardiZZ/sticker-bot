// utils/ensureStickerWebp.js
import sharp from 'sharp';
import { isAnimatedWebp } from './isAnimatedWebp.js';

/**
 * Detecta WebP (qualquer) pelo cabeçalho RIFF/WEBP.
 * Útil pra evitar re-encodar WebP estático desnecessariamente.
 */
function isAnyWebp(buf) {
  return (
    buf.length >= 12 &&
    buf.slice(0, 4).toString() === 'RIFF' &&
    buf.slice(8, 12).toString() === 'WEBP'
  );
}

/**
 * Converte buffer para WebP estático ***somente se necessário***.
 * - Mantém WebP animado intocado.
 * - Se já for WebP estático, retorna como está.
 * - Para outros formatos (png/jpg/heic/gif estático, etc), exporta WebP 512px máx.
 */
export async function ensureStickerWebp(buf) {
  // 1) Se for WebP animado, preserve
  if (isAnimatedWebp(buf)) return buf;

  // 2) Se já for WebP (estático), não re-encode
  if (isAnyWebp(buf)) return buf;

  // 3) Converter para WebP estático com limites de sticker
  //    - 512 no maior lado
  //    - remove metadata
  //    - qualidade equilibrada
  try {
    const webpBuf = await sharp(buf, { pages: 1 }) // se vier GIF, pega o 1º frame
      .rotate() // respeita EXIF
      .resize({
        width: 512,
        height: 512,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({
        quality: 80,
        effort: 4,       // trade-off velocidade/compactação
        lossless: false, // lossless tende a gerar arquivos maiores
      })
      .toBuffer({ resolveWithObject: false });

    return webpBuf;
  } catch (err) {
    // Se algo der errado, devolve o original para não quebrar o fluxo do bot
    // (e loga no chamador)
    return buf;
  }
}
