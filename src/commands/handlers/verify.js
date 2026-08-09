/**
 * WhatsApp verification command handler
 */

const { db, createVerificationCode, getVerifiedUser } = require('../../database/index');
const { safeReply } = require('../../utils/safeMessaging');

const SITE_BASE_URL = String(process.env.WEB_SERVER_URL || process.env.BASE_URL || 'https://figurinhas.zanardizz.uk').replace(/\/$/, '');
const REGISTER_URL = SITE_BASE_URL + '/register';

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
      await safeReply(client, chatId, `✅ *Seu WhatsApp já está vinculado ao site!*\n\n👤 Usuário: *${existingUser.username}*\n\nAcesse: ${SITE_BASE_URL}`);
      return;
    }

    // Generate verification code
    const code = await createVerificationCode(db, whatsappJid);
    
    const response = `🔐 *Código para vincular seu WhatsApp ao site*\n\n` +
      `Seu código: *${code}*\n\n` +
      `📋 *Como concluir o cadastro:*\n` +
      `1. Acesse: ${REGISTER_URL}\n` +
      `2. Crie sua conta usando o mesmo número do WhatsApp\n` +
      `3. Confirme seu e-mail e faça login\n` +
      `4. Abra seu perfil e informe este código na área de vínculo WhatsApp\n` +
      `5. Confirme a verificação\n\n` +
      `⏰ *O código é válido por 30 minutos*\n` +
      `🔒 Não compartilhe este código`;

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
