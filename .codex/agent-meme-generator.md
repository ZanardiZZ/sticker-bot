# Objetivo do Agente

Desenvolver um módulo completo para o projeto **Sticker-Bot** (Node.js + Baileys), que implemente uma **pipeline custom de geração de memes inteligentes** e **aprendizado com feedback de usuários**.

---

## Escopo principal

1. **Criação de memes a partir de texto**
   - Quando o usuário envia `#criar <descrição>`, o bot:
     - chama o modelo GPT-4o-mini (ou GPT-5-mini) para expandir a ideia em um prompt visual detalhado;
     - chama `gpt-image-1` para gerar a imagem;
     - converte para `.webp` 512x512 e envia como figurinha;
     - registra no banco `memes`:
       - id, user_jid, texto_original, prompt_final, caminho_imagem, timestamp, sucesso (bool), tipo ("texto").

2. **Criação de memes a partir de áudio**
   - Usuário envia um áudio (mensagem de voz WhatsApp).
   - Bot faz download e transcreve com Whisper (`whisper-1`).
   - Usa a transcrição como entrada para a mesma pipeline de geração acima.
   - Registra o tipo como `"audio"` na tabela `memes`.

3. **Registro e aprendizado baseado em feedback**
   - O bot já detecta reações dos usuários (ex: emoji 🎯).
   - Cada vez que uma mensagem de figurinha recebe reação “🎯”, incrementa o campo `reacoes_precisas` na tabela `memes`.
   - No futuro, esse dado servirá como base para treinar um modelo local ou ajustar prompts.
   - A tabela deve conter colunas:  
     `id, user_jid, tipo, texto_original, prompt_final, caminho_imagem, timestamp, sucesso, reacoes_precisas`.

4. **Eficiência e modularização**
   - Criar um módulo independente `plugins/memeGenerator.js` com funções:
     - `gerarPromptMeme(textoUsuario)`
     - `gerarImagemMeme(prompt)`
     - `processarAudioParaMeme(msg)`
     - `registrarMeme(dados)`
     - `registrarReacao(jid, mensagemId, emoji)`
   - Integrar no handler principal (`messageHandler.js` ou `index.js`).

5. **Banco de dados**
   - Usar SQLite local (`data/memes.sqlite`).
   - Se não existir, criar automaticamente.
   - Criar função `initMemesDB()` que executa:
     ```sql
     CREATE TABLE IF NOT EXISTS memes (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_jid TEXT,
       tipo TEXT,
       texto_original TEXT,
       prompt_final TEXT,
       caminho_imagem TEXT,
       timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
       sucesso INTEGER,
       reacoes_precisas INTEGER DEFAULT 0
     );
     ```

6. **Bibliotecas e recursos**
   - `openai` para GPT e Whisper.
   - `sharp` para conversão em WebP.
   - `node-fetch` para baixar imagens geradas.
   - `sqlite3` para persistência.
   - Integrar com o socket Baileys existente, mantendo compatibilidade.

7. **Feedback e logs**
   - Logs legíveis no console (com timestamps).
   - Mensagens no WhatsApp:
     - “🎨 Gerando ideia de meme...”
     - “🧠 Prompt criado: ...”
     - “🖼️ Enviando figurinha...”
   - Erros tratados com mensagens amigáveis.

8. **Configuração**
   - Usar `OPENAI_API_KEY` via `.env`.
   - Se faltar a chave, avisar “🚫 Nenhuma chave OpenAI configurada”.

9. **Futuro**
   - Preparar hooks para pipeline de aprendizado local:
     - exportação de `memes` com mais de 5 reações “🎯”.
     - permitir análise de performance dos prompts.

---

## Resultado esperado

- Novo módulo `plugins/memeGenerator.js` totalmente funcional.
- Integração no handler principal do bot.
- Base de dados `memes.sqlite` criada e atualizando automaticamente.
- Suporte a texto e áudio.
- Captação automática de feedback via reações 🎯.
- Código limpo, comentado, compatível com Node 18+.

---

## Referência

O projeto principal é o **Sticker-Bot** no repositório:
> https://github.com/zanardizz/sticker-bot

A arquitetura segue o estilo dos outros plugins (handlers modulares com export de funções assíncronas).

---

## Instruções para o Agente

1. Criar ou atualizar os arquivos necessários.
2. Executar migrações automáticas no SQLite.
3. Testar via mensagens simuladas `#criar ...` e áudios.
4. Confirmar que a figurinha gerada é enviada corretamente.
5. Confirmar que reações 🎯 são registradas no banco.

---

## Observações finais

- Priorizar eficiência e modularidade.
- Garantir compatibilidade com instâncias múltiplas (grupos diferentes).
- Adotar logs padronizados: `[MemeGen] <mensagem>`.
- Evitar salvar imagens fora do `/tmp` (memória volátil).
- Respeitar formato 512x512 `.webp` para stickers.

