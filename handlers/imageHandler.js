// handlers/imageHandler.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Handler para processamento de imagens:
 * comandos via caption (message.caption) ou corpo (message.body):
 *  - #sticker         → converte imagem em sticker (.webp)
 *  - #rotate <deg>    → rotaciona em graus (ex: #rotate 90)
 *  - #grayscale       → aplica filtro grayscale
 *  - #flip            → espelha verticalmente
 */
async function handleImage(client, message) {
  // 1. Baixa e decifra a imagem
  const buffer = await client.decryptFile(message);
  if (!buffer) throw new Error('404 - Falha ao baixar imagem');

  // 2. Lê comando e argumentos
  const caption = (message.caption || message.body || '').trim();
  const [cmd, ...args] = caption.split(/\s+/);

  let outputBuffer;
  let filename;

  switch (cmd) {
    case '#sticker':
      outputBuffer = await sharp(buffer)
        .resize(512, 512, { fit: 'inside' })
        .webp()
        .toBuffer();
      filename = `sticker_${message.id}.webp`;
      break;

    case '#rotate': {
      const angle = parseInt(args[0], 10) || 0;
      outputBuffer = await sharp(buffer)
        .rotate(angle)
        .toBuffer();
      filename = `rotate_${angle}_${message.id}.png`;
      break;
    }

    case '#grayscale':
      outputBuffer = await sharp(buffer)
        .grayscale()
        .toBuffer();
      filename = `grayscale_${message.id}.png`;
      break;

    case '#flip':
      outputBuffer = await sharp(buffer)
        .flip()
        .toBuffer();
      filename = `flip_${message.id}.png`;
      break;

    default:
      await client.sendText(
        message.from,
        '🤖 Comando de imagem inválido. Use:\n' +
        '#sticker → converter em sticker\n' +
        '#rotate <deg> → rotacionar imagem\n' +
        '#grayscale → aplicar filtro grayscale\n' +
        '#flip → espelhar verticalmente'
      );
      return;
  }

  // 3. Salva temporariamente e envia de volta
  const outDir = path.join('stickers');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, outputBuffer);

  await client.sendImage(
    message.from,
    outPath,
    filename,
    'Aqui está sua imagem processada!'
  );
}

module.exports = handleImage;
