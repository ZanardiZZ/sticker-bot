require('dotenv').config();

// ---- Dependências externas
const { create } = require('@open-wa/wa-automate');
const { decryptMedia } = require('@open-wa/wa-decrypt');
const cron = require('node-cron');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const mime = require('mime-types');
const { logReceivedMessage } = require('./bot/logging');
const { initContactsTable, upsertContactFromMessage } = require('./bot/contacts');
// wa-sticker-formatter é opcional. Se não estiver instalado, caímos em fallback do open-wa
let Sticker, StickerTypes;
try {
  ({ Sticker, StickerTypes } = require('wa-sticker-formatter'));
} catch (e) {
  console.warn('[init] wa-sticker-formatter não encontrado, usando fallback do open-wa. Instale com: npm i wa-sticker-formatter');
}
const { PACK_NAME, AUTHOR_NAME } = require('./config/stickers');

// ---- Serviços / Banco
const {
  saveMedia,
  getRandomMedia,
  incrementRandomCount,
  getMD5,
  getHashVisual,
  findByHashVisual,
  findById,
  updateMediaTags,
  getTagsForMedia,
  updateMediaDescription,
  processOldStickers,
  getMediaWithLowestRandomCount,
  getTop10Media,
  getTop5UsersByStickerCount,
  countMedia,
} = require('./database');
const { isNSFW } = require('./services/nsfwFilter');
const { isVideoNSFW } = require('./services/nsfwVideoFilter');
const { getAiAnnotations, transcribeAudioBuffer, getAiAnnotationsFromPrompt } = require('./services/ai');
const { processVideo } = require('./services/videoProcessor');
const { handleCommand, handleTaggingMode, isValidCommand, taggingMap, forceMap } = require('./commands');
const { normalizeText } = require('./utils/commandNormalizer');
const { cleanDescriptionTags, renderInfoMessage } = require('./utils/messageUtils');

// ---- Config
const ADMIN_NUMBER = process.env.ADMIN_NUMBER; // "5511999999999@c.us"
const AUTO_SEND_GROUP_ID = process.env.AUTO_SEND_GROUP_ID; // Grupo para envio automático
const MAX_TAGS_LENGTH = 500;
const MEDIA_DIR = path.resolve(__dirname, 'media');

// ---- Estado em memória
// (Using maps from commands.js module)

// ---- Utilitários
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Detecta se um WebP é animado (VP8X com bit ANIM)
function isAnimatedWebpBuffer(buf) {
  try {
    if (!buf || buf.length < 21) return false;
    const riff = buf.slice(0, 4).toString('ascii') === 'RIFF';
    const webp = buf.slice(8, 12).toString('ascii') === 'WEBP';
    const vp8x = buf.slice(12, 16).toString('ascii') === 'VP8X';
    const animBit = (buf[20] & 0x10) === 0x10; // bit 5
    return riff && webp && vp8x && animBit;
  } catch { return false; }
}
async function isAnimatedWebpFile(filePath) {
  try {
    const fd = await fsp.open(filePath, 'r');
    const { buffer } = await fd.read(Buffer.alloc(32), 0, 32, 0);
    await fd.close();
    return isAnimatedWebpBuffer(buffer);
  } catch { return false; }
}


async function sendStickerForMediaRecord(client, chatId, media) {
  if (!media) return;
  const filePath = media.file_path;
  const mimetype = media.mimetype || mime.lookup(filePath) || '';

  // Helpers
  const isGif = mimetype === 'image/gif' || filePath.endsWith('.gif');
  const isImage = mimetype.startsWith('image/');
  const isWebp = mimetype === 'image/webp' || filePath.endsWith('.webp');
  const isVideo = mimetype.startsWith('video/');

  async function sendRawWebp(path) {
    const base64 = (await fsp.readFile(path)).toString('base64');
    const withHeader = `data:image/webp;base64,${base64}`;
    await client.sendRawWebpAsSticker(chatId, withHeader, {
      pack: PACK_NAME,
      author: AUTHOR_NAME,
    });
  }

  async function convertToMp4ForSticker(inputPath) {
    const outDir = path.join(MEDIA_DIR, 'tmp');
    ensureDirSync(outDir);
    const outPath = path.join(outDir, `stk-${Date.now()}.mp4`);
    const vf = "scale=512:-2:flags=lanczos:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black,fps=15,format=yuv420p";
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noAudio()
        .videoFilters(vf)
        .duration(6)
        .outputOptions(['-movflags', '+faststart'])
        .on('end', resolve)
        .on('error', reject)
        .save(outPath);
    });
    return outPath;
  }

  try {
    // 1) Animado WebP → enviar como sticker animado (raw webp)
    if (isWebp && await isAnimatedWebpFile(filePath)) {
      await sendRawWebp(filePath);
      return;
    }

    // 2) GIF/Video → tentar sticker animado via open-wa
    if (isGif || isVideo) {
      // Preferir mp4 como fonte
      let mp4Path = filePath;
      if (!isVideo) {
        // Converter GIF para MP4 otimizado
        mp4Path = await convertToMp4ForSticker(filePath);
      }

      if (typeof client.sendMp4AsSticker === 'function') {
        try {
          await client.sendMp4AsSticker(chatId, mp4Path, { pack: PACK_NAME, author: AUTHOR_NAME });
          return;
        } catch (e) {
          console.warn('sendMp4AsSticker falhou, tentando sendImageAsStickerGif (se existir):', e?.message || e);
        }
      }
      if (isGif && typeof client.sendImageAsStickerGif === 'function') {
        await client.sendImageAsStickerGif(chatId, filePath, { author: AUTHOR_NAME, pack: PACK_NAME });
        return;
      }
      // Fallback: envia como arquivo
      await client.sendFile(chatId, filePath, 'media', 'Aqui está sua mídia!');
      return;
    }

    // 3) Imagem estática → sticker estático com EXIF se disponível
    if (isImage) {
      if (Sticker && StickerTypes) {
        const sticker = new Sticker(filePath, {
          pack: PACK_NAME,
          author: AUTHOR_NAME,
          type: StickerTypes.FULL,
          categories: ['😀','🔥','✨'],
          quality: 70,
        });
        const webpBuf = await sticker.build();
        const withHeader = `data:image/webp;base64,${webpBuf.toString('base64')}`;
        await client.sendRawWebpAsSticker(chatId, withHeader, { pack: PACK_NAME, author: AUTHOR_NAME });
        return;
      }
      await client.sendImageAsSticker(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
      return;
    }

    // 4) Fallback final
    await client.sendFile(chatId, filePath, 'media', 'Aqui está sua mídia!');
  } catch (err) {
    console.error('Falha ao enviar mídia como figurinha. Fallback para arquivo. Motivo:', err?.message || err);
    try {
      await client.sendFile(chatId, filePath, 'media', 'Aqui está sua mídia!');
    } catch {}
  }
}

async function pickRandomMedia() {
  // Prioriza novidades processadas; senão menor count_random
  const novas = await processOldStickers();
  if (novas && novas.length) {
    const last = novas[novas.length - 1];
    return { id: last.id, file_path: last.filePath, mimetype: 'image/webp' };
  }
  return getMediaWithLowestRandomCount();
}

async function sendRandomMediaToGroup(client) {
  if (!AUTO_SEND_GROUP_ID) {
    console.warn('AUTO_SEND_GROUP_ID não configurado no .env');
    return;
  }

  try {
    const media = await pickRandomMedia();
    if (!media) {
      console.log('Nenhuma mídia disponível para envio automático.');
      return;
    }

    await incrementRandomCount(media.id);
    await sendStickerForMediaRecord(client, AUTO_SEND_GROUP_ID, media);

    const full = await findById(media.id);
    if (full) {
      const tags = await getTagsForMedia(full.id);
      const clean = cleanDescriptionTags(full.description, tags);
      await client.sendText(AUTO_SEND_GROUP_ID, renderInfoMessage({ ...clean, id: full.id }));
    }

    console.log('Mídia enviada automaticamente ao grupo.');
  } catch (err) {
    console.error('Erro no envio automático:', err);
  }
}

function scheduleAutoSend(client) {
  if (!AUTO_SEND_GROUP_ID) {
    console.warn('AUTO_SEND_GROUP_ID não configurado no .env');
    return;
  }

  const tz = process.env.TIMEZONE || process.env.TZ || 'America/Sao_Paulo';

  // A cada hora cheia das 08:00 às 21:00 no fuso configurado
  cron.schedule('0 8-21 * * *', () => sendRandomMediaToGroup(client), {
    timezone: tz,
  });

  console.log(`Agendamento: envios automáticos de 08h às 21h no fuso ${tz}, toda hora cheia.`);
}

// ---- Comandos (delegated to commands.js module)


// ---- Pipeline de mídia recebida
async function handleIncomingMedia(client, message) {
  const chatId = message.from;

  // Descriptografa
  const buffer = await decryptMedia(message);
  if (!buffer) throw new Error('Falha ao baixar mídia');

  const mimetype = message.mimetype || 'application/octet-stream';
  const extOriginal = mime.extension(mimetype) || 'bin';

  // Normaliza imagem para webp (exceto gif)
  let bufferToSave = buffer;
  let extToSave = extOriginal;
  let mimetypeToSave = mimetype;

  if (mimetype.startsWith('image/') && mimetype !== 'image/gif') {
    // Se for WebP animado, preserva sem reprocessar (evita perder animação)
    if (!(mimetype === 'image/webp' && isAnimatedWebpBuffer(buffer))) {
      bufferToSave = await sharp(buffer).webp().toBuffer();
      mimetypeToSave = 'image/webp';
      extToSave = 'webp';
    }
  }

  // Verifica se é NSFW
  let nsfwFlag = 0;
  try {
    nsfwFlag = (await isNSFW(bufferToSave)) ? 1 : 0;
  } catch (err) {
    console.error('Erro ao executar filtro NSFW:', err);
    nsfwFlag = 0;
  }

  // Gera hash visual para identificar mídia
  const hv = await getHashVisual(bufferToSave);

  // Verifica se mídia já existe (por hash)
  let existing = await findByHashVisual(hv);

  if (existing && !forceMap.get(chatId)) {
    // Já existe - enviar mensagem padrão com descrição, tags e id e msg aviso
    const clean = cleanDescriptionTags(existing.description, existing.tags);
    await client.reply(chatId, 'Mídia já está salva no banco de dados. Aqui estão os dados:', message.id);
    await client.reply(chatId, renderInfoMessage({ ...clean, id: existing.id }), message.id);
  } else {
    // Salvar arquivo na pasta local
    ensureDirSync(MEDIA_DIR);
    const filename = `${Date.now()}.${extToSave}`;
    const filePath = path.join(MEDIA_DIR, filename);
    await fsp.writeFile(filePath, bufferToSave);

    // Tentar obter descrição e tags via IA somente se não for NSFW
    let description = '';
    let tags = '';
    if (nsfwFlag === 0) {
      try {
        const aiResult = await getAiAnnotations(bufferToSave);
        description = aiResult.description || '';
        tags = aiResult.tags ? aiResult.tags.join(',') : '';
      } catch (err) {
        console.error('Erro ao obter anotações AI:', err);
      }
    }

     // Identidades: remetente e grupo
    const senderId =
      message?.sender?.id ||
      message?.author ||
      (message?.from && !String(message.from).endsWith('@g.us') ? message.from : null);

    const groupId = message?.from && String(message.from).endsWith('@g.us') ? message.from : null;

    // Salva no banco com sender_id, group_id, nsfw, descrição e tags
    const newMediaId = await saveMedia({
      chatId: chatId,
      groupId: groupId,
      senderId: senderId || null,
      filePath: filePath,
      mimetype: mimetypeToSave,
      timestamp: Date.now(),
      description: description,
      tags: tags,
      hashVisual: hv,
      hashMd5: '', // se não tiver ainda
      nsfw: nsfwFlag,
    });

    forceMap.delete(chatId);

    // Envia mensagem com texto padrão
    const media = await findById(newMediaId);
    if (media) {
      const tags = await getTagsForMedia(media.id);
      const clean = cleanDescriptionTags(media.description, tags);
      await client.reply(chatId, renderInfoMessage({ ...clean, id: media.id }), message.id);
    }
  }
}
// ---- Inicialização
create({
  sessionId: 'StickerBotSession',
  headless: true,
  qrTimeout: 0,
  authTimeout: 0,
  autoRefresh: true,
  restartOnCrash: start,
})
  .then((client) => start(client))
  .catch((e) => console.error('Erro ao iniciar cliente:', e));

async function start(client) {
  console.log('🤖 Bot iniciado e aguardando mensagens...');
  
  // Certifica que a tabela contacts existe
  initContactsTable();
  
  scheduleAutoSend(client);

  client.onMessage(async (message) => {
    await logReceivedMessage(client, message);
    try { upsertContactFromMessage(message);
      } catch (e) {
        console.error('[bot] upsertContactFromMessage error:', e);
      }
    try {
      const chatId = message.from;
      
      // 1) Try to handle command via commands module (includes validation)
      const commandHandled = await handleCommand(client, message, chatId);
      if (commandHandled) return;

      // 2) Modo edição de tags (if activated for this chat)
      if (message.type === 'chat' && message.body && taggingMap.has(chatId)) {
        const handled = await handleTaggingMode(client, message, chatId);
        if (handled) return;
      }

      // 3) Modo edição via resposta a uma mídia (#editar como reply)
      if (message.hasQuotedMsg && message.body && normalizeText(message.body).startsWith('#editar')) {
        try {
          const quoted = await client.getQuotedMessage(message.id);
          if (quoted.isMedia) {
            const buf = await decryptMedia(quoted);
            const hv = await getHashVisual(buf);
            const rec = await findByHashVisual(hv);
            if (rec) {
              taggingMap.set(chatId, rec.id);
              await client.sendText(
                chatId,
                `Modo edição ativado para a mídia ID ${rec.id}.\n\n` +
                  'Envie no formato:\n' +
                  'descricao: [sua descrição]; tags: tag1, tag2, tag3\n' +
                  'Você pode enviar apenas tags OU apenas descrição.\n' +
                  `Limite total de ${MAX_TAGS_LENGTH} caracteres.`
              );
              return;
            }
          }
          await client.sendText(chatId, 'Não foi possível encontrar o ID da mídia respondida.');
          return;
        } catch (err) {
          console.error('Erro ao ativar modo edição via resposta:', err);
          await client.sendText(chatId, 'Erro ao tentar ativar o modo edição.');
          return;
        }
      }

      // 5) Sem comando -> só processa se for mídia
      if (!message.isMedia) return;
      await handleIncomingMedia(client, message);
    } catch (e) {
      console.error('Erro ao processar mensagem:', e);
      if (e?.response?.data) console.error('Detalhes resposta:', e.response.data);
      try { await client.sendText(message.from, 'Erro ao processar sua mensagem.'); } catch {}
    }
  });
};
