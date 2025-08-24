const { decryptMedia } = require('@open-wa/wa-decrypt');
const path = require('path');
const sharp = require('sharp');
const { PACK_NAME, AUTHOR_NAME } = require('./config/stickers');
let Sticker, StickerTypes;
try {
  ({ Sticker, StickerTypes } = require('wa-sticker-formatter'));
} catch (e) {
  console.warn('[commands] wa-sticker-formatter não encontrado. Fallback para open-wa. Instale com: npm i wa-sticker-formatter');
}
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
  countMedia
} = require('./database');
const { isNSFW } = require('./services/nsfwFilter');
const { getAiAnnotations, transcribeAudioBuffer, getAiAnnotationsFromPrompt } = require('./services/ai');
const { processVideo } = require('./services/videoProcessor');

const forceMap = {};
const taggingMap = {};
const MAX_TAGS_LENGTH = 500;
const clearDescriptionCmds = ['nenhum', 'limpar', 'clear', 'apagar', 'remover'];

function cleanDescriptionTags(description, tags) {
  const badPhrases = [
    'desculpe',
    'não posso ajudar',
    'não disponível',
    'sem descrição',
    'audio salvo sem descrição ai'
  ];
  let cleanDesc = description ? description.toLowerCase() : '';
  if (badPhrases.some(phrase => cleanDesc.includes(phrase))) {
    cleanDesc = '';
  } else {
    cleanDesc = description;
  }

  let cleanTags = [];
  if (tags && Array.isArray(tags)) {
    cleanTags = tags.filter(t => {
      if (!t) return false;
      if (t.includes('##')) return false;
      const low = t.toLowerCase();
      if (badPhrases.some(phrase => low.includes(phrase))) return false;
      return true;
    });
  } else if (typeof tags === 'string') {
    cleanTags = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  return { description: cleanDesc, tags: cleanTags };
}

// Função para envio da mídia conforme tipo
async function sendMediaByType(client, chatId, media) {
  if (!media) return;

  const filePath = media.file_path;
  const mimetype = media.mimetype || '';

  const isGif = mimetype === 'image/gif' || filePath.endsWith('.gif');
  const isVideo = mimetype.startsWith('video/');
  const isImage = mimetype.startsWith('image/');

  // Animated (gif/mp4)
  if (isGif || isVideo) {
    if (typeof client.sendMp4AsSticker === 'function') {
      try {
        await client.sendMp4AsSticker(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
        return;
      } catch (e) {
        console.warn('sendMp4AsSticker falhou, tentando sendImageAsStickerGif (se existir):', e?.message || e);
      }
    }
    if (isGif && typeof client.sendImageAsStickerGif === 'function') {
      await client.sendImageAsStickerGif(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
      return;
    }
    await client.sendFile(chatId, filePath, 'media', 'Aqui está sua mídia!');
    return;
  }

  // Static images (includes webp)
  if (isImage) {
    if (Sticker && StickerTypes) {
      const sticker = new Sticker(filePath, {
        pack: PACK_NAME,
        author: AUTHOR_NAME,
        type: StickerTypes.FULL,
        quality: 70,
      });
      const webpBuf = await sticker.build();
      const dataUrl = `data:image/webp;base64,${webpBuf.toString('base64')}`;
      await client.sendRawWebpAsSticker(chatId, dataUrl, { pack: PACK_NAME, author: AUTHOR_NAME });
      return;
    }
    await client.sendImageAsSticker(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
    return;
  }

  // Others
  await client.sendFile(chatId, filePath, 'media', 'Aqui está sua mídia!');
}

async function handleRandomCommand(client, message, chatId) {
  try {
    const novasMedias = await processOldStickers();

    let media;
    if (novasMedias.length > 0) {
      const lastMedia = novasMedias[novasMedias.length - 1];
      media = await findById(lastMedia.id);
    } else {
      media = await getMediaWithLowestRandomCount();
    }

    if (!media) {
      await client.sendText(chatId, 'Nenhuma mídia salva ainda.');
      return;
    }

    await incrementRandomCount(media.id);

    await sendMediaByType(client, chatId, media);

    const cleanRandom = cleanDescriptionTags(
      media.description,
      media.tags ? (typeof media.tags === 'string' ? media.tags.split(',') : media.tags) : []
    );

    let responseMessageRandom = `\n📝 ${cleanRandom.description || ''}\n` +
      `🏷️ ${cleanRandom.tags.length > 0 ? cleanRandom.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n` +
      `🆔 ${media.id}`;

    await client.sendText(chatId, responseMessageRandom);
  } catch (err) {
    console.error('Erro no comando #random:', err);
    await client.sendText(chatId, 'Erro ao buscar mídia.');
  }
}

async function handleCountCommand(client, chatId) {
  try {
    const total = await countMedia();
    await client.sendText(chatId, `Existem ${total} figurinhas salvas no banco de dados.`);
  } catch (err) {
    console.error('Erro ao contar figurinhas:', err);
    await client.sendText(chatId, 'Erro ao obter contagem de figurinhas.');
  }
}

async function handleTop10Command(client, chatId) {
  try {
    const top10 = await getTop10Media();
    if (!top10 || top10.length === 0) {
      await client.sendText(chatId, 'Nenhuma figurinha encontrada.');
      return;
    }

    await client.sendText(chatId, 'Top 10 figurinhas mais usadas:');
    for (const media of top10) {
      await sendMediaByType(client, chatId, media);
    }
  } catch (err) {
    console.error('Erro ao enviar top10:', err);
    await client.sendText(chatId, 'Erro ao buscar top 10 figurinhas.');
  }
}

async function handleTop5UsersCommand(client, chatId) {
  try {
    const topUsers = await getTop5UsersByStickerCount();
    if (!topUsers || topUsers.length === 0) {
      await client.sendText(chatId, 'Nenhum usuário encontrado.');
      return;
    }

    let reply = 'Top 5 usuários que enviaram figurinhas:\n\n';

    for (let i = 0; i < topUsers.length; i++) {
      const user = topUsers[i];
      let userName = null;

      try {
        const contact = await client.getContact(user.chat_id);
        if (contact) {
          if (contact.pushname) {
            userName = contact.pushname;
          } else if (contact.formattedName) {
            userName = contact.formattedName;
          }
        }
      } catch (err) {
        console.warn(`N�E3o foi poss�EDvel obter o contato para ${user.chat_id}`);
      }

      if (!userName) {
        userName = user.chat_id.split('@')[0];
      }

      reply += `${i + 1}. ${userName} - ${user.sticker_count} figurinhas\n`;
    }

    await client.sendText(chatId, reply);
  } catch (err) {
    console.error('Erro ao buscar top 5 usuários:', err);
    await client.sendText(chatId, 'Erro ao buscar top 5 usuários.');
  }
}

async function handleSendMediaById(client, message, chatId) {
  const parts = message.body.split(' ');
  if (parts.length !== 2) return;
  const mediaId = parts[1];

  try {
    const media = await findById(mediaId);
    if (!media) {
      await client.sendText(chatId, 'M�EDdia n�E3o encontrada para o ID fornecido.');
      return;
    }

    await sendMediaByType(client, chatId, media);

    const cleanMediaInfo = cleanDescriptionTags(media.description, media.tags ? (typeof media.tags === 'string' ? media.tags.split(',') : media.tags) : []);
    let responseMessageID = `\n📝 ${cleanMediaInfo.description || ''}\n` +
      `🏷️ ${cleanMediaInfo.tags.length > 0 ? cleanMediaInfo.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n` +
      `🆔 ${media.id}`;

    await client.sendText(chatId, responseMessageID);
  } catch (err) {
    console.error('Erro ao buscar mídia pelo ID:', err);
    await client.sendText(chatId, 'Erro ao buscar essa mídia.');
  }
}

async function handleForceCommand(client, message, chatId) {
  if (message.hasQuotedMsg) {
    try {
      const quotedMsg = await client.getQuotedMessage(message.id);
      const isMedia =
        quotedMsg.isMedia &&
        ['image', 'video', 'sticker', 'audio'].some(type =>
          quotedMsg.mimetype?.startsWith(type)
        );
      if (isMedia) {
        forceMap[chatId] = true;
        await client.sendText(chatId, 'Modo #forçar ativado para a próxima mídia.');
        return true;
      }
    } catch {
      // Ignore error
    }
  } else {
    forceMap[chatId] = true;
    await client.sendText(chatId, 'Modo #forçar ativado. Envie a mídia que deseja salvar.');
    return true;
  }

  return false;
}

async function handleTaggingMode(client, message, chatId) {
  if (!taggingMap[chatId]) return false;

  if (message.type === 'chat' && message.body) {
    const mediaId = taggingMap[chatId];
    const newText = message.body.trim();

    if (newText.length > MAX_TAGS_LENGTH) {
      await client.sendText(chatId, `Texto muito longo. Limite de ${MAX_TAGS_LENGTH} caracteres.`);
      taggingMap[chatId] = null;
      return true;
    }

    try {
      const media = await findById(mediaId);
      if (!media) {
        await client.sendText(chatId, `Mídia com ID ${mediaId} não encontrada.`);
        taggingMap[chatId] = null;
        return true;
      }

      let newDescription = media.description || '';
      let newTags = media.tags ? (typeof media.tags === 'string' ? media.tags.split(',') : media.tags) : [];

      const parts = newText.split(';');
      for (const part of parts) {
        const [key, ...rest] = part.split(':');
        if (!key || rest.length === 0) continue;
        const value = rest.join(':').trim();
        const keyLower = key.trim().toLowerCase();
        if (keyLower === 'descricao' || keyLower === 'descri�����������������������������������������������������������������������������������������������������������������������������������...' || keyLower === 'description') {
          if (clearDescriptionCmds.includes(value.toLowerCase())) {
            newDescription = '';
          } else {
            newDescription = value;
          }
        } else if (keyLower === 'tags') {
          const tagsArr = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
          newTags = tagsArr;
        }
      }

      if (parts.length === 1 && !newText.toLowerCase().startsWith('descricao:') && !newText.toLowerCase().startsWith('description:')) {
        newTags = newText.split(',').map(t => t.trim()).filter(t => t.length > 0);
      }

      let combinedLength = (newDescription.length || 0) + (newTags.join(',').length || 0);
      if (combinedLength > MAX_TAGS_LENGTH) {
        const allowedTagsLength = Math.max(0, MAX_TAGS_LENGTH - newDescription.length);
        let tagsStr = newTags.join(',');
        if (tagsStr.length > allowedTagsLength) {
          tagsStr = tagsStr.substring(0, allowedTagsLength);
          newTags = tagsStr.split(',').map(t => t.trim());
        }
      }

      const updateDescription = newDescription;
      const updateTags = newTags.join(',');

      await updateMediaDescription(mediaId, updateDescription);
      await updateMediaTags(mediaId, updateTags);

      const updatedMedia = await findById(mediaId);
      const cleanUpdated = cleanDescriptionTags(
        updatedMedia.description,
        updatedMedia.tags ? (typeof updatedMedia.tags === 'string' ? updatedMedia.tags.split(',') : updatedMedia.tags) : []
      );

      let updatedMessage = `✅ Figurinha Atualizada!\n\n` +
        `📝 ${cleanUpdated.description || ''}\n` +
        `🏷️ ${cleanUpdated.tags.length > 0 ? cleanUpdated.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n` +
        `🆔 ${updatedMedia.id}`;

      await client.sendText(chatId, updatedMessage);
      taggingMap[chatId] = null;
    } catch (err) {
      console.error('Erro ao adicionar tags:', err);
      await client.sendText(chatId, 'Erro ao adicionar tags/descrição.');
      taggingMap[chatId] = null;
    }

    return true;
  }

  return false;
}

function isValidCommand(messageBody) {
  const validCommands = [
    '#random',
    '#editar',
    '#editar ID',
    '#top10',
    '#top5users',
    '#ID',
    '#forçar',
    '#count'
  ];

  if (!messageBody.startsWith('#')) return true; // não é comando

  const isValid = validCommands.some(cmd => {
    if (cmd.endsWith('ID')) {
      return messageBody.startsWith(cmd);
    }
    return messageBody === cmd || messageBody.startsWith(cmd + ' ');
  });

  return isValid;
}

async function handleInvalidCommand(client, chatId) {
  const validCommands = [
    '#random',
    '#editar',
    '#editar ID',
    '#top10',
    '#top5users',
    '#ID',
    '#forçar',
    '#count'
  ];

  await client.sendText(chatId,
    `Comando não reconhecido.\nComandos disponíveis:\n` +
    validCommands.map(c => c.replace('ID', 'XXX')).join('\n')
  );
}

module.exports = {
  forceMap,
  taggingMap,
  MAX_TAGS_LENGTH,
  clearDescriptionCmds,
  cleanDescriptionTags,
  sendMediaByType,
  handleRandomCommand,
  handleCountCommand,
  handleTop10Command,
  handleTop5UsersCommand,
  handleSendMediaById,
  handleForceCommand,
  handleTaggingMode,
  isValidCommand,
  handleInvalidCommand
};
