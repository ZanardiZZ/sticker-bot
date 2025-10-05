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
async function handleThemeCommand(client, message, chatId, params = []) {
  try {
    const { keywords, limit } = parseThemeParams(params);

    if (!keywords.length) {
      await safeReply(
        client,
        chatId,
        'Usage: #theme <keywords> <quantity (1-10)>\nExample: #theme fun 5',
        message.id
      );
      return;
    }

    const mediaList = await findMediaByTheme(keywords, limit);

    if (!mediaList.length) {
      await safeReply(
        client,
        chatId,
        `No stickers found for theme "${keywords.join(' ')}".`,
        message.id
      );
      return;
    }

    const requestedCount = limit;
    const deliveredCount = mediaList.length;

    const mediaWithDetails = await Promise.all(
      mediaList.map(async media => {
        const [, tags] = await Promise.all([
          incrementRandomCount(media.id),
          getTagsForMedia(media.id)
        ]);

        return { media, tags };
      })
    );

    for (const { media, tags } of mediaWithDetails) {
      await sendMediaByType(client, chatId, media);

      const infoText = renderInfoMessage(media, tags);

      if (infoText.trim()) {
        await safeReply(client, chatId, infoText, message.id);
      }
    }

    if (deliveredCount < requestedCount) {
      await safeReply(
        client,
        chatId,
        `Only found ${deliveredCount} stickers for the requested theme.`,
        message.id
      );
    }
  } catch (err) {
    console.error('Error in #theme command:', err);
    await safeReply(client, chatId, 'Error searching for stickers by theme.', message.id);
  }
}

module.exports = { handleThemeCommand };