// utils/webp2gif.js
const webp = require('webp-converter');

/**
 * Converte um .webp animado para .gif e devolve o caminho do GIF.
 * Retorna uma Promise que resolve quando a conversão termina.
 */
function webpToGif(inputPath) {
  const outputPath = `${inputPath}.gif`;

  return new Promise((resolve, reject) => {
    // -q 80 = qualidade; mude se quiser
    webp.webp2gif(inputPath, outputPath, "-q 80", (status, error) => {
      if (error) return reject(error);     // erro de conversão
      if (status.trim() !== '100') {       // webp-converter devolve "100" on success
        return reject(new Error('Conversão incompleta: ' + status));
      }
      resolve(outputPath);
    });
  });
}

module.exports = { webpToGif };
