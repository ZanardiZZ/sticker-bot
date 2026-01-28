# 🚀 Auto-Deploy via GitHub Webhook

Sistema de deploy automático que atualiza o bot sempre que há push na branch `main` do GitHub.

## 📋 Como Funciona

```
┌─────────────────────────────────────────────────────────┐
│  GitHub: Push to main branch                            │
└────────────────────┬────────────────────────────────────┘
                     │ Webhook HTTP POST
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Web Server: /webhook/github endpoint                   │
│  1. Verifica assinatura do webhook                      │
│  2. Valida que é push na branch main                    │
│  3. Executa git pull                                    │
│  4. Instala dependências (se package.json mudou)        │
│  5. Reinicia serviços PM2                               │
└─────────────────────────────────────────────────────────┘
```

## ⚙️ Configuração

### 1. Gerar Webhook Secret

```bash
# Gera um secret aleatório seguro
openssl rand -hex 32
```

Adicione no `.env`:

```env
GITHUB_WEBHOOK_SECRET=seu_secret_gerado_aqui
```

### 2. Configurar Webhook no GitHub

1. Vá para o repositório no GitHub
2. Navegue para **Settings** → **Webhooks** → **Add webhook**
3. Configure:

```
Payload URL: https://seu-dominio.com/webhook/github
Content type: application/json
Secret: (cole o secret do passo 1)
SSL verification: Enable SSL verification (recomendado)
Events: Just the push event
Active: ✓ Checked
```

4. Clique em **Add webhook**

### 3. Verificar Configuração

Teste o endpoint localmente:

```bash
curl http://localhost:3000/webhook/status
```

Resposta esperada:

```json
{
  "status": "active",
  "webhook_secret_configured": true,
  "services": ["baileys-bridge", "sticker-bot", "web-interface"]
}
```

## 🔄 Processo de Deploy

Quando há push na branch `main`, o sistema executa automaticamente:

### Passo 1: Git Pull

```bash
git pull origin main
```

Se não houver mudanças (`Already up to date`), o processo para aqui.

### Passo 2: Instalar Dependências (Condicional)

Se `package.json` ou `package-lock.json` foram modificados:

```bash
npm ci --production
```

### Passo 3: Reiniciar Serviços

Reinicia serviços PM2 na ordem:

1. **baileys-bridge** - WebSocket bridge (mantém sessão WhatsApp)
2. **sticker-bot** - Bot principal
3. **web-interface** - Interface web

```bash
pm2 restart baileys-bridge
# Aguarda 2 segundos
pm2 restart sticker-bot
# Aguarda 2 segundos
pm2 restart web-interface
```

### Passo 4: Verificar Status

Verifica que todos os serviços subiram corretamente:

```bash
pm2 jlist
```

## 📊 Logs de Deploy

Os logs do webhook aparecem no console do `web-interface`:

```bash
pm2 logs web-interface --lines 50
```

Exemplo de log bem-sucedido:

```
[Webhook] Recebido webhook do GitHub
[Webhook] Evento: push, Ref: refs/heads/main
[Webhook] Push de root: 1 commit(s)
[Webhook] Último commit: feat: Adiciona auto-deploy webhook
[Webhook] Executando git pull...
[Webhook] Código atualizado: Updating abc123..def456
[Webhook] Reiniciando baileys-bridge...
[Webhook] Reiniciando sticker-bot...
[Webhook] Reiniciando web-interface...
[Webhook] Verificando status dos serviços...
[Webhook] ✅ Deploy concluído com sucesso
```

## 🔒 Segurança

### Verificação de Assinatura

O webhook valida a assinatura `X-Hub-Signature-256` do GitHub usando HMAC-SHA256:

```javascript
const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
const digest = 'sha256=' + hmac.update(body).digest('hex');
```

Se a assinatura não corresponder, retorna `401 Unauthorized`.

### Modo de Desenvolvimento

Se `GITHUB_WEBHOOK_SECRET` não estiver configurado, a verificação é pulada (apenas para desenvolvimento local).

**⚠️ SEMPRE configure o secret em produção!**

### Filtragem de Eventos

O webhook só processa:
- Eventos do tipo `push`
- Na branch `refs/heads/main`

Outros eventos (pull requests, issues, etc.) são ignorados.

## 🧪 Testando o Webhook

### 1. Teste Manual (curl)

```bash
# Gera payload de teste
cat > /tmp/webhook-payload.json << 'EOF'
{
  "ref": "refs/heads/main",
  "commits": [
    {
      "message": "test: Deploy automático"
    }
  ],
  "pusher": {
    "name": "test-user"
  }
}
EOF

# Calcula assinatura
SECRET="seu_webhook_secret_aqui"
PAYLOAD=$(cat /tmp/webhook-payload.json)
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

# Envia webhook
curl -X POST http://localhost:3000/webhook/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

### 2. Teste via GitHub (Redeliver)

No GitHub:
1. Vá para **Settings** → **Webhooks**
2. Clique no webhook configurado
3. Scroll até **Recent Deliveries**
4. Clique em qualquer delivery
5. Clique em **Redeliver** para reenviar

### 3. Verificar Logs de Erro no GitHub

Se o webhook falhar, o GitHub mostra:
- Request headers
- Request payload
- Response body
- Response headers

Útil para debug!

## 🐛 Troubleshooting

### Webhook não dispara

**Sintoma**: Push no GitHub mas nada acontece no servidor

**Causas possíveis**:
1. Webhook não configurado no GitHub
2. URL do webhook incorreta
3. Firewall bloqueando GitHub IPs
4. Servidor web não rodando

**Verificar**:
```bash
# Servidor rodando?
pm2 list | grep web-interface

# Endpoint responde?
curl http://localhost:3000/webhook/status

# Logs do servidor
pm2 logs web-interface --lines 100
```

### Erro 401 Unauthorized

**Sintoma**: GitHub mostra "401 Unauthorized" em Recent Deliveries

**Causas possíveis**:
1. `GITHUB_WEBHOOK_SECRET` diferente entre .env e GitHub
2. Secret não configurado

**Solucionar**:
```bash
# Verificar secret no .env
grep GITHUB_WEBHOOK_SECRET .env

# Regenerar secret
openssl rand -hex 32

# Atualizar no .env E no GitHub
```

### Deploy falha mas webhook sucede

**Sintoma**: Webhook retorna 200 mas deploy não acontece

**Causas possíveis**:
1. Git pull falha (conflitos, permissões)
2. PM2 não instalado
3. Serviços não existem no PM2

**Verificar**:
```bash
# Ver logs completos do deploy
pm2 logs web-interface --lines 200 | grep Webhook

# Testar git pull manualmente
git pull origin main

# Verificar PM2
pm2 list
```

### Serviços não reiniciam

**Sintoma**: Deploy executa mas serviços ficam offline

**Causas possíveis**:
1. Erro de sintaxe no código novo
2. Dependências faltando
3. Porta já em uso

**Verificar**:
```bash
# Ver logs de erro dos serviços
pm2 logs baileys-bridge --err
pm2 logs sticker-bot --err
pm2 logs web-interface --err

# Testar manualmente
pm2 restart baileys-bridge
pm2 restart sticker-bot
```

## 📝 Exemplo Completo de Fluxo

### Cenário: Você faz um commit com bugfix

```bash
# Você faz alterações localmente
git add services/versionNotifier.js
git commit -m "fix: Corrige parsing do CHANGELOG"
git push origin main
```

### O que acontece automaticamente:

**1. GitHub recebe o push** (1s)
```
✓ Push recebido
✓ Workflows iniciados
✓ Webhook disparado
```

**2. Webhook recebido no servidor** (1-2s)
```
[Webhook] Recebido webhook do GitHub
[Webhook] Evento: push, Ref: refs/heads/main
[Webhook] Push de root: 1 commit(s)
[Webhook] Último commit: fix: Corrige parsing do CHANGELOG
```

**3. Git pull executado** (2-3s)
```
[Webhook] Executando git pull...
[Webhook] Código atualizado:
   Updating 03e3e55..a1b2c3d
   services/versionNotifier.js | 12 +++++++-----
   1 file changed, 7 insertions(+), 5 deletions(-)
```

**4. Serviços reiniciados** (8-10s)
```
[Webhook] Reiniciando baileys-bridge...
[PM2] Applying action restartProcessId on app [baileys-bridge]
[PM2] [baileys-bridge] ✓

[Webhook] Reiniciando sticker-bot...
[PM2] Applying action restartProcessId on app [sticker-bot]
[PM2] [sticker-bot] ✓

[Webhook] Reiniciando web-interface...
[PM2] Applying action restartProcessId on app [web-interface]
[PM2] [web-interface] ✓
```

**5. Verificação final** (1s)
```
[Webhook] Verificando status dos serviços...
[Webhook] ✅ Deploy concluído com sucesso

Services status:
- baileys-bridge: online (uptime: 5s, restarts: 47)
- sticker-bot: online (uptime: 3s, restarts: 23)
- web-interface: online (uptime: 1s, restarts: 18)
```

**Total: ~15-20 segundos do push até bot atualizado!**

## 🎯 Próximos Passos (Opcional)

### 1. Notificação no WhatsApp

Adicionar envio de mensagem ao admin após deploy:

```javascript
// No final de executeDeploy()
if (results.success) {
  const { waAdapter } = require('../../waAdapter');
  await waAdapter.sendMessage(process.env.ADMIN_NUMBER,
    `✅ Deploy automático concluído!\n\nVersão: ${packageJson.version}\nCommits: ${commits.length}`
  );
}
```

### 2. Rollback Automático

Se deploy falhar, fazer rollback:

```javascript
if (!results.success) {
  console.log('[Webhook] Fazendo rollback...');
  await execAsync('git reset --hard HEAD@{1}');
  await execAsync('pm2 restart all');
}
```

### 3. Health Check Pós-Deploy

Verificar se bot responde após deploy:

```javascript
// Aguarda 30s e testa #ping
setTimeout(async () => {
  const response = await fetch('http://localhost:3000/api/health');
  if (!response.ok) {
    console.error('[Webhook] Health check falhou!');
  }
}, 30000);
```

## 📚 Referências

- [GitHub Webhooks Documentation](https://docs.github.com/en/webhooks)
- [Securing Webhooks](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)

## 📄 Arquivos Relacionados

- `web/routes/webhook.js` - Endpoint do webhook
- `web/routes/index.js` - Registro de rotas
- `.env.example` - Configuração do secret
- `docs/AUTO_DEPLOY_WEBHOOK.md` - Esta documentação
