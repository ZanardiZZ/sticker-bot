/**
 * Force command handler
 */

const { safeReply } = require('../../utils/safeMessaging');

/**
 * Handles the #forçar command (force mode to save duplicate media)
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 * @param {Map} forceMap - Force mode state map
 * @param {Map} forceVideoToStickerMap - State map to force video -> sticker conversion
 */
async function handleForceCommand(client, message, chatId, forceMap, forceVideoToStickerMap) {
  const enableDuplicateSave = () => {
    if (forceMap && typeof forceMap.set === 'function') {
      forceMap.set(chatId, true);
    }
  };

  const enableVideoStickerMode = () => {
    if (forceVideoToStickerMap && typeof forceVideoToStickerMap.set === 'function') {
      forceVideoToStickerMap.set(chatId, true);
    }
  };

  if (message.hasQuotedMsg) {
    try {
      const quotedMsg = await client.getQuotedMessage(message.id);
      const isMedia =
        quotedMsg.isMedia &&
        ['image', 'video', 'sticker', 'audio'].some(type =>
          quotedMsg.mimetype?.startsWith(type)
        );
      if (isMedia) {
        const isVideo = quotedMsg.mimetype?.startsWith('video/');
        enableDuplicateSave();
        enableVideoStickerMode();
        const replyText = isVideo
          ? 'Modo #forçar ativado. Vou salvar e converter o próximo vídeo em figurinha animada (som ignorado).'
          : 'Modo #forçar ativado para a próxima mídia (se for vídeo, envio como figurinha animada ignorando o som).';
        await safeReply(client, chatId, replyText, message.id);
        return true;
      }
    } catch {
      // Ignore error
    }
  } else {
    enableDuplicateSave();
    enableVideoStickerMode();
    await safeReply(
      client,
      chatId,
      'Modo #forçar ativado. Envie a mídia que deseja salvar (vídeos serão convertidos em figurinha animada mesmo com áudio).',
      message.id
    );
    return true;
  }

  return false;
}

module.exports = { handleForceCommand };
