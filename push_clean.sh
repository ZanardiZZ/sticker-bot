#!/bin/bash
set -e

# ==== CONFIGURAÇÃO ====
SRC="/opt/sticker-bot"   # Caminho do código atual do bot
STAGE="/tmp/sticker-bot-stage"
REPO_URL="https://github.com/ZanardiZZ/sticker-bot.git"

# ==== LIMPAR STAGING ====
rm -rf "$STAGE"
mkdir -p "$STAGE"
cd "$STAGE"

# ==== CLONAR REPO REMOTO ====
git clone "$REPO_URL" .
git checkout --orphan clean-main
git rm -rf .

# ==== COPIAR ARQUIVOS DO BOT (SEM SUJEIRA) ====
rsync -av --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'stickers' \
  --exclude 'stickersolds' \
  --exclude 'stickers.db' \
  --exclude 'videos' \
  --exclude 'tokens' \
  --exclude 'nsfwjs' \
  "$SRC"/ ./

# ==== CRIAR .gitignore ====
cat > .gitignore << 'EOF'
# Node
node_modules/
npm-debug.log*
yarn.lock
pnpm-lock.yaml

# Segredos/ambiente
.env
.env.*
*.local

# Logs e temporários
logs/
*.log
send.log
tmp/
temp/
*.tmp
.DS_Store

# Build/coverage
dist/
build/
coverage/

# Bot (mídias e caches)
stickers/
stickersolds/
stickers.db
videos/
tokens/
nsfwjs/

# Sessões Venom/Open-WA/WPPConnect
tokens*/
.venom/
WPPConnect-*/ 
chats*/ 
Auth*/ 

# Modelos grandes
*.h5
*.bin
*.pb
*.onnx
EOF

# ==== CRIAR .env.example ====
cat > .env.example << 'EOF'
OPENAI_API_KEY=
VENOM_SESSION_NAME=sticker-bot
DB_PATH=./stickers.db
STICKERS_DIR=./stickers
VIDEOS_DIR=./videos
SKIP_NSFW=1
EOF

# ==== COMMIT E PUSH ====
git add -A
git commit -m "start: repositório limpo com versão atual do bot"
git branch -M main
git push -f origin main

echo "✅ Repositório atualizado e publicado com histórico limpo!"
