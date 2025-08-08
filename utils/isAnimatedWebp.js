// utils/isAnimatedWebp.js
/**
 * Retorna true se o WebP tiver flag de animação ligada.
 * Analisa só os primeiros bytes: rápido e síncrono.
 */
function isAnimatedWebp(buf) {
  return (
    buf.slice(0, 4).toString() === 'RIFF' &&   // cabeçalho RIFF
    buf.slice(8, 12).toString() === 'WEBP' &&  // container WEBP
    buf.slice(12, 16).toString() === 'VP8X' && // chunk VP8X
    (buf[20] & 0x10) === 0x10                  // bit ANIM = 1
  );
}

module.exports = { isAnimatedWebp };
