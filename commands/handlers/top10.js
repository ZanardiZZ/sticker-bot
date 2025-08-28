/**
 * Top 10 command handler
 */

const { getTop10Media } = require('../../database');

/**
 * Handles the #top10 command
 * @param {object} client - WhatsApp client
 * @param {string} chatId - Chat ID
 */
async function handleTop10Command(client, chatId) {
  try {
    const top10 = await getTop10Media();
    
    if (top10.length === 0) {
      await client.sendText(chatId, 'Nenhuma mídia encontrada.');
      return;
    }

    let msg = '🏆 *TOP 10 MÍDIAS MAIS USADAS:*\\n\\n';
    
    top10.forEach((media, index) => {
      const position = index + 1;
      const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
      const sender = media.display_name || 
                    (media.sender_id?.includes('@g.us') ? 
                     `Grupo ${media.sender_id.substring(0, 8)}...` : 
                     `Usuário ${media.sender_id?.substring(0, 8) || 'Desconhecido'}...`);
      
      msg += `${emoji} *ID ${media.id}* - ${media.uso} usos\\n`;
      msg += `   👤 ${sender}\\n`;
      if (media.description) {
        msg += `   📝 ${media.description.substring(0, 50)}${media.description.length > 50 ? '...' : ''}\\n`;
      }
      msg += '\\n';
    });

    await client.sendText(chatId, msg);
  } catch (err) {
    console.error('Erro no comando #top10:', err);
    await client.sendText(chatId, 'Erro ao buscar top 10.');
  }
}

module.exports = { handleTop10Command };