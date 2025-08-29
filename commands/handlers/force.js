/**
 * Force command handler
 */

/**
 * Handles the #forçar command (force mode to save duplicate media)
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 * @param {Map} forceMap - Force mode state map
 */
async function handleForceCommand(client, message, chatId, forceMap) {
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
        await client.reply(chatId, 'Modo #forçar ativado para a próxima mídia.', message.id);
        return true;
      }
    } catch {
      // Ignore error
    }
  } else {
    forceMap.set(chatId, true);
    await client.reply(chatId, 'Modo #forçar ativado. Envie a mídia que deseja salvar.', message.id);
    return true;
  }

  return false;
}

module.exports = { handleForceCommand };