# Lia-Core Memory Integration - Sticker Bot
## Documentação de Integração

Esta documentação explica como o Sticker Bot integra-se com o sistema de memória persistente Lia-Core.

---

## 📁 Arquivos do Cliente

| Arquivo | Descrição |
|---------|-----------|
| `memory-client.js` | Cliente principal para comunicação com a API |
| `example-usage.js` | Exemplos práticos de implementação |
| `MEMORY-INTEGRATION.md` | Esta documentação |

---

## ⚙️ Configuração

### Variável de Ambiente

```bash
MEMORY_API_URL=http://seu-backend-de-memoria:8766
MEMORY_ENABLED=1
MEMORY_TIMEOUT_MS=3000
MEMORY_RETRY_COUNT=1
```

Se `MEMORY_API_URL` não estiver definida, a integração fica desabilitada.

### Inicialização

```javascript
const memory = require('./client/memory-client');
memory.init();
```

---

## 🧠 Funcionalidades

### 1. Perfil de Usuário

**Garantir usuário existe:**
```javascript
await memory.ensureUser(userId, { name: 'João' });
```

**Adicionar fato:**
```javascript
await memory.addFact(userId, 'trabalha com TI', 'profession', 0.8);
```

**Buscar fatos:**
```javascript
const facts = await memory.getFacts(userId, { category: 'interest', limit: 10 });
```

### 2. Perfil de Grupo

**Garantir grupo existe:**
```javascript
await memory.ensureGroup(groupId, { name: 'Grupo da Família' });
```

**Adicionar piada interna:**
```javascript
await memory.addRunningJoke(groupId, 'Gordon Freeman', 'Dr. Kleiner', 'Referência Half-Life');
```

### 3. Eventos

**Registrar evento:**
```javascript
await memory.logEvent({
  type: 'birthday',
  groupId: groupId,
  userId: userId,
  description: 'Aniversário do Capitão'
});
```

### 4. Contexto Enriquecido

**Obter contexto para resposta:**
```javascript
const context = await memory.buildContext(groupId, [userId]);
```

### 5. Aprendizado Automático

**Extrair fatos de mensagens:**
```javascript
const facts = await memory.learnFromMessage(userId, 'Meu nome é Daniel', groupId);
```

---

## 🔌 Endpoints da API

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/user/:id` | GET/POST | Perfil do usuário |
| `/api/user/:id/fact` | POST | Adicionar fato |
| `/api/user/:id/facts` | GET | Listar fatos |
| `/api/group/:id` | GET/POST | Perfil do grupo |
| `/api/event` | POST | Registrar evento |
| `/api/insights/:groupId` | GET | Contexto completo |

---

## 🚀 Integração Rápida

Adicione ao seu handler de mensagens:

```javascript
const memory = require('./client/memory-client');
memory.init();

async function onMessage(msg) {
  const userId = msg.key.participant || msg.key.remoteJid;
  const groupId = msg.key.remoteJid.endsWith('@g.us') ? msg.key.remoteJid : null;
  const text = msg.message?.conversation || '';
  
  await memory.ensureUser(userId, { name: msg.pushName });
  if (groupId) await memory.ensureGroup(groupId);
await memory.learnFromMessage(userId, text, groupId);
const context = await memory.buildContext(groupId, [userId]);
}
```

No bot principal, o contexto retornado deve ser incorporado ao prompt do `conversationAgent`, não apenas buscado e descartado.

---

## 📝 Logs

O cliente loga automaticamente:
- `[MemoryClient] Bridge conectado` - na inicialização
- `[MemoryClient] Erro:` - em caso de falha na API
- `[Bot] Aprendi X fato(s)` - quando extrai informações

---

## 🔧 Troubleshooting

| Problema | Solução |
|----------|---------|
| API não responde | Verificar se `MEMORY_API_URL` está correto |
| Dados não persistem | Verificar conectividade com porta 8766 |
| Timeout | Aumentar timeout do axios no cliente |

---

## 🏗️ Arquitetura

```
┌─────────────────┐      HTTP      ┌──────────────────┐
│  Sticker Bot    │ ◄─────────────►│  Lia-Core API    │
│  (Figurinhas)   │    Porta 8766  │  (192.168.20.140)│
│                 │                │                  │
│  memory-client  │                │  Memória         │
│  client/        │                │  Persistente     │
└─────────────────┘                └──────────────────┘
```

---

**Documentação gerada em:** 2026-03-23
**Versão:** 1.0
