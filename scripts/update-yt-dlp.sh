#!/bin/bash
# Atualiza o binário yt-dlp para a versão mais recente
# Executado semanalmente via cron

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
YTDLP_PATH="$SCRIPT_DIR/../storage/temp/yt-dlp"
GITHUB_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
LOG_PREFIX="[update-yt-dlp]"

echo "$LOG_PREFIX Verificando versão atual..."
CURRENT_VERSION=$("$YTDLP_PATH" --version 2>/dev/null || echo "não instalado")
echo "$LOG_PREFIX Versão atual: $CURRENT_VERSION"

echo "$LOG_PREFIX Baixando versão mais recente..."
TMP_FILE="$YTDLP_PATH.tmp"

if wget -q -O "$TMP_FILE" "$GITHUB_URL"; then
    chmod +x "$TMP_FILE"
    NEW_VERSION=$("$TMP_FILE" --version 2>/dev/null)

    if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
        echo "$LOG_PREFIX Já está na versão mais recente ($CURRENT_VERSION). Nada a fazer."
        rm -f "$TMP_FILE"
    else
        mv "$TMP_FILE" "$YTDLP_PATH"
        echo "$LOG_PREFIX Atualizado: $CURRENT_VERSION → $NEW_VERSION"
    fi
else
    echo "$LOG_PREFIX ERRO: falha ao baixar yt-dlp. Mantendo versão atual ($CURRENT_VERSION)." >&2
    rm -f "$TMP_FILE"
    exit 1
fi
