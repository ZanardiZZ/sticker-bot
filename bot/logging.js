module.exports = {
  async logReceivedMessage(client, message) {
    try {
      const contactId =
        message?.sender?.id ||
        message?.author || // mensagens em grupos
        message?.from ||
        null;

      // Melhor tentativa de nome a partir do payload já recebido
      let name =
        message?.sender?.pushname ||
        message?.sender?.formattedName ||
        message?.sender?.notifyName ||
        message?.sender?.name ||
        null;

      // Se ainda não tiver nome, tenta buscar via API do cliente
      if (!name && contactId) {
        try {
          const contact = await client.getContact(contactId);
          name =
            contact?.pushname ||
            contact?.formattedName ||
            contact?.notifyName ||
            contact?.name ||
            null;
        } catch {
          // ignora falha de getContact
        }
      }

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

      console.log(`${base} | De: ${who}${where}${body}`);
    } catch (e) {
      console.warn('[MSG] Falha ao logar mensagem:', e?.message || e);
    }
  },
};