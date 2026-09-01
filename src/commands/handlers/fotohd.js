/** Foto HD command handler: Real-ESRGAN CT153 with bounded queue. */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { promisify } = require('util');
const { execFile } = require('child_process');
const execFileAsync = promisify(execFile);
const { downloadMediaForMessage } = require('../../utils/mediaDownload');
const { safeReply } = require('../../utils/safeMessaging');
const { parseCommand } = require('../../utils/commandNormalizer');
const { withTyping } = require('../../utils/typingIndicator');
const { enhanceImage } = require('../../services/imageEnhancer');
const { createRealEsrganHttpClient } = require('../../services/realEsrganClient');
const { fotoHdQueue, formatDuration } = require('../../services/fotoHdQueue');
const { getHashVisual, findByHashVisual } = require('../../database/index.js');

const TEMP_DIR = path.resolve(__dirname, '..', '..', 'temp');

async function loadBufferFromRecord(record) {
  if (!record?.file_path || !fs.existsSync(record.file_path)) return null;
  try { return fs.readFileSync(record.file_path); } catch { return null; }
}

async function resolveMediaFromQuoted(client, message) {
  try {
    const messageId = message?.id || message?.key?.id || message?.msgId || message?.messageId;
    const quoted = await client.getQuotedMessage(messageId);
    if (!quoted || !quoted.isMedia) return { error: 'quoted_not_media' };
    const mimetype = quoted.mimetype || quoted.mediaType || '';
    if (typeof mimetype === 'string' && !mimetype.startsWith('image/')) return { error: 'quoted_not_image' };
    const download = await downloadMediaForMessage(client, quoted);
    if (!download?.buffer) return { error: 'download_failed' };
    let buffer = download.buffer;
    try {
      const hash = await getHashVisual(buffer);
      const record = hash ? await findByHashVisual(hash) : null;
      const stored = await loadBufferFromRecord(record);
      if (stored) buffer = stored;
    } catch (error) {
      console.warn('[COMMAND:fotohd] hash lookup failed:', error?.message || error);
    }
    return { buffer, mimetype: download.mimetype || quoted.mimetype || 'image/png' };
  } catch (error) {
    console.warn('[COMMAND:fotohd] quoted media failed:', error?.message || error);
    return { error: 'quoted_fetch_failed' };
  }
}

function ensureTempDir() { fs.mkdirSync(TEMP_DIR, { recursive: true }); }

async function convertAnimatedWebpToMp4(inputPath, outputPath, durations = []) {
  const frameDir = `${outputPath}.frames`;
  fs.mkdirSync(frameDir, { recursive: true });
  try {
    const metadata = await sharp(inputPath, { animated: true }).metadata();
    const pages = Number(metadata.pages || 1);
    const decoded = await sharp(inputPath, { animated: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = Number(decoded.info.width || metadata.width || 1);
    const height = Number(metadata.pageHeight || Math.floor(decoded.info.height / pages) || 1);
    const channels = Number(decoded.info.channels || 4);
    const frameBytes = width * height * channels;
    const concatLines = [];
    for (let index = 0; index < pages; index += 1) {
      const framePath = path.join(frameDir, `frame-${String(index).padStart(5, '0')}.png`);
      const frameStart = index * frameBytes;
      const frameBuffer = decoded.data.subarray(frameStart, frameStart + frameBytes);
      await sharp(frameBuffer, { raw: { width, height, channels } })
        .png()
        .toFile(framePath);
      concatLines.push(`file '${framePath.replaceAll("'", "'\\\\''")}'`);
      const delayMs = Number(durations[index] || 100);
      concatLines.push(`duration ${Math.max(0.01, delayMs / 1000)}`);
    }
    const concatPath = path.join(frameDir, 'frames.ffconcat');
    fs.writeFileSync(concatPath, concatLines.join(String.fromCharCode(10)) + String.fromCharCode(10));
    await execFileAsync('/usr/bin/ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0',
      '-i', concatPath, '-fps_mode', 'vfr', '-vf', 'format=yuv420p', '-c:v', 'libx264',
      '-movflags', '+faststart', outputPath
    ], { timeout: 120000 });
    const stat = fs.statSync(outputPath);
    if (!stat.size) throw new Error('animated_video_empty');
  } finally {
    fs.rmSync(frameDir, { recursive: true, force: true });
  }
}

function secondsForJob(metadata) {
  const frames = Number(metadata.pages || 1);
  const width = Number(metadata.width || 1);
  const height = Number(metadata.pageHeight || metadata.height || 1);
  return { frames, width, height, seconds: fotoHdQueue.estimate(frames, width, height) };
}

async function sendResult(client, chatId, message, result) {
  ensureTempDir();
  const filename = `fotohd-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
  const webpPath = path.join(TEMP_DIR, filename);
  const frames = Number(result.info?.frames || 1);
  const dims = result.info?.width && result.info?.height ? ` (${result.info.width}×${result.info.height})` : '';
  let sendPath = webpPath;
  let sendFilename = filename;
  fs.writeFileSync(webpPath, result.buffer);
  try {
    if (frames > 1) {
      sendFilename = filename.replace(/\.webp$/i, '.mp4');
      sendPath = path.join(TEMP_DIR, sendFilename);
      await convertAnimatedWebpToMp4(webpPath, sendPath, result.info?.durations);
    }
    if (typeof client.sendFile !== 'function') throw new Error('send_file_not_supported');
    if (frames > 1) {
      await client.sendFile(chatId, sendPath, sendFilename, '', undefined, false, false, false, false, false, {
        mimetype: 'video/mp4', asDocument: false
      });
    } else {
      await client.sendFile(chatId, sendPath, sendFilename);
    }
    await safeReply(client, chatId, `✨ Pronto! Ampliei a imagem em 2x${dims}${frames > 1 ? `, preservando ${frames} frames em vídeo` : ''} com Real-ESRGAN na GPU.`, message.id);
  } finally {
    for (const temporaryPath of [webpPath, sendPath]) {
      try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (error) {
        console.warn('[COMMAND:fotohd] temp cleanup failed:', error?.message || error);
      }
    }
  }
}

async function handleFotoHdCommand(client, message, chatId) {
  const rawCommand = message.body || message.caption || '';
  if (!rawCommand.startsWith('#')) return false;
  const { command, params: originalParams } = parseCommand(rawCommand);
  if (command !== '#fotohd') return false;
  const params = Array.isArray(originalParams) ? originalParams : [];
  if (params.length) {
    await safeReply(client, chatId, 'Use somente #fotohd, respondendo diretamente a uma imagem ou figurinha.', message.id);
    return true;
  }

  const resolved = await resolveMediaFromQuoted(client, message);
  if (resolved.error) {
    await safeReply(client, chatId, 'Responda a uma figurinha ou imagem válida para usar #fotohd.', message.id);
    return true;
  }
  if (!resolved.mimetype?.startsWith('image/')) {
    await safeReply(client, chatId, 'Apenas imagens podem ser ampliadas com #fotohd.', message.id);
    return true;
  }

  let metadata;
  try {
    metadata = await sharp(resolved.buffer, { animated: true }).metadata();
  } catch {
    await safeReply(client, chatId, 'Não consegui ler esta imagem para o upscale.', message.id);
    return true;
  }
  const job = secondsForJob(metadata);
  const inputBuffer = resolved.buffer;
  let queued;
  try {
    const run = async () => {
      let processingBuffer = inputBuffer;
      if (job.frames > 1) {
        const { normalizeAnimatedWebpCanvas } = require('../../bot/stickers');
        processingBuffer = await normalizeAnimatedWebpCanvas(processingBuffer);
        const normalizedMetadata = await sharp(processingBuffer, { animated: true }).metadata();
        console.log('[COMMAND:fotohd] animated canvas normalized:', {
          pages: normalizedMetadata.pages,
          width: normalizedMetadata.width,
          pageHeight: normalizedMetadata.pageHeight
        });
      }
      const clientRunner = createRealEsrganHttpClient();
      if (clientRunner && process.env.REAL_ESRGAN_URL) return clientRunner(processingBuffer);
      if (job.frames > 1) throw new Error('REAL_ESRGAN_ANIMATED_ENDPOINT_MISSING');
      return enhanceImage(processingBuffer, { factor: 2, format: 'webp', allowFallback: false });
    };
    queued = fotoHdQueue.add(run, job.seconds);
  } catch (error) {
    if (error.code === 'FOTOHD_QUEUE_FULL') {
      await safeReply(client, chatId, '⏳ A fila do #fotohd está cheia no momento. Tente novamente em alguns minutos.', message.id);
      return true;
    }
    throw error;
  }

  const waiting = Math.max(0, queued.position - 1);
  const queueText = waiting ? ` Há ${waiting} processamento${waiting === 1 ? '' : 's'} antes do seu.` : ' Você é o próximo da fila.';
  await safeReply(client, chatId,
    `🔄 Sticker ${job.frames > 1 ? 'animado' : 'estático'} recebido (${job.frames} frame${job.frames === 1 ? '' : 's'}, ${job.width}×${job.height}).\n` +
    `⏱️ Tempo provável: ${formatDuration(job.seconds)}.${queueText}`, message.id);

  try {
    await withTyping(client, chatId, async () => {
      const result = await queued.promise;
      await sendResult(client, chatId, message, result);
    });
  } catch (error) {
    console.error('[COMMAND:fotohd] upscale failed:', error?.message || error);
    const limitErrors = new Set(['too_many_frames', 'dimensions_too_large', 'duration_too_long', 'output_too_large']);
    const text = error.code === 'REAL_ESRGAN_TIMEOUT'
      ? '⏱️ O processamento excedeu o tempo limite. A fila foi liberada; tente uma animação menor.'
      : limitErrors.has(error.code)
        ? '⚠️ Esta mídia excede os limites seguros do #fotohd (duração, frames, dimensões ou tamanho final).'
        : error.code === 'worker_busy'
          ? '⏳ O worker está ocupado. Sua solicitação não foi perdida; tente novamente em instantes.'
          : 'Não consegui melhorar esta imagem agora. Tente novamente mais tarde.';
    await safeReply(client, chatId, text, message.id);
  }
  return true;
}

module.exports = { handleFotoHdCommand, secondsForJob };
