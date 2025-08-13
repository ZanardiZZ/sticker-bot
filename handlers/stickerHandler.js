const { decryptFile, looksLikeImage } = require('../utils/decrypt.js');
const { gerarHashVisual, hammingDistance } = require('../utils/hash.js');
const { gerarDescricaoETag } = require('../utils/ia.js');
const { isImageNSFW } = require('../utils/nsfw.js');
const { getRepresentativeFrame } = require('../utils/frames.js');
const {
  listarFigurinhas,
  inserirFigurinha,
  buscarPorHash,
  atualizarDescricao
} = require('../database.js');

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const localPath = 'stickers';
if (!fs.existsSync(localPath)) {
  fs.mkdirSync(localPath, { recursive: true });
}

const pendentesForcar = new Map();
const MAX_DIST_SIMILAR = 5;

async function handleSticker(client, message) {
  const destino = message.from;
  console.log('handleSticker - Recebido from:', destino);

  // 1) Decrypt
  const originalBuffer = await decryptFile(client, message);
  if (!originalBuffer) throw new Error('404 - Falha ao baixar arquivo');
  if (!looksLikeImage(originalBuffer)) throw new Error('Arquivo não é imagem após decrypt');

  // 2) Pega frame para análise
  const analysisPng = await getRepresentativeFrame(originalBuffer);

  // 3) Hash MD5 do arquivo original
  const hash = crypto.createHash('md5').update(originalBuffer).digest('hex');

  // 4) Hash visual
  let visualHash = null;
  try {
    visualHash = await gerarHashVisual(analysisPng);
  } catch (e) {
    console.warn('⚠️ Hash visual falhou, seguindo só com MD5:', e.message);
  }

  // 5) Busca similares
  if (visualHash) {
    const todas = listarFigurinhas();
    const similares = todas
      .filter(f => f.visual_hash)
      .map(f => ({ ...f, dist: hammingDistance(visualHash, f.visual_hash) }))
      .filter(f => f.dist <= MAX_DIST_SIMILAR)
      .sort((a, b) => a.dist - b.dist);

    if (similares.length > 0) {
      pendentesForcar.set(message.id, { visualHash, buffer: originalBuffer });
      await client.sendText(
        destino,
        `⚠️ Figurinha parecida detectada (ID ${similares[0].id}).\nEnvie #forçar para confirmar a adição.`
      );
      return;
    }
  }

  // 6) Verifica duplicata exata (MD5)
  const existente = buscarPorHash(hash);
  if (existente) {
    if (existente.descricao && existente.tag) {
      await client.sendText(
        destino,
        `♻️ Figurinha já cadastrada!\n📝 ${existente.descricao}\n🏷️ ${existente.tag}\n🆔 ${existente.id}`
      );
      return;
    }
    // atualiza descrição/tag faltantes
    const { description, tag } = await gerarDescricaoETag(analysisPng);
    atualizarDescricao(existente.id, description, tag);
    await client.sendText(
      destino,
      `🆙 Figurinha atualizada!\n📝 ${description}\n🏷️ ${tag}\n🆔 ${existente.id}`
    );
    return;
  }

  // 7) NSFW
  const nsfw = await isImageNSFW(analysisPng);
  if (nsfw) throw new Error('NSFW');

  // 8) Descrição/tag
  const { description, tag } = await gerarDescricaoETag(analysisPng);

  // 9) Salva original como .webp
  const filePath = path.join(localPath, `${hash}.webp`);
  try {
    const isWebp =
      originalBuffer.slice(0, 4).toString() === 'RIFF' &&
      originalBuffer.slice(8, 12).toString() === 'WEBP';
    if (isWebp) {
      fs.writeFileSync(filePath, originalBuffer);
    } else {
      const webp = await sharp(originalBuffer, { animated: true }).webp().toBuffer();
      fs.writeFileSync(filePath, webp);
    }
  } catch (e) {
    console.warn('⚠️ Falha ao salvar .webp, salvando bruto:', e.message);
    fs.writeFileSync(filePath, originalBuffer);
  }

  // 10) Insere no banco
  const id = inserirFigurinha({
    file: hash,
    descricao: description,
    tag,
    nsfw: 0,
    remetente: message.sender?.id || message.author || 'desconhecido',
    grupo: destino,
    visual_hash: visualHash
  });

  // 11) Responde ao usuário
  console.log('handleSticker - Enviando mensagem para:', destino);
  await client.sendText(
    destino,
    `✅ Figurinha adicionada!\n📝 ${description}\n🏷️ ${tag}\n🆔 ${id}`
  );
}

async function forceAdd(client, message) {
  if (!pendentesForcar.size) {
    await client.sendText(message.from, '❌ Nenhuma figurinha pendente para forçar.');
    return;
  }
  const [origId, { visualHash, buffer: originalBuffer }] = pendentesForcar.entries().next().value;
  const destino = message.from;
  console.log('forceAdd - Enviando mensagem para:', destino);

  // frame para análise
  const analysisPng = await getRepresentativeFrame(originalBuffer);

  // MD5 do original
  const hash = crypto.createHash('md5').update(originalBuffer).digest('hex');

  // NSFW
  const nsfw = await isImageNSFW(analysisPng);
  if (nsfw) throw new Error('NSFW');

  // descrição/tag com IA
  const { description, tag } = await gerarDescricaoETag(analysisPng);

  // salva original
  const filePath = path.join(localPath, `${hash}.webp`);
  try {
    const isWebp =
      originalBuffer.slice(0, 4).toString() === 'RIFF' &&
      originalBuffer.slice(8, 12).toString() === 'WEBP';
    if (isWebp) {
      fs.writeFileSync(filePath, originalBuffer);
    } else {
      const webpBuf = await sharp(originalBuffer, { animated: true }).webp().toBuffer();
      fs.writeFileSync(filePath, webpBuf);
    }
  } catch (e) {
    console.warn('⚠️ Falha ao salvar .webp, salvando bruto:', e.message);
    fs.writeFileSync(filePath, originalBuffer);
  }

  // insere forçado no DB
  const id = inserirFigurinha({
    file: hash,
    descricao: description,
    tag,
    nsfw: 0,
    remetente: message.sender?.id || message.author || 'desconhecido',
    grupo: destino,
    visual_hash: visualHash || null
  });

  await client.sendText(
    destino,
    `✅ Figurinha adicionada com #forçar!\n📝 ${description}\n🏷️ ${tag}\n🆔 ${id}`
  );
  pendentesForcar.delete(origId);
}

module.exports = {
  handleSticker,
  forceAdd,
};