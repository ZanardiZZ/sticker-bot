const fs = require('fs');
const path = require('path');

const {
  downloadAudio,
  isVideoUrl,
  MAX_AUDIO_DURATION,
  MAX_AUDIO_FILESIZE_MB,
  SUPPORTED_PLATFORMS
} = require('../../services/videoDownloader');
const { convertMp3ToOpusAuto } = require('../../services/audioConverter');
const { safeReply } = require('../../utils/safeMessaging');
const { withTyping } = require('../../utils/typingIndicator');

const MEDIA_DIR = path.resolve(__dirname, '..', '..', 'bot', 'media');

function normalizeParams(params) {
  if (Array.isArray(params)) {
    return params
      .map(part => {
        if (typeof part === 'string') return part;
        if (part == null) return '';
        return String(part);
      })
      .join(' ');
  }

  if (typeof params === 'string') {
    return params;
  }

  return '';
}

async function handleDownloadMp3Command(client, message, chatId, params) {
  const rawParams = normalizeParams(params);
  const url = typeof rawParams === 'string' ? rawParams.trim() : '';

  const supportedPlatformsList = SUPPORTED_PLATFORMS.map(platform => `• ${platform}`).join('\n');
  const usageMessage = [
    '❌ *Uso incorreto!*',
    '',
    'Para extrair o áudio de um vídeo curto:',
    '`#downloadmp3 <URL>`',
    '',
    '*Exemplos:*',
    '• `#downloadmp3 https://youtube.com/watch?v=xxxxx`',
    '• `#downloadmp3 https://tiktok.com/@user/video/xxxxx`',
    '',
    `⏱️ *Limite:* ${MAX_AUDIO_DURATION} segundos (10 minutos)`,
    `📦 *Tamanho máximo:* ${MAX_AUDIO_FILESIZE_MB}MB`,
    '🌐 *Plataformas suportadas:*',
    supportedPlatformsList
  ].join('\n');

  if (!url) {
    await safeReply(client, chatId, usageMessage, message.id);
    return;
  }

  if (!isVideoUrl(url)) {
    const invalidMessage = [
      '❌ *URL inválida ou não suportada*',
      '',
      'Forneça um link válido de vídeo de uma plataforma compatível.',
      '',
      '*Como usar:*',
      '`#downloadmp3 <URL>`',
      '',
      '*Plataformas suportadas:*',
      supportedPlatformsList
    ].join('\n');

    await safeReply(client, chatId, invalidMessage, message.id);
    return;
  }

  await withTyping(client, chatId, async () => {
    let downloadResult = null;
    let finalMediaPath = null;
    let convertedAudioPath = null;
    let fileSent = false;
    let conversionSucceeded = false;

    try {
      await safeReply(
        client,
        chatId,
        '⏬ *Baixando áudio...*\n\n🎧 Preparando conversão para formato compatível com WhatsApp...',
        message.id
      );

      downloadResult = await downloadAudio(url);

      if (!downloadResult || !downloadResult.filePath) {
        throw new Error('Falha ao baixar áudio. Tente novamente mais tarde.');
      }

      if (!fs.existsSync(MEDIA_DIR)) {
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
      }

      // Copy MP3 to media directory first
      const baseName = `audio-${Date.now()}.mp3`;
      finalMediaPath = path.join(MEDIA_DIR, baseName);
      fs.copyFileSync(downloadResult.filePath, finalMediaPath);

      const metadata = downloadResult.metadata || {};
      const durationSeconds = metadata.duration ? Math.round(metadata.duration) : null;
      const prettyTitle = metadata.title
        ? metadata.title.slice(0, 80) + (metadata.title.length > 80 ? '...' : '')
        : 'Áudio';

      // Try to convert MP3 to OPUS for WhatsApp compatibility
      let audioPathToSend = finalMediaPath;
      let mimetypeToSend;
      
      try {
        console.log('[DownloadMp3Command] Converting audio to OPUS format...');
        convertedAudioPath = await convertMp3ToOpusAuto(finalMediaPath);
        audioPathToSend = convertedAudioPath;
        mimetypeToSend = 'audio/ogg; codecs=opus';
        conversionSucceeded = true;
        console.log('[DownloadMp3Command] Audio converted successfully to OPUS');
      } catch (conversionError) {
        console.warn('[DownloadMp3Command] OPUS conversion failed, sending as document:', conversionError.message);
        // Fallback: send as document instead of audio message
        await client.sendFile(
          chatId,
          finalMediaPath,
          path.basename(finalMediaPath),
          undefined,
          undefined,
          true,
          false,
          false,
          undefined,
          undefined,
          { mimetype: 'audio/mpeg', asDocument: true }
        );

        fileSent = true;

        const successMessageParts = [
          '✅ *Áudio pronto!*',
          '',
          '📝 *Nota:* Enviado como arquivo MP3 (formato original)',
          `🎵 *Título:* ${prettyTitle}`,
          durationSeconds ? `⏱️ *Duração:* ${durationSeconds}s` : null,
          `📁 *Arquivo:* ${path.basename(finalMediaPath)}`
        ].filter(Boolean);

        await safeReply(client, chatId, successMessageParts.join('\n'), message.id);
        return;
      }

      // Send converted audio as audio message
      await client.sendFile(
        chatId,
        audioPathToSend,
        path.basename(audioPathToSend),
        undefined,
        undefined,
        true,
        false,
        false,
        undefined,
        undefined,
        { mimetype: mimetypeToSend, asDocument: false }
      );

      fileSent = true;

      const successMessageParts = [
        '✅ *Áudio pronto!*',
        '',
        `🎵 *Título:* ${prettyTitle}`,
        durationSeconds ? `⏱️ *Duração:* ${durationSeconds}s` : null,
        `📁 *Formato:* OPUS (otimizado para WhatsApp)`
      ].filter(Boolean);

      await safeReply(client, chatId, successMessageParts.join('\n'), message.id);
    } catch (error) {
      console.error('[DownloadMp3Command] Error:', error.message);
      await safeReply(client, chatId, `❌ ${error.message}`, message.id);
    } finally {
      // Cleanup temporary download file
      if (downloadResult && downloadResult.filePath) {
        try {
          if (fs.existsSync(downloadResult.filePath)) {
            fs.unlinkSync(downloadResult.filePath);
          }
        } catch (cleanupError) {
          console.warn('[DownloadMp3Command] Failed to remove temp audio file:', cleanupError.message);
        }
      }

      // Cleanup MP3 file when conversion succeeded (we keep only OPUS)
      if (finalMediaPath && conversionSucceeded) {
        try {
          if (fs.existsSync(finalMediaPath)) {
            fs.unlinkSync(finalMediaPath);
          }
        } catch (cleanupError) {
          console.warn('[DownloadMp3Command] Failed to remove MP3 file:', cleanupError.message);
        }
      }

      // Cleanup MP3 file if sending failed and no conversion happened (document send failed)
      if (finalMediaPath && !fileSent && !conversionSucceeded) {
        try {
          if (fs.existsSync(finalMediaPath)) {
            fs.unlinkSync(finalMediaPath);
          }
        } catch (cleanupError) {
          console.warn('[DownloadMp3Command] Failed to remove orphaned MP3 file:', cleanupError.message);
        }
      }

      // Cleanup converted OPUS file if sending failed
      if (convertedAudioPath && !fileSent) {
        try {
          if (fs.existsSync(convertedAudioPath)) {
            fs.unlinkSync(convertedAudioPath);
          }
        } catch (cleanupError) {
          console.warn('[DownloadMp3Command] Failed to remove converted audio file:', cleanupError.message);
        }
      }
    }
  });
}

module.exports = { handleDownloadMp3Command };
