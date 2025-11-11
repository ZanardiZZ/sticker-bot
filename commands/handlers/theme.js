/**
 * Theme command handler - fetches media based on keywords
 */

const { findMediaByTheme, incrementRandomCount, getTagsForMedia } = require('../../database');
const { sendMediaByType } = require('../media');
const { renderInfoMessage } = require('../../utils/messageUtils');
const { safeReply } = require('../../utils/safeMessaging');

/**
 * Parses command parameters to extract keywords and limit
 * @param {string[]} params - Array of command parameters
 * @returns {{ keywords: string[], limit: number }} Parsed keywords and limit
 */
function parseThemeParams(params = []) {
  const workingParams = Array.isArray(params) ? [...params] : [];

  if (!workingParams.length) {
    return { keywords: [], limit: 1 };
  }

  let limit = 1;
  const lastParam = workingParams[workingParams.length - 1];

  if (/^\d+$/.test(lastParam)) {
    limit = Math.min(10, Math.max(1, parseInt(lastParam, 10)));
    workingParams.pop();
  }

  const keywords = workingParams
    .map(param => (typeof param === 'string' ? param.trim() : ''))
    .filter(Boolean);

  return { keywords, limit };
}

/**
 * Handles the #tema command
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 * @param {string[]} params - Command parameters
 */
function isRateLimitError(error) {
  if (!error) return false;
  const code = typeof error.data === 'number' ? String(error.data) : '';
  const message = String(error.message || '').toLowerCase();
  return message.includes('rate-overlimit') || code === '429';
}

async function handleThemeCommand(client, message, chatId, params = []) {
  try {
    const { keywords, limit } = parseThemeParams(params);

    if (!keywords.length) {
      await safeReply(
        client,
        chatId,
        'Uso: #tema <palavras-chave> <quantidade>\nQuantidade: 1-10 (máximo 10 figurinhas)\nExemplo: #tema divertido 5',
        message.id
      );
      return;
    }

    const mediaList = await findMediaByTheme(keywords, limit);

    if (!mediaList.length) {
      await safeReply(
        client,
        chatId,
        `Nenhum sticker encontrado para o tema "${keywords.join(' ')}".`,
        message.id
      );
      return;
    }

    const requestedCount = limit;
    const deliveredCount = mediaList.length;

    const mediaWithDetails = [];
    for (const media of mediaList) {
      const [, tags] = await Promise.all([
        incrementRandomCount(media.id),
        getTagsForMedia(media.id)
      ]);
      mediaWithDetails.push({ media, tags });
    }

    let rateLimited = false;

    for (const { media, tags } of mediaWithDetails) {
      try {
        await sendMediaByType(client, chatId, media);
      } catch (error) {
        if (isRateLimitError(error)) {
          rateLimited = true;
          break;
        }
        throw error;
      }

      const infoText = renderInfoMessage(media, tags);

      if (infoText.trim()) {
        try {
          await safeReply(client, chatId, infoText, message.id);
        } catch (error) {
          if (isRateLimitError(error)) {
            rateLimited = true;
            break;
          }
          throw error;
        }
      }
    }

    if (rateLimited) {
      await safeReply(
        client,
        chatId,
        'O WhatsApp limitou temporariamente o envio de mensagens. Aguarde alguns instantes e tente novamente.',
        message.id
      );
      return;
    }

    if (deliveredCount < requestedCount) {
      await safeReply(
        client,
        chatId,
        `Achei apenas ${deliveredCount} stickers para o tema solicitado.`,
        message.id
      );
    }
  } catch (err) {
    console.error('Error in #theme command:', err);

    const fallbackMessage = isRateLimitError(err)
      ? 'O WhatsApp limitou temporariamente o envio de mensagens. Aguarde alguns instantes e tente novamente.'
      : 'Erro ao buscar stickers por tema.';

    await safeReply(client, chatId, fallbackMessage, message.id);
  }
}

module.exports = { handleThemeCommand };