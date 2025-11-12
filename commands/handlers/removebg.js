/**
 * Remove background command handler
 */

const fs = require('fs');
const path = require('path');
const { downloadMediaForMessage } = require('../../utils/mediaDownload');
const { safeReply } = require('../../utils/safeMessaging');
const { parseCommand, normalizeText } = require('../../utils/commandNormalizer');
const { withTyping } = require('../../utils/typingIndicator');
const { removeBackground } = require('../../services/backgroundRemoval');
const { getHashVisual, findByHashVisual, findById } = require('../../database/index.js');

const TEMP_DIR = path.resolve(__dirname, '..', '..', 'temp');

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function extractMediaId(params) {
  if (!Array.isArray(params) || params.length === 0) {
    return { mediaId: null, remaining: params };
  }

  const [first, second, ...rest] = params;
  const normalizedFirst = normalizeText(first);

  if (normalizedFirst === 'id' && second) {
    const parsed = parseInt(second, 10);
    if (!Number.isNaN(parsed)) {
      return { mediaId: parsed, remaining: rest };
    }
    return { mediaId: null, remaining: rest };
  }

  const numeric = parseInt(first, 10);
  if (!Number.isNaN(numeric)) {
    return { mediaId: numeric, remaining: [second, ...rest].filter(Boolean) };
  }

  return { mediaId: null, remaining: params };
}

async function loadBufferFromRecord(record) {
  if (!record?.file_path) {
    return null;
  }

  try {
    if (!fs.existsSync(record.file_path)) {
      console.warn('[COMMAND:removebg] Arquivo não encontrado:', record.file_path);
      return null;
    }
    return fs.readFileSync(record.file_path);
  } catch (error) {
    console.warn('[COMMAND:removebg] Falha ao ler arquivo original:', error?.message || error);
    return null;
  }
}

async function resolveMediaFromQuoted(client, message) {
  try {
    const quoted = await client.getQuotedMessage(message.id);

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

    let buffer = download.buffer;
    let record = null;

    try {
      const hash = await getHashVisual(buffer);
      if (hash) {
        record = await findByHashVisual(hash);
      }
    } catch (hashError) {
      console.warn('[COMMAND:removebg] Falha ao calcular hash visual:', hashError?.message || hashError);
    }

    if (record) {
      const storedBuffer = await loadBufferFromRecord(record);
      if (storedBuffer) {
        buffer = storedBuffer;
      }
      return {
        buffer,
        mimetype: record.mimetype || download.mimetype || mimetype || 'image/png',
        record
      };
    }

    return {
      buffer,
      mimetype: download.mimetype || mimetype || 'image/png'
    };
  } catch (error) {
    console.warn('[COMMAND:removebg] Erro ao obter mensagem respondida:', error?.message || error);
    return { error: 'quoted_fetch_failed' };
  }
}

/**
 * Handles the #removebg command (background removal)
 * @param {object} client - WhatsApp client instance
 * @param {object} message - Incoming message object
 * @param {string} chatId - Chat identifier
 * @param {object} [context] - Additional context information
 * @returns {Promise<boolean>} True if command processed
 */
async function handleRemoveBackgroundCommand(client, message, chatId, context = {}) {
  const rawCommand = message.body || message.caption || '';
  if (!rawCommand.startsWith('#')) {
    return false;
  }

  const { command, params: originalParams } = parseCommand(rawCommand);
  if (command !== '#removebg') {
    return false;
  }

  let params = Array.isArray(originalParams) ? [...originalParams] : [];
  const { mediaId } = extractMediaId(params);

  const usageMessage = 'Responda a uma figurinha ou imagem com #removebg para remover o fundo.\n' +
    'Também é possível usar #removebg ID <número> para processar itens do acervo.';

  let buffer = null;
  let mimetype = null;

  if (mediaId != null) {
    try {
      const record = await findById(mediaId);
      if (!record) {
        await safeReply(client, chatId, `Não encontrei a mídia com ID ${mediaId}.`, message.id);
        return true;
      }

      if (!record.mimetype || !record.mimetype.startsWith('image/')) {
        await safeReply(client, chatId, 'Apenas imagens podem ter o fundo removido.', message.id);
        return true;
      }

      const storedBuffer = await loadBufferFromRecord(record);
      if (!storedBuffer) {
        await safeReply(client, chatId, 'Não consegui acessar o arquivo original dessa mídia.', message.id);
        return true;
      }

      buffer = storedBuffer;
      mimetype = record.mimetype;
    } catch (error) {
      console.error('[COMMAND:removebg] Erro ao buscar mídia por ID:', error?.message || error);
      await safeReply(client, chatId, 'Erro ao buscar a mídia solicitada.', message.id);
      return true;
    }
  }

  if (!buffer && message.hasQuotedMsg) {
    const resolved = await resolveMediaFromQuoted(client, message);
    if (resolved.error) {
      await safeReply(client, chatId, 'Responda a uma figurinha ou imagem para usar #removebg.', message.id);
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
    await safeReply(client, chatId, 'Apenas imagens podem ter o fundo removido.', message.id);
    return true;
  }

  ensureTempDir();
  const cleanupPaths = [];

  try {
    await withTyping(client, chatId, async () => {
      await safeReply(client, chatId, '✂️ Removendo o fundo da imagem, aguarde...', message.id);

      const outputBuffer = await removeBackground(buffer);
      if (!Buffer.isBuffer(outputBuffer)) {
        throw new Error('invalid_output_buffer');
      }

      const filename = `removebg-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
      const filePath = path.join(TEMP_DIR, filename);

      fs.writeFileSync(filePath, outputBuffer);
      cleanupPaths.push(filePath);

      if (typeof client.sendFile !== 'function') {
        throw new Error('send_file_not_supported');
      }

      await client.sendFile(chatId, filePath, filename);
      await safeReply(client, chatId, '🪄 Fundo removido! Espero que ajude. ✨', message.id);
    });
  } catch (error) {
    if (error && error.message === 'send_file_not_supported') {
      await safeReply(client, chatId, 'Cliente não suporta envio de arquivos para #removebg.', message.id);
    } else if (error && error.message === 'invalid_output_buffer') {
      await safeReply(client, chatId, 'Não consegui gerar a imagem com fundo transparente.', message.id);
    } else {
      console.error('[COMMAND:removebg] Erro ao remover fundo:', error?.message || error);
      await safeReply(client, chatId, 'Não consegui remover o fundo agora. Tente novamente mais tarde.', message.id);
    }
  } finally {
    for (const tempPath of cleanupPaths) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanupError) {
        console.warn('[COMMAND:removebg] Falha ao limpar arquivo temporário:', cleanupError?.message || cleanupError);
      }
    }
  }

  return true;
}

module.exports = { handleRemoveBackgroundCommand };
