/**
 * Exemplo de integração do Memory Client no Sticker Bot
 * 
 * Adicione isso ao seu handler principal de mensagens
 */

const memory = require('./memory-client');

// Inicializar no startup do bot
memory.init();

// ============================================
// HANDLER DE MENSAGENS (para integrar ao seu bot)
// ============================================

async function handleMessage(msg, sock) {
  const userId = msg.key.participant || msg.key.remoteJid;
  const groupId = msg.key.remoteJid.endsWith('@g.us') ? msg.key.remoteJid : null;
  const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
  const senderName = msg.pushName || 'Desconhecido';

  // 1. Garantir que usuário existe no sistema de memória
  await memory.ensureUser(userId, { name: senderName });

  // 2. Se for grupo, garantir que grupo existe
  if (groupId) {
    await memory.ensureGroup(groupId, { name: 'Grupo WhatsApp' });
  }

  // 3. Extrair e salvar fatos da mensagem
  const learnedFacts = await memory.learnFromMessage(userId, messageText, groupId);
  if (learnedFacts.length > 0) {
    console.log('[Bot] Aprendi', learnedFacts.length, 'fato(s) sobre', senderName);
  }

  // 4. Buscar contexto enriquecido para resposta
  const context = await memory.buildContext(groupId, [userId]);
  
  // 5. Usar contexto para personalizar resposta
  let personalizedGreeting = '';
  if (context.users[userId]) {
    const user = context.users[userId];
    const recentFacts = user.recentFacts || [];
    
    // Exemplo: mencionar algo que sabemos sobre o usuário
    if (recentFacts.length > 0) {
      console.log('[Bot] Contexto disponível:', recentFacts);
    }
  }

  // ... resto do seu handler de mensagens ...
}

// ============================================
// EXEMPLOS DE USO AVANÇADO
// ============================================

// Adicionar fato manualmente
async function saveUserPreference(userId, preference) {
  await memory.addFact(userId, preference, 'preference', 0.9);
}

// Registrar evento especial
async function logSpecialEvent(groupId, userId, eventType, description) {
  await memory.logEvent({
    type: eventType, // ex: 'birthday', 'achievement', 'milestone'
    groupId,
    userId,
    description,
    importance: 'high'
  });
}

// Buscar fatos de um usuário específico
async function getUserProfile(userId) {
  const user = await memory.getUser(userId);
  const facts = await memory.getFacts(userId, { limit: 10 });
  return { ...user, facts: facts.facts };
}

module.exports = { handleMessage, saveUserPreference, logSpecialEvent, getUserProfile };
