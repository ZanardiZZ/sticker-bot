module.exports = {
  async logReceivedMessage(client, message) {
    try {
      const contactId =
        message?.sender?.id ||
        message?.author || // mensagens em grupos
        message?.from ||
        null;

      // Melhor tentativa de nome a partir do payload já recebido (sem consultas externas)
      let name =
        message?.sender?.pushname ||
        message?.sender?.formattedName ||
        message?.sender?.notifyName ||
        message?.sender?.name ||
        null;

      if (!name) {
        name = contactId ? contactId.split('@')[0] : 'Desconhecido';
      }

      const isGroup = !!message?.isGroupMsg;
      const groupName = isGroup
        ? message?.chat?.name || message?.chat?.formattedTitle || 'Grupo'
        : null;

      const type = message?.type || 'desconhecido';
      const bodyPreview = (message?.body || '')
        .replace(/\s+/g, ' ')
        .slice(0, 120);

      const ts =
        message?.timestamp
          ? new Date(message.timestamp * 1000).toISOString()
          : new Date().toISOString();

      const base = `[MSG] ${ts} | ${type}`;
      const who = `${name}${contactId ? ` (${contactId})` : ''}`;
      const where = isGroup ? ` | ${groupName}` : '';
      const body = bodyPreview ? ` | "${bodyPreview}"` : '';
      const chatInfo = message?.from ? ` | Chat: ${message.from}` : '';

      console.log(`${base} | De: ${who}${where}${body}${chatInfo}`);
    } catch (e) {
      console.warn('[MSG] Falha ao logar mensagem:', e?.message || e);
    }
  },
};
