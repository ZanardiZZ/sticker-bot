/**
 * Message handling pipeline for the bot
 */

const { decryptMedia } = require('@open-wa/wa-decrypt');
const { getHashVisual, findByHashVisual } = require('../database');
const { handleCommand, handleTaggingMode, taggingMap } = require('../commands');
const { normalizeText } = require('../utils/commandNormalizer');
const { logReceivedMessage } = require('./logging');
const { upsertContactFromMessage } = require('./contacts');
const { processIncomingMedia } = require('../mediaProcessor');

const MAX_TAGS_LENGTH = 500;

/**
 * Handles the #editar command when replying to media
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 * @param {string} chatId - Chat ID
 * @returns {boolean} True if handled successfully
 */
async function handleEditReply(client, message, chatId) {
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
        return true;
      }
    }
    await client.sendText(chatId, 'Não foi possível encontrar o ID da mídia respondida.');
    return true;
  } catch (err) {
    console.error('Erro ao ativar modo edição via resposta:', err);
    await client.sendText(chatId, 'Erro ao tentar ativar o modo edição.');
    return true;
  }
}

/**
 * Main message handler that processes all incoming messages
 * @param {Object} client - WhatsApp client instance
 * @param {Object} message - Incoming message object
 */
async function handleMessage(client, message) {
  await logReceivedMessage(client, message);
  
  // Update contact information
  try { 
    upsertContactFromMessage(message);
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
      await handleEditReply(client, message, chatId);
      return;
    }

    // 4) Sem comando -> só processa se for mídia
    if (!message.isMedia) return;
    await processIncomingMedia(client, message);
    
  } catch (e) {
    console.error('Erro ao processar mensagem:', e);
    if (e?.response?.data) console.error('Detalhes resposta:', e.response.data);
    try { 
      await client.sendText(message.from, 'Erro ao processar sua mensagem.'); 
    } catch {}
  }
}

/**
 * Sets up message handling for the client
 * @param {Object} client - WhatsApp client instance
 */
function setupMessageHandler(client) {
  client.onMessage(handleMessage);
}

module.exports = {
  handleMessage,
  handleEditReply,
  setupMessageHandler
};