/**
 * Pack command handler - retrieves and sends stickers from a pack
 */

const { 
  getPackByName,
  listPacks,
  getPackStickers,
  incrementRandomCount,
  getTagsForMedia
} = require('../../database');
const { sendMediaByType } = require('../media');
const { renderInfoMessage } = require('../../utils/messageUtils');
const { safeReply } = require('../../utils/safeMessaging');
const { PACK_NAME, AUTHOR_NAME } = require('../../config/stickers');
const { generateWastickersZip } = require('../../services/wastickersGenerator');

/**
 * Parses command parameters to extract pack name
 * @param {string[]} params - Array of command parameters
 * @returns {{ packName: string }} Parsed pack name
 */
function parsePackParams(params = []) {
  if (!Array.isArray(params) || params.length === 0) {
    return { packName: null };
  }

  const packName = params.join(' ').trim();
  return { packName };
}

/**
 * Checks if error is a rate limit error
 * @param {Error} error - Error object
 * @returns {boolean} True if rate limit error
 */
function isRateLimitError(error) {
  if (!error) return false;
  const code = typeof error.data === 'number' ? String(error.data) : '';
  const message = String(error.message || '').toLowerCase();
  return message.includes('rate-overlimit') || code === '429';
}

/**
 * Handles the #pack command
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 * @param {string[]} params - Command parameters
 */
async function handlePackCommand(client, message, chatId, params = []) {
  try {
    const { packName } = parsePackParams(params);

    // If no pack name provided, list available packs
    if (!packName) {
      const packs = await listPacks(null, 20);
      
      if (!packs || packs.length === 0) {
        await safeReply(
          client,
          chatId,
          'Nenhum pack de figurinhas encontrado.\n\n' +
          'Crie um novo pack com: #addpack <nome-do-pack>',
          message.id
        );
        return;
      }

      // Build list of packs
      let response = '📦 *Packs Disponíveis:*\n\n';
      
      for (const pack of packs) {
        const percentage = Math.round((pack.sticker_count / pack.max_stickers) * 100);
        const statusEmoji = pack.sticker_count >= pack.max_stickers ? '🔴' : '🟢';
        
        response += `${statusEmoji} *${pack.name}*\n`;
        response += `   📊 ${pack.sticker_count}/${pack.max_stickers} stickers (${percentage}%)\n`;
        
        if (pack.description) {
          response += `   📝 ${pack.description}\n`;
        }
        
        response += '\n';
      }

      response += '\n💡 Use: #pack <nome-do-pack> para ver os stickers';

      await safeReply(client, chatId, response, message.id);
      return;
    }

    // Search for pack by name (exact match first, then partial)
    let pack = await getPackByName(packName);
    
    if (!pack) {
      // Try partial match
      const matchingPacks = await listPacks(packName, 10);
      
      if (!matchingPacks || matchingPacks.length === 0) {
        await safeReply(
          client,
          chatId,
          `Pack "${packName}" não encontrado.\n\n` +
          'Use #pack (sem parâmetros) para ver a lista de packs disponíveis.',
          message.id
        );
        return;
      }

      if (matchingPacks.length === 1) {
        // Use the single matching pack
        pack = matchingPacks[0];
      } else {
        // Multiple matches - show options
        let response = `Vários packs encontrados para "${packName}":\n\n`;
        
        for (const p of matchingPacks) {
          response += `• ${p.name} (${p.sticker_count} stickers)\n`;
        }
        
        response += '\n💡 Use o nome completo do pack';
        
        await safeReply(client, chatId, response, message.id);
        return;
      }
    }

    // Get stickers from pack
    const stickers = await getPackStickers(pack.id);

    if (!stickers || stickers.length === 0) {
      await safeReply(
        client,
        chatId,
        `O pack "${pack.name}" está vazio.\n\n` +
        'Adicione stickers com: #addpack <nome-do-pack>',
        message.id
      );
      return;
    }

    // Generate wastickers ZIP file
    try {
      const infoMsg = `📦 *Gerando pack: ${pack.name}*\n` +
        `📊 ${stickers.length}/${pack.max_stickers} stickers\n` +
        (pack.description ? `📝 ${pack.description}\n` : '') +
        `\n🎨 Pack criado por: ${PACK_NAME}\n` +
        `✍️ Autor: ${AUTHOR_NAME}\n\n` +
        `⏳ Gerando arquivo .wastickers...`;

      await safeReply(client, chatId, infoMsg, message.id);

      // Prepare stickers with tags for wastickers
      const stickersWithTags = [];
      for (const media of stickers) {
        const tags = await getTagsForMedia(media.id);
        stickersWithTags.push({
          ...media,
          tags: tags.map(t => t.replace('#', ''))
        });
      }

      // Generate the wastickers ZIP file
      const zipPath = await generateWastickersZip(pack, stickersWithTags);

      // Send the wastickers file
      await client.sendFile(chatId, zipPath, `${pack.name}.wastickers`);

      await safeReply(
        client,
        chatId,
        `✅ Pack "${pack.name}" enviado!\n\n` +
        `📱 Para importar:\n` +
        `1. Baixe o arquivo ${pack.name}.wastickers\n` +
        `2. Abra com um app de stickers do WhatsApp\n` +
        `3. Adicione todos os ${stickers.length} stickers de uma vez!\n\n` +
        `💡 Você também pode salvar stickers individualmente ao recebê-los.`,
        message.id
      );

    } catch (error) {
      console.error('Error generating wastickers:', error);
      
      // Fallback to sending stickers individually
      await safeReply(
        client,
        chatId,
        `⚠️ Erro ao gerar arquivo .wastickers.\n` +
        `Enviando stickers individualmente...`,
        message.id
      );

      // Prepare stickers with tags
      const mediaWithDetails = [];
      for (const media of stickers) {
        const [, tags] = await Promise.all([
          incrementRandomCount(media.id),
          getTagsForMedia(media.id)
        ]);
        mediaWithDetails.push({ media, tags });
      }

      let rateLimited = false;
      let sentCount = 0;

      // Send each sticker
      for (const { media, tags } of mediaWithDetails) {
        try {
          await sendMediaByType(client, chatId, media);
          sentCount++;
        } catch (error) {
          if (isRateLimitError(error)) {
            rateLimited = true;
            break;
          }
          console.error('Error sending pack sticker:', error);
          continue;
        }

        // Send info message for each sticker
        const infoText = renderInfoMessage(media, tags);

        if (infoText.trim()) {
          try {
            await safeReply(client, chatId, infoText, message.id);
          } catch (error) {
            if (isRateLimitError(error)) {
              rateLimited = true;
              break;
            }
            console.error('Error sending sticker info:', error);
          }
        }

        // Small delay between stickers to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Send completion or rate limit message
      if (rateLimited) {
        try {
          await safeReply(
            client,
            chatId,
            `⚠️ Enviados ${sentCount}/${stickers.length} stickers.\n\n` +
            'O WhatsApp limitou temporariamente o envio de mensagens. ' +
            'Aguarde alguns instantes e use o comando novamente para receber os stickers restantes.',
            message.id
          );
        } catch (error) {
          console.error('Failed to send rate limit notification:', error);
        }
      } else if (sentCount === stickers.length) {
        try {
          await safeReply(
            client,
            chatId,
            `✅ Pack "${pack.name}" enviado com sucesso! (${sentCount} stickers)`,
          message.id
        );
      } catch (error) {
        console.error('Failed to send completion notification:', error);
      }
    }

  } catch (error) {
    console.error('Error in #pack command:', error);

    const fallbackMessage = isRateLimitError(error)
      ? 'O WhatsApp limitou temporariamente o envio de mensagens. Aguarde alguns instantes e tente novamente.'
      : 'Erro ao buscar pack de stickers. Por favor, tente novamente.';

    await safeReply(client, chatId, fallbackMessage, message.id);
  }
}

module.exports = { handlePackCommand };
