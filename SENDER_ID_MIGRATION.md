# Migração de Sender IDs Faltantes

## Problema
Após a migração do sender_id, 642 mídias ficaram sem `sender_id`, mas podem ter informações em `chat_id` ou `group_id`. Estas mídias não apareciam no ranking de usuários.

## Solução
Implementada solução que:

1. **Usa fallback**: `sender_id` → `chat_id` → `group_id`
2. **Distingue grupos**: Mostra nomes de grupos apropriados  
3. **Exclui bot**: Envios do próprio bot não aparecem no ranking de usuários
4. **Mantém contagem**: Bot sends ainda são contados, só não exibidos

## Como usar

### 1. Executar migração das mídias órfãs
```bash
node scripts/migrate-missing-sender-ids.js
```

Este script:
- Encontra mídias sem `sender_id` mas com `chat_id`/`group_id`
- Cria entradas na tabela `contacts` para estes IDs
- Gera nomes apropriados para grupos
- Permite que sejam incluídas no ranking

### 2. Verificar resultados
Use os comandos de ranking para ver os resultados:
- `#top5users` - No bot
- Painel web `/ranking-users` - Interface web

## Mudanças técnicas

### Banco de dados
- `getTop5UsersByStickerCount()`: Agora usa `COALESCE(sender_id, chat_id, group_id)`
- Exclui padrões de bot (`%bot%`)
- Inclui flag `is_group` para identificar grupos

### Web API  
- `/api/rank/users`: Atualizado com nova lógica
- Retorna campo `is_group` para frontend
- Gera nomes de grupo automaticamente

### Frontend
- Mostra ícone 👥 para grupos
- Exibe nomes apropriados para todos os tipos

### Identificação de Bot
Envios do bot são identificados pelos padrões:
- `sender_id LIKE '%bot%'`  
- `chat_id LIKE '%bot%'`
- `sender_id = chat_id AND group_id IS NULL` (padrão suspeito)

## Compatibilidade
- ✅ Mantém funcionamento existente
- ✅ Dados antigos continuam funcionando  
- ✅ Novos dados usam lógica aprimorada
- ✅ Migração é opcional e segura