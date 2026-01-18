/**
 * WhatsApp verification command handler
 */

const { db, createVerificationCode, getVerifiedUser } = require('../../database/index');
const { safeReply } = require('../../utils/safeMessaging');

/**
 * Handle verification code generation command
 * @param {object} client - WhatsApp client
 * @param {object} message - Message object
 * @param {string} chatId - Chat ID
 */
async function handleVerifyCommand(client, message, chatId) {
  try {
    // Only allow in DM (private chats)
    if (chatId.includes('@g.us')) {
      await safeReply(client, chatId, '❌ *Este comando só funciona em conversa privada.*\n\nEnvie uma mensagem diretamente para o bot para gerar seu código de verificação.');
      return;
    }

    const whatsappJid = message.from;

    // Check if user is already verified
    const existingUser = await getVerifiedUser(db, whatsappJid);
    if (existingUser) {
      await safeReply(client, chatId, `✅ *Sua conta já está verificada!*\n\n👤 Usuário: *${existingUser.username}*\n\nVocê já pode editar figurinhas no site.`);
      return;
    }

    // Generate verification code
    const code = await createVerificationCode(db, whatsappJid);
    
    const response = `🔐 *Código de Verificação Gerado*\n\n` +
      `Seu código: *${code}*\n\n` +
      `📋 *Como usar:*\n` +
      `1. Acesse o site do Sticker Bot\n` +
      `2. Faça login na sua conta\n` +
      `3. Vá em "Configurações" ou "Perfil"\n` +
      `4. Digite este código no campo "Verificação WhatsApp"\n` +
      `5. Clique em "Verificar"\n\n` +
      `⏰ *Válido por 30 minutos*\n` +
      `🔒 Mantenha este código em segurança`;

    await safeReply(client, chatId, response);
    
    console.log(`[VERIFY] Generated verification code for ${whatsappJid}: ${code}`);
    
  } catch (error) {
    console.error('[VERIFY] Error handling verify command:', error);
    await safeReply(client, chatId, '❌ *Erro ao gerar código de verificação.*\n\nTente novamente em alguns segundos.');
  }
}

module.exports = {
  handleVerifyCommand
};
