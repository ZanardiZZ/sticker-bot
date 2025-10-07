# Migração para Sistema LID (Local Identifier) do WhatsApp

Este documento descreve as mudanças implementadas para suportar o novo sistema LID do WhatsApp, que substitui gradualmente o sistema baseado em números de telefone (PN).

## 📋 Visão Geral

O WhatsApp introduziu o sistema LID (Local Identifier) para melhorar a privacidade dos usuários, especialmente em grupos grandes. Este sistema:

- ✅ **Mantém anonimato** - Mostra apenas números parciais como (+43.......21)
- ✅ **Preserva funcionalidade** - Usuários ainda podem ser identificados de forma única
- ✅ **Suporta migração** - Compatível com números de telefone existentes
- ✅ **Funciona com @usernames** - Preparado para futuros usernames do WhatsApp

## 🔧 Mudanças Implementadas

### 1. Utilitários JID (`utils/jidUtils.js`)

Novo módulo com funções para identificar e manipular diferentes tipos de JIDs:

```javascript
const { 
    isPnUser,           // Identifica números de telefone
    isLidUser,          // Identifica LIDs
    isJidGroup,         // Identifica grupos
    normalizeJid,       // Normaliza formato
    areJidsSameUser     // Compara usuários
} = require('./utils/jidUtils');
```

### 2. Mapeamento LID ↔ PN (`database/models/lidMapping.js`)

Sistema de armazenamento para mapeamentos LID ↔ PN:

```javascript
const { 
    storeLidPnMapping,  // Armazena mapeamento
    getPnForLid,        // Busca PN por LID
    getLidForPn,        // Busca LID por PN
    resolveSenderId     // Resolve ID preferido
} = require('./database');
```

### 3. Database Schema Atualizado

Nova tabela `lid_mapping`:
```sql
CREATE TABLE lid_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lid TEXT UNIQUE,
    pn TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4. Message Handler Atualizado

O `bot/messageHandler.js` agora:
- ✅ Detecta sender IDs corretamente usando `participantAlt` e `remoteJidAlt`
- ✅ Resolve IDs preferidos (LID quando disponível)
- ✅ Armazena mapeamentos automaticamente

### 5. Server Baileys Atualizado

O `server.js` agora escuta eventos de mapeamento LID:
```javascript
sock.ev.on('lid-mapping.update', (mapping) => {
    console.log('[LID] Novo mapeamento recebido:', mapping);
});
```

## 🚀 Como Usar

### 1. Executar Migração

```bash
# Migrar dados existentes para suportar LIDs
node scripts/migrate-to-lids.js
```

### 2. Executar Testes

```bash
# Testar funcionalidades LID
node tests/test-lid-functionality.js

# Teste integrado completo
node tests/test-lid-integration.js
```

### 3. Iniciar Bot

```bash
# Modo normal
npm start

# Modo Baileys (recomendado para LIDs)
USE_BAILEYS=true npm start
```

## 📊 Monitoramento

### Logs Importantes

O sistema produz logs específicos para LIDs:

```
[LID] Novo mapeamento LID↔PN armazenado: 123456@lid ↔ 5511999999999@s.whatsapp.net
[JID] Erro ao obter LID para 5511999999999@s.whatsapp.net: not_found
[MIGRATE] 150 sender_ids atualizados para formato normalizado
```

### Verificação de Dados

```javascript
// Verificar mapeamentos no database
const { getAllMappings } = require('./database');
const mappings = getAllMappings();
console.log('Mapeamentos LID ↔ PN:', mappings);
```

## ⚠️ Importante

### Compatibilidade

- ✅ **Backward compatible** - Funciona com PNs antigos
- ✅ **Forward compatible** - Pronto para LIDs novos
- ✅ **Migração automática** - Converte dados existentes

### Fallbacks

Se LID não estiver disponível:
1. Sistema tenta buscar PN correspondente
2. Usa PN normalizado como fallback
3. Mantém funcionalidade completa

### Configurações Recomendadas

```env
# .env
USE_BAILEYS=true
BAILEYS_WS_URL=ws://localhost:8765
BAILEYS_CLIENT_TOKEN=your_token
```

## 🔍 Resolução de Problemas

### Problema: "LID mapping não funciona"
- ✅ Verifique se Baileys está atualizado (v6.8.0+)
- ✅ Confirme que `USE_BAILEYS=true`
- ✅ Execute a migração: `node scripts/migrate-to-lids.js`

### Problema: "Usuários duplicados"
- ✅ Execute o script de limpeza de duplicatas
- ✅ Verifique mapeamentos: `getAllMappings()`

### Problema: "Sender ID null"
- ✅ Verifique se `messageKey.participant` ou `messageKey.participantAlt` existem
- ✅ Confirme que função `resolveSenderId` está sendo usada

## 📝 Estrutura de Arquivos

```
├── utils/
│   └── jidUtils.js              # Utilitários JID
├── database/
│   ├── models/
│   │   └── lidMapping.js        # Modelo LID mapping
│   └── migrations/
│       └── schema.js            # Schema atualizado
├── scripts/
│   └── migrate-to-lids.js       # Script de migração
├── tests/
│   ├── test-lid-functionality.js   # Testes funcionais
│   └── test-lid-integration.js     # Testes integrados
├── bot/
│   └── messageHandler.js        # Handler atualizado
├── server.js                    # Server Baileys atualizado
└── waAdapter.js                 # Adapter atualizado
```

## 🎯 Próximos Passos

1. **Monitorar logs** - Observar mapeamentos sendo criados
2. **Validar dados** - Confirmar que usuários são identificados corretamente
3. **Performance** - Otimizar consultas de mapeamento se necessário
4. **Username support** - Preparar para sistema @username futuro

---

**Status**: ✅ Implementado e testado
**Versão**: 1.0.0
**Compatibilidade**: Baileys 6.8.0+
