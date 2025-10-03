const path = require('path');
const sharp = require('sharp');
const { PACK_NAME, AUTHOR_NAME } = require('./config/stickers');
const { renderInfoMessage, cleanDescriptionTags } = require('./utils/messageUtils');
const { safeReply } = require('./utils/safeMessaging');
let Sticker, StickerTypes;
try {
  ({ Sticker, StickerTypes } = require('wa-sticker-formatter'));
} catch (e) {
  console.warn('[commands] wa-sticker-formatter não encontrado. Fallback para open-wa. Instale com: npm i wa-sticker-formatter');
}
// Import modular command handlers
const { handleRandomCommand } = require('./commands/handlers/random');
const { handleCountCommand } = require('./commands/handlers/count');
const { handleTop10Command } = require('./commands/handlers/top10');
const { handleTop5UsersCommand } = require('./commands/handlers/top5users');
const { handleIdCommand } = require('./commands/handlers/id');
const { handleForceCommand } = require('./commands/handlers/force');
const { handleEditCommand } = require('./commands/handlers/edit');
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
} = require('./database/index.js');
const { isNSFW } = require('./services/nsfwFilter');
const { getAiAnnotations, transcribeAudioBuffer, getAiAnnotationsFromPrompt } = require('./services/ai');
const { processVideo } = require('./services/videoProcessor');
const { normalizeText, matchesCommand, parseCommand } = require('./utils/commandNormalizer');
const { withTyping } = require('./utils/typingIndicator');

const forceMap = new Map();
const taggingMap = new Map();
const MAX_TAGS_LENGTH = 500;
const clearDescriptionCmds = ['nenhum', 'limpar', 'clear', 'apagar', 'remover'];

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
    // use top-level 'path' import
    await client.sendFile(chatId, filePath, path.basename(filePath));
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
  const path = require('path');
  await client.sendFile(chatId, filePath, path.basename(filePath));
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
    const path = require('path');
    await client.sendFile(chatId, filePath, path.basename(filePath));
    return;
  }

  // Videos should be sent as files (not stickers)
  if (isVideo) {
    const path = require('path');
    await client.sendFile(chatId, filePath, path.basename(filePath));
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
  const path = require('path');
  await client.sendFile(chatId, filePath, path.basename(filePath));
}

async function handleTaggingMode(client, message, chatId) {
  if (!taggingMap.has(chatId)) return false;

  if (message.type === 'chat' && message.body) {
    const mediaId = taggingMap.get(chatId);
    const newText = message.body.trim();

    if (newText.length > MAX_TAGS_LENGTH) {
      await safeReply(client, chatId, `Texto muito longo. Limite de ${MAX_TAGS_LENGTH} caracteres.`, message.id);
      taggingMap.delete(chatId);
      return true;
    }

    // Show typing indicator while processing tags
    await withTyping(client, chatId, async () => {
      try {
      const media = await findById(mediaId);
      if (!media) {
        await safeReply(client, chatId, `Mídia com ID ${mediaId} não encontrada.`, message.id);
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

      await safeReply(client, chatId, updatedMessage, message.id);
      taggingMap.delete(chatId);
      } catch (err) {
        console.error('Erro ao adicionar tags:', err);
        await safeReply(client, chatId, 'Erro ao adicionar tags/descrição.', message.id);
        taggingMap.delete(chatId);
      }
    });

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
    '#count',
    '#bot',
    '#ping'
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

async function handleInvalidCommand(client, message, chatId) {
  const validCommands = [
    '#random',
    '#editar',
    '#editar ID',
    '#top10',
    '#top5users',
    '#ID',
    '#forçar',
    '#count',
    '#bot',
    '#ping'
  ];

  await safeReply(client, chatId,
    `Comando não reconhecido.\nComandos disponíveis:\n` +
    validCommands.map(c => c.replace('ID', 'XXX')).join('\n'),
    message.id
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
    await withTyping(client, chatId, async () => {
      await handleInvalidCommand(client, message, chatId);
    });
    return true;
  }

  // ======= PERMISSION CHECKS =======
  // Permissões e restrições por grupo/usuário
  try {
    const { command, params } = parseCommand(messageBody);
    const groupId = message.isGroupMsg ? message.chatId : null;
    const userId = message.sender?.id || message.author || message.from;
    let allowed = true;

    // Carrega permissões do grupo
    let groupPerm = null;
    if (groupId) {
      const { getGroupUser, listGroupCommandPermissions } = require('./web/dataAccess');
      // Checa se usuário está bloqueado ou restrito
      const userRow = await getGroupUser(groupId, userId);
      if (userRow) {
        if (userRow.blocked) {
          allowed = false;
        }
        // Se houver restrição de comandos
        if (userRow.restricted_commands) {
          try {
            const restricted = JSON.parse(userRow.restricted_commands);
            if (Array.isArray(restricted) && restricted.includes(command)) allowed = false;
          } catch (err) {
            console.error('[PERMISSION] Erro ao fazer parse de restricted_commands:', err);
            // Default to empty array if parsing fails
            if (Array.isArray([]) && [].includes(command)) allowed = false;
          }
        }
        // Se houver lista de comandos permitidos
        if (userRow.allowed_commands) {
          try {
            const allowedList = JSON.parse(userRow.allowed_commands);
            if (Array.isArray(allowedList) && !allowedList.includes(command)) allowed = false;
          } catch (err) {
            console.error('[PERMISSION] Erro ao fazer parse de allowed_commands:', err);
            // Default to empty array if parsing fails
            if (Array.isArray([]) && ![].includes(command)) allowed = false;
          }
        }
      }
      // Checa permissões globais do grupo
      const perms = await listGroupCommandPermissions(groupId);
      if (perms && perms.length) {
        const found = perms.find(p => p.command === command);
        if (found && !found.allowed) allowed = false;
      }
    }
    if (!allowed) {
      await client.sendText(chatId, 'Você não tem permissão para usar este comando.');
      return true;
    }

    // Wrap all command processing with typing indicator
    await withTyping(client, chatId, async () => {
      switch (command) {
        case '#random':
          await handleRandomCommand(client, message, chatId);
          break;
        case '#count':
          await handleCountCommand(client, message, chatId);
          break;
        case '#top10':
          await handleTop10Command(client, message, chatId);
          break;
        case '#top5users':
          await handleTop5UsersCommand(client, message, chatId);
          break;
        case '#forcar': // normalized version of #forçar
          await handleForceCommand(client, message, chatId, forceMap);
          break;
        case '#editar':
          await handleEditCommand(client, message, chatId, taggingMap, MAX_TAGS_LENGTH);
          break;
        case '#bot':
        case '#ping': {
          // Uptime
          const uptimeSeconds = Math.floor(process.uptime());
          const uptime = new Date(uptimeSeconds * 1000).toISOString().substr(11, 8);
          // Latência
          const start = Date.now();
          //const sentMsg = await client.sendText(chatId, '⏳ Testando...');
          const latency = Date.now() - start;
          // Versão
          let version = 'desconhecida';
          try {
            version = require('./package.json').version || 'desconhecida';
          } catch {}
          // CRON/configuração
          let cronInfo = '';
          try {
            const { getBotConfig } = require('./web/dataAccess');
            // correct key is 'auto_send_cron' (was mistakenly using auto_post_cron)
            let cronExpr = await getBotConfig('auto_send_cron');
            if (!cronExpr) cronExpr = '0 8-21 * * *';
            cronInfo = `⏰ CRON: ${cronExpr}`;
          } catch {
            cronInfo = '⏰ CRON: não disponível';
          }
          const statusMsg = [
            `🤖 *Sticker Bot*`,
            `🟢 Uptime: ${uptime}`,
            `📡 Latência: ${latency} ms`,
            cronInfo,
            `🛠️ Versão: ${version}`,
          ].join('\n');
          await client.sendText(chatId, statusMsg);
          break;
        }
        default:
          // Handle ID-based commands
          if (command === '#id' && params.length > 0) {
            await handleIdCommand(client, { body: `#ID ${params.join(' ')}`, id: message.id }, chatId);
          }
          break;
      }
    });
    return true;
  } catch (err) {
    console.error('[PERMISSION] Erro ao checar permissões:', err);
    await client.sendText(chatId, 'Erro ao checar permissões. Tente novamente.');
    return true;
  }
}

module.exports = {
  forceMap,
  taggingMap,
  MAX_TAGS_LENGTH,
  clearDescriptionCmds,
  sendMediaByType,
  sendMediaAsOriginal,
  handleRandomCommand,
  handleCountCommand,
  handleTop10Command,
  handleTop5UsersCommand,
  handleSendMediaById: handleIdCommand, // Alias for backwards compatibility
  handleForceCommand,
  handleEditCommand,
  handleTaggingMode,
  isValidCommand,
  handleInvalidCommand,
  handleCommand
};
