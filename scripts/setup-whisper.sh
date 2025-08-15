#!/bin/bash
set -e

# Verifica se comandos essenciais existem
for cmd in cmake make git wget; do
  if ! command -v $cmd &> /dev/null; then
    echo "Erro: comando '$cmd' não encontrado. Por favor instale antes de continuar."
    exit 1
  fi
done

WHISPER_DIR="./whisper.cpp"

if [ ! -d "$WHISPER_DIR" ]; then
  echo "Clonando whisper.cpp..."
  git clone https://github.com/ggerganov/whisper.cpp.git $WHISPER_DIR
fi

cd $WHISPER_DIR

echo "Compilando whisper.cpp..."
mkdir -p build && cd build
cmake .. && make -j$(nproc)

echo "Baixando modelo multilíngue base..."
wget -nc https://huggingface.co/ggerganov/whisper.cpp/resolve/main/models/ggml-base.bin

echo "Setup do whisper concluído."