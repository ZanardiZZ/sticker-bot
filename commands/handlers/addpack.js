/**
 * Add to pack command handler - adds a sticker to a pack
 */

const { 
  getPackByName, 
  createPack, 
  addStickerToPack,
  suggestPackName 
} = require('../../database');
const { safeReply } = require('../../utils/safeMessaging');

/**
 * Handles the #addpack command
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 * @param {string[]} params - Command parameters
 */
async function handleAddPackCommand(client, message, chatId, params = []) {
  try {
    // Check if message is a reply to a media message
    if (!message.hasQuotedMsg) {
      await safeReply(
        client,
        chatId,
        'Use este comando respondendo a uma figurinha que deseja adicionar ao pack.\n\nUso: #addpack <nome-do-pack>',
        message.id
      );
      return;
    }

    // Check if pack name was provided
    if (!params || params.length === 0) {
      await safeReply(
        client,
        chatId,
        'Por favor, informe o nome do pack.\n\nUso: #addpack <nome-do-pack>',
        message.id
      );
      return;
    }

    const packName = params.join(' ').trim();
    
    if (!packName) {
      await safeReply(
        client,
        chatId,
        'Nome do pack não pode ser vazio.\n\nUso: #addpack <nome-do-pack>',
        message.id
      );
      return;
    }

    // Get quoted message
    const quotedMsg = await message.getQuotedMessage();
    
    if (!quotedMsg) {
      await safeReply(
        client,
        chatId,
        'Não foi possível obter a mensagem respondida. Tente novamente.',
        message.id
      );
      return;
    }

    // Try to parse media ID from quoted message body or caption
    // The ID is usually sent in the info message after the sticker
    let mediaId = null;
    
    // Check quoted message body for ID
    if (quotedMsg.body) {
      const idMatch = quotedMsg.body.match(/🆔\s*(\d+)|ID:\s*(\d+)/i);
      if (idMatch) {
        mediaId = parseInt(idMatch[1] || idMatch[2], 10);
      }
    }
    
    if (!mediaId) {
      await safeReply(
        client,
        chatId,
        'Por favor, responda à mensagem de informação do sticker (que contém o 🆔 ID) para adicioná-lo ao pack.\n\n' +
        'Dica: O ID aparece logo após o sticker ser enviado pelo bot.',
        message.id
      );
      return;
    }

    // Verify media exists in database
    const { findById } = require('../../database');
    const mediaRecord = await findById(mediaId);
    if (!mediaRecord) {
      await safeReply(
        client,
        chatId,
        `Figurinha com ID ${mediaId} não encontrada no banco de dados.`,
        message.id
      );
      return;
    }

    // Get or create pack
    let pack = await getPackByName(packName);
    
    if (!pack) {
      // Create new pack
      const userId = message.from || null;
      const packId = await createPack(packName, null, userId);
      pack = await getPackByName(packName);
      
      await safeReply(
        client,
        chatId,
        `✅ Pack "${packName}" criado com sucesso!`,
        message.id
      );
    }

    // Try to add sticker to pack
    try {
      await addStickerToPack(pack.id, mediaId);
      
      const newCount = pack.sticker_count + 1;
      const remaining = pack.max_stickers - newCount;
      
      await safeReply(
        client,
        chatId,
        `✅ Figurinha adicionada ao pack "${packName}"!\n\n` +
        `📊 Stickers no pack: ${newCount}/${pack.max_stickers}\n` +
        `💡 Espaço disponível: ${remaining} stickers`,
        message.id
      );
      
    } catch (error) {
      if (error.message === 'PACK_FULL') {
        // Suggest new pack name
        const suggestedName = await suggestPackName(packName);
        
        await safeReply(
          client,
          chatId,
          `⚠️ O pack "${packName}" está cheio (${pack.max_stickers}/${pack.max_stickers} stickers).\n\n` +
          `💡 Sugestão: Crie um novo pack com o comando:\n` +
          `#addpack ${suggestedName}`,
          message.id
        );
      } else if (error.message.includes('já está neste pack')) {
        await safeReply(
          client,
          chatId,
          `ℹ️ Esta figurinha já está no pack "${packName}".`,
          message.id
        );
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error('Error in #addpack command:', error);
    await safeReply(
      client,
      chatId,
      'Erro ao adicionar figurinha ao pack. Por favor, tente novamente.',
      message.id
    );
  }
}

module.exports = { handleAddPackCommand };
