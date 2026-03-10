# Investigação: Figurinhas 10389 e 10410 - São Duplicatas?

**Data:** 2026-01-25
**Investigador:** Claude (Anthropic)
**Solicitante:** Admin via WhatsApp

---

## 🎯 Pergunta Original

> "Verifique se era esse o problema desses dois stickers, era a falta de media_queue"

---

## 📊 Dados das Figurinhas

### Figurinha 10389
- **ID:** 10389
- **Criada em:** 2026-01-25 01:27:31 (timestamp: 1769304451973)
- **Hash MD5:** `29b0b6c2adc0e907e9f68923b78a7b68`
- **Hash Visual:** `618c30bf6798717d65aa64f931aae47980b5987d...` (256 chars)
- **Descrição AI:** "Imagem do Pica-Pau, personagem de desenho animado, fazendo gesto de positivo com a frase 'TÁ QUERENDO VARA'. [Texto: TÁ QUERENDO VARA]"
- **Arquivo:** `/home/dev/work/sticker-bot2/bot/media/media-1769304434724.webp`

### Figurinha 10410
- **ID:** 10410
- **Criada em:** 2026-01-25 11:04:08 (timestamp: 1769339048063)
- **Hash MD5:** `783289618f4bb4643e638db6318a8278`
- **Hash Visual:** `000000000000008000000000c6a30a6351c207e6...` (256 chars)
- **Descrição AI:** "Imagem do Pica-Pau, personagem de desenho animado, fazendo um gesto com o polegar e dizendo 'TÁ QUERENDO VARA'. [Texto: TÁ QUERENDO VARA]"
- **Arquivo:** `/home/dev/work/sticker-bot2/bot/media/media-1769339038319.webp`

**Diferença de tempo:** ~9.5 horas entre as duas figurinhas

---

## 🔍 Análise de Similaridade

### Comparação de Hashes

```
Hash Visual 10389: 618c30bf6798717d65aa64f931aae47980b5987d...
Hash Visual 10410: 000000000000008000000000c6a30a6351c207e6...

Hamming Distance: 438 bits (de 1024 bits total)
Similaridade: 57%
Threshold para duplicata: ≤ 102 bits (~90% similaridade)
```

### ❌ Conclusão Técnica: **NÃO SÃO DUPLICATAS PELO SISTEMA**

Com apenas **57% de similaridade**, as figurinhas estão **muito abaixo** do threshold de 90% necessário para serem bloqueadas como duplicatas.

---

## 🤖 O Problema da Tabela `media_queue`

### ❌ **FALSO POSITIVO**: A tabela `media_queue` NÃO é necessária para detecção de duplicatas

**O que aconteceu:**
1. AdminWatcher detectou erro: "SQLITE_ERROR: no such table: media_queue"
2. GPT-4o-mini assumiu que `media_queue` era necessária para verificação de duplicadas
3. Criou a tabela: `CREATE TABLE media_queue (id, sticker_id, created_at)`
4. **PORÉM:** Essa tabela não tem relação com detecção de duplicatas!

### ✅ Como Detecção de Duplicatas REALMENTE Funciona

**Arquivo:** `database/models/duplicates.js`

1. **Usa o serviço `services/mediaQueue.js`** (fila em memória, não tabela de banco)
2. **Compara `hash_visual`** na tabela `media`:
   ```sql
   SELECT hash_visual, COUNT(*) as duplicate_count
   FROM media
   WHERE hash_visual IS NOT NULL
   GROUP BY hash_visual
   HAVING COUNT(*) > 1
   ```
3. **Duplicatas = mesmo `hash_visual` EXATO**

### 📋 Duplicatas REAIS Encontradas no Banco

Executando a query de detecção de duplicatas:

```
Hash: 0000...0000 (todas zeros) → 8 duplicatas (IDs: 441, 664, 810, 2395, 4650, 4807, 6016, 9580)
Hash: 0000...20980001e01007... → 2 duplicatas (IDs: 10289, 10290)
Hash: 0000...324b6d9100... → 3 duplicatas (IDs: 3333, 3335, 3339)
```

**Observação:** As figurinhas 10389 e 10410 **NÃO aparecem** nessa lista porque têm hashes diferentes.

---

## 🧩 Por Que Elas Parecem Duplicatas?

### Hipóteses:

1. **Descrição AI Idêntica:**
   - Ambas: "Pica-Pau" + "TÁ QUERENDO VARA"
   - OpenAI GPT-4 Vision viu as mesmas características
   - Mas isso não significa que as imagens são pixel-perfect

2. **Possíveis Diferenças Visuais:**
   - Compressão diferente
   - Recorte ligeiramente diferente
   - Qualidade/tamanho diferente
   - Ângulo sutilmente diferente
   - Marca d'água ou artefatos

3. **Hash Visual Sensível:**
   - Algoritmo de hash visual (perceptual hash) detecta diferenças sutis
   - 57% de similaridade indica que há diferenças significativas nos pixels
   - Para humanos podem parecer iguais, mas computacionalmente são diferentes

---

## 🎯 Resposta à Pergunta Original

### ❌ **NÃO, a falta da tabela `media_queue` NÃO era o problema**

**Motivos:**

1. **A tabela `media_queue` criada pelo AdminWatcher foi um erro do GPT-4**
   - Não é usada para detecção de duplicatas
   - O sistema usa `services/mediaQueue.js` (serviço em memória)

2. **As figurinhas 10389 e 10410 NÃO são duplicatas técnicas**
   - Hash MD5 diferente
   - Hash Visual diferente (57% similar vs threshold de 90%)
   - Foram corretamente aceitas pelo sistema

3. **O sistema de detecção está funcionando corretamente**
   - Detecta duplicatas exatas (mesmo hash_visual)
   - Existem outras duplicatas reais no banco (IDs 441, 664, 810, etc.)
   - 10389 e 10410 não aparecem porque NÃO são duplicatas exatas

---

## ✅ O Que Foi Corrigido (Bug Real)

### Bug: AdminWatcher se Auto-Reiniciou

**Problema:** O AdminWatcher tentou reiniciar o próprio processo (`Bot-Client`) durante diagnóstico, matando-se antes de enviar a resposta.

**Correção Aplicada:**
- Bloqueio de auto-restart em `services/openaiTools.js`
- Agora retorna erro: "Cannot restart Bot-Client during diagnosis - would kill AdminWatcher"

---

## 🔬 Verificação Recomendada (Para o Admin)

Se você acredita que as figurinhas são visualmente idênticas, pode:

1. **Visualizar as imagens:**
   ```bash
   ls -lh /home/dev/work/sticker-bot2/bot/media/media-1769304434724.webp
   ls -lh /home/dev/work/sticker-bot2/bot/media/media-1769339038319.webp
   ```

2. **Comparar visualmente:**
   - Abrir ambas as imagens lado a lado
   - Verificar se há diferenças sutis (qualidade, tamanho, corte)

3. **Ajustar threshold de similaridade (opcional):**
   - Atual: 90% (102 bits de diferença permitida)
   - Se 57% for aceitável como duplicata, seria necessário:
     - Aumentar threshold para ~440 bits
     - **ATENÇÃO:** Isso pode causar MUITOS falsos positivos

---

## 📝 Conclusão Final

1. ✅ **Sistema funcionando corretamente** - detecção de duplicatas está OK
2. ❌ **media_queue não era necessária** - foi criada por engano do GPT-4
3. ✅ **Bug real corrigido** - AdminWatcher não se auto-reinicia mais
4. ⚠️ **10389 e 10410 não são duplicatas técnicas** - apenas 57% similares
5. ℹ️ **Se parecem duplicatas para humanos** - pode haver diferenças sutis nos arquivos

**Recomendação:** Manter o sistema como está, pois detecção de duplicatas está funcionando corretamente para duplicatas exatas.

---

**Investigação concluída em:** 2026-01-25 17:36 BRT
**Arquivo gerado:** `investigation-duplicates-10389-10410.md`
