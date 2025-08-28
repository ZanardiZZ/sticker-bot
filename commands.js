const { decryptMedia } = require('@open-wa/wa-decrypt');
const path = require('path');
const sharp = require('sharp');
const { PACK_NAME, AUTHOR_NAME } = require('./config/stickers');
const { renderInfoMessage } = require('./utils/messageUtils');
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
  getTagsForMedia,
  updateMediaDescription,
  processOldStickers,
  getMediaWithLowestRandomCount,
  getTop10Media,
  getTop5UsersByStickerCount,
  countMedia
} = require('./database');
const { isNSFW } = require('./services/nsfwFilter');
const { getAiAnnotations, transcribeAudioBuffer, getAiAnnotationsFromPrompt } = require('./services/ai');
const { processVideo } = require('./services/videoProcessor');
const { normalizeText, matchesCommand, parseCommand } = require('./utils/commandNormalizer');

const forceMap = new Map();
const taggingMap = new Map();
const MAX_TAGS_LENGTH = 500;
const clearDescriptionCmds = ['nenhum', 'limpar', 'clear', 'apagar', 'remover'];

function cleanDescriptionTags(description, tags) {
  const badPhrases = [
    'desculpe',
    'não posso ajudar',
    'não disponível',
    'sem descrição',
    'audio salvo sem descrição IA'
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

// Função para envio da mídia conforme tipo (para stickers)
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
    await client.sendFile(chatId, filePath, 'media');
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
  await client.sendFile(chatId, filePath, 'media');
}

// Função para envio da mídia no formato original (para comando #ID)
async function sendMediaAsOriginal(client, chatId, media) {
  if (!media) return;

  const filePath = media.file_path;
  const mimetype = media.mimetype || '';

  const isGif = mimetype === 'image/gif' || filePath.endsWith('.gif');
  const isVideo = mimetype.startsWith('video/');
  const isImage = mimetype.startsWith('image/');
  const isAudio = mimetype.startsWith('audio/');

  // GIFs should be sent as animated stickers
  if (isGif) {
    if (typeof client.sendMp4AsSticker === 'function') {
      try {
        await client.sendMp4AsSticker(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
        return;
      } catch (e) {
        console.warn('sendMp4AsSticker falhou, tentando sendImageAsStickerGif (se existir):', e?.message || e);
      }
    }
    if (typeof client.sendImageAsStickerGif === 'function') {
      await client.sendImageAsStickerGif(chatId, filePath, { pack: PACK_NAME, author: AUTHOR_NAME });
      return;
    }
    await client.sendFile(chatId, filePath, 'media');
    return;
  }

  // Videos should be sent as videos (not stickers)
  if (isVideo) {
    await client.sendFile(chatId, filePath, 'video');
    return;
  }

  // Images can still be sent as stickers since that's expected behavior
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

  // Audio and others
  await client.sendFile(chatId, filePath, 'media');
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

    const tags = await getTagsForMedia(media.id);
    const cleanRandom = cleanDescriptionTags(media.description, tags);

    // Use consistent formatting with renderInfoMessage
    const responseMessage = renderInfoMessage({
      description: cleanRandom.description,
      tags: cleanRandom.tags,
      id: media.id
    });

    await client.reply(chatId, responseMessage, message.id);
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
      let userName = (user.display_name && user.display_name.trim()) || null;

      // Se é um grupo, usa o nome do grupo ou gera um nome baseado no ID
      if (user.is_group) {
        if (!userName && user.group_id) {
          userName = `Grupo ${user.group_id.replace('@g.us', '').substring(0, 10)}...`;
        }
        userName = userName || 'Grupo desconhecido';
      } else {
        // Para usuários individuais, tenta buscar informações do contato
        if (!userName && user.effective_sender) {
          try {
            const contact = await client.getContact(user.effective_sender);
            userName =
              contact?.pushname ||
              contact?.formattedName ||
              contact?.notifyName ||
              contact?.name ||
              null;
          } catch {
            // ignore
          }
        }

        if (!userName) {
          userName = user.effective_sender ? String(user.effective_sender).split('@')[0] : 'Desconhecido';
        }
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
      await client.sendText(chatId, 'Mídia não encontrada para o ID fornecido.');
      return;
    }

    await incrementRandomCount(media.id);
    
    // Use the new function that sends videos as videos, not stickers
    await sendMediaAsOriginal(client, chatId, media);

    // Get tags and prepare response message
    const tags = await getTagsForMedia(media.id);
    const cleanMediaInfo = cleanDescriptionTags(media.description, tags);
    
    // Use imported renderInfoMessage function
    const responseMessage = renderInfoMessage({ 
      description: cleanMediaInfo.description, 
      tags: cleanMediaInfo.tags, 
      id: media.id 
    });

    await client.reply(chatId, responseMessage, message.id);
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
        forceMap.set(chatId, true);
        await client.sendText(chatId, 'Modo #forçar ativado para a próxima mídia.');
        return true;
      }
    } catch {
      // Ignore error
    }
  } else {
    forceMap.set(chatId, true);
    await client.sendText(chatId, 'Modo #forçar ativado. Envie a mídia que deseja salvar.');
    return true;
  }

  return false;
}

async function handleTaggingMode(client, message, chatId) {
  if (!taggingMap.has(chatId)) return false;

  if (message.type === 'chat' && message.body) {
    const mediaId = taggingMap.get(chatId);
    const newText = message.body.trim();

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

      let newDescription = media.description || '';
      let newTags = await getTagsForMedia(media.id);

      const parts = newText.split(';');
      for (const part of parts) {
        const [key, ...rest] = part.split(':');
        if (!key || rest.length === 0) continue;
        const value = rest.join(':').trim();
        const keyLower = normalizeText(key);
        if (keyLower === 'descricao' || keyLower === 'description') {
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

      if (parts.length === 1 && !normalizeText(newText).startsWith('descricao:') && !normalizeText(newText).startsWith('description:')) {
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
      const updatedTags = await getTagsForMedia(mediaId);
      const cleanUpdated = cleanDescriptionTags(updatedMedia.description, updatedTags);

      let updatedMessage = `✅ Figurinha Atualizada!\n\n` +
        `📝 ${cleanUpdated.description || ''}\n` +
        `🏷️ ${cleanUpdated.tags.length > 0 ? cleanUpdated.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n` +
        `🆔 ${updatedMedia.id}`;

      await client.sendText(chatId, updatedMessage);
      taggingMap.delete(chatId);
    } catch (err) {
      console.error('Erro ao adicionar tags:', err);
      await client.sendText(chatId, 'Erro ao adicionar tags/descrição.');
      taggingMap.delete(chatId);
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

  const normalizedMessage = normalizeText(messageBody);
  
  const isValid = validCommands.some(cmd => {
    const normalizedCmd = normalizeText(cmd);
    if (normalizedCmd.endsWith('id')) {
      return normalizedMessage.startsWith(normalizedCmd + ' ');
    }
    return normalizedMessage === normalizedCmd || normalizedMessage.startsWith(normalizedCmd + ' ');
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

/**
 * Main command router that handles all command dispatching with normalization
 * @param {object} client WhatsApp client
 * @param {object} message Message object
 * @param {string} chatId Chat ID
 * @returns {boolean} true if command was handled, false otherwise
 */
async function handleCommand(client, message, chatId) {
  const messageBody = message.body;
  if (!messageBody || !messageBody.startsWith('#')) {
    return false;
  }

  // Check if it's a valid command first
  if (!isValidCommand(messageBody)) {
    await handleInvalidCommand(client, chatId);
    return true;
  }

  const { command, params } = parseCommand(messageBody);
  
  switch (command) {
    case '#random':
      await handleRandomCommand(client, message, chatId);
      return true;
      
    case '#count':
      await handleCountCommand(client, chatId);
      return true;
      
    case '#top10':
      await handleTop10Command(client, chatId);
      return true;
      
    case '#top5users':
      await handleTop5UsersCommand(client, chatId);
      return true;
      
    case '#forcar': // normalized version of #forçar
      await handleForceCommand(client, message, chatId);
      return true;
      
    default:
      // Handle ID-based commands
      if (command === '#id' && params.length > 0) {
        await handleSendMediaById(client, { body: `#ID ${params.join(' ')}`, id: message.id }, chatId);
        return true;
      }
      
      if (command === '#editar' && params.length > 0 && normalizeText(params[0]) === 'id') {
        const mediaId = params[1];
        if (mediaId) {
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
        return true;
      }
      
      return false;
  }
}

module.exports = {
  forceMap,
  taggingMap,
  MAX_TAGS_LENGTH,
  clearDescriptionCmds,
  cleanDescriptionTags,
  sendMediaByType,
  sendMediaAsOriginal,
  handleRandomCommand,
  handleCountCommand,
  handleTop10Command,
  handleTop5UsersCommand,
  handleSendMediaById,
  handleForceCommand,
  handleTaggingMode,
  isValidCommand,
  handleInvalidCommand,
  handleCommand
};
