# Hash Integrity Improvements

**Data:** 2026-01-26
**Versão:** 0.6.1 (proposta)
**Motivação:** Prevenir corrupção de hashes e melhorar detecção de duplicatas

---

## 🎯 Problema Identificado

Durante investigação de duplicatas (figurinhas 10389 e 10410), descobrimos que:

1. **Hashes estavam desatualizados** - arquivo foi modificado após salvar, hash no banco ficou obsoleto
2. **Nenhuma validação** - hashes inválidos/degenerados eram salvos sem verificação
3. **Nenhuma proteção** - arquivos podiam ser modificados livremente após salvos
4. **Sem detecção automática** - corrupção só era descoberta manualmente

### Exemplo Real

```
Figurinha 10389:
- Hash no banco: 0000000000000000000000000000000311c21fe6... (ERRADO - hash antigo)
- Hash do arquivo: 000000000000008000000000c6a30b6351c207e6... (CORRETO - hash atual)
- Resultado: 57% similaridade com 10410 (FALSO NEGATIVO)

Após correção:
- Ambas com hash correto: 98% similaridade (DUPLICATAS DETECTADAS!)
```

---

## ✅ Melhorias Implementadas

### 1. Validação de Hash (`database/utils/index.js`)

**Nova função: `isValidHash(hash, allowMultiFrame)`**

Valida se um hash é válido antes de usar/salvar:

- ✅ Verifica comprimento correto (10-16 para 64-bit, 200-256 para 1024-bit)
- ✅ Verifica se é hexadecimal válido
- ✅ Detecta hashes degenerados (all zeros, all ones, padrões repetitivos)
- ✅ Suporta hashes multi-frame (separados por `:`)

**Uso:**
```javascript
const { isValidHash } = require('./database/utils');

const hash = await getHashVisual(pngBuffer);
if (hash && isValidHash(hash, false)) {
  // Hash válido, pode usar
} else {
  console.warn('Hash inválido ou degenerado, descartando');
  hash = null;
}
```

### 2. Verificação de Integridade (`database/utils/index.js`)

**Nova função: `validateHashIntegrity(filePath, dbHashMd5, dbHashVisual)`**

Compara hashes do arquivo no disco vs hashes no banco:

- ✅ Recalcula MD5 do arquivo
- ✅ Recalcula hash visual do arquivo
- ✅ Compara com valores do banco
- ✅ Retorna detalhes de discrepâncias

**Uso:**
```javascript
const { validateHashIntegrity } = require('./database/utils');

const integrity = await validateHashIntegrity(
  media.file_path,
  media.hash_md5,
  media.hash_visual
);

if (!integrity.valid) {
  console.warn('Hash corruption detected:', integrity.errors);
  // Recalcular hashes...
}
```

### 3. Recálculo Automático de Hashes (`database/utils/index.js`)

**Nova função: `recalculateHashForMedia(mediaId, filePath, dryRun)`**

Recalcula e atualiza hashes corrompidos:

- ✅ Lê arquivo do disco
- ✅ Calcula novos hashes (MD5 + visual)
- ✅ Compara com valores antigos
- ✅ Atualiza banco (se não for dry-run)
- ✅ Retorna relatório detalhado

**Uso:**
```javascript
const { recalculateHashForMedia } = require('./database/utils');

const result = await recalculateHashForMedia(10389, filePath, false);

if (result.updated) {
  console.log('Hashes updated successfully');
  console.log('Old MD5:', result.oldHashMd5);
  console.log('New MD5:', result.newHashMd5);
}
```

### 4. Script de Recálculo em Massa (`scripts/recalculate-hashes.js`)

Script para detectar e corrigir hashes corrompidos em massa:

**Funcionalidades:**

- ✅ Escaneia toda a tabela `media`
- ✅ Valida integridade de cada hash
- ✅ Detecta hashes inválidos/degenerados
- ✅ Detecta arquivos modificados (MD5 mismatch)
- ✅ Detecta hashes visuais desatualizados
- ✅ Recalcula e atualiza automaticamente
- ✅ Gera relatório detalhado

**Uso:**
```bash
# Dry-run (apenas verificar, sem atualizar)
node scripts/recalculate-hashes.js --dry-run

# Limitar a primeiras 100 figurinhas
node scripts/recalculate-hashes.js --dry-run --limit 100

# Atualizar hashes corrompidos
node scripts/recalculate-hashes.js
```

**Output exemplo:**
```
📊 Hash Integrity Report
========================

Total media checked: 10283/10283
File not found: 5
MD5 mismatches: 2
Visual hash mismatches: 12
Invalid visual hashes: 0
Degenerate visual hashes: 3
Records updated: 14
Errors: 0

⚠️  Visual Hash Mismatches (file modified after save):
  - Media 10389: bot/media/media-1769304434724.webp
    Old: 00000000000000000000000000000003...
    New: 000000000000008000000000c6a30b63...
  - Media 10410: bot/media/media-1769339038319.webp
    Old: 000000000000008000000000c6a30a63...
    New: 000000000000008000000000c6a30b63...

✅ Hashes updated successfully!
```

### 5. Validação no Media Processor (`bot/mediaProcessor.js`)

Adicionada validação de hash ANTES de salvar no banco:

**Mudanças:**

```javascript
// ANTES: Salvava hash sem validar
hashVisual = await getHashVisual(pngBuffer);

// AGORA: Valida antes de usar
const calculatedHash = await getHashVisual(pngBuffer);
if (calculatedHash && isValidHash(calculatedHash, false) && !isDegenerateHash(calculatedHash)) {
  hashVisual = calculatedHash;
} else {
  console.warn('[MediaProcessor] Hash inválido ou degenerado, descartando');
  hashVisual = null;
}
```

**Benefícios:**

- ✅ Previne salvar hashes inválidos/degenerados
- ✅ Evita falsos positivos em detecção de duplicatas
- ✅ Logs de avisos quando hash é rejeitado

### 6. Proteção de Arquivos (`bot/mediaProcessor.js`)

Arquivos são protegidos contra modificação após salvos:

```javascript
// Após salvar arquivo
await fs.promises.writeFile(filePath, bufferWebp);

// Protege arquivo (readonly)
await fs.promises.chmod(filePath, 0o444);
```

**Benefícios:**

- ✅ Previne modificação acidental de arquivos
- ✅ Mantém integridade MD5/hash visual
- ✅ Arquivos só podem ser lidos, não modificados

---

## 📊 Impacto

### Antes das Melhorias:
- ❌ Hashes corrompidos não detectados
- ❌ Arquivos podiam ser modificados livremente
- ❌ Falsos negativos em detecção de duplicatas (como 10389/10410)
- ❌ Sem forma de recalcular hashes em massa

### Depois das Melhorias:
- ✅ Hashes validados antes de salvar
- ✅ Arquivos protegidos (readonly)
- ✅ Detecção automática de corrupção
- ✅ Script de recálculo para correção em massa
- ✅ Duplicatas detectadas corretamente (10389/10410 agora detectadas!)

---

## 🧪 Testes

Criado `test-hash-improvements.js` com 13 testes:

```bash
node test-hash-improvements.js
```

**Resultados:**

```
1️⃣  Testing isValidHash()...
  ✅ Valid 256-char hash: PASS
  ✅ Valid 16-char hash: PASS
  ✅ Valid multi-frame hash: PASS
  ✅ null hash: PASS
  ✅ Empty hash: PASS
  ✅ All zeros (degenerate): PASS
  ✅ Wrong length: PASS
  ✅ Non-hex characters: PASS

2️⃣  Testing isDegenerateHash()...
  ✅ All zeros: PASS
  ✅ All ones: PASS
  ✅ Too many zeros (>75%): PASS
  ✅ Valid diverse hash: PASS
  ✅ Valid 16-char hash: PASS

3️⃣  Testing validateHashIntegrity()...
  Testing media 10389: ✅
  Testing media 10410: ✅

4️⃣  Testing recalculateHashForMedia()...
  Media 10389 recalculation: ✅
```

---

## 🔄 Migrações Necessárias

### Recalcular Hashes Existentes

Recomendado rodar o script de recálculo após deploy:

```bash
# 1. Verificar escopo do problema
node scripts/recalculate-hashes.js --dry-run

# 2. Corrigir hashes corrompidos
node scripts/recalculate-hashes.js

# 3. Verificar resultados
node scripts/recalculate-hashes.js --dry-run --limit 100
```

### Permissões de Arquivos Antigos

Arquivos salvos antes desta versão não estão protegidos. Para proteger:

```bash
# Tornar todos os arquivos de media readonly
find bot/media -type f -exec chmod 444 {} \;
```

---

## 📝 Manutenção

### Verificação Periódica

Recomendado rodar verificação periódica (mensal):

```bash
# Cron job mensal
0 0 1 * * node /path/to/sticker-bot2/scripts/recalculate-hashes.js --dry-run >> /var/log/hash-check.log
```

### Monitoramento

Adicionar alertas para:

- ✅ Hashes inválidos sendo rejeitados (logs do mediaProcessor)
- ✅ Arquivos modificados (output do script de recálculo)
- ✅ Permissions negadas ao escrever arquivo (indica arquivo protegido corretamente)

---

## 🔗 Arquivos Modificados

### Novos Arquivos:
- `scripts/recalculate-hashes.js` - Script de recálculo em massa
- `test-hash-improvements.js` - Suite de testes
- `docs/HASH_INTEGRITY_IMPROVEMENTS.md` - Esta documentação

### Arquivos Modificados:
- `database/utils/index.js` - Adicionadas 3 novas funções:
  - `isValidHash()`
  - `validateHashIntegrity()`
  - `recalculateHashForMedia()`
  - Melhorada `isDegenerateHash()` para aceitar comprimentos flexíveis

- `bot/mediaProcessor.js`:
  - Adicionada validação de hash antes de salvar
  - Adicionada proteção de arquivo (chmod 444)
  - Import de `isValidHash` de database/index

---

## ✅ Checklist de Deploy

- [ ] Rodar testes: `node test-hash-improvements.js`
- [ ] Verificar hashes corrompidos: `node scripts/recalculate-hashes.js --dry-run`
- [ ] Corrigir hashes: `node scripts/recalculate-hashes.js`
- [ ] Proteger arquivos antigos: `find bot/media -type f -exec chmod 444 {} \;`
- [ ] Atualizar documentação de changelog
- [ ] Incrementar versão para 0.6.1

---

**Autor:** Claude (Anthropic)
**Revisão:** Necessária pelo desenvolvedor principal
**Status:** ✅ Implementado e testado
