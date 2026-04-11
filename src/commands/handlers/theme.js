/**
 * Theme command handler - fetches media based on keywords
 */

const { findMediaByTheme, incrementRandomCount, getTagsForMedia } = require('../../database');
const { sendMediaByType } = require('../media');
const { renderInfoMessage } = require('../../utils/messageUtils');
const { safeReply } = require('../../utils/safeMessaging');
const { withTyping } = require('../../utils/typingIndicator');

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

function isMissingMediaError(error) {
  if (!error) return false;
  const message = String(error.message || '');
  return error.code === 'ENOENT' || message.includes('Arquivo de mídia não encontrado');
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

    const searchLimit = Math.max(limit, Math.min(50, limit * 5));
    const mediaList = await findMediaByTheme(keywords, searchLimit);

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
    let deliveredCount = 0;
    let skippedMissing = 0;
    let rateLimited = false;

    for (const media of mediaList) {
      if (deliveredCount >= requestedCount) {
        break;
      }

      let tags = [];
      try {
        await withTyping(client, chatId, () => sendMediaByType(client, chatId, media));

        await incrementRandomCount(media.id);
        tags = await getTagsForMedia(media.id);
        deliveredCount += 1;
      } catch (error) {
        if (isRateLimitError(error)) {
          rateLimited = true;
          break;
        }

        if (isMissingMediaError(error)) {
          skippedMissing += 1;
          console.warn(`[#theme] Skipping missing media id=${media.id} path=${media.file_path}`);
          continue;
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
      try {
        await safeReply(
          client,
          chatId,
          'O WhatsApp limitou temporariamente o envio de mensagens. Aguarde alguns instantes e tente novamente.',
          message.id
        );
      } catch (error) {
        console.error('Failed to send rate limit notification:', error);
      }
      return;
    }

    if (skippedMissing > 0) {
      console.warn(`[#theme] Skipped ${skippedMissing} media item(s) with missing files.`);
    }

    if (deliveredCount < requestedCount) {
      await safeReply(
        client,
        chatId,
        deliveredCount > 0
          ? `Achei apenas ${deliveredCount} stickers para o tema solicitado.`
          : `Nenhum sticker disponível para o tema "${keywords.join(' ')}".`,
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
