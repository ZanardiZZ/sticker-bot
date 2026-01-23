# Instalação no Windows - Guia Completo

## 🪟 Opções de Instalação para Windows

### ✅ Opções que Funcionam Nativamente

| Opção | Windows | Facilidade | Recomendado |
|-------|---------|------------|-------------|
| **NPX Package** | ✅ Nativo | ⭐⭐⭐⭐⭐ | 🏆 **MELHOR** |
| **CLI Interativo** | ✅ Nativo | ⭐⭐⭐⭐⭐ | ✅ Sim |
| **Docker Desktop** | ✅ Com Docker | ⭐⭐⭐⭐ | ✅ Sim |
| **PowerShell Script** | ✅ Nativo | ⭐⭐⭐⭐ | ✅ Sim |
| **WSL2 + Shell Script** | ✅ Via WSL | ⭐⭐⭐ | ⚠️ Técnico |

---

## 🏆 Recomendação: NPX Package (Cross-Platform)

### Por que NPX é a melhor opção para Windows?

✅ **100% Cross-platform** - Funciona em Win/Mac/Linux
✅ **Zero configuração** - Só precisa de Node.js
✅ **Instalação em 1 comando** - `npx create-sticker-bot`
✅ **Nativo no Windows** - Não precisa de WSL ou adaptações
✅ **Gerenciamento de versões** - npm cuida de updates
✅ **Familiar** - Desenvolvedores já conhecem

### Como Funciona

```powershell
# PowerShell ou CMD
npx create-sticker-bot@latest

# Wizard interativo no terminal
? WhatsApp Group ID: 120363...@g.us
? Admin Number: 5511000000000@c.us
? Admin Username: admin
? Admin Password: ********
? OpenAI API Key (optional): [skip]
? Timezone: America/Sao_Paulo
? Start on boot: Yes

[████████████████████] Installing dependencies
[████████████████████] Setting up database
[████████████████████] Configuring services

✓ Installation complete!
  → Web UI: http://localhost:3000
  → Bot: Running (PID 12345)
  → Logs: C:\Users\YourName\sticker-bot\logs\
```

---

## 📦 Opção 1: NPX Package (RECOMENDADO)

### Pré-requisitos

```powershell
# 1. Instalar Node.js 20+ (se não tiver)
# Baixar de: https://nodejs.org/

# 2. Verificar instalação
node -v  # Deve ser 20.x ou superior
npm -v   # Deve estar presente
```

### Instalação

```powershell
# Método 1: Instalação direta (recomendado)
npx create-sticker-bot@latest

# Método 2: Especificar diretório
npx create-sticker-bot@latest --dir="C:\sticker-bot"

# Método 3: Modo CLI (sem wizard web)
npx create-sticker-bot@latest --cli

# Método 4: Instalação global
npm install -g create-sticker-bot
create-sticker-bot
```

### Implementação

```javascript
// packages/create-sticker-bot/index.js
#!/usr/bin/env node

const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

program
  .name('create-sticker-bot')
  .description('Setup Sticker Bot - Works on Windows/Mac/Linux')
  .option('--dir <path>', 'Installation directory', process.cwd())
  .option('--cli', 'CLI mode (no web wizard)')
  .option('--web', 'Web wizard mode (default)')
  .action(async (options) => {
    console.log(chalk.blue.bold('🤖 Sticker Bot Installer'));
    console.log(chalk.gray('Cross-platform installer for Windows/Mac/Linux\n'));

    // Detect OS
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';

    console.log(`Platform: ${chalk.yellow(process.platform)}`);
    console.log(`Node: ${chalk.green(process.version)}\n`);

    // Choose installation mode
    let mode = options.cli ? 'cli' : 'web';

    if (!options.cli && !options.web) {
      const { preferredMode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'preferredMode',
          message: 'Installation mode:',
          choices: [
            { name: '🌐 Web Wizard (Visual setup)', value: 'web' },
            { name: '🔧 CLI Interactive (Terminal only)', value: 'cli' }
          ]
        }
      ]);
      mode = preferredMode;
    }

    if (mode === 'web') {
      await runWebInstaller(options.dir, isWindows);
    } else {
      await runCLIInstaller(options.dir, isWindows);
    }
  });

async function runCLIInstaller(installDir, isWindows) {
  console.log(chalk.blue('\n🔧 CLI Interactive Mode\n'));

  const questions = [
    {
      type: 'input',
      name: 'groupId',
      message: 'WhatsApp Group ID:',
      validate: (val) => val.endsWith('@g.us') || 'Must end with @g.us'
    },
    {
      type: 'input',
      name: 'adminNumber',
      message: 'Admin WhatsApp Number:',
      default: '5511000000000@c.us',
      validate: (val) => val.includes('@') || 'Must include @'
    },
    {
      type: 'input',
      name: 'adminUsername',
      message: 'Web Admin Username:',
      default: 'admin',
      validate: (val) => val.length >= 3 || 'Min 3 characters'
    },
    {
      type: 'password',
      name: 'adminPassword',
      message: 'Web Admin Password:',
      validate: (val) => val.length >= 8 || 'Min 8 characters'
    },
    {
      type: 'input',
      name: 'openaiKey',
      message: 'OpenAI API Key (optional, press Enter to skip):',
      default: ''
    },
    {
      type: 'list',
      name: 'timezone',
      message: 'Timezone:',
      choices: [
        'America/Sao_Paulo',
        'America/New_York',
        'Europe/London',
        'UTC'
      ]
    },
    {
      type: 'confirm',
      name: 'autoStart',
      message: 'Start bot on system boot?',
      default: true
    }
  ];

  const answers = await inquirer.prompt(questions);

  // Install
  console.log(chalk.blue('\n📦 Installing...\n'));

  // Clone or copy template
  const templateDir = path.join(__dirname, 'template');
  await copyTemplate(templateDir, installDir);

  // Install dependencies
  console.log(chalk.gray('Installing dependencies...'));
  execSync('npm ci', { cwd: installDir, stdio: 'inherit' });

  // Generate .env
  const envContent = generateEnvFile(answers);
  fs.writeFileSync(path.join(installDir, '.env'), envContent);

  // Run migrations
  console.log(chalk.gray('Setting up database...'));
  execSync('node scripts/run-migrations.js', { cwd: installDir, stdio: 'inherit' });

  // Create admin user
  await createAdminUser(installDir, answers.adminUsername, answers.adminPassword);

  // Setup auto-start
  if (answers.autoStart) {
    if (isWindows) {
      setupWindowsAutoStart(installDir);
    } else {
      setupUnixAutoStart(installDir);
    }
  }

  // Start services
  console.log(chalk.blue('\n🚀 Starting services...\n'));

  if (isWindows) {
    // Use pm2 or node directly
    execSync('npm run baileys:server', {
      cwd: installDir,
      detached: true,
      stdio: 'ignore'
    });
    execSync('npm run bot', {
      cwd: installDir,
      detached: true,
      stdio: 'ignore'
    });
    execSync('npm run web', {
      cwd: installDir,
      detached: true,
      stdio: 'ignore'
    });
  } else {
    execSync('pm2 start ecosystem.config.js', { cwd: installDir, stdio: 'inherit' });
  }

  // Success message
  console.log(chalk.green.bold('\n✓ Installation complete!\n'));
  console.log(`${chalk.blue('→')} Web UI: ${chalk.underline('http://localhost:3000')}`);
  console.log(`${chalk.blue('→')} Installed at: ${chalk.gray(installDir)}`);
  console.log(`${chalk.blue('→')} Username: ${chalk.yellow(answers.adminUsername)}`);

  if (isWindows) {
    console.log(`\n${chalk.gray('Windows Commands:')}`);
    console.log(`  ${chalk.cyan('npm run web')}     - Start web interface`);
    console.log(`  ${chalk.cyan('npm run bot')}     - Start bot`);
    console.log(`  ${chalk.cyan('npm run baileys:server')} - Start WhatsApp bridge`);
  } else {
    console.log(`\n${chalk.gray('Commands:')}`);
    console.log(`  ${chalk.cyan('pm2 status')}     - Check services`);
    console.log(`  ${chalk.cyan('pm2 logs')}       - View logs`);
    console.log(`  ${chalk.cyan('pm2 restart all')} - Restart services`);
  }
}

async function runWebInstaller(installDir, isWindows) {
  console.log(chalk.blue('\n🌐 Web Wizard Mode\n'));

  // Same as CLI but starts web server instead
  // ... (código similar, mas inicia servidor web)
}

function setupWindowsAutoStart(installDir) {
  // Create startup script
  const startupScript = `
@echo off
cd /d "${installDir}"
start /B npm run baileys:server
start /B npm run bot
start /B npm run web
  `.trim();

  const startupPath = path.join(
    process.env.APPDATA,
    'Microsoft\\Windows\\Start Menu\\Programs\\Startup',
    'sticker-bot.bat'
  );

  fs.writeFileSync(startupPath, startupScript);
  console.log(chalk.green('✓ Windows auto-start configured'));
}

function setupUnixAutoStart(installDir) {
  execSync('pm2 startup', { stdio: 'inherit' });
  execSync('pm2 save', { stdio: 'inherit' });
  console.log(chalk.green('✓ Auto-start configured'));
}

// Helper functions
function generateEnvFile(answers) {
  return `# Generated by create-sticker-bot
AUTO_SEND_GROUP_ID=${answers.groupId}
ADMIN_NUMBER=${answers.adminNumber}
BOT_WHATSAPP_NUMBER=${answers.adminNumber.replace('@c.us', '')}
ADMIN_INITIAL_USERNAME=${answers.adminUsername}

PORT=3000
WEB_SERVER_URL=http://localhost:3000

BAILEYS_WS_PORT=8765
BAILEYS_WS_URL=ws://localhost:8765
BAILEYS_ALLOWED_TOKENS=dev
BAILEYS_CLIENT_TOKEN=dev

SESSION_SECRET=${require('crypto').randomBytes(32).toString('hex')}
JWT_SECRET=${require('crypto').randomBytes(32).toString('hex')}
JWT_EXPIRES_IN=7d

TIMEZONE=${answers.timezone}
${answers.openaiKey ? `OPENAI_API_KEY=${answers.openaiKey}` : '# OPENAI_API_KEY='}

ENABLE_INTERNAL_ANALYTICS=true
`;
}

async function createAdminUser(installDir, username, password) {
  const bcrypt = require('bcryptjs');
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(installDir, 'media.db');

  const db = new sqlite3.Database(dbPath);
  const hash = await bcrypt.hash(password, 10);
  const timestamp = Math.floor(Date.now() / 1000);

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (username, password_hash, role, status, created_at)
       VALUES (?, ?, 'admin', 'approved', ?)`,
      [username, hash, timestamp],
      (err) => {
        db.close();
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function copyTemplate(src, dest) {
  // Copy template files recursively
  // ... (implementação de cópia recursiva)
}

program.parse();
```

### package.json

```json
{
  "name": "create-sticker-bot",
  "version": "1.0.0",
  "description": "Cross-platform Sticker Bot installer",
  "bin": {
    "create-sticker-bot": "./index.js"
  },
  "keywords": [
    "whatsapp",
    "bot",
    "sticker",
    "installer",
    "windows",
    "macos",
    "linux"
  ],
  "dependencies": {
    "inquirer": "^9.2.12",
    "chalk": "^5.3.0",
    "commander": "^11.1.0",
    "bcryptjs": "^2.4.3",
    "sqlite3": "^5.1.7"
  },
  "files": [
    "index.js",
    "template/**/*"
  ]
}
```

---

## 📜 Opção 2: PowerShell Script

### install.ps1

```powershell
# Sticker Bot Installer for Windows
# Usage: iwr -useb install.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host "🤖 Sticker Bot Installer for Windows" -ForegroundColor Blue
Write-Host "=====================================" -ForegroundColor Blue
Write-Host ""

# Check Node.js
$nodeVersion = $null
try {
    $nodeVersion = node -v
    $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')

    if ($major -lt 20) {
        Write-Host "❌ Node.js 20+ required. Current: $nodeVersion" -ForegroundColor Red
        Write-Host "   Download from: https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "✓ Node.js $nodeVersion found" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found" -ForegroundColor Red
    Write-Host "   Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check npm
try {
    $npmVersion = npm -v
    Write-Host "✓ npm $npmVersion found" -ForegroundColor Green
} catch {
    Write-Host "❌ npm not found" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Installation directory
$installDir = "$env:USERPROFILE\sticker-bot"
if ($args.Length -gt 0) {
    $installDir = $args[0]
}

Write-Host "📁 Installing to: $installDir" -ForegroundColor Cyan

# Check if directory exists
if (Test-Path $installDir) {
    $response = Read-Host "⚠️  Directory exists. Remove and reinstall? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Remove-Item -Recurse -Force $installDir
    } else {
        exit 1
    }
}

# Clone repository
Write-Host "📥 Downloading Sticker Bot..." -ForegroundColor Cyan
git clone https://github.com/ZanardiZZ/sticker-bot.git $installDir

# Enter directory
Set-Location $installDir

# Install dependencies
Write-Host "📦 Installing dependencies (this may take a few minutes)..." -ForegroundColor Cyan
npm ci

# Create minimal .env
$envContent = @"
# Auto-generated by installer
PORT=3000
SETUP_MODE=true
"@
$envContent | Out-File -FilePath ".env" -Encoding utf8

# Start web server
Write-Host ""
Write-Host "🚀 Starting setup wizard..." -ForegroundColor Green
Write-Host "   Opening http://localhost:3000/setup in 5 seconds..." -ForegroundColor Cyan
Write-Host ""

# Start server in background
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run", "web"

# Wait and open browser
Start-Sleep -Seconds 5
Start-Process "http://localhost:3000/setup"

Write-Host ""
Write-Host "✓ Setup wizard is ready!" -ForegroundColor Green
Write-Host "  Follow the steps in your browser to complete installation." -ForegroundColor White
Write-Host ""
Write-Host "  Directory: $installDir" -ForegroundColor Gray
Write-Host ""
```

### Uso

```powershell
# Baixar e executar
Invoke-WebRequest -Uri "https://raw.../install.ps1" -OutFile "install.ps1"
.\install.ps1

# Ou one-liner (requer execução de scripts habilitada)
iwr -useb https://raw.../install.ps1 | iex

# Com diretório customizado
.\install.ps1 "C:\sticker-bot"
```

---

## 🐳 Opção 3: Docker Desktop

### Pré-requisitos

1. Instalar Docker Desktop for Windows
2. Habilitar WSL2 backend (recomendado)

### Instalação

```powershell
# 1. Baixar docker-compose.yml
Invoke-WebRequest -Uri "https://raw.../docker-compose.yml" -OutFile "docker-compose.yml"

# 2. Criar diretórios
New-Item -ItemType Directory -Force -Path ".\data"
New-Item -ItemType Directory -Force -Path ".\auth_info_baileys"

# 3. Iniciar
docker-compose up -d

# 4. Abrir setup
Start-Process "http://localhost:3000/setup"
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  sticker-bot:
    image: stickerbot/bot:latest
    container_name: sticker-bot
    ports:
      - "3000:3000"
      - "8765:8765"
    volumes:
      - ./data:/app/data
      - ./auth_info_baileys:/app/auth_info_baileys
      - ./bot/media:/app/bot/media
    environment:
      - SETUP_MODE=true
      - TZ=America/Sao_Paulo
    restart: unless-stopped
```

---

## 🔧 Opção 4: WSL2 + Shell Script

### Setup WSL2

```powershell
# 1. Instalar WSL2
wsl --install

# 2. Instalar Ubuntu
wsl --install -d Ubuntu

# 3. Abrir Ubuntu
wsl
```

### Dentro do WSL

```bash
# Usar o script original
curl -sSL https://install.stickerbot.io | bash
```

### Acessar do Windows

```
http://localhost:3000/setup
```

---

## 📊 Comparação de Métodos no Windows

| Método | Facilidade | Nativo | Auto-start | Recomendado |
|--------|-----------|--------|------------|-------------|
| **NPX** | ⭐⭐⭐⭐⭐ | ✅ | ✅ | 🏆 **MELHOR** |
| **PowerShell** | ⭐⭐⭐⭐ | ✅ | ✅ | ✅ Bom |
| **Docker** | ⭐⭐⭐ | ⚠️ Precisa Docker | ✅ | ✅ OK |
| **WSL2** | ⭐⭐ | ⚠️ Precisa WSL | ✅ | ⚠️ Técnico |

---

## 🚀 Recomendação Final para Windows

### Para Usuários Comuns
**→ NPX Package**
```powershell
npx create-sticker-bot@latest
```
- Mais fácil
- Zero configuração
- Funciona imediatamente

### Para Desenvolvedores
**→ NPX ou Docker**
- NPX: Desenvolvimento local
- Docker: Deploy/produção

### Para Usuários Linux no Windows
**→ WSL2 + Shell Script**
- Ambiente Linux completo
- Melhor compatibilidade

---

## 🛠️ Troubleshooting Windows

### Erro: "Execution of scripts is disabled"

```powershell
# Solução temporária
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Executar script
.\install.ps1
```

### Erro: "npm command not found"

```powershell
# Adicionar npm ao PATH
$env:Path += ";C:\Program Files\nodejs"

# Ou reinstalar Node.js com opção "Add to PATH" marcada
```

### Porta 3000 em uso

```powershell
# Verificar processo
netstat -ano | findstr :3000

# Matar processo
taskkill /PID <PID> /F

# Ou usar porta diferente
$env:PORT=3001
npm run web
```

### Firewall bloqueando

```powershell
# Adicionar exceção
New-NetFirewallRule -DisplayName "Sticker Bot" -Direction Inbound -Protocol TCP -LocalPort 3000,8765 -Action Allow
```

---

## ✅ Checklist de Instalação no Windows

- [ ] Node.js 20+ instalado
- [ ] npm funcionando
- [ ] Git instalado (opcional, para clone)
- [ ] Portas 3000 e 8765 livres
- [ ] Firewall configurado
- [ ] Executar como Administrador (se necessário)

---

## 📝 Próximos Passos

1. **Escolher método de instalação**
2. **Instalar pré-requisitos**
3. **Executar instalador**
4. **Seguir wizard de configuração**
5. **Acessar http://localhost:3000**

**Pronto! Bot rodando no Windows!** 🎉
