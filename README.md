# 🤖 Sticker Bot (WhatsApp)

Bot de WhatsApp para gerenciamento inteligente de figurinhas, vídeos, imagens e áudios, com suporte a descrição automática via IA, classificação de conteúdo (incluindo detecção NSFW), e banco de dados pesquisável.

## ✨ Funcionalidades

- 📦 **Recebe figurinhas, imagens, vídeos e áudios** enviados no WhatsApp.
- 📝 **Gera descrição automática** usando IA (OpenAI).
- 🏷️ **Gera tags automáticas** para organização.
- 🚫 **Classificação NSFW** (conteúdo adulto) com bloqueio opcional.
- 🔍 **Banco de dados pesquisável** via interface web.
- 🎯 **Envio automático de figurinhas aleatórias** em horários programados.
- 📥 **Importa mídias recebidas para o banco** evitando duplicatas.
- 🗂️ **Estrutura modular** para fácil manutenção e expansão.

## 📂 Estrutura do Projeto

/handlers → Manipuladores para cada tipo de mídia (stickers, vídeos, imagens, áudios)

/services → Serviços auxiliares (IA, NSFW, conversão de formatos, etc.)

/utils → Funções utilitárias

configRuntime.js → Configurações dinâmicas

database.js → Operações no banco de dados SQLite

bot.js → Arquivo principal do bot


## 🛠️ Requisitos

- **Node.js** v18+
- **npm** ou **yarn**
- Conta na [OpenAI](https://platform.openai.com/) (para gerar descrições e tags)
- API Key válida da OpenAI (configurada no `.env`)
- [Venom-Bot](https://github.com/orkestral/venom) como base de conexão ao WhatsApp

## 🚀 Instalação

```bash
# Clone o repositório
git clone https://github.com/ZanardiZZ/sticker-bot.git
cd sticker-bot

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
nano .env


Exemplo de .env
OPENAI_API_KEY=sua_chave_openai
SKIP_NSFW=false
STICKERS_DIR=stickers

Como rodar?
# Executar diretamente
node bot.js

# Ou usar PM2 para execução em segundo plano
npm install -g pm2
pm2 start bot.js --name sticker-bot
pm2 logs sticker-bot

📜 Comandos Disponíveis no WhatsApp (nem todos estão funcionais ainda)
#random → Envia uma figurinha aleatória.
#tag <nova_tag> → Atualiza a tag da última mídia recebida.
#forçar → Força a reanálise de mídia pendente.
#help → Lista todos os comandos disponíveis.

🌐 Interface Web (ainda será adicionado ao projeto)
Servidor web integrado para navegação das figurinhas e busca por descrição ou tag.
Acesse via: http://<IP_DO_SERVIDOR>:<PORTA>

🧠 IA Integrada
Descrição e tags automáticas usando OpenAI GPT-4o (ou outro modelo que desejar).
Categorização de conteúdo NSFW usando nsfwjs com TensorFlow.

⚠️ Avisos
O bot requer conexão ativa com o WhatsApp Web.
Figurinhas/vídeos/imagens duplicadas são automaticamente detectadas.
Em caso de mensagens sem mediaBlob, o bot ignora para evitar travamentos.

📄 Licença
Este projeto é distribuído sob a licença MIT.
Sinta-se livre para modificar e contribuir!

