# Admin Watcher - Ferramentas de Correção Automática

## 📋 Resumo

O AdminWatcher foi expandido de **9 para 15 ferramentas**, adicionando **6 novas ferramentas de correção automática** que permitem ao bot **aplicar fixes automaticamente** em vez de apenas diagnosticar e sugerir correções.

**Versão Anterior:** Bot diagnosticava problemas e sugeria correções manuais
**Versão Atual:** Bot diagnostica E aplica correções automaticamente quando possível

---

## 🆕 Novas Ferramentas de Correção (6 adicionadas)

### 1. **analyzeDatabaseSchema**
- **O que faz:** Analisa estrutura do banco de dados SQLite
- **Quando usar:** Para investigar problemas de schema, verificar se tabelas existem
- **Exemplo:**
  ```javascript
  // Listar todas as tabelas
  analyzeDatabaseSchema({})

  // Analisar tabela específica
  analyzeDatabaseSchema({ tableName: 'media' })
  ```

### 2. **executeSqlQuery** ⚠️ Poderosa
- **O que faz:** Executa queries SQL no banco de dados
- **Operações permitidas:** SELECT, INSERT, UPDATE, CREATE TABLE, CREATE INDEX, ALTER TABLE
- **Operações bloqueadas:** DROP, DELETE, TRUNCATE, PRAGMA
- **Quando usar:** Para corrigir dados corrompidos, criar índices, atualizar registros
- **Exemplo:**
  ```sql
  -- Verificar duplicatas
  SELECT hash_md5, COUNT(*) FROM media GROUP BY hash_md5 HAVING COUNT(*) > 1

  -- Criar índice faltante
  CREATE INDEX idx_media_hash ON media(hash_md5)
  ```

### 3. **createDatabaseTable** ⚠️ Poderosa
- **O que faz:** Cria tabelas que estão faltando no banco de dados
- **Quando usar:** Quando detectar que uma tabela necessária não existe
- **Exemplo de uso real:**
  ```javascript
  // Criar tabela media_queue que estava faltando
  createDatabaseTable({
    tableName: 'media_queue',
    schema: `CREATE TABLE media_queue (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL,
      created_at INTEGER
    )`
  })
  ```

### 4. **modifyBotConfig** ⚠️ Poderosa
- **O que faz:** Modifica valores de configuração na tabela `bot_config`
- **Quando usar:** Para corrigir configs perdidas ou incorretas
- **Exemplo:**
  ```javascript
  // Habilitar scheduler que foi desabilitado
  modifyBotConfig({
    key: 'scheduler_enabled',
    value: '1'
  })

  // Restaurar cron expression
  modifyBotConfig({
    key: 'auto_send_cron',
    value: '0 8-21 * * *'
  })
  ```

### 5. **clearProcessingQueue** ⚠️ Poderosa
- **O que faz:** Limpa fila de processamento travada
- **Opções:** `failed`, `stuck`, `all`
- **Quando usar:** Quando detectar muitos jobs travados na fila
- **Exemplo:**
  ```javascript
  // Limpar apenas jobs com falha
  clearProcessingQueue({ status: 'failed' })

  // Limpar jobs travados (processando há mais de 10 min)
  clearProcessingQueue({ status: 'stuck' })
  ```

### 6. **writeFile** ⚠️ Poderosa
- **O que faz:** Escreve conteúdo em arquivos
- **Restrições:** NÃO pode escrever em `.env`, `auth_info_baileys`, `node_modules`, `.git`, `media.db`, arquivos `.key/.pem/.crt`
- **Quando usar:** Para criar scripts de correção temporários ou patches
- **Exemplo:**
  ```javascript
  // Criar script de correção
  writeFile({
    filePath: 'scripts/fix-duplicates-temp.js',
    content: '// Script auto-gerado para corrigir duplicatas\n...'
  })

  // Adicionar ao final de um log
  writeFile({
    filePath: 'logs/manual-fixes.log',
    content: 'Fixed issue X at 2026-01-25\n',
    append: true
  })
  ```

---

## 🛠️ Ferramentas Existentes (9 originais)

### Diagnóstico:
1. **getBotLogs** - Lê logs recentes (bot/baileys/web)
2. **searchLogsForPattern** - Busca regex em logs
3. **getServiceStatus** - Verifica status PM2
4. **getLastSentSticker** - Info do último sticker enviado
5. **getSchedulerStatus** - Status do scheduler
6. **getQueueStatus** - Status da fila de processamento
7. **readFile** - Lê código-fonte (agora permite `.env.example`)
8. **runHealthCheck** - Health check completo

### Correção:
9. **restartService** - Reinicia serviço PM2

---

## 📝 Cenário Real: Antes vs Depois

### ❌ ANTES (apenas diagnosticava)
```
Admin: "erro na verificação de duplicadas"

Bot: [usa getBotLogs] → vê "SQLITE_ERROR: no such table: media_queue"
Bot responde: "o problema é que a tabela media_queue não existe no banco.
você vai precisar criar ela manualmente rodando este SQL: CREATE TABLE..."
```

**Resultado:** Admin precisa executar SQL manualmente, reiniciar bot, etc.

---

### ✅ DEPOIS (diagnostica + corrige)
```
Admin: "erro na verificação de duplicadas"

Bot: [usa getBotLogs] → vê "SQLITE_ERROR: no such table: media_queue"
Bot: [usa analyzeDatabaseSchema] → confirma que media_queue não existe
Bot: [usa readFile('database/migrations/schema.js')] → encontra schema
Bot: [usa createDatabaseTable] → cria a tabela
Bot: [usa restartService('sticker-bot')] → reinicia para aplicar
Bot responde: "achei o problema 👍 a tabela media_queue tava faltando no banco.
criei ela e reiniciei o bot. agora a verificação de duplicadas tá funcionando de boa"
```

**Resultado:** Problema corrigido automaticamente em segundos, sem intervenção manual!

---

## 🔒 Segurança

### ✅ Proteções Implementadas:

1. **SQL Injection Prevention:**
   - Queries parametrizadas
   - Validação de operações permitidas
   - Bloqueio de operações destrutivas (DROP, DELETE, TRUNCATE)

2. **File System Protection:**
   - Path traversal detection
   - Blacklist de arquivos sensíveis
   - Validação de nomes de tabelas/arquivos

3. **Audit Trail:**
   - Todas as ações são logadas com `console.log`
   - Parâmetros completos registrados

4. **Limitações:**
   - DELETE queries bloqueadas (use UPDATE com flag)
   - DROP tables bloqueado
   - Arquivos sensíveis protegidos (.env, auth, keys)
   - Database binário protegido

---

## 🧪 Testes

Executar suite de testes completa:

```bash
node test-remediation-tools.js
```

**Resultado esperado:** 14/14 testes passando

Testes incluem:
- ✅ Análise de schema (completa e específica)
- ✅ Queries SELECT permitidas
- ✅ Queries DELETE bloqueadas
- ✅ Modificação de configs
- ✅ Leitura de arquivos permitidos (.env.example)
- ✅ Bloqueio de arquivos sensíveis (.env)
- ✅ Escrita de arquivos temporários
- ✅ Bloqueio de escrita em paths sensíveis

---

## 📊 Estatísticas

**Total de ferramentas:** 15 (9 → 15, aumento de 67%)
**Ferramentas de diagnóstico:** 9
**Ferramentas de correção:** 6 (novas)
**Operações SQL permitidas:** 6 (SELECT, INSERT, UPDATE, CREATE TABLE, CREATE INDEX, ALTER TABLE)
**Operações SQL bloqueadas:** 4 (DROP, DELETE, TRUNCATE, PRAGMA)

---

## 🎯 Próximos Passos Sugeridos (Fase 2)

1. **Adicionar histórico de correções:**
   - Criar tabela `auto_fix_log` para auditar todas as correções aplicadas
   - Mostrar ao admin o que foi feito nas últimas 24h

2. **Modo dry-run:**
   - Adicionar flag `dryRun: true` que mostra o que seria feito sem aplicar
   - Admin pode aprovar ou rejeitar a correção

3. **Correções preventivas:**
   - Monitoramento proativo que detecta problemas antes de quebrarem
   - Exemplo: "memória chegando em 90%, vou reiniciar preventivamente"

4. **Inteligência de padrões:**
   - Aprender com correções anteriores
   - "Este problema aconteceu 3x nas últimas semanas, sugiro mudar X"

5. **Integração com GitHub:**
   - Auto-criar issues para bugs que não podem ser corrigidos automaticamente
   - Vincular PRs com correções aplicadas

---

## ⚠️ Notas Importantes

1. **Sempre teste em ambiente de desenvolvimento primeiro**
2. **Faça backup do banco antes de ativar em produção**
3. **Monitore os logs para ver o que o bot está fazendo**
4. **Configure cooldown adequado para evitar loops de correção**
5. **DELETE queries foram bloqueadas intencionalmente - use UPDATE se precisar desativar registros**

---

## 📖 Referências

- **Plan original:** `<HOST_PATH>/.claude/plans/iterative-sparking-sky.md`
- **Código principal:** `services/openaiTools.js` (agora com 15 tools)
- **System prompt:** `services/adminWatcher.js` (atualizado com instruções de correção)
- **Testes:** `test-remediation-tools.js` (14 testes automatizados)

---

**Última atualização:** 2026-01-25
**Versão do bot:** 0.6.0
**Modelo OpenAI recomendado:** gpt-4o-mini (custo ~$0.60/mês)
