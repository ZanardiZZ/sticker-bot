/**
 * Foto HD command handler
 */

const fs = require('fs');
const path = require('path');
const { downloadMediaForMessage } = require('../../utils/mediaDownload');
const { safeReply } = require('../../utils/safeMessaging');
const { parseCommand, normalizeText } = require('../../utils/commandNormalizer');
const { withTyping } = require('../../utils/typingIndicator');
const { enhanceImage } = require('../../services/imageEnhancer');
const sharp = require('sharp');
const { getHashVisual, findByHashVisual } = require('../../database/index.js');

const TEMP_DIR = path.resolve(__dirname, '..', '..', 'temp');

function mimetypeToFormat(mimetype) {
  if (typeof mimetype !== 'string') {
    return undefined;
  }

  const clean = mimetype.split(';')[0].trim().toLowerCase();
  if (!clean.startsWith('image/')) {
    return undefined;
  }

  const format = clean.slice('image/'.length);
  if (format === 'jpeg' || format === 'pjpeg') {
    return 'jpeg';
  }

  return format;
}

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}


function getOutputExtension(info, fallbackMime) {
  if (info?.format) {
    switch (info.format.toLowerCase()) {
      case 'jpeg':
      case 'jpg':
        return 'jpg';
      case 'png':
      case 'webp':
      case 'tiff':
      case 'avif':
      case 'gif':
      case 'bmp':
        return info.format.toLowerCase();
      default:
        break;
    }
  }

  if (typeof fallbackMime === 'string') {
    if (fallbackMime.includes('png')) return 'png';
    if (fallbackMime.includes('jpeg')) return 'jpg';
    if (fallbackMime.includes('webp')) return 'webp';
  }

  return 'png';
}

async function loadBufferFromRecord(record) {
  if (!record || !record.file_path) {
    return null;
  }

  try {
    if (!fs.existsSync(record.file_path)) {
      console.warn('[COMMAND:fotohd] Arquivo original não encontrado:', record.file_path);
      return null;
    }

    return fs.readFileSync(record.file_path);
  } catch (error) {
    console.warn('[COMMAND:fotohd] Falha ao ler arquivo original:', error?.message || error);
    return null;
  }
}

async function resolveMediaFromQuoted(client, message) {
  try {
    // WPP/bridge payloads may expose the native ID only at key.id.
    const messageId = message?.id || message?.key?.id || message?.msgId || message?.messageId;
    const quoted = await client.getQuotedMessage(messageId);

    if (!quoted || !quoted.isMedia) {
      return { error: 'quoted_not_media' };
    }

    const mimetype = quoted.mimetype || quoted.mediaType || '';
    if (typeof mimetype === 'string' && !mimetype.startsWith('image/')) {
      return { error: 'quoted_not_image' };
    }

    const download = await downloadMediaForMessage(client, quoted);
    if (!download?.buffer) {
      return { error: 'download_failed' };
    }

    let record = null;
    try {
      const hash = await getHashVisual(download.buffer);
      if (hash) {
        record = await findByHashVisual(hash);
      }
    } catch (hashError) {
      console.warn('[COMMAND:fotohd] Falha ao calcular hash visual:', hashError?.message || hashError);
    }

    let buffer = download.buffer;
    if (record) {
      const storedBuffer = await loadBufferFromRecord(record);
      if (storedBuffer) {
        buffer = storedBuffer;
      }
    }

    return {
      buffer,
      mimetype: download.mimetype || quoted.mimetype || 'image/png',
      record
    };
  } catch (error) {
    console.warn('[COMMAND:fotohd] Erro ao acessar mensagem respondida:', error?.message || error);
    return { error: 'quoted_fetch_failed' };
  }
}

/**
 * Handles the #fotohd command (enhance image resolution)
 * @param {object} client - WhatsApp client instance
 * @param {object} message - Incoming message object
 * @param {string} chatId - Chat identifier
 * @param {object} [context] - Additional context information
 * @returns {Promise<boolean>} True if command processed
 */
async function handleFotoHdCommand(client, message, chatId, context = {}) {
  const rawCommand = message.body || message.caption || '';
  if (!rawCommand.startsWith('#')) {
    return false;
  }

  const { command, params: originalParams } = parseCommand(rawCommand);
  if (command !== '#fotohd') {
    return false;
  }


  const params = Array.isArray(originalParams) ? originalParams : [];
  if (params.length > 0) {
    await safeReply(client, chatId, 'Use somente #fotohd, respondendo diretamente a uma imagem ou figurinha.', message.id);
    return true;
  }

  const factor = 2;
  const usageMessage = 'Responda a uma figurinha ou imagem com #fotohd para ampliar em 2x.';

  let buffer = null;
  let mimetype = null;


  // Some WPPConnect payloads omit hasQuotedMsg even though the incoming
  // message is a reply. The bridge can recover the quoted object from the
  // current message ID and its cached quotedMsgId, so do not gate this path
  // solely on the boolean flag.
  if (!buffer && (message.hasQuotedMsg || message.id || message.key?.id || message.msgId || message.messageId)) {
    const resolved = await resolveMediaFromQuoted(client, message);
    if (resolved.error) {
      await safeReply(client, chatId, 'Responda a uma figurinha ou imagem válida para usar #fotohd.', message.id);
      return true;
    }
    buffer = resolved.buffer;
    mimetype = resolved.mimetype;
  }

  if (!buffer) {
    await safeReply(client, chatId, usageMessage, message.id);
    return true;
  }

  if (!mimetype || !mimetype.startsWith('image/')) {
    await safeReply(client, chatId, 'Apenas imagens podem ser ampliadas no momento.', message.id);
    return true;
  }

  const cleanupPaths = [];

  try {
    await withTyping(client, chatId, async () => {
      await safeReply(client, chatId, '🔄 Melhorando a qualidade da imagem, aguarde...', message.id);

      const animatedMetadata = await sharp(buffer, { animated: true }).metadata();

      if (Number(animatedMetadata?.pages || 1) > 1) {

        const error = new Error('animated_fotohd_pending');

        error.code = 'ANIMATED_FOTOHD_PENDING_CHAINNER';

        throw error;

      }


      const enhanced = await enhanceImage(buffer, { factor, format: mimetypeToFormat(mimetype) });
      if (!enhanced || !Buffer.isBuffer(enhanced.buffer)) {
        throw new Error('enhancer_invalid_result');
      }

      ensureTempDir();
      const extension = getOutputExtension(enhanced.info, mimetype);
      const filename = `fotohd-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      const filePath = path.join(TEMP_DIR, filename);

      fs.writeFileSync(filePath, enhanced.buffer);
      cleanupPaths.push(filePath);

      if (typeof client.sendFile === 'function') {
        await client.sendFile(chatId, filePath, filename);
      } else {
        throw new Error('send_file_not_supported');
      }

      const dims = enhanced.info?.width && enhanced.info?.height
        ? ` (${enhanced.info.width}×${enhanced.info.height})`
        : '';

      const engineLabel = enhanced.info?.engine === 'ai'
        ? 'com IA'
        : 'com interpolação Lanczos3';
      const fallbackNotice = enhanced.info?.engine === 'ai'
        ? ''
        : '\n⚠️ Configure REAL_ESRGAN_BIN para habilitar o modo IA.';

      await safeReply(
        client,
        chatId,
        `✨ Pronto! Ampliei a imagem em ${factor}x${dims} ${engineLabel}.${fallbackNotice}`.trim(),
        message.id
      );
    });
  } catch (error) {
    if (error && error.message === 'send_file_not_supported') {
      await safeReply(client, chatId, 'Cliente não suporta envio de arquivos para #fotohd.', message.id);
    } else if (error && error.code === 'ANIMATED_FOTOHD_PENDING_CHAINNER') {
      await safeReply(client, chatId, 'GIFs e figurinhas animadas ainda estão em preparação para upscale quadro a quadro com ChaiNNer. Imagens estáticas já usam Real-ESRGAN no ai-lxc.', message.id);
    } else {
      console.error('[COMMAND:fotohd] Erro ao aprimorar imagem:', error?.message || error);
      await safeReply(client, chatId, 'Não consegui melhorar esta imagem agora. Tente novamente mais tarde.', message.id);
    }
  } finally {
    for (const tempPath of cleanupPaths) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanupError) {
        console.warn('[COMMAND:fotohd] Falha ao limpar arquivo temporário:', cleanupError?.message || cleanupError);
      }
    }
  }

  return true;
}

module.exports = { handleFotoHdCommand };
