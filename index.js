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
// wa-sticker-formatter é opcional. Se não estiver instalado, caímos em fallback do open-wa
let Sticker, StickerTypes;
try {
  ({ Sticker, StickerTypes } = require('wa-sticker-formatter'));
} catch (e) {
  console.warn('[init] wa-sticker-formatter não encontrado, usando fallback do open-wa. Instale com: npm i wa-sticker-formatter');
}

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

// ---- Config
const ADMIN_NUMBER = process.env.ADMIN_NUMBER; // "5511000000000@c.us"
const AUTO_SEND_GROUP_ID = process.env.AUTO_SEND_GROUP_ID; // Grupo para envio automático
const MAX_TAGS_LENGTH = 500;
const MEDIA_DIR = path.resolve(__dirname, 'media');

// ---- Estado em memória
const forceMap = new Map(); // chatId -> bool (próxima mídia força inserir)
const taggingMap = new Map(); // chatId -> mediaId (modo edição de tags)

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

function cleanDescriptionTags(description, tags) {
  const badPhrases = [
    'desculpe',
    'não posso ajudar',
    'não disponível',
    'sem descrição',
    'audio salvo sem descrição ai',
  ];

  let cleanDesc = description ? String(description) : '';
  if (badPhrases.some((p) => cleanDesc.toLowerCase().includes(p))) cleanDesc = '';

  let cleanTags = [];
  if (Array.isArray(tags)) {
    cleanTags = tags
      .filter(Boolean)
      .map((t) => String(t).trim())
      .filter((t) => t && !t.includes('##') && !badPhrases.some((p) => t.toLowerCase().includes(p)));
  } else if (typeof tags === 'string') {
    cleanTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t);
  }

  return { description: cleanDesc, tags: cleanTags };
}

function renderInfoMessage({ description, tags, id }) {
  const tagsLine = (tags && tags.length)
    ? tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')
    : '';
  return [
    '📝 ' + (description || ''),
    '🏷️ ' + tagsLine,
    '🆔 ' + id,
  ].join('\n');
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
    await client.sendRawWebpAsSticker(chatId, withHeader);
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
          await client.sendMp4AsSticker(chatId, mp4Path);
          return;
        } catch (e) {
          console.warn('sendMp4AsSticker falhou, tentando sendImageAsStickerGif (se existir):', e?.message || e);
        }
      }
      if (isGif && typeof client.sendImageAsStickerGif === 'function') {
        await client.sendImageAsStickerGif(chatId, filePath, { author: 'ZZ-Bot', pack: 'StickerBot' });
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
          pack: 'StickerBot',
          author: 'ZZ-Bot',
          type: StickerTypes.FULL,
          categories: ['😀','🔥','✨'],
          quality: 70,
        });
        const webpBuf = await sticker.build();
        const withHeader = `data:image/webp;base64,${webpBuf.toString('base64')}`;
        await client.sendRawWebpAsSticker(chatId, withHeader);
        return;
      }
      await client.sendImageAsSticker(chatId, filePath, { pack: 'StickerBot', author: 'ZZ-Bot' });
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
      const clean = cleanDescriptionTags(full.description, full.tags);
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
  // A cada hora cheia das 08:00 às 21:00
  cron.schedule('0 8-21 * * *', () => sendRandomMediaToGroup(client));
  console.log('Agendamento: envios automáticos de 08h às 21h, toda hora cheia.');
}

// ---- Comandos
const VALID_COMMANDS = ['#random', '#editar ID', '#top10', '#top5users', '#ID', '#forçar', '#count'];

function isValidCommand(body) {
  if (!body || !body.startsWith('#')) return false;
  return VALID_COMMANDS.some((cmd) => (cmd.endsWith('ID') ? body.startsWith(cmd) : body === cmd || body.startsWith(cmd + ' ')));
}

async function cmdRandom(client, chatId) {
  const media = await pickRandomMedia();
  if (!media) {
    await client.sendText(chatId, 'Nenhuma mídia salva ainda.');
    return;
  }

  await incrementRandomCount(media.id);
  await sendStickerForMediaRecord(client, chatId, media);

  const m = await findById(media.id);
  const clean = cleanDescriptionTags(m.description, m.tags);
  await client.sendText(chatId, renderInfoMessage({ ...clean, id: m.id }));
}

async function cmdCount(client, chatId) {
  const total = await countMedia();
  await client.sendText(chatId, `Existem ${total} mídias salvas no banco de dados.`);
}

async function cmdTop10(client, chatId) {
  const top10 = await getTop10Media();
  if (!top10 || !top10.length) {
    await client.sendText(chatId, 'Nenhuma figurinha encontrada.');
    return;
  }
  await client.sendText(chatId, 'Top 10 figurinhas mais usadas:');
  for (const media of top10) {
    await sendStickerForMediaRecord(client, chatId, media);
  }
}

async function cmdTop5Users(client, chatId) {
  const topUsers = await getTop5UsersByStickerCount();
  if (!topUsers || !topUsers.length) {
    await client.sendText(chatId, 'Nenhum usuário encontrado.');
    return;
  }

  let reply = 'Top 5 usuários que enviaram figurinhas:\n\n';
  for (let i = 0; i < topUsers.length; i++) {
    const u = topUsers[i];
    let name = null;
    try {
      const contact = await client.getContact(u.chat_id);
      name = contact?.pushname || contact?.formattedName || null;
    } catch {}
    if (!name) name = u.chat_id ? u.chat_id.split('@')[0] : 'Desconhecido';
    reply += `${i + 1}. ${name} - ${u.sticker_count} figurinhas\n`;
  }
  await client.sendText(chatId, reply);
}

async function cmdID(client, chatId, body) {
  const parts = body.split(' ');
  if (parts.length !== 2) return;
  const mediaId = parts[1];
  const media = await findById(mediaId);
  if (!media) {
    await client.sendText(chatId, 'Mídia não encontrada.');
    return;
  }
  await sendStickerForMediaRecord(client, chatId, media);
  const clean = cleanDescriptionTags(media.description, media.tags);
  await client.sendText(chatId, renderInfoMessage({ ...clean, id: media.id }));
}

async function cmdForcar(client, chatId, message) {
  if (message.hasQuotedMsg) {
    try {
      const quoted = await client.getQuotedMessage(message.id);
      const isMedia = quoted.isMedia && ['image', 'video', 'sticker', 'audio'].some((t) => quoted.mimetype?.startsWith(t));
      if (!isMedia) throw new Error('Mensagem citada sem mídia.');
      forceMap.set(chatId, true);
      await client.sendText(chatId, 'Modo #forçar ativado para a próxima mídia.');
      return;
    } catch {}
  }
  forceMap.set(chatId, true);
  await client.sendText(chatId, 'Modo #forçar ativado. Envie a mídia que deseja salvar.');
}

async function cmdEditarStart(client, chatId, body) {
  const parts = body.split(' ');
  if (parts.length !== 3) return;
  const mediaId = parts[2];
  taggingMap.set(chatId, mediaId);
  await client.sendText(
    chatId,
    `Modo edição ativado para a mídia ID ${mediaId}.\n\n` +
      'Envie no formato:\n' +
      'descricao: [sua descrição]; tags: tag1, tag2, tag3\n' +
      'Você pode enviar apenas tags OU apenas descrição.\n' +
      `Limite total de ${MAX_TAGS_LENGTH} caracteres.`
  );
}

async function handleTaggingText(client, chatId, text) {
  const mediaId = taggingMap.get(chatId);
  if (!mediaId) return false;

  const newText = text.trim();
  if (newText.length > MAX_TAGS_LENGTH) {
    await client.sendText(chatId, `Texto muito longo. Limite de ${MAX_TAGS_LENGTH} caracteres.`);
    taggingMap.delete(chatId);
    return true;
  }

  try {
    const media = await findById(mediaId);
    if (!media) {
      await client.sendText(chatId, `Mídia com ID ${mediaId} não encontrada.`);
      taggingMap.delete(chatId);
      return true;
    }

    const clearCmds = ['nenhum', 'limpar', 'clear', 'apagar', 'remover'];
    let newDescription = media.description || '';
    let newTags = media.tags ? (Array.isArray(media.tags) ? media.tags : String(media.tags).split(',')) : [];

    const parts = newText.split(';');
    for (const part of parts) {
      const [rawKey, ...rest] = part.split(':');
      if (!rawKey || !rest.length) continue;
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (['descricao', 'descrição', 'description'].includes(key)) {
        newDescription = clearCmds.includes(value.toLowerCase()) ? '' : value;
      } else if (key === 'tags') {
        newTags = value.split(',').map((t) => t.trim()).filter(Boolean);
      }
    }

    if (parts.length === 1 && !newText.toLowerCase().startsWith('descricao:') && !newText.toLowerCase().startsWith('descrição:') && !newText.toLowerCase().startsWith('description:')) {
      newTags = newText.split(',').map((t) => t.trim()).filter(Boolean);
    }

    // Enxugar para o limite total
    let combined = (newDescription?.length || 0) + (newTags.join(',').length || 0);
    if (combined > MAX_TAGS_LENGTH) {
      const allowTagsLen = Math.max(0, MAX_TAGS_LENGTH - (newDescription?.length || 0));
      let tagsStr = newTags.join(',');
      if (tagsStr.length > allowTagsLen) {
        tagsStr = tagsStr.substring(0, allowTagsLen);
        newTags = tagsStr.split(',').map((t) => t.trim());
      }
    }

    await updateMediaDescription(mediaId, newDescription);
    await updateMediaTags(mediaId, newTags.join(','));

    const updated = await findById(mediaId);
    const clean = cleanDescriptionTags(updated.description, updated.tags);
    await client.sendText(chatId, `✅ Figurinha atualizada!\n\n${renderInfoMessage({ ...clean, id: updated.id })}`);
  } catch (err) {
    console.error('Erro ao adicionar tags:', err);
    await client.sendText(chatId, 'Erro ao adicionar tags/descrição.');
  } finally {
    taggingMap.delete(chatId);
  }

  return true; // tratou
}

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
    }
    extToSave = 'webp';
    mimetypeToSave = 'image/webp';
  }
}
// ---- Atualização de descrição (sqlite3 local)
async function updateMediaDescription(id, description) {
  return new Promise((resolve, reject) => {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.resolve(__dirname, 'media.db');
    const db = new sqlite3.Database(dbPath);
    db.run('UPDATE media SET description = ? WHERE id = ?', [description, id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
    db.close();
  });
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
  scheduleAutoSend(client);

  client.onMessage(async (message) => {
    try {
      const chatId = message.from;

      // 1) Comandos inválidos (que começam com # mas não constam na lista)
      if (message.body?.startsWith('#') && !isValidCommand(message.body)) {
          await client.sendText(chatId,'Comando não reconhecido.\nComandos disponíveis:\n' + VALID_COMMANDS.join('\n'));
          return;
      }

      // 2) Modo edição de tags (se já ativado para este chat)
      if (message.type === 'chat' && message.body && taggingMap.has(chatId)) {
        const handled = await handleTaggingText(client, chatId, message.body);
        if (handled) return;
      }

      // 3) Disparo por comandos
      if (message.body === '#random') return void cmdRandom(client, chatId);
      if (message.body === '#count') return void cmdCount(client, chatId);
      if (message.body === '#top10') return void cmdTop10(client, chatId);
      if (message.body === '#top5users') return void cmdTop5Users(client, chatId);
      if (message.body?.startsWith('#ID ')) return void cmdID(client, chatId, message.body);
      if (message.body?.trim() === '#forçar') return void cmdForcar(client, chatId, message);
      if (message.body?.startsWith('#editar ID ')) return void cmdEditarStart(client, chatId, message.body);

      // 4) Modo edição via resposta a uma mídia (#editar como reply)
      if (message.hasQuotedMsg && message.body && message.body.toLowerCase().startsWith('#editar')) {
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
