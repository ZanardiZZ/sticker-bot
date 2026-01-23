# Plano: Instalador Web com Comando Único

## 📋 Objetivo

Implementar um sistema de instalação e configuração completo que permita:
1. **Instalação com um único comando** (curl/wget one-liner)
2. **Configuração via interface web** intuitiva
3. **Setup guiado** passo a passo
4. **Validação em tempo real** das configurações
5. **Auto-start** e gerenciamento de processos

---

## 🎯 Opções de Implementação

### **Opção 1: Script Shell + Web Setup Wizard (RECOMENDADO)**

**Arquitetura:**
```
┌─────────────────────────────────────────────────┐
│  curl -sSL install.sh | bash                    │
│                                                  │
│  1. Detecta ambiente (Node, npm, ffmpeg)        │
│  2. Instala dependências faltantes              │
│  3. Clona repo / baixa release                  │
│  4. npm ci (instala pacotes)                    │
│  5. Cria .env mínimo (apenas PORT)              │
│  6. Inicia web server em modo setup             │
│  7. Abre browser → http://localhost:3000/setup  │
└─────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────┐
│  Web Setup Wizard (/setup route)                │
│                                                  │
│  Step 1: WhatsApp Config                        │
│    - Exibe QR Code para conectar WhatsApp       │
│    - Detecta número automaticamente              │
│    - Solicita grupo padrão (lista grupos)       │
│                                                  │
│  Step 2: Admin Account                          │
│    - Cria usuário admin                         │
│    - Define senha forte                         │
│                                                  │
│  Step 3: Optional Features                      │
│    - OpenAI API (opcional)                      │
│    - SMTP (opcional)                            │
│    - Timezone                                   │
│                                                  │
│  Step 4: Service Setup                          │
│    - Instala PM2                                │
│    - Configura auto-start                       │
│    - Testa conectividade                        │
│                                                  │
│  Step 5: Finalize                               │
│    - Salva .env                                 │
│    - Roda migrations                            │
│    - Inicia todos os processos                  │
│    - Redireciona para /login                    │
└─────────────────────────────────────────────────┘
```

**Vantagens:**
- ✅ Simples e direto
- ✅ Funciona em qualquer Unix-like (Linux, macOS)
- ✅ Interface visual amigável
- ✅ Validação em tempo real
- ✅ Pode mostrar preview das configurações

**Desvantagens:**
- ⚠️ Requer acesso ao browser (não funciona em servidor headless sem port forwarding)
- ⚠️ Precisa de duas partes (script + web UI)

---

### **Opção 2: CLI Interativo (Alternativa)**

**Arquitetura:**
```
npx create-sticker-bot@latest

┌─────────────────────────────────────────┐
│  CLI Interativo (usando inquirer.js)    │
│                                          │
│  ? WhatsApp Group ID: _                 │
│  ? Admin Number: 5511999999999          │
│  ? Admin Username: admin                │
│  ? Admin Password: ********             │
│  ? OpenAI API Key (optional): _         │
│  ? Enable auto-start? (Y/n): Y          │
│                                          │
│  [■■■■■■■■■■] Installing dependencies   │
│  [■■■■■■■■■■] Setting up database       │
│  [■■■■■■■■■■] Configuring services      │
│                                          │
│  ✓ Installation complete!               │
│  → Web UI: http://localhost:3000        │
│  → Bot status: Running                  │
└─────────────────────────────────────────┘
```

**Vantagens:**
- ✅ Funciona em servidores headless
- ✅ Rápido e direto
- ✅ Pode incluir validações inline

**Desvantagens:**
- ⚠️ Menos visual
- ⚠️ Difícil mostrar QR code do WhatsApp
- ⚠️ Configurações avançadas podem ser verbosas

---

### **Opção 3: Híbrido (Melhor dos dois mundos)**

**Arquitetura:**
```
curl -sSL install.sh | bash

Detecta ambiente:
  - Se tem DISPLAY ou SSH com X11 → Web Wizard
  - Se é headless → CLI Interativo
  - Flag --cli ou --web força modo específico
```

**Vantagens:**
- ✅ Flexível
- ✅ Funciona em qualquer ambiente
- ✅ Melhor UX para cada cenário

**Desvantagens:**
- ⚠️ Mais complexo de implementar
- ⚠️ Dois fluxos para manter

---

## 🏗️ Implementação Detalhada (Opção 1 - RECOMENDADA)

### **Parte 1: Script de Instalação (`install.sh`)**

```bash
#!/bin/bash
# Sticker Bot One-Liner Installer
# Usage: curl -sSL https://raw.githubusercontent.com/ZanardiZZ/sticker-bot/main/install.sh | bash

set -e

echo "🤖 Sticker Bot Installer"
echo "========================"

# 1. Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
else
    echo "❌ Unsupported OS: $OSTYPE"
    exit 1
fi

# 2. Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Installing..."
    # Install via nvm or package manager
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    source ~/.nvm/nvm.sh
    nvm install 20
else
    NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        echo "❌ Node.js version must be 20+. Current: $NODE_VERSION"
        exit 1
    fi
    echo "✓ Node.js $(node -v) found"
fi

# 3. Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    exit 1
fi
echo "✓ npm $(npm -v) found"

# 4. Clone repository
INSTALL_DIR="${INSTALL_DIR:-$HOME/sticker-bot}"
if [ -d "$INSTALL_DIR" ]; then
    echo "⚠️  Directory $INSTALL_DIR already exists"
    read -p "Remove and reinstall? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$INSTALL_DIR"
    else
        exit 1
    fi
fi

echo "📥 Downloading Sticker Bot..."
git clone https://github.com/ZanardiZZ/sticker-bot.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

# 5. Install dependencies
echo "📦 Installing dependencies (this may take a few minutes)..."
npm ci

# 6. Create minimal .env for setup mode
cat > .env << EOF
# Auto-generated by installer - will be configured via web UI
PORT=3000
SETUP_MODE=true
EOF

# 7. Start web server in setup mode
echo ""
echo "🚀 Starting setup wizard..."
echo "   Opening http://localhost:3000/setup in 5 seconds..."
echo ""

# Start server in background
npm run web > setup.log 2>&1 &
WEB_PID=$!

# Wait for server to be ready
sleep 5

# Open browser
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000/setup
elif command -v open &> /dev/null; then
    open http://localhost:3000/setup
else
    echo "Please open: http://localhost:3000/setup"
fi

echo ""
echo "✓ Setup wizard is ready!"
echo "  Follow the steps in your browser to complete installation."
echo ""
echo "  Server PID: $WEB_PID"
echo "  Logs: tail -f $INSTALL_DIR/setup.log"
echo ""
```

### **Parte 2: Rotas de Setup (`web/routes/setup.js`)**

**Nova rota dedicada ao wizard de instalação:**

```javascript
// web/routes/setup.js
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const { db } = require('../../database');

// Middleware: só permite acesso se SETUP_MODE=true
function requireSetupMode(req, res, next) {
  if (process.env.SETUP_MODE !== 'true') {
    return res.redirect('/login');
  }
  next();
}

// GET /setup - Página principal do wizard
router.get('/setup', requireSetupMode, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/setup.html'));
});

// GET /setup/status - Verifica status do setup
router.get('/setup/status', requireSetupMode, (req, res) => {
  const envPath = path.join(__dirname, '../../.env');
  const hasEnv = fs.existsSync(envPath);

  res.json({
    setupMode: true,
    hasConfig: hasEnv,
    currentStep: req.session.setupStep || 1
  });
});

// POST /setup/whatsapp - Step 1: Configurar WhatsApp
router.post('/setup/whatsapp', requireSetupMode, async (req, res) => {
  const { groupId, adminNumber } = req.body;

  // Validação
  if (!groupId || !groupId.endsWith('@g.us')) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  if (!adminNumber || !adminNumber.includes('@')) {
    return res.status(400).json({ error: 'Invalid admin number' });
  }

  // Salva na sessão
  req.session.setupData = {
    ...req.session.setupData,
    AUTO_SEND_GROUP_ID: groupId,
    ADMIN_NUMBER: adminNumber,
    BOT_WHATSAPP_NUMBER: adminNumber.replace('@c.us', '')
  };
  req.session.setupStep = 2;

  res.json({ success: true, nextStep: 2 });
});

// POST /setup/admin - Step 2: Criar conta admin
router.post('/setup/admin', requireSetupMode, async (req, res) => {
  const { username, password } = req.body;

  if (!username || username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  req.session.setupData = {
    ...req.session.setupData,
    ADMIN_INITIAL_USERNAME: username,
    ADMIN_INITIAL_PASSWORD: await bcrypt.hash(password, 10)
  };
  req.session.setupStep = 3;

  res.json({ success: true, nextStep: 3 });
});

// POST /setup/features - Step 3: Features opcionais
router.post('/setup/features', requireSetupMode, async (req, res) => {
  const { openaiKey, smtpHost, smtpUser, smtpPass, timezone } = req.body;

  req.session.setupData = {
    ...req.session.setupData,
    ...(openaiKey && { OPENAI_API_KEY: openaiKey }),
    ...(smtpHost && { SMTP_HOST: smtpHost }),
    ...(smtpUser && { SMTP_USER: smtpUser }),
    ...(smtpPass && { SMTP_PASS: smtpPass }),
    TIMEZONE: timezone || 'America/Sao_Paulo'
  };
  req.session.setupStep = 4;

  res.json({ success: true, nextStep: 4 });
});

// POST /setup/finalize - Step 4: Finalizar e salvar
router.post('/setup/finalize', requireSetupMode, async (req, res) => {
  try {
    const setupData = req.session.setupData;

    // 1. Gerar .env completo
    const envContent = generateEnvFile(setupData);
    await fs.writeFile(path.join(__dirname, '../../.env'), envContent);

    // 2. Rodar migrations
    const { runMigrations } = require('../../scripts/run-migrations');
    await runMigrations();

    // 3. Criar usuário admin no banco
    await createAdminUser(setupData.ADMIN_INITIAL_USERNAME, setupData.ADMIN_INITIAL_PASSWORD);

    // 4. Remover SETUP_MODE do .env
    delete process.env.SETUP_MODE;

    // 5. Retornar sucesso
    res.json({
      success: true,
      message: 'Setup completed! Restarting services...',
      redirectTo: '/login'
    });

    // 6. Restart server (PM2 ou exit para restart)
    setTimeout(() => {
      process.exit(0); // PM2 irá reiniciar automaticamente
    }, 2000);

  } catch (error) {
    console.error('Setup finalize error:', error);
    res.status(500).json({ error: error.message });
  }
});

function generateEnvFile(data) {
  return `# Generated by Sticker Bot Setup Wizard
# You can edit this file manually if needed

# WhatsApp Configuration
AUTO_SEND_GROUP_ID=${data.AUTO_SEND_GROUP_ID}
ADMIN_NUMBER=${data.ADMIN_NUMBER}
BOT_WHATSAPP_NUMBER=${data.BOT_WHATSAPP_NUMBER}

# Web Interface
PORT=${data.PORT || 3000}
WEB_SERVER_URL=${data.WEB_SERVER_URL || 'http://localhost:3000'}

# Admin Account
ADMIN_INITIAL_USERNAME=${data.ADMIN_INITIAL_USERNAME}
ADMIN_INITIAL_PASSWORD=${data.ADMIN_INITIAL_PASSWORD}

# Security
SESSION_SECRET=${generateRandomSecret()}
JWT_SECRET=${generateRandomSecret()}
JWT_EXPIRES_IN=7d

# Baileys WebSocket
BAILEYS_WS_PORT=8765
BAILEYS_WS_URL=ws://localhost:8765
BAILEYS_ALLOWED_TOKENS=dev
BAILEYS_CLIENT_TOKEN=dev

# Timezone
TIMEZONE=${data.TIMEZONE}

# Optional Features
${data.OPENAI_API_KEY ? `OPENAI_API_KEY=${data.OPENAI_API_KEY}` : '# OPENAI_API_KEY='}
${data.SMTP_HOST ? `SMTP_HOST=${data.SMTP_HOST}` : '# SMTP_HOST='}
${data.SMTP_USER ? `SMTP_USER=${data.SMTP_USER}` : '# SMTP_USER='}
${data.SMTP_PASS ? `SMTP_PASS=${data.SMTP_PASS}` : '# SMTP_PASS='}

# Analytics
ENABLE_INTERNAL_ANALYTICS=true
`;
}

function generateRandomSecret() {
  return require('crypto').randomBytes(32).toString('hex');
}

async function createAdminUser(username, passwordHash) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    db.run(
      `INSERT INTO users (username, password_hash, role, status, created_at)
       VALUES (?, ?, 'admin', 'approved', ?)`,
      [username, passwordHash, timestamp],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

module.exports = router;
```

### **Parte 3: Interface Web (`web/public/setup.html`)**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sticker Bot Setup</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .wizard {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 600px;
      width: 100%;
      padding: 40px;
    }
    .wizard-header {
      text-align: center;
      margin-bottom: 30px;
    }
    .wizard-header h1 {
      font-size: 32px;
      color: #333;
      margin-bottom: 8px;
    }
    .wizard-header p {
      color: #666;
      font-size: 14px;
    }
    .steps {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
      position: relative;
    }
    .step {
      flex: 1;
      text-align: center;
      position: relative;
      z-index: 1;
    }
    .step-number {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #e0e0e0;
      color: #999;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 8px;
      font-weight: bold;
      transition: all 0.3s;
    }
    .step.active .step-number {
      background: #667eea;
      color: white;
      transform: scale(1.1);
    }
    .step.completed .step-number {
      background: #4caf50;
      color: white;
    }
    .step-label {
      font-size: 12px;
      color: #666;
    }
    .step-content {
      display: none;
    }
    .step-content.active {
      display: block;
      animation: fadeIn 0.3s;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: #333;
      font-weight: 500;
    }
    .form-group input,
    .form-group select {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.3s;
    }
    .form-group input:focus,
    .form-group select:focus {
      outline: none;
      border-color: #667eea;
    }
    .form-group small {
      display: block;
      margin-top: 4px;
      color: #999;
      font-size: 12px;
    }
    .btn-group {
      display: flex;
      gap: 12px;
      margin-top: 30px;
    }
    button {
      flex: 1;
      padding: 14px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-primary {
      background: #667eea;
      color: white;
    }
    .btn-primary:hover {
      background: #5568d3;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .btn-secondary {
      background: #e0e0e0;
      color: #666;
    }
    .btn-secondary:hover {
      background: #d0d0d0;
    }
    .error {
      background: #ffebee;
      color: #c62828;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }
    .error.show {
      display: block;
    }
    .success {
      background: #e8f5e9;
      color: #2e7d32;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }
    .success.show {
      display: block;
    }
  </style>
</head>
<body>
  <div class="wizard">
    <div class="wizard-header">
      <h1>🤖 Sticker Bot Setup</h1>
      <p>Configure seu bot em poucos passos</p>
    </div>

    <div class="steps">
      <div class="step active" data-step="1">
        <div class="step-number">1</div>
        <div class="step-label">WhatsApp</div>
      </div>
      <div class="step" data-step="2">
        <div class="step-number">2</div>
        <div class="step-label">Admin</div>
      </div>
      <div class="step" data-step="3">
        <div class="step-number">3</div>
        <div class="step-label">Features</div>
      </div>
      <div class="step" data-step="4">
        <div class="step-number">4</div>
        <div class="step-label">Finalizar</div>
      </div>
    </div>

    <div class="error" id="error"></div>
    <div class="success" id="success"></div>

    <!-- Step 1: WhatsApp -->
    <div class="step-content active" data-step="1">
      <div class="form-group">
        <label>ID do Grupo WhatsApp *</label>
        <input type="text" id="groupId" placeholder="120363123456789012@g.us" required>
        <small>O grupo onde o bot enviará figurinhas automaticamente</small>
      </div>
      <div class="form-group">
        <label>Número do Admin *</label>
        <input type="text" id="adminNumber" placeholder="5511999999999@c.us" required>
        <small>Seu número com acesso total ao bot</small>
      </div>
      <div class="btn-group">
        <button class="btn-primary" onclick="nextStep(1)">Próximo →</button>
      </div>
    </div>

    <!-- Step 2: Admin Account -->
    <div class="step-content" data-step="2">
      <div class="form-group">
        <label>Nome de Usuário *</label>
        <input type="text" id="adminUsername" placeholder="admin" required>
        <small>Para acessar a interface web</small>
      </div>
      <div class="form-group">
        <label>Senha *</label>
        <input type="password" id="adminPassword" placeholder="Senha forte (mín. 8 caracteres)" required>
      </div>
      <div class="btn-group">
        <button class="btn-secondary" onclick="prevStep(2)">← Voltar</button>
        <button class="btn-primary" onclick="nextStep(2)">Próximo →</button>
      </div>
    </div>

    <!-- Step 3: Optional Features -->
    <div class="step-content" data-step="3">
      <div class="form-group">
        <label>OpenAI API Key (Opcional)</label>
        <input type="password" id="openaiKey" placeholder="sk-...">
        <small>Para IA de tagging e transcrição</small>
      </div>
      <div class="form-group">
        <label>Timezone</label>
        <select id="timezone">
          <option value="America/Sao_Paulo">Brasil (São Paulo)</option>
          <option value="America/New_York">EUA (New York)</option>
          <option value="Europe/London">Europa (London)</option>
          <option value="UTC">UTC</option>
        </select>
      </div>
      <div class="btn-group">
        <button class="btn-secondary" onclick="prevStep(3)">← Voltar</button>
        <button class="btn-primary" onclick="nextStep(3)">Próximo →</button>
      </div>
    </div>

    <!-- Step 4: Finalize -->
    <div class="step-content" data-step="4">
      <h3 style="margin-bottom: 20px;">Pronto para finalizar!</h3>
      <p style="color: #666; margin-bottom: 20px;">
        Clique em "Finalizar" para salvar as configurações e iniciar o bot.
      </p>
      <div id="summary" style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h4 style="margin-bottom: 10px;">Resumo:</h4>
        <ul id="summaryList" style="list-style: none; line-height: 2;">
        </ul>
      </div>
      <div class="btn-group">
        <button class="btn-secondary" onclick="prevStep(4)">← Voltar</button>
        <button class="btn-primary" onclick="finalize()">✓ Finalizar</button>
      </div>
    </div>
  </div>

  <script>
    let currentStep = 1;
    const setupData = {};

    function showError(msg) {
      const el = document.getElementById('error');
      el.textContent = msg;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 5000);
    }

    function showSuccess(msg) {
      const el = document.getElementById('success');
      el.textContent = msg;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 5000);
    }

    async function nextStep(step) {
      let data = {};

      if (step === 1) {
        const groupId = document.getElementById('groupId').value;
        const adminNumber = document.getElementById('adminNumber').value;

        if (!groupId || !adminNumber) {
          return showError('Preencha todos os campos obrigatórios');
        }

        data = { groupId, adminNumber };
      } else if (step === 2) {
        const username = document.getElementById('adminUsername').value;
        const password = document.getElementById('adminPassword').value;

        if (!username || !password || password.length < 8) {
          return showError('Senha deve ter no mínimo 8 caracteres');
        }

        data = { username, password };
      } else if (step === 3) {
        data = {
          openaiKey: document.getElementById('openaiKey').value,
          timezone: document.getElementById('timezone').value
        };
      }

      try {
        const endpoints = {
          1: '/setup/whatsapp',
          2: '/setup/admin',
          3: '/setup/features'
        };

        const res = await fetch(endpoints[step], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await res.json();

        if (!res.ok) {
          return showError(result.error || 'Erro ao processar');
        }

        Object.assign(setupData, data);
        currentStep = result.nextStep;
        updateSteps();

        if (currentStep === 4) {
          updateSummary();
        }

      } catch (err) {
        showError('Erro de conexão: ' + err.message);
      }
    }

    function prevStep(step) {
      currentStep = step - 1;
      updateSteps();
    }

    function updateSteps() {
      // Update step indicators
      document.querySelectorAll('.step').forEach((el, idx) => {
        el.classList.remove('active', 'completed');
        if (idx + 1 < currentStep) el.classList.add('completed');
        if (idx + 1 === currentStep) el.classList.add('active');
      });

      // Update step content
      document.querySelectorAll('.step-content').forEach((el, idx) => {
        el.classList.toggle('active', idx + 1 === currentStep);
      });
    }

    function updateSummary() {
      const list = document.getElementById('summaryList');
      list.innerHTML = `
        <li>✓ Grupo: ${setupData.groupId}</li>
        <li>✓ Admin: ${setupData.adminNumber}</li>
        <li>✓ Usuário web: ${setupData.username}</li>
        <li>✓ OpenAI: ${setupData.openaiKey ? 'Configurado' : 'Não configurado'}</li>
        <li>✓ Timezone: ${setupData.timezone}</li>
      `;
    }

    async function finalize() {
      try {
        const res = await fetch('/setup/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const result = await res.json();

        if (!res.ok) {
          return showError(result.error || 'Erro ao finalizar');
        }

        showSuccess(result.message);

        setTimeout(() => {
          window.location.href = result.redirectTo;
        }, 2000);

      } catch (err) {
        showError('Erro ao finalizar: ' + err.message);
      }
    }
  </script>
</body>
</html>
```

---

## 📝 Passos de Implementação

### **Fase 1: Setup Script (1-2 dias)**
1. ✅ Criar `install.sh` com detecção de ambiente
2. ✅ Implementar instalação de dependências
3. ✅ Adicionar geração de .env mínimo
4. ✅ Testar em Linux e macOS

### **Fase 2: Web Wizard Backend (2-3 dias)**
1. ✅ Criar rotas `/setup/*` em `web/routes/setup.js`
2. ✅ Implementar validação de cada step
3. ✅ Adicionar geração automática de .env
4. ✅ Integrar criação de admin user
5. ✅ Adicionar execução de migrations

### **Fase 3: Web Wizard Frontend (2-3 dias)**
1. ✅ Criar `web/public/setup.html` com wizard
2. ✅ Implementar navegação entre steps
3. ✅ Adicionar validação client-side
4. ✅ Criar preview de configurações
5. ✅ Testar fluxo completo

### **Fase 4: Integração WhatsApp (1-2 dias)**
1. ✅ Adicionar QR Code display no step 1
2. ✅ Implementar detecção automática de grupos
3. ✅ Validar conexão antes de prosseguir

### **Fase 5: PM2 Integration (1 dia)**
1. ✅ Criar ecosystem.config.js automático
2. ✅ Configurar auto-start
3. ✅ Testar restart automático

### **Fase 6: Testes e Documentação (2 dias)**
1. ✅ Testar instalação limpa em VPS
2. ✅ Atualizar README.md
3. ✅ Criar guia de troubleshooting
4. ✅ Fazer vídeo tutorial

---

## 🎨 Mockup Visual do Wizard

```
┌────────────────────────────────────────────────┐
│   🤖 Sticker Bot Setup                         │
│   Configure seu bot em poucos passos           │
│                                                │
│   ●────●────○────○                            │
│   WhatsApp Admin Features Done                │
│                                                │
│   Step 1: Configuração do WhatsApp            │
│   ┌──────────────────────────────────────┐   │
│   │ ID do Grupo WhatsApp *               │   │
│   │ 120363123456789012@g.us              │   │
│   │ O grupo onde o bot enviará stickers  │   │
│   └──────────────────────────────────────┘   │
│                                                │
│   ┌──────────────────────────────────────┐   │
│   │ Número do Admin *                     │   │
│   │ 5511999999999@c.us                   │   │
│   │ Seu número com acesso total           │   │
│   └──────────────────────────────────────┘   │
│                                                │
│   [          Próximo →          ]              │
└────────────────────────────────────────────────┘
```

---

## 🚀 Uso Final

```bash
# Instalação em um comando
curl -sSL https://install.stickerbot.io | bash

# Ou via wget
wget -qO- https://install.stickerbot.io | bash

# Com opções
curl -sSL https://install.stickerbot.io | bash -s -- --dir=/opt/sticker-bot

# CLI mode forçado (para servidores headless)
curl -sSL https://install.stickerbot.io | bash -s -- --cli
```

**Após execução:**
1. Browser abre automaticamente em `http://localhost:3000/setup`
2. Usuário segue wizard de 4 steps
3. Bot é configurado e iniciado automaticamente
4. Redirecionado para login da interface web

---

## 🔍 Validações Necessárias

### **Backend Validations:**
- ✅ Group ID format (`xxxxx@g.us`)
- ✅ Phone number format (`xxxxx@c.us`)
- ✅ Username length (min 3 chars)
- ✅ Password strength (min 8 chars, complexity)
- ✅ OpenAI API key format (se fornecido)
- ✅ SMTP connection test (se fornecido)

### **Frontend Validations:**
- ✅ Real-time field validation
- ✅ Password strength indicator
- ✅ Preview de configurações antes de salvar
- ✅ Confirmação antes de finalizar

---

## 🛠️ Tecnologias Utilizadas

- **Shell Script** - Instalação automatizada
- **Express.js** - Web wizard backend
- **Vanilla JS** - Frontend leve e rápido
- **SQLite** - Database setup automático
- **PM2** - Process management
- **bcrypt** - Password hashing seguro

---

## ⚡ Melhorias Futuras

1. **Docker Support** - `docker run` one-liner
2. **Auto-update** - Sistema de updates automáticos
3. **Health Checks** - Monitoring integrado
4. **Backup/Restore** - Interface para backups
5. **Multi-language** - Suporte a EN/PT/ES
6. **Cloud Deploy** - Deploy direto para VPS/Cloud

---

## 📊 Estimativa de Tempo

| Fase | Tempo Estimado |
|------|----------------|
| Fase 1: Setup Script | 1-2 dias |
| Fase 2: Backend | 2-3 dias |
| Fase 3: Frontend | 2-3 dias |
| Fase 4: WhatsApp | 1-2 dias |
| Fase 5: PM2 | 1 dia |
| Fase 6: Testes | 2 dias |
| **TOTAL** | **9-13 dias** |

---

## ✅ Recomendação Final

**Implementar Opção 1 (Script + Web Wizard)** porque:
1. Melhor UX para usuários não-técnicos
2. Validação visual em tempo real
3. Possibilidade de mostrar QR Code do WhatsApp
4. Mais fácil de manter e expandir
5. Compatível com servidores via port forwarding

**Fallback para CLI** pode ser adicionado depois se necessário.
