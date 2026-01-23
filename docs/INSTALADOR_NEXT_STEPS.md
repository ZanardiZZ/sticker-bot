# Instalador Web - Próximos Passos

## ✅ O Que Foi Planejado

Criamos um plano completo para instalação e configuração do Sticker Bot com:

1. **Plano Principal** ([INSTALADOR_WEB_PLAN.md](./INSTALADOR_WEB_PLAN.md))
   - Wizard web completo em 4 steps
   - Script de instalação automático
   - Integração com PM2
   - Estimativa: 9-13 dias

2. **Análise de Alternativas** ([INSTALADOR_ALTERNATIVES.md](./INSTALADOR_ALTERNATIVES.md))
   - Comparação de 5 abordagens diferentes
   - Prós/contras detalhados
   - Roadmap de implementação

---

## 🎯 Recomendação: Começar com Web Wizard

### Por quê?
- ✅ Melhor experiência do usuário
- ✅ Visual e intuitivo
- ✅ Permite mostrar QR Code do WhatsApp
- ✅ Validação em tempo real
- ✅ Mais fácil de documentar com screenshots
- ✅ Atrai usuários não-técnicos

### Próximos Passos Imediatos

#### **Passo 1: Criar Estrutura Base (1 dia)**

```bash
# Criar arquivos necessários
touch install.sh
chmod +x install.sh

mkdir -p web/routes
touch web/routes/setup.js

mkdir -p web/public
touch web/public/setup.html
touch web/public/setup.css
touch web/public/setup.js

mkdir -p scripts
touch scripts/finalize-setup.js
```

**Checklist:**
- [ ] Criar `install.sh` básico
- [ ] Configurar rota `/setup` no Express
- [ ] Criar HTML do wizard
- [ ] Adicionar validação de SETUP_MODE

#### **Passo 2: Implementar Backend (2-3 dias)**

**Arquivo: `web/routes/setup.js`**

Endpoints a criar:
- [ ] `GET /setup` - Página do wizard
- [ ] `GET /setup/status` - Status atual
- [ ] `POST /setup/whatsapp` - Step 1
- [ ] `POST /setup/admin` - Step 2
- [ ] `POST /setup/features` - Step 3
- [ ] `POST /setup/finalize` - Finalizar

**Funcionalidades:**
- [ ] Validação de dados
- [ ] Salvamento em sessão
- [ ] Geração de .env
- [ ] Criação de admin user
- [ ] Execução de migrations
- [ ] Restart automático

#### **Passo 3: Implementar Frontend (2-3 dias)**

**Arquivo: `web/public/setup.html`**

Componentes a criar:
- [ ] Layout do wizard
- [ ] Navegação entre steps
- [ ] Formulários de cada step
- [ ] Validação client-side
- [ ] Preview de configurações
- [ ] Mensagens de erro/sucesso
- [ ] Loading states

#### **Passo 4: Integração WhatsApp (1-2 dias)**

**QR Code Display:**
- [ ] Endpoint para gerar QR Code
- [ ] WebSocket para status de conexão
- [ ] Auto-detecção de grupos
- [ ] Validação de conexão

#### **Passo 5: Script de Instalação (1-2 dias)**

**Arquivo: `install.sh`**

Funcionalidades:
- [ ] Detecção de OS (Linux/macOS)
- [ ] Verificação de Node.js 20+
- [ ] Instalação de dependências
- [ ] Clone do repositório
- [ ] npm ci
- [ ] Geração de .env inicial
- [ ] Inicialização do web server
- [ ] Abertura do browser

#### **Passo 6: PM2 Integration (1 dia)**

**Arquivo: `ecosystem.config.js`**

- [ ] Configuração do PM2
- [ ] Auto-start no boot
- [ ] Gerenciamento de logs
- [ ] Restart automático
- [ ] Monitoring

#### **Passo 7: Testes (2 dias)**

- [ ] Testar em Ubuntu 22.04 LTS
- [ ] Testar em Debian 12
- [ ] Testar em macOS
- [ ] Testar instalação limpa
- [ ] Testar com diferentes configurações
- [ ] Testar erros e validações

#### **Passo 8: Documentação (1-2 dias)**

- [ ] Atualizar README.md
- [ ] Criar guia de troubleshooting
- [ ] Screenshots do wizard
- [ ] Vídeo tutorial (opcional)
- [ ] Documentar variáveis de ambiente

---

## 📁 Estrutura de Arquivos a Criar

```
sticker-bot/
├── install.sh                          # Script de instalação
├── ecosystem.config.js                 # PM2 config (gerado pelo wizard)
├── web/
│   ├── routes/
│   │   └── setup.js                   # Rotas do wizard
│   └── public/
│       ├── setup.html                 # Interface do wizard
│       ├── setup.css                  # Estilos
│       └── setup.js                   # Lógica client-side
├── scripts/
│   └── finalize-setup.js              # Finalização pós-wizard
└── docs/
    ├── INSTALADOR_WEB_PLAN.md         # ✅ Criado
    ├── INSTALADOR_ALTERNATIVES.md     # ✅ Criado
    └── INSTALADOR_NEXT_STEPS.md       # ✅ Este arquivo
```

---

## 🔧 Comandos Úteis Durante Desenvolvimento

```bash
# Testar install.sh localmente
bash install.sh

# Rodar web server em modo setup
SETUP_MODE=true npm run web

# Testar migrations
node scripts/run-migrations.js

# Ver logs do PM2
pm2 logs sticker-bot

# Restart após mudanças
pm2 restart sticker-bot
```

---

## 🧪 Checklist de Testes

### Teste 1: Instalação Limpa
- [ ] VPS Ubuntu 22.04 sem nada instalado
- [ ] Executar `curl -sSL install.sh | bash`
- [ ] Verificar se abre browser/mostra URL
- [ ] Completar wizard
- [ ] Verificar se bot inicia

### Teste 2: Validações
- [ ] Tentar Group ID inválido
- [ ] Tentar senha curta (<8 chars)
- [ ] Deixar campos obrigatórios vazios
- [ ] OpenAI key inválido
- [ ] Verificar mensagens de erro

### Teste 3: Restart
- [ ] Completar setup
- [ ] Reiniciar servidor
- [ ] Verificar se SETUP_MODE foi removido
- [ ] Verificar se /setup redireciona para /login
- [ ] Verificar se bot continua rodando

### Teste 4: PM2
- [ ] Verificar auto-start no boot
- [ ] Matar processo e verificar restart
- [ ] Verificar logs
- [ ] Verificar status

---

## 📝 Template de Código Inicial

### `install.sh` (Básico)

```bash
#!/bin/bash
set -e

echo "🤖 Sticker Bot Installer v1.0"
echo "=============================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 20+ first."
    exit 1
fi

# Check version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ required. Current: $NODE_VERSION"
    exit 1
fi

echo "✓ Node.js $(node -v) found"
echo "✓ npm $(npm -v) found"
echo ""

# Install directory
INSTALL_DIR="${1:-$HOME/sticker-bot}"
echo "📁 Installing to: $INSTALL_DIR"

# Clone repo
if [ -d "$INSTALL_DIR" ]; then
    read -p "⚠️  Directory exists. Remove? (y/N): " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$INSTALL_DIR"
    else
        exit 1
    fi
fi

git clone https://github.com/ZanardiZZ/sticker-bot.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Install deps
echo "📦 Installing dependencies..."
npm ci

# Create .env
cat > .env << EOF
PORT=3000
SETUP_MODE=true
EOF

# Start server
echo ""
echo "🚀 Starting setup wizard..."
echo "   Opening http://localhost:3000/setup"
echo ""

npm run web &
sleep 5

# Open browser
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000/setup
elif command -v open &> /dev/null; then
    open http://localhost:3000/setup
else
    echo "→ Please open: http://localhost:3000/setup"
fi

echo ""
echo "✓ Setup wizard ready!"
echo "  Follow the steps to complete installation."
```

### `web/routes/setup.js` (Estrutura)

```javascript
const express = require('express');
const router = express.Router();
const path = require('path');

function requireSetupMode(req, res, next) {
  if (process.env.SETUP_MODE !== 'true') {
    return res.redirect('/login');
  }
  next();
}

// Main wizard page
router.get('/setup', requireSetupMode, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/setup.html'));
});

// Status check
router.get('/setup/status', requireSetupMode, (req, res) => {
  res.json({
    setupMode: true,
    currentStep: req.session.setupStep || 1
  });
});

// TODO: Implementar outros endpoints
// POST /setup/whatsapp
// POST /setup/admin
// POST /setup/features
// POST /setup/finalize

module.exports = router;
```

---

## 🎬 Para Começar AGORA

```bash
# 1. Criar branch de desenvolvimento
git checkout -b feature/web-installer

# 2. Criar arquivos base
touch install.sh
chmod +x install.sh
mkdir -p web/routes web/public scripts
touch web/routes/setup.js
touch web/public/setup.html

# 3. Copiar código dos templates acima

# 4. Testar localmente
SETUP_MODE=true npm run web
# Abrir http://localhost:3000/setup

# 5. Iterar e desenvolver
```

---

## 📊 Timeline Detalhado

### Semana 1
- **Dia 1-2:** Setup da estrutura + backend básico
- **Dia 3-4:** Frontend do wizard
- **Dia 5:** Integração WhatsApp

### Semana 2
- **Dia 6-7:** Script de instalação + PM2
- **Dia 8-9:** Testes em diferentes ambientes
- **Dia 10:** Documentação e polish

**Total:** ~10 dias úteis (2 semanas)

---

## ✅ Quando Estiver Pronto

1. Merge para main
2. Criar release tag (v1.0.0)
3. Publicar install.sh
4. Atualizar README.md
5. Anunciar para usuários
6. Coletar feedback
7. Iterar melhorias

---

## 🚀 Vamos Começar?

Escolha uma das opções:

### Opção A: Implementar tudo agora
```bash
# Começar desenvolvimento imediatamente
git checkout -b feature/web-installer
# Seguir passos acima
```

### Opção B: Implementar em fases
```bash
# Fase 1: Backend apenas
# Fase 2: Frontend apenas
# Fase 3: Integração
# etc.
```

### Opção C: Criar prototype primeiro
```bash
# Criar versão simplificada para testar conceito
# Depois expandir para versão completa
```

**Qual opção você prefere? Posso começar a implementar agora!** 🚀
