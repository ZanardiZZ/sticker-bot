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
const { saveMedia, updateMediaTags, findById, getTagsForMedia, getHashVisual, getMD5 } = require('../../database');
const { cleanDescriptionTags, renderInfoMessage } = require('../../utils/messageUtils');
const { generateResponseMessage } = require('../../utils/responseMessage');
const sharp = require('sharp');
const { getAiAnnotations } = require('../../services/ai');

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

async function sendStatusMessage(client, chatId, text) {
  if (!text) return;
  try {
    if (typeof client.sendText === 'function') {
      await client.sendText(chatId, text);
    } else {
      await safeReply(client, chatId, text);
    }
  } catch (error) {
    console.warn('[MemeGen] status - falha ao enviar mensagem:', error?.message || error);
  }
}

function generateSuggestedTags(sourceText) {
  if (!sourceText) return [];
  const normalized = sourceText
    .toLowerCase()
    .replace(/[^a-zà-ú0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const unique = Array.from(new Set(normalized));
  return unique
    .filter((word) => word.length >= 4)
    .slice(0, 5);
}

function normalizeTag(tag) {
  if (!tag) return '';
  return String(tag)
    .toLowerCase()
    .replace(/[^a-z0-9à-ú\s]/gi, ' ')
    .trim()
    .replace(/\s+/g, '');
}

function stripCaptionDirectives(text) {
  if (!text || typeof text !== 'string') return text || '';
  let result = text;
  const patterns = [
    /texto\s+em\s+cima(?:\s+escrito)?[\s,:;\-]*["“']?([^"“',.;]+)/gi,
    /texto\s+no\s+topo(?:\s+escrito)?[\s,:;\-]*["“']?([^"“',.;]+)/gi,
    /texto\s+superior(?:\s+escrito)?[\s,:;\-]*["“']?([^"“',.;]+)/gi,
    /texto\s+em\s+baixo(?:\s+escrito)?[\s,:;\-]*["“']?([^"“',.;]+)/gi,
    /texto\s+na\s+parte\s+de\s+baixo(?:\s+escrito)?[\s,:;\-]*["“']?([^"“',.;]+)/gi,
    /texto\s+inferior(?:\s+escrito)?[\s,:;\-]*["“']?([^"“',.;]+)/gi
  ];
  patterns.forEach((regex) => {
    result = result.replace(regex, '').trim();
  });
  return result.replace(/\s{2,}/g, ' ').trim();
}

function buildPromptSeed(rawText, captions) {
  const baseText = stripCaptionDirectives(rawText || '');
  const hasCaptions = captions && (captions.topText || captions.bottomText);
  const instruction = hasCaptions
    ? 'Importante: não inclua texto ou legendas na arte. Deixe espaço limpo para inserirmos texto depois.'
    : '';
  const parts = [baseText, instruction].map((part) => (part || '').trim()).filter(Boolean);
  return parts.join('\n');
}

function buildMediaDescription(originalText, promptText) {
  const prompt = typeof promptText === 'string' ? promptText.trim() : '';
  const sentences = prompt.split(/(?<=[.!?])\s+/).filter(Boolean);
  let base = sentences.length ? sentences[0] : '';
  if (!base && originalText) {
    base = String(originalText).trim();
  }
  if (base.length > 220) {
    base = `${base.slice(0, 217)}...`;
  }
  const cleanOriginal = typeof originalText === 'string' ? originalText.trim() : '';
  if (cleanOriginal) {
    base = base ? `${base} [Texto: ${cleanOriginal}]` : `[Texto: ${cleanOriginal}]`;
  }
  return base;
}

function extractMessageId(sendResult) {
  if (!sendResult) return null;
  if (typeof sendResult === 'string') return sendResult;
  if (typeof sendResult === 'object') {
    if (typeof sendResult.messageId === 'string') return sendResult.messageId;
    if (typeof sendResult.id === 'string') return sendResult.id;
    if (sendResult.key && typeof sendResult.key.id === 'string') return sendResult.key.id;
    if (sendResult.key && sendResult.key.id && typeof sendResult.key.id === 'object' && sendResult.key.id.id) {
      return sendResult.key.id.id;
    }
  }
  return null;
}

function splitCaptionLines(text) {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  const maxChars = 18;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeForSvg(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createCaptionSvg(width, height, topText, bottomText) {
  const topLines = splitCaptionLines(topText).map((line) => line.toUpperCase());
  const bottomLines = splitCaptionLines(bottomText).map((line) => line.toUpperCase());
  if (!topLines.length && !bottomLines.length) return null;

  let fontSize = 56;
  const totalLines = topLines.length + bottomLines.length;
  const maxLineLength = Math.max(
    ...[...topLines, ...bottomLines].map((line) => (line ? line.length : 0)),
    1
  );

  while (fontSize > 24) {
    const margin = Math.max(40, fontSize * 0.9);
    const lineHeight = fontSize * 1.1;
    const availableHeight = height - 2 * margin;
    const neededHeight = totalLines * lineHeight;
    const approxLineWidth = maxLineLength * fontSize * 0.65;
    if (neededHeight <= availableHeight && approxLineWidth <= width - 2 * margin) {
      break;
    }
    fontSize -= 4;
  }

  const margin = Math.max(40, fontSize * 0.9);
  const lineHeight = fontSize * 1.1;
  const strokeWidth = Math.max(8, Math.round(fontSize * 0.18));
  const topMargin = topLines.length ? margin : fontSize * 0.6;
  const bottomMargin = bottomLines.length ? margin : fontSize * 0.6;
  const topSvg = topLines
    .map((line, idx) => {
      const y = topMargin + fontSize / 2 + idx * lineHeight;
      return `<text x="${width / 2}\" y=\"${y}\" font-size="${fontSize}\" class=\"caption\">${escapeForSvg(line)}</text>`;
    })
    .join('');
  const bottomSvg = bottomLines
    .map((line, idx) => {
      const y = height - bottomMargin - fontSize / 2 - (bottomLines.length - 1 - idx) * lineHeight;
      return `<text x="${width / 2}\" y=\"${y}\" font-size="${fontSize}\" class=\"caption\">${escapeForSvg(line)}</text>`;
    })
    .join('');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><style>.caption{font-family:'Impact','Arial Black',sans-serif;fill:#fff;stroke:#000;stroke-width:${strokeWidth};paint-order:stroke;letter-spacing:2;text-transform:uppercase;text-anchor:middle;dominant-baseline:middle;}</style>${topSvg}${bottomSvg}</svg>`;
}

function parseCaptionTexts(text) {
  if (!text || typeof text !== 'string') {
    return { topText: '', bottomText: '' };
  }
  const extract = (patterns) => {
    for (const pattern of patterns) {
      const regex = new RegExp(`${pattern}(?:\s+escrito)?[\s,:;\-]*["“']?([^"“',.;]+)`, 'i');
      const match = text.match(regex);
      if (match && match[1]) {
        return match[1].trim().toUpperCase();
      }
    }
    return '';
  };
  const topText = extract(['texto\s+em\s+cima', 'texto\s+no\s+topo', 'texto\s+superior']);
  const bottomText = extract(['texto\s+em\s+baixo', 'texto\s+na\s+parte\s+de\s+baixo', 'texto\s+inferior']);
  return { topText, bottomText };
}

async function applyCaptionsToSticker(imagePath, { topText, bottomText }) {
  if (!topText && !bottomText) return;
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width || 512;
  const height = metadata.height || 512;
  const svg = createCaptionSvg(width, height, topText, bottomText);
  if (!svg) return;
  const buffer = await sharp(imagePath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 88 })
    .toBuffer();
  await fsp.writeFile(imagePath, buffer);
}

async function enviarFigurinhaGerada(client, chatId, webpPath) {
  if (typeof client.sendImageAsSticker === 'function') {
    try {
      const result = await client.sendImageAsSticker(chatId, webpPath, {
        pack: PACK_NAME,
        author: AUTHOR_NAME
      });
      const messageId = extractMessageId(result);
      return messageId || null;
    } catch (error) {
      console.warn('[MemeGen] envio - sendImageAsSticker falhou:', error.message);
    }
  }

  try {
    const webpBuffer = await fsp.readFile(webpPath);
    const dataUrl = `data:image/webp;base64,${webpBuffer.toString('base64')}`;
    if (typeof client.sendRawWebpAsSticker === 'function') {
      try {
        const result = await client.sendRawWebpAsSticker(chatId, dataUrl, {
          pack: PACK_NAME,
          author: AUTHOR_NAME
        });
        const messageId = extractMessageId(result);
        return messageId || null;
      } catch (rawError) {
        console.warn('[MemeGen] envio - sendRawWebpAsSticker falhou:', rawError.message);
      }
    }
  } catch (bufferError) {
    console.warn('[MemeGen] envio - falha ao ler figurinha gerada:', bufferError?.message || bufferError);
  }

  console.error('[MemeGen] envio - nenhuma estratégia de sticker funcionou.');
  return null;
}

async function handleCriarMemeCommand(client, message, chatId, params = '') {
  if (!process.env.OPENAI_API_KEY_MEMECREATOR) {
    await sendStatusMessage(client, chatId, '🚫 Nenhuma chave OpenAI configurada para criação de memes.');
    return true;
  }

  try {
    await initMemesDB();
  } catch (error) {
    console.error('[MemeGen] init - falha ao iniciar DB:', error.message);
    await sendStatusMessage(client, chatId, 'Erro ao preparar banco de memes.');
    return true;
  }

  let tipo = 'texto';
  let textoOriginal = normalizeCommandParams(params);
  let promptInfo = null;
  let imagemInfo = null;
  let captions = parseCaptionTexts(textoOriginal);
  const senderId = message.sender?.id || message.author || message.from;
  const groupId = chatId.endsWith('@g.us') ? chatId : null;

  try {
    await sendStatusMessage(client, chatId, '🎨 Gerando ideia de meme...');

    if (!textoOriginal && message.hasQuotedMsg) {
      try {
        const quoted = await client.getQuotedMessage(message.id);
        if (quoted?.isMedia && (quoted.mimetype?.startsWith('audio/') || quoted.type === 'ptt')) {
          tipo = 'audio';
          const audioResult = await withTyping(client, chatId, async () => processarAudioParaMeme(client, quoted));
          textoOriginal = audioResult.textoOriginal;
          promptInfo = audioResult.promptInfo;
          imagemInfo = audioResult.imagemInfo;
          captions = parseCaptionTexts(textoOriginal);
        } else if (quoted?.body && quoted.body.trim()) {
          textoOriginal = quoted.body.trim();
          captions = parseCaptionTexts(textoOriginal);
        }
      } catch (error) {
        console.warn('[MemeGen] quoted - falha ao analisar mensagem citada:', error.message);
      }
    }

    if (!textoOriginal) {
      await sendStatusMessage(client, chatId, 'Forneça uma descrição ou responda a um áudio para gerar o meme.');
      return true;
    }

    if (!promptInfo) {
      const promptSeed = buildPromptSeed(textoOriginal, captions) || textoOriginal;
      promptInfo = await withTyping(client, chatId, async () => gerarPromptMeme(promptSeed));
    }

    const gptCaptions = {
      topText: promptInfo.topText || '',
      bottomText: promptInfo.bottomText || ''
    };
    captions = {
      topText: gptCaptions.topText || captions.topText,
      bottomText: gptCaptions.bottomText || captions.bottomText
    };

    const display = formatPromptForDisplay(promptInfo.prompt);
    await sendStatusMessage(client, chatId, `🧠 Prompt criado: ${display}`);

    if (!imagemInfo) {
      imagemInfo = await withTyping(client, chatId, async () => gerarImagemMeme(promptInfo.prompt, tipo));
    }

    await sendStatusMessage(client, chatId, '🖼️ Enviando figurinha...');

    if (captions.topText || captions.bottomText) {
      try {
        await applyCaptionsToSticker(imagemInfo.webpPath, captions);
      } catch (captionError) {
        console.warn('[MemeGen] legenda - falha ao aplicar texto na figurinha:', captionError?.message || captionError);
      }
    }

    const mensagemId = await enviarFigurinhaGerada(client, chatId, imagemInfo.webpPath);

    const memeId = await registrarMeme({
      userJid: senderId,
      tipo,
      textoOriginal,
      promptFinal: promptInfo.prompt,
      caminhoImagem: imagemInfo.webpPath,
      sucesso: 1,
      mensagemId: mensagemId || null
    });

    const tagsSugeridas = generateSuggestedTags(`${textoOriginal || ''} ${promptInfo.prompt || ''}`);
    let normalizedTags = Array.from(new Set(tagsSugeridas.map((tag) => normalizeTag(tag)))).filter(Boolean).slice(0, 5);
    const captionTags = [captions.topText, captions.bottomText].map((tag) => normalizeTag(tag)).filter(Boolean);
    normalizedTags = Array.from(new Set([...captionTags, ...normalizedTags]));
    const fallbackTags = normalizedTags.map((tag) => (tag ? `#${tag}` : null)).filter(Boolean);

    try {
      const fileBuffer = await fsp.readFile(imagemInfo.webpPath);
      const hashMd5 = getMD5(fileBuffer);
      const hashVisual = await getHashVisual(fileBuffer);

      let annotationDescription = '';
      let annotationTags = [];
      let annotationText = '';
      try {
        const annotations = await getAiAnnotations(fileBuffer);
        if (annotations) {
          annotationDescription = typeof annotations.description === 'string' ? annotations.description.trim() : '';
          annotationTags = Array.isArray(annotations.tags) ? annotations.tags.filter(Boolean) : [];
          annotationText = typeof annotations.text === 'string' ? annotations.text.trim() : '';
        }
      } catch (annotationError) {
        console.warn('[MemeGen] anotacao - falha ao analisar imagem gerada:', annotationError?.message || annotationError);
      }
      if (!annotationText && (captions.topText || captions.bottomText)) {
        annotationText = [captions.topText, captions.bottomText].filter(Boolean).join(' | ');
      }

      let descriptionForDb = annotationDescription || buildMediaDescription(textoOriginal, promptInfo.prompt);
      if (annotationText) {
        descriptionForDb = descriptionForDb
          ? `${descriptionForDb} [Texto: ${annotationText}]`
          : `[Texto: ${annotationText}]`;
      }
      if (!descriptionForDb && textoOriginal) {
        descriptionForDb = String(textoOriginal).trim();
      }

      const tagsSource = annotationTags.length ? annotationTags : fallbackTags;
      let cleaned = cleanDescriptionTags(descriptionForDb, tagsSource);
      if ((!cleaned.tags || cleaned.tags.length === 0) && fallbackTags.length) {
        cleaned = cleanDescriptionTags(descriptionForDb, fallbackTags);
      }
      const tagsStringForDb = cleaned.tags && cleaned.tags.length ? cleaned.tags.join(',') : '';

      const mediaId = await saveMedia({
        chatId,
        groupId,
        senderId,
        filePath: imagemInfo.webpPath,
        mimetype: 'image/webp',
        timestamp: Date.now(),
        description: cleaned.description,
        hashVisual,
        hashMd5,
        nsfw: 0,
        extractedText: annotationText || null
      });

      if (tagsStringForDb) {
        await updateMediaTags(mediaId, tagsStringForDb);
      }

      const savedMedia = await findById(mediaId);
      const mediaTags = await getTagsForMedia(mediaId);
      const finalClean = cleanDescriptionTags(savedMedia?.description, mediaTags);
      const infoMessage = renderInfoMessage({
        description: finalClean.description,
        tags: finalClean.tags,
        id: savedMedia?.id || mediaId
      });
      const finalMessage = `${generateResponseMessage('image/webp', false)}${infoMessage}`;
      await sendStatusMessage(client, chatId, finalMessage);
    } catch (storageError) {
      console.warn('[MemeGen] armazenamento - falha ao sincronizar com banco principal:', storageError?.message || storageError);
      await sendStatusMessage(client, chatId, '⚠️ Meme gerado, mas não foi possível arquivar automaticamente.');
    }

    return true;
  } catch (error) {
    console.error('[MemeGen] criar - erro:', error.message);
    await sendStatusMessage(client, chatId, 'Falha ao criar o meme.');
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
