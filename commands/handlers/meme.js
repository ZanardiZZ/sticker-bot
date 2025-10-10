const fsp = require('fs/promises');

const { safeReply } = require('../../utils/safeMessaging');
const { withTyping } = require('../../utils/typingIndicator');
const {
  initMemesDB,
  gerarPromptMeme,
  gerarImagemMeme,
  processarAudioParaMeme,
  registrarMeme,
  exportarMemesTop,
  gerarPromptTreinavel
} = require('../../plugins/memeGenerator');
const { PACK_NAME, AUTHOR_NAME } = require('../../config/stickers');

function formatPromptForDisplay(prompt) {
  const normalized = typeof prompt === 'string' ? prompt : String(prompt || '');
  const trimmed = normalized.trim();
  if (trimmed.length <= 300) return trimmed;
  return `${trimmed.slice(0, 297)}...`;
}

function normalizeCommandParams(params) {
  if (Array.isArray(params)) {
    return params
      .map((item) => (typeof item === 'string' ? item : String(item || '')))
      .join(' ')
      .trim();
  }
  if (typeof params === 'string') {
    return params.trim();
  }
  if (params == null) {
    return '';
  }
  return String(params).trim();
}

async function enviarFigurinhaGerada(client, chatId, webpPath) {
  const webpBuffer = await fsp.readFile(webpPath);
  const dataUrl = `data:image/webp;base64,${webpBuffer.toString('base64')}`;
  if (typeof client.sendRawWebpAsSticker === 'function') {
    try {
      return await client.sendRawWebpAsSticker(chatId, dataUrl, {
        pack: PACK_NAME,
        author: AUTHOR_NAME
      });
    } catch (error) {
      console.warn('[MemeGen] envio - sendRawWebpAsSticker falhou:', error.message);
    }
  }
  if (typeof client.sendImageAsSticker === 'function') {
    try {
      return await client.sendImageAsSticker(chatId, webpPath, {
        pack: PACK_NAME,
        author: AUTHOR_NAME
      });
    } catch (error) {
      console.warn('[MemeGen] envio - sendImageAsSticker falhou:', error.message);
    }
  }
  try {
    await client.sendFile(chatId, webpPath, 'meme.webp');
  } catch (error) {
    console.error('[MemeGen] envio - fallback sendFile falhou:', error.message);
  }
  return null;
}

async function handleCriarMemeCommand(client, message, chatId, params = '') {
  if (!process.env.OPENAI_API_KEY_MEMECREATOR) {
    await safeReply(client, chatId, '🚫 Nenhuma chave OpenAI configurada para criação de memes.', message);
    return true;
  }

  try {
    await initMemesDB();
  } catch (error) {
    console.error('[MemeGen] init - falha ao iniciar DB:', error.message);
    await safeReply(client, chatId, 'Erro ao preparar banco de memes.', message);
    return true;
  }

  let tipo = 'texto';
  let textoOriginal = normalizeCommandParams(params);
  let promptInfo = null;
  let imagemInfo = null;

  try {
    await safeReply(client, chatId, '🎨 Gerando ideia de meme...', message);

    if (!textoOriginal && message.hasQuotedMsg) {
      try {
        const quoted = await client.getQuotedMessage(message.id);
        if (quoted?.isMedia && (quoted.mimetype?.startsWith('audio/') || quoted.type === 'ptt')) {
          tipo = 'audio';
          const audioResult = await withTyping(client, chatId, async () => processarAudioParaMeme(client, quoted));
          textoOriginal = audioResult.textoOriginal;
          promptInfo = audioResult.promptInfo;
          imagemInfo = audioResult.imagemInfo;
        } else if (quoted?.body && quoted.body.trim()) {
          textoOriginal = quoted.body.trim();
        }
      } catch (error) {
        console.warn('[MemeGen] quoted - falha ao analisar mensagem citada:', error.message);
      }
    }

    if (!textoOriginal) {
      await safeReply(client, chatId, 'Forneça uma descrição ou responda a um áudio para gerar o meme.', message);
      return true;
    }

    if (!promptInfo) {
      promptInfo = await withTyping(client, chatId, async () => gerarPromptMeme(textoOriginal));
    }

    const display = formatPromptForDisplay(promptInfo.prompt);
    await safeReply(client, chatId, `🧠 Prompt criado: ${display}`, message);

    if (!imagemInfo) {
      imagemInfo = await withTyping(client, chatId, async () => gerarImagemMeme(promptInfo.prompt, tipo));
    }

    await safeReply(client, chatId, '🖼️ Enviando figurinha...', message);

    const mensagemId = await enviarFigurinhaGerada(client, chatId, imagemInfo.webpPath);

    await registrarMeme({
      userJid: message.sender?.id || message.author || message.from,
      tipo,
      textoOriginal,
      promptFinal: promptInfo.prompt,
      caminhoImagem: imagemInfo.webpPath,
      sucesso: 1,
      mensagemId: mensagemId || null
    });

    return true;
  } catch (error) {
    console.error('[MemeGen] criar - erro:', error.message);
    await safeReply(client, chatId, 'Falha ao criar o meme.', message);
    await registrarMeme({
      userJid: message.sender?.id || message.author || message.from,
      tipo,
      textoOriginal,
      promptFinal: promptInfo ? promptInfo.prompt : null,
      caminhoImagem: imagemInfo ? imagemInfo.webpPath : null,
      sucesso: 0,
      mensagemId: null
    });
    return true;
  }
}

async function handleExportarMemesCommand(client, message, chatId) {
  try {
    await initMemesDB();
    const { quantidade: totalExportados, caminho: caminhoExport } = await exportarMemesTop();
    const { quantidade: totalDataset, caminho: caminhoDataset } = await gerarPromptTreinavel();
    await safeReply(
      client,
      chatId,
      `Exportação concluída!\nTop memes: ${totalExportados} → ${caminhoExport}\nDataset de prompts: ${totalDataset} → ${caminhoDataset}`,
      message
    );
    return true;
  } catch (error) {
    console.error('[MemeGen] export - erro:', error.message);
    await safeReply(client, chatId, 'Falha ao exportar memes top.', message);
    return true;
  }
}

module.exports = {
  handleCriarMemeCommand,
  handleExportarMemesCommand
};
