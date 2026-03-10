# Conversation Agent - Melhorias de Naturalidade

Este documento descreve as melhorias implementadas no Conversation Agent para torná-lo mais natural, menos robótico e menos forçado.

## 🎯 Objetivos das Melhorias

- ✅ Respostas mais naturais e variadas
- ✅ Menos previsível e mecânico
- ✅ Não parecer que está "forçando" participação
- ✅ Ton mais casual e autêntico
- ✅ Menos sanitização agressiva

---

## 🔧 O Que Foi Melhorado

### 1. **System Prompt Variável e Menos Rígido**

#### ❌ ANTES (Rígido e Cheio de Regras)

```
Aja como integrante real do grupo X e mantenha a conversa informal.
Fale sempre em primeira pessoa, como se você fosse parte da conversa.
NUNCA mencione nomes de outros usuários nas suas respostas.
NUNCA prefixe suas respostas com nomes (ex: "Fulano: texto").
Fale sempre em português brasileiro, com tom casual e natural.
Responda de forma breve (até 3 frases), demonstrando empatia e humor leve quando fizer sentido.
Só faça perguntas quando forem naturais para o contexto e evite terminar respostas com perguntas forçadas.
Nunca diga que é um bot, IA ou assistente — comporte-se como mais uma pessoa do grupo.
Se não souber algo, seja honesto ou puxe um assunto relacionado sem inventar informações.
```

**Problemas:**
- Muitas instruções em CAPS (NUNCA, SEMPRE)
- Lista extensa de proibições
- Tom muito "consciente de si mesmo"
- Sempre o mesmo prompt (previsível)

#### ✅ DEPOIS (Natural e Variado)

Agora o bot escolhe **aleatoriamente** entre 4 estilos diferentes de prompt a cada conversa:

**Estilo 1 - Casual e Amigável:**
```
Você é Lia, integrante do grupo X. Participe da conversa de forma natural e casual,
como qualquer pessoa do grupo faria. Use português brasileiro informal. Seja breve
(1-2 frases). Se não souber algo, admita ou mude de assunto. Nunca revele que é IA.
```

**Estilo 2 - Direto e Despojado:**
```
Você faz parte do grupo X. Responda como se estivesse conversando com amigos,
de forma simples e direta. Português informal, 1-2 frases no máximo. Se não souber,
seja honesto ou ignore. Comporte-se como uma pessoa normal, nunca mencione ser bot ou IA.
```

**Estilo 3 - Mais Engajado:**
```
Você é Lia e está no grupo X conversando com a galera. Fale naturalmente, use gírias
se fizer sentido, seja breve (1-2 frases). Não precisa responder tudo, só quando tiver
algo a adicionar. Nunca diga que é IA ou assistente.
```

**Estilo 4 - Minimalista:**
```
Integrante do grupo X. Converse naturalmente em português informal. Respostas curtas
(1-2 frases). Admita quando não souber. Nunca revele ser IA. Seja você mesmo.
```

**Benefícios:**
- Variação natural entre conversas
- Menos regras explícitas
- Tom mais autêntico
- Instruções mais sutis

---

### 2. **Probabilidade de Resposta Mais Orgânica**

#### ❌ ANTES (Muito Calculado)

```javascript
probability = 0.18;  // Sempre começa em 18%
if (text.endsWith('?')) probability += 0.25;
if (text.includes('alguém sabe')) probability += 0.15;
// ... sempre os mesmos incrementos fixos
```

**Problemas:**
- Probabilidade base sempre igual (18%)
- Incrementos fixos e previsíveis
- Pouca aleatoriedade real

#### ✅ DEPOIS (Mais Aleatório)

```javascript
// Base aleatória: 12-20%
probability = 0.12 + (Math.random() * 0.08);

// Perguntas têm maior peso
if (text.endsWith('?')) probability += 0.3;

// Detecta "alguém" em geral
if (text.includes('alguém') || text.includes('alguem')) probability += 0.2;

// Variação aleatória final ±5%
probability += (Math.random() - 0.5) * 0.1;
```

**Benefícios:**
- Base aleatória (não sempre 18%)
- Mais peso para perguntas diretas
- Detecção mais ampla de contextos
- Variação final aleatória (menos previsível)

---

### 3. **Sanitização Menos Agressiva**

#### ❌ ANTES (Muito Agressivo)

```javascript
// Removia menções standalone de nomes
const mentionPattern = new RegExp(
  `\\b${name}\\b(?=\\s*[,:.!?]|\\s+(?:disse|falou|perguntou|respondeu))`,
  'gi'
);
cleaned = cleaned.replace(mentionPattern, '').trim();
```

**Problema:** Removia menções naturais de nomes na conversa, tornando respostas estranhas.

**Exemplo:**
- GPT: "concordo com o João, isso faz sentido"
- Sanitizado: "concordo com o , isso faz sentido" ❌

#### ✅ DEPOIS (Menos Agressivo)

```javascript
// Apenas remove "Nome: " prefixo (padrão comum de IA)
const namePattern = new RegExp(`\\b${name}:\\s*`, 'gi');
cleaned = cleaned.replace(namePattern, '').trim();
```

**Benefício:** Permite menções naturais de nomes, remove apenas padrões óbvios de IA.

**Exemplo:**
- GPT: "concordo com o João, isso faz sentido"
- Sanitizado: "concordo com o João, isso faz sentido" ✅

---

### 4. **Truncamento de Texto Mais Inteligente**

#### ❌ ANTES (Sempre Corta no Mesmo Ponto)

```javascript
if (reply.length > MAX_REPLY_CHARS) {
  return reply.slice(0, MAX_REPLY_CHARS);
}
```

**Problema:** Sempre corta no mesmo número de caracteres, fica previsível.

#### ✅ DEPOIS (Variação e Corte Inteligente)

```javascript
// Adiciona variação ±20 chars
const variance = Math.floor(Math.random() * 40) - 20;
const effectiveMax = MAX_REPLY_CHARS + variance;

// Tenta cortar em final de frase
const sentenceMatch = truncated.match(/^(.+[.!?])\s+/);
if (sentenceMatch && sentenceMatch[1].length > effectiveMax * 0.6) {
  return sentenceMatch[1].trim();
}

// Senão, corta em palavra
return truncated.replace(/\s+\S*$/, '').trim();
```

**Benefícios:**
- Tamanho varia entre respostas
- Tenta cortar em fim de frase
- Nunca corta no meio de palavra

---

## 📊 Comparação: Antes vs Depois

### Exemplo 1: Conversa Casual

**Contexto:**
```
João: alguém sabe que horas abre o mercado?
Maria: acho que às 8h
Pedro: depende, qual mercado?
```

**❌ ANTES (Bot responde):**
```
Lia: João, o horário de funcionamento varia de acordo com cada estabelecimento.
Você poderia verificar no Google Maps ou ligar para confirmar o horário específico?
```
*Problema: Muito formal, menciona João desnecessariamente, pergunta forçada no final*

**✅ DEPOIS (Bot responde):**
```
Lia: maioria abre às 8h mesmo, mas tem uns que abrem só às 9h
```
*Melhor: Casual, direto, sem perguntas forçadas*

---

### Exemplo 2: Assunto Técnico

**Contexto:**
```
Carlos: como faz pra resetar senha do Instagram?
Ana: já tentou clicar em "esqueci minha senha"?
```

**❌ ANTES:**
```
Lia: Para redefinir a senha do Instagram, Ana sugeriu corretamente clicar em
"esqueci minha senha". Você também pode usar o email cadastrado para receber
um link de recuperação. Conseguiu resolver?
```
*Problema: Menciona Ana, muito explicativo, pergunta forçada*

**✅ DEPOIS:**
```
Lia: isso mesmo, ou pede pra mandar o código no email/sms
```
*Melhor: Complementa naturalmente, sem repetir o que já foi dito*

---

### Exemplo 3: Quando NÃO Responder

**Contexto:**
```
Lucas: acabei de assistir aquele filme
Maria: qual?
Lucas: o do homem aranha novo
Maria: ah, ainda não vi
Lucas: é muito bom
```

**❌ ANTES (às vezes respondia desnecessariamente):**
```
Lia: Que legal que você gostou! Também ouvi falar bem desse filme.
O que você achou da história?
```
*Problema: Forçado, pergunta desnecessária, não agrega*

**✅ DEPOIS (não responde):**
```
[silêncio - deixa a conversa fluir naturalmente]
```
*Melhor: Sabe quando ficar quieto*

---

### Exemplo 4: Respondendo a Perguntas Diretas

**Contexto:**
```
Pedro: Lia, vc sabe se vai chover amanhã?
```

**❌ ANTES:**
```
Lia: Infelizmente, não tenho acesso a previsões meteorológicas em tempo real.
Você pode consultar aplicativos como Weather.com ou Google Weather para
informações precisas sobre o clima de amanhã.
```
*Problema: Resposta de assistente virtual, muito formal*

**✅ DEPOIS:**
```
Lia: não sei, mas dá uma olhada no app do tempo aí
```
*Melhor: Honesto, casual, útil*

---

## ⚙️ Configuração

### Variáveis de Ambiente Importantes

```env
# Habilitar/desabilitar
CONVERSATION_AGENT_ENABLED=1

# Nome do bot
CONVERSATION_PERSONA_NAME=Lia

# Aliases (gatilhos)
CONVERSATION_ALIASES=Lia,lia

# Comportamento
CONVERSATION_HISTORY_LIMIT=16          # Memória de mensagens
CONVERSATION_COOLDOWN_MS=120000        # 2 min entre respostas
CONVERSATION_MIN_MESSAGES=3            # Min 3 msgs antes de responder
CONVERSATION_MAX_RESPONSE_CHARS=360    # Máx 360 chars

# Prompt customizado (opcional)
# Deixe vazio para usar os 4 estilos aleatórios (recomendado)
# CONVERSATION_SYSTEM_PROMPT=Você é {persona}...
```

### Recomendações

**Para bot mais ativo:**
```env
CONVERSATION_MIN_MESSAGES=2
CONVERSATION_COOLDOWN_MS=60000  # 1 min
```

**Para bot mais discreto:**
```env
CONVERSATION_MIN_MESSAGES=5
CONVERSATION_COOLDOWN_MS=300000  # 5 min
```

**Para bot mais expansivo:**
```env
CONVERSATION_MAX_RESPONSE_CHARS=500
```

---

## 🎭 Personalidade do Bot

Com as melhorias, o bot agora:

- ✅ **Varia o estilo** entre conversas (4 prompts diferentes)
- ✅ **Responde menos previsível** (probabilidades aleatórias)
- ✅ **Menciona nomes naturalmente** (sanitização menos agressiva)
- ✅ **Corta texto inteligentemente** (fim de frase quando possível)
- ✅ **Sabe quando ficar quieto** (não força participação)
- ✅ **Parece mais humano** (menos regras explícitas no prompt)

---

## 📈 Métricas de Sucesso

Após as melhorias, espera-se:

1. **Menos "uncanny valley"** - respostas menos estranhas
2. **Mais variabilidade** - não parece script
3. **Menos perguntas forçadas** - participa quando faz sentido
4. **Tom mais natural** - português informal verdadeiro
5. **Menos "cara de IA"** - não soa como assistente virtual

---

## 🔍 Como Testar

1. **Converse naturalmente** no grupo
2. **Observe se o bot:**
   - Responde em momentos apropriados
   - Usa linguagem casual
   - Não força perguntas
   - Varia o estilo de resposta
   - Sabe quando ficar quieto

3. **Red flags (sinais de problema):**
   - Sempre responde com perguntas
   - Sempre começa/termina da mesma forma
   - Menciona muito "verificar", "consultar", "eu recomendo"
   - Soa como atendimento ao cliente
   - Responde a tudo mesmo quando desnecessário

---

## 💡 Próximos Passos (Futuro)

Melhorias adicionais que podem ser implementadas:

1. **Análise de sentimento** - ajustar tom baseado na conversa
2. **Memória de longo prazo** - lembrar de conversas antigas
3. **Contexto de horário** - adaptar respostas ao período do dia
4. **Detecção de humor** - participar de piadas/memes
5. **Multi-modal** - responder a imagens/stickers com texto

---

## 📝 Notas Técnicas

### Estrutura do Código

**Principais funções melhoradas:**
- `buildSystemPrompt()` - Agora retorna 1 de 4 estilos aleatórios
- `computeShouldRespond()` - Probabilidade mais orgânica e aleatória
- `sanitizeReplyText()` - Menos agressivo, permite menções naturais
- `clampReplyLength()` - Corta em fim de frase quando possível

### Compatibilidade

✅ Totalmente compatível com versões anteriores
✅ Configurações antigas continuam funcionando
✅ Novos comportamentos são opt-in via env vars

---

Aproveite o bot mais natural e menos robótico! 🎉
