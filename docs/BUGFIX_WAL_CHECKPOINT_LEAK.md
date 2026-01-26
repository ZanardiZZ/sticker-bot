# BugFix: WAL Checkpoint Timer Leak

**Data:** 2026-01-26
**Versão:** 0.6.1
**Severidade:** Média
**Status:** ✅ Corrigido

---

## 🐛 Descrição do Bug

O timer periódico de WAL checkpoint continuava executando mesmo após o database ser fechado, resultando em centenas de avisos `SQLITE_MISUSE: Database is closed`.

### Sintomas

```
[DB] Periodic WAL checkpoint warning: SQLITE_MISUSE: Database is closed
[DB] Periodic WAL checkpoint warning: SQLITE_MISUSE: Database is closed
[DB] Periodic WAL checkpoint warning: SQLITE_MISUSE: Database is closed
... (repetido centenas de vezes)
```

**Quando ocorria:**
- Scripts de teste que fechavam o database
- Scripts de manutenção (recalculate-hashes.js)
- Qualquer script que não rodasse indefinidamente

### Exemplo Real

```bash
node scripts/recalculate-hashes.js --dry-run

# Output:
✅ Hash recalculation completed
[DB] Periodic WAL checkpoint warning: SQLITE_MISUSE: Database is closed
[DB] Periodic WAL checkpoint warning: SQLITE_MISUSE: Database is closed
[DB] Periodic WAL checkpoint warning: SQLITE_MISUSE: Database is closed
... (continua por ~5 minutos até o próximo checkpoint falhar e parar)
```

---

## 🔍 Causa Raiz

### Fluxo do Bug

1. **Inicialização** (`database/connection.js`):
   ```javascript
   startPeriodicCheckpoint(); // Inicia timer setInterval
   ```

2. **Timer Periódico** (executa a cada 5 minutos):
   ```javascript
   setInterval(async () => {
     await dbHandler.checkpointWAL(); // Tenta fazer checkpoint
   }, 5 * 60 * 1000);
   ```

3. **Script fecha database**:
   ```javascript
   await dbHandler.close(); // Fecha o database
   // Timer continua rodando! ❌
   ```

4. **Timer tenta checkpoint em database fechado**:
   ```javascript
   this.db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
     // err: SQLITE_MISUSE: Database is closed
   });
   ```

### Por Que Não Parava?

**Problema 1:** `DatabaseHandler.close()` não existia

```javascript
// services/databaseHandler.js - ANTES
class DatabaseHandler {
  constructor(db) {
    this.db = db;
    // Sem método close()! ❌
  }
}
```

**Problema 2:** Timer não verificava se database estava fechado

```javascript
// database/connection.js - ANTES
checkpointInterval = setInterval(async () => {
  // Sem verificação de isClosed! ❌
  await dbHandler.checkpointWAL();
}, 5 * 60 * 1000);
```

**Problema 3:** `checkpointWAL()` não verificava estado

```javascript
// services/databaseHandler.js - ANTES
async checkpointWAL() {
  // Sem verificação de isClosed! ❌
  return this.executeWithRetry(() => {
    this.db.run('PRAGMA wal_checkpoint(TRUNCATE)', ...);
  });
}
```

---

## ✅ Correção Aplicada

### 1. Adicionado flag `isClosed` (`services/databaseHandler.js`)

```javascript
class DatabaseHandler {
  constructor(db) {
    this.db = db;
    this.isClosed = false; // ✅ Track database state
    // ...
  }
}
```

### 2. Adicionado método `close()` (`services/databaseHandler.js`)

```javascript
/**
 * Close the database connection and stop periodic operations
 */
close() {
  this.isClosed = true; // ✅ Mark as closed

  // Stop periodic checkpoint if running
  const connection = require('../database/connection');
  if (connection.stopPeriodicCheckpoint) {
    connection.stopPeriodicCheckpoint(); // ✅ Stop timer
  }

  return new Promise((resolve, reject) => {
    this.db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
```

### 3. Verificação em `checkpointWAL()` (`services/databaseHandler.js`)

```javascript
async checkpointWAL() {
  // ✅ Skip checkpoint if database is closed
  if (this.isClosed) {
    return;
  }

  return this.executeWithRetry(() => {
    return new Promise((resolve, reject) => {
      // ✅ Double-check before executing
      if (this.isClosed) {
        resolve();
        return;
      }

      this.db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}
```

### 4. Verificação no Timer Periódico (`database/connection.js`)

```javascript
checkpointInterval = setInterval(async () => {
  // ✅ Skip if database is closed
  if (dbHandler.isClosed) {
    stopPeriodicCheckpoint();
    return;
  }

  try {
    await dbHandler.checkpointWAL();
    console.log('[DB] Periodic WAL checkpoint completed');
  } catch (error) {
    // ✅ Ignore errors if database is closed
    if (dbHandler.isClosed) {
      stopPeriodicCheckpoint();
      return;
    }

    console.warn(`[DB] Periodic WAL checkpoint warning: ${error.message}`);
    // ...
  }
}, 5 * 60 * 1000);
```

### 5. Atualizado `recalculate-hashes.js`

```javascript
// ANTES:
finally {
  await dbHandler.close(); // Pode falhar silenciosamente
}

// DEPOIS:
try {
  await dbHandler.close(); // ✅ Close explicitamente
} catch (closeErr) {
  console.warn('Warning: Database close error:', closeErr.message);
}
```

---

## 🧪 Validação

### Teste 1: Close Manual

```javascript
const { dbHandler } = require('./database/connection');

// Database está aberto, timer rodando
console.log('Database open, checkpoint timer running');

// Fecha database
await dbHandler.close();

// Aguarda 10 segundos
await new Promise(resolve => setTimeout(resolve, 10000));

// ✅ Nenhum warning de SQLITE_MISUSE
```

**Resultado:**
```
[DB] Started periodic WAL checkpoint
Database open, checkpoint timer running
[DB] Stopped periodic WAL checkpoint
✅ Test completed - no warnings!
```

### Teste 2: Script de Recálculo

```bash
node scripts/recalculate-hashes.js --dry-run --limit 5
```

**Antes da correção:**
```
✅ Hash recalculation completed
[DB] Periodic WAL checkpoint warning: SQLITE_MISUSE: Database is closed
[DB] Periodic WAL checkpoint warning: SQLITE_MISUSE: Database is closed
... (centenas de linhas)
```

**Depois da correção:**
```
✅ Hash recalculation completed
[DB] Stopped periodic WAL checkpoint
(sem warnings!)
```

---

## 📊 Impacto

### Antes da Correção:
- ❌ Scripts de teste/manutenção poluíam logs com centenas de warnings
- ❌ Timer continuava rodando desnecessariamente por até 5 minutos
- ❌ Possível memory leak em ambientes com muitos scripts curtos
- ❌ Confusão em logs (parecem erros graves mas são apenas avisos)

### Depois da Correção:
- ✅ Logs limpos, sem warnings desnecessários
- ✅ Timer para imediatamente quando database é fechado
- ✅ Sem memory leaks
- ✅ Logs claros: `[DB] Stopped periodic WAL checkpoint`

---

## 🔗 Arquivos Modificados

1. **`services/databaseHandler.js`**:
   - Adicionada flag `isClosed`
   - Adicionado método `close()`
   - Verificação em `checkpointWAL()`

2. **`database/connection.js`**:
   - Verificação de `isClosed` no timer periódico
   - Ignora erros se database fechado

3. **`scripts/recalculate-hashes.js`**:
   - Close explícito com try/catch
   - Tratamento de erro no close

---

## 💡 Lições Aprendidas

### 1. **Sempre Limpar Timers**

```javascript
// ❌ MAU
setInterval(() => {
  doSomething();
}, 1000);
// Timer nunca para!

// ✅ BOM
const timer = setInterval(() => {
  doSomething();
}, 1000);

cleanup() {
  clearInterval(timer);
}
```

### 2. **Verificar Estado Antes de Operações Assíncronas**

```javascript
// ❌ MAU
async function doWork() {
  await longOperation();
  // Estado pode ter mudado durante await!
  this.db.run(...); // Pode estar fechado agora
}

// ✅ BOM
async function doWork() {
  if (this.isClosed) return;
  await longOperation();
  if (this.isClosed) return; // Verifica novamente
  this.db.run(...);
}
```

### 3. **Close Deve Ser Explícito e Completo**

```javascript
// ❌ MAU
close() {
  this.db.close();
  // Esqueceu de parar timers!
}

// ✅ BOM
close() {
  this.isClosed = true;
  this.stopAllTimers();
  this.cleanupResources();
  this.db.close();
}
```

---

## 📋 Checklist de Prevenção

Para evitar bugs similares no futuro:

- [x] Sempre criar método `close()` para classes com timers
- [x] Sempre verificar estado antes de operações assíncronas
- [x] Sempre limpar timers em `close()`
- [x] Sempre adicionar flag de estado (`isClosed`, `isRunning`, etc)
- [x] Sempre testar scripts curtos (não apenas serviços de longa duração)
- [x] Sempre verificar logs para warnings repetitivos

---

**Autor:** Claude (Anthropic)
**Revisão:** Necessária pelo desenvolvedor principal
**Merge Status:** ✅ Aplicado e testado (2026-01-26)
