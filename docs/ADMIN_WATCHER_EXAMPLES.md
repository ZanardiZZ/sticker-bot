# Admin Watcher - Exemplos de Uso

Este documento mostra exemplos reais de como o Admin Watcher responde a problemas reportados no WhatsApp.

## Características das Respostas

O Admin Watcher foi projetado para responder de forma **natural e casual**, como se fosse um admin técnico conversando no grupo:

- ✅ Português informal ("tô vendo aqui", "deixa eu checar")
- ✅ Direto ao ponto, sem formatação excessiva
- ✅ Máximo 1-2 emojis por mensagem
- ✅ Explica o que aconteceu e o que foi feito
- ❌ Evita estruturas robóticas ("🔧 Diagnóstico Automático")
- ❌ Evita excesso de emojis e seções formais

---

## Exemplo 1: Bot Parou de Enviar Stickers

**Admin reporta:**
```
o bot parou de enviar stickers desde as 14h
```

**Watcher responde:**
```
deixa eu dar uma olhada aqui

[alguns segundos depois...]

achei o problema. o baileys crashou às 14h12 e o bot perdeu a conexão.
dei um restart no baileys-bridge e no bot, agora tá tudo rodando de boa.

último sticker que saiu foi às 14h00, o próximo vai sair normal às 15h
```

---

## Exemplo 2: Comando #random Travando

**Admin reporta:**
```
o comando #random não tá respondendo, bugou
```

**Watcher responde:**
```
peraí, vou investigar

[alguns segundos depois...]

então, o #random tá travando porque o banco de dados tá bloqueado.
a interface web tá rodando uma query pesada de analytics que tá usando 95% de CPU.

não posso otimizar as queries automaticamente, mas identifiquei o problema:
- precisa adicionar um índice na coluna sent_at
- a query de analytics em web/routes/analytics.js:234 tá sem LIMIT
- recomendo colocar cache nos resultados

o comando vai voltar ao normal quando a query terminar. se quiser resolver de vez,
é só otimizar essas queries
```

---

## Exemplo 3: Scheduler Não Enviou no Horário

**Admin reporta:**
```
deveria ter enviado às 15h mas não enviou nada
```

**Watcher responde:**
```
tô vendo... um segundo

[alguns segundos depois...]

encontrei o problema. o bot crashou por falta de memória às 14h15 e quando
reiniciou, a config do scheduler foi perdida.

já reconfigurei o cron pra 0 8-21 * * * e reiniciei o bot.
o scheduler tá ativo de novo.

obs: o bot tava usando +1GB de memória antes de crashar, pode ter um memory leak.
vale investigar o logCollector que talvez tá com buffer muito grande.

o envio das 15h foi perdido mas o das 16h vai sair normal
```

---

## Exemplo 4: Baileys Desconecta Constantemente

**Admin reporta:**
```
baileys fica caindo toda hora
```

**Watcher responde:**
```
hmm, deixa eu ver o que tá rolando

[alguns segundos depois...]

cara, isso tá crítico. o baileys reiniciou 47 vezes nas últimas horas.

o whatsapp tá rejeitando a conexão com erro "428 Precondition Required".
isso geralmente significa que o número foi temporariamente bloqueado por spam.

**não dá pra eu resolver isso automaticamente**, vai precisar:

1. para o baileys agora: pm2 stop baileys-bridge
2. limpa a sessão: rm -rf auth_info_baileys/
3. espera 24-48h antes de reconectar
4. quando reconectar, vai precisar escanear um novo QR code

depois disso, evita spam:
- reduz a frequência de envios
- não manda pra número que não tá salvo
- coloca delay entre mensagens

todos os serviços tão pausados até você resolver isso manualmente
```

---

## Exemplo 5: Problema Simples - Serviço Offline

**Admin reporta:**
```
erro ao enviar mensagem
```

**Watcher responde:**
```
vou checar isso

[alguns segundos depois...]

o baileys-bridge tava offline. dei um restart e agora tá funcionando.
problema resolvido 👍
```

---

## Exemplo 6: Falha no Diagnóstico

**Admin reporta:**
```
o bot bugou
```

**Se houver erro no diagnóstico:**
```
deixa eu verificar

[alguns segundos depois...]

puts, falhou o diagnóstico: OpenAI API timeout

ve os logs aí pra entender melhor
```

---

## Configuração

### Mensagem de Confirmação Inicial

Por padrão, o bot envia uma mensagem casual antes de diagnosticar:

```
deixa eu dar uma olhada aqui
```

Você pode desabilitar isso adicionando ao `.env`:

```env
ADMIN_WATCHER_SEND_ACK=false
```

As mensagens variam aleatoriamente entre:
- "deixa eu dar uma olhada aqui"
- "vou checar isso"
- "peraí, vou investigar"
- "deixa eu verificar"
- "tô vendo... um segundo"
- "hmm, deixa eu ver o que tá rolando"

### Cooldown

O sistema tem um cooldown de 5 minutos por chat para evitar spam. Se o admin reportar múltiplos problemas seguidos, apenas o primeiro será diagnosticado.

---

## Comparação: Antes vs Depois

### ❌ ANTES (Robótico)

```
🤖 Detectei um reporte de problema. Iniciando diagnóstico automático...

🔧 Diagnóstico Automático

❌ Problema: Baileys bridge offline
🔍 Causa Raiz: Serviço crashou às 14:12
✓ Correção: Serviço reiniciado com sucesso
📊 Status: Todos os serviços operacionais

Último sticker enviado: 14:00 (ID: 1234)
Próximo envio agendado: 15:00
```

### ✅ DEPOIS (Natural)

```
deixa eu dar uma olhada aqui

achei o problema. o baileys crashou às 14h12 e o bot perdeu a conexão.
dei um restart no baileys-bridge e no bot, agora tá tudo rodando de boa.

último sticker que saiu foi às 14h00, o próximo vai sair normal às 15h
```

---

## Como Testar

1. Certifique-se de que você é admin (configurado via `ADMIN_NUMBER` no `.env`)

2. Habilite o watcher:
   ```env
   ADMIN_WATCHER_ENABLED=true
   ADMIN_WATCHER_MODEL=gpt-4o-mini
   OPENAI_API_KEY=sk-your-key
   ```

3. Reinicie o bot:
   ```bash
   pm2 restart sticker-bot
   ```

4. Envie mensagens de teste no grupo:
   ```
   "o bot parou de funcionar"
   "o scheduler tá bugado"
   "baileys não conecta"
   ```

5. Observe as respostas naturais e casuais do bot

---

## Custos

Com gpt-4o-mini (recomendado):
- ~$0.004 por diagnóstico
- ~5 diagnósticos/dia = $0.02/dia
- **Total: ~$0.60/mês**

Extremamente acessível para a funcionalidade oferecida.
