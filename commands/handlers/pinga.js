/**
 * Pinga command handler - sends the least used beverage sticker
 */

const { findMediaByTheme, incrementRandomCount, getTagsForMedia } = require('../../database/index.js');
const { sendMediaByType } = require('../media');
const { renderInfoMessage } = require('../../utils/messageUtils');
const { safeReply } = require('../../utils/safeMessaging');

// Keywords that represent beverage-related stickers
const BEVERAGE_KEYWORDS = [
  'bebida',
  'bebidas',
  'drink',
  'drinks',
  'cerveja',
  'cervejinha',
  'chopp',
  'chope',
  'pinga',
  'cachaça',
  'cachaca',
  'álcool',
  'alcool',
  'whisky',
  'vodka',
  'tequila',
  'vinho',
  'champagne',
  'champanhe',
  'beer'
];

/**
 * Handles the #pinga command
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 */
async function handlePingaCommand(client, message, chatId) {
  try {
    // Fetch the least used beverage sticker (ordered by count_random asc)
    const mediaList = await findMediaByTheme(BEVERAGE_KEYWORDS, 1);

    if (!mediaList.length) {
      await safeReply(client, chatId, 'Nenhum sticker de bebida encontrado.', message.id);
      return;
    }

    const media = mediaList[0];

    const [, tags] = await Promise.all([
      incrementRandomCount(media.id),
      getTagsForMedia(media.id)
    ]);

    await sendMediaByType(client, chatId, media);

    const infoText = renderInfoMessage(media, tags);
    if (infoText.trim()) {
      await safeReply(client, chatId, infoText, message.id);
    }
  } catch (err) {
    console.error('Erro no comando #pinga:', err);
    await safeReply(client, chatId, 'Erro ao buscar sticker de bebida.', message.id);
  }
}

module.exports = { handlePingaCommand };
