# Teste do Sistema de Tracking de Reações

## Overview

Sistema implementado para linkar messageIds de stickers enviadas pelo bot, permitindo tracking completo de reações de emojis.

## Como testar

### 1. Enviar sticker via comando

No WhatsApp, envie no grupo:
```
#random
```

ou

```
#123
```

**Resultado esperado:**
- Bot envia sticker
- messageId é linkado automaticamente ao media_id
- Link aparece na tabela `message_media_links`

### 2. Reagir à sticker enviada

- Reaja à sticker com qualquer emoji (❤️, 😂, 👍, etc.)

**Resultado esperado:**
- Reação é registrada na tabela `media_reactions`
- Associada ao media_id correto

### 3. Verificar no banco de dados

```bash
# Ver links recentes
sqlite3 media.db "
SELECT
  mml.message_id,
  mml.media_id,
  m.file_path
FROM message_media_links mml
JOIN media m ON m.id = mml.media_id
ORDER BY mml.created_at DESC
LIMIT 10;
"

# Ver reações recentes
sqlite3 media.db "
SELECT
  mr.media_id,
  mr.emoji,
  mr.reactor_jid,
  datetime(mr.created_at, 'unixepoch') as reacted_at
FROM media_reactions mr
ORDER BY mr.created_at DESC
LIMIT 10;
"

# Ver estatísticas de reações por emoji
sqlite3 media.db "
SELECT
  emoji,
  COUNT(*) as count,
  COUNT(DISTINCT media_id) as unique_media,
  COUNT(DISTINCT reactor_jid) as unique_reactors
FROM media_reactions
GROUP BY emoji
ORDER BY count DESC;
"
```

### 4. Verificar logs

```bash
# Ver confirmações de link
sudo -u dev pm2 logs Bot-Client --lines 100 | grep -i "link\|reaction"

# Se houver erros de link, aparecerá:
# [Sticker] Failed to link message to media: <erro>
```

## Comandos que devem funcionar

Todos os comandos que enviam stickers agora devem linkar:

- ✅ `#random` - Sticker aleatória
- ✅ `#123` - Sticker por ID
- ✅ `#tema <tag>` - Sticker por tema
- ✅ `#pack <nome>` - Stickers de um pack
- ✅ **Scheduler automático** - Envios agendados

## Queries úteis

### Ranking de stickers mais reagidas

```sql
SELECT
  m.id,
  m.file_path,
  COUNT(*) as reaction_count,
  GROUP_CONCAT(DISTINCT mr.emoji) as emojis_used
FROM media_reactions mr
JOIN media m ON m.id = mr.media_id
GROUP BY m.id
ORDER BY reaction_count DESC
LIMIT 10;
```

### Usuários que mais reagem

```sql
SELECT
  reactor_jid,
  COUNT(*) as total_reactions,
  GROUP_CONCAT(DISTINCT emoji) as emojis_used
FROM media_reactions
GROUP BY reactor_jid
ORDER BY total_reactions DESC
LIMIT 10;
```

### Taxa de sucesso de links

```sql
SELECT
  (SELECT COUNT(*) FROM message_media_links) as total_links,
  (SELECT COUNT(*) FROM media) as total_media,
  ROUND(
    (SELECT COUNT(*) FROM message_media_links) * 100.0 /
    (SELECT COUNT(*) FROM media),
    2
  ) as link_percentage;
```

**Antes:** ~1.1% (119 links de 10.536 media)
**Depois:** Deve aumentar gradualmente conforme bot envia mais stickers

## Troubleshooting

### Reações não aparecem

1. **Verificar se messageId foi linkado:**
   ```sql
   SELECT * FROM message_media_links
   WHERE message_id = 'MESSAGE_ID_AQUI';
   ```

2. **Verificar logs de erro:**
   ```bash
   sudo -u dev pm2 logs Bot-Client --err --lines 50 | grep -i "link\|reaction"
   ```

3. **Verificar handler de reações está ativo:**
   ```bash
   sudo -u dev pm2 logs Bot-Client --lines 200 | grep "Registrado handler de reações"
   ```

   Deve aparecer: `✅ Registrado handler de reações`

### messageId não está sendo retornado

1. **Verificar versão do server.js:**
   ```bash
   grep -A 2 "const messageId = sent?.key?.id" <PROJECT_ROOT>/server.js
   ```

   Deve aparecer nas 3 funções de envio de sticker

2. **Verificar se WS-Socket-Server está atualizado:**
   ```bash
   sudo -u dev pm2 list | grep WS-Socket-Server
   ```

   Versão deve ser >= 0.8.1

## API do modelo de reações

Funções disponíveis em `database/models/reactions.js`:

- `linkMessageToMedia(messageId, mediaId, chatId)` - Linka mensagem ao media
- `getMediaIdFromMessage(messageId)` - Busca media_id de uma mensagem
- `upsertReaction(mediaId, messageId, reactorJid, emoji)` - Adiciona/atualiza reação
- `getReactionsForMedia(mediaId)` - Lista todas reações de um media
- `getReactionCountsForMedia(mediaId)` - Conta reações por emoji
- `getMostReactedMedia(limit)` - Ranking de mais reagidas
- `getUserReactionStats(reactorJid)` - Estatísticas de um usuário

## Próximos passos (futuro)

Possíveis melhorias:

1. **Comando #topreactions** - Mostrar stickers mais reagidas
2. **Analytics web** - Dashboard de reações no painel web
3. **Notificações** - Avisar quando sticker recebe muitas reações
4. **Reação automática** - Bot pode reagir a mensagens de usuários
5. **Emoji trends** - Análise de emojis mais usados ao longo do tempo

---

**Última atualização:** 2026-01-27
**Versão do bot:** 0.8.1
