#!/bin/bash
set -e

# Função para instalar dependências via apt caso estejam faltando
install_deps() {
  echo "Atualizando repositórios e instalando dependências necessárias..."
  sudo apt update
  sudo apt install -y cmake make git wget
}

# Verifica se comandos essenciais existem, tenta instalar se não existir
for cmd in cmake make git wget; do
  if ! command -v $cmd &> /dev/null; then
    echo "Comando '$cmd' não encontrado."
    read -p "Deseja tentar instalar automaticamente (requer sudo)? [s/N]: " resposta
    if [[ "$resposta" =~ ^[Ss]$ ]]; then
      install_deps
      # Verifica novamente após tentativa de instalação
      if ! command -v $cmd &> /dev/null; then
        echo "Erro: comando '$cmd' ainda não encontrado após tentativa de instalação. Abortando."
        exit 1
      fi
    else
      echo "Por favor, instale manualmente o comando '$cmd' e execute novamente."
      exit 1
    fi
  fi
done

WHISPER_DIR="./whisper.cpp"

if [ ! -d "$WHISPER_DIR" ]; then
  echo "Clonando whisper.cpp..."
  git clone https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
fi

cd "$WHISPER_DIR"

echo "Compilando whisper.cpp..."
mkdir -p build && cd build
cmake .. && make -j"$(nproc)"

echo "Baixando modelo multilíngue base..."
wget -nc https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-small.bin

echo "Setup do whisper concluído."