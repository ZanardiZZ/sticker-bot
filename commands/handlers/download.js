const { downloadVideo, isVideoUrl, getVideoInfo, MAX_VIDEO_DURATION } = require('../../services/videoDownloader');
const { safeReply } = require('../../utils/safeMessaging');
const { withTyping } = require('../../utils/typingIndicator');
const { saveMedia, findById } = require('../../database/index.js');
const { processVideo } = require('../../services/videoProcessor');
const { isVideoNSFW } = require('../../services/nsfwVideoFilter');
const { cleanDescriptionTags } = require('../../utils/messageUtils');
const { sendStickerForMediaRecord } = require('../../bot/stickers');
const { generateResponseMessage } = require('../../utils/responseMessage');
const { isGifLikeVideo } = require('../../utils/gifDetection');
const fs = require('fs');
const path = require('path');

/**
 * Handles the #download command
 * Downloads short videos from various platforms and processes them as stickers
 * 
 * Usage: #download <URL>
 * Example: #download https://youtube.com/shorts/xxxxx
 */
async function handleDownloadCommand(client, message, chatId, params) {
  const url = params?.trim();
  
  if (!url) {
    await safeReply(
      client,
      chatId,
      '❌ *Uso incorreto!*\n\n' +
      'Para baixar um vídeo curto:\n' +
      '`#download <URL>`\n\n' +
      '*Exemplos:*\n' +
      '• `#download https://youtube.com/shorts/xxxxx`\n' +
      '• `#download https://tiktok.com/@user/video/xxxxx`\n' +
      '• `#download https://instagram.com/reel/xxxxx`\n\n' +
      `⏱️ *Limite:* ${MAX_VIDEO_DURATION} segundos (1 minuto)\n` +
      '🌐 *Sites suportados:* YouTube, TikTok, Instagram, Twitter/X, Facebook, Vimeo, e mais!',
      message.id
    );
    return;
  }
  
  // Validate URL format
  if (!isVideoUrl(url)) {
    await safeReply(
      client,
      chatId,
      '❌ *URL inválida ou não suportada*\n\n' +
      'Por favor, forneça um link válido de vídeo de uma plataforma suportada.\n\n' +
      '*Plataformas suportadas:*\n' +
      '• YouTube (incluindo Shorts)\n' +
      '• TikTok\n' +
      '• Instagram (Reels, IGTV)\n' +
      '• Twitter/X\n' +
      '• Facebook\n' +
      '• Vimeo\n' +
      '• E mais...',
      message.id
    );
    return;
  }
  
  // Show typing indicator while processing
  await withTyping(client, chatId, async () => {
    let downloadedFile = null;
    let finalMediaPath = null;
    
    try {
      // Send initial feedback
      await safeReply(
        client,
        chatId,
        '⏬ *Baixando vídeo...*\n\n' +
        '📋 Verificando informações do vídeo...',
        message.id
      );
      
      // Get video info first (to check duration before downloading)
      let videoInfo;
      try {
        videoInfo = await getVideoInfo(url);
      } catch (infoError) {
        console.error('[DownloadCommand] Error getting video info:', infoError.message);
        throw new Error('Não foi possível acessar as informações do vídeo. Verifique se o link está correto e o vídeo está disponível.');
      }
      
      // Provide feedback about the video
      await safeReply(
        client,
        chatId,
        `📹 *Vídeo encontrado!*\n\n` +
        `📝 *Título:* ${videoInfo.title.slice(0, 80)}${videoInfo.title.length > 80 ? '...' : ''}\n` +
        `⏱️ *Duração:* ${Math.round(videoInfo.duration)}s\n` +
        `🌐 *Origem:* ${videoInfo.extractor}\n\n` +
        `⬇️ Baixando...`,
        message.id
      );
      
      // Download the video
      const result = await downloadVideo(url);
      downloadedFile = result.filePath;
      
      console.log('[DownloadCommand] Video downloaded:', result.filePath);
      
      // Send processing feedback
      await safeReply(
        client,
        chatId,
        '🎬 *Vídeo baixado!*\n\n' +
        '⚙️ Processando vídeo...\n' +
        '🔍 Analisando conteúdo com IA...\n\n' +
        '⏳ Isso pode levar alguns instantes...',
        message.id
      );
      
      // Check for NSFW content
      let nsfw = false;
      try {
        nsfw = await isVideoNSFW(downloadedFile);
        console.log(`[DownloadCommand] NSFW check: ${nsfw ? 'DETECTED' : 'safe'}`);
      } catch (nsfwErr) {
        console.warn('[DownloadCommand] Error in NSFW check:', nsfwErr.message);
        nsfw = false; // Assume safe if error occurs
      }
      
      let description = '';
      let tags = '';
      let isGifLike = false;
      
      // Only process with AI if not NSFW
      if (!nsfw) {
        try {
          // Check that downloadedFile is within MEDIA_DIR to prevent path traversal
          const absDownloadedFile = path.resolve(downloadedFile);
          if (!absDownloadedFile.startsWith(MEDIA_DIR + path.sep)) {
            console.warn('[DownloadCommand] Security violation: downloadedFile outside MEDIA_DIR:', absDownloadedFile);
            await safeReply(msg, 'Erro de segurança: arquivo de vídeo inválido.');
            return;
          }
          // Check if it's a GIF-like video (store result to avoid redundant computation)
          isGifLike = await isGifLikeVideo(downloadedFile, result.mimetype);
          
          // Process video with AI to get description and tags
          const aiResult = await processVideo(downloadedFile);
          
          if (aiResult && typeof aiResult === 'object') {
            const clean = cleanDescriptionTags(aiResult.description, aiResult.tags);
            description = clean.description;
            tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
            
            // Add source information to description
            if (description) {
              description = `${description} | Origem: ${videoInfo.extractor}`;
            } else {
              description = `Vídeo de ${videoInfo.extractor}: ${videoInfo.title.slice(0, 100)}`;
            }
            
            console.log('[DownloadCommand] AI analysis complete:', { description: description.slice(0, 50), tags });
          } else {
            console.warn('[DownloadCommand] Invalid AI result:', aiResult);
            description = `Vídeo de ${videoInfo.extractor}: ${videoInfo.title.slice(0, 100)}`;
            tags = videoInfo.extractor.toLowerCase();
          }
        } catch (aiError) {
          console.warn('[DownloadCommand] Error in AI processing:', aiError.message);
          description = `Vídeo de ${videoInfo.extractor}: ${videoInfo.title.slice(0, 100)}`;
          tags = videoInfo.extractor.toLowerCase();
        }
      } else {
        description = '';
        tags = '';
      }
      
      // Move video to media directory
      const mediaDir = path.resolve(__dirname, 'STICKER_DIR');
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }
      
      // Use the actual file extension from the downloaded file
      const downloadedExt = path.extname(downloadedFile).toLowerCase().slice(1) || 'mp4';
      const fileName = `media-${Date.now()}.${downloadedExt}`;
      finalMediaPath = path.join(mediaDir, fileName);
      fs.copyFileSync(downloadedFile, finalMediaPath);
      
      console.log('[DownloadCommand] Video copied to media directory:', finalMediaPath);
      
      // Save to database
      const groupId = chatId.endsWith('@g.us') ? chatId : null;
      const senderId = message?.sender?.id || message?.author || 
                      (message?.from && !String(message.from).endsWith('@g.us') ? message.from : null);
      
      const mediaId = await saveMedia({
        chatId,
        groupId,
        senderId,
        filePath: finalMediaPath,
        mimetype: result.mimetype,
        timestamp: Date.now(),
        description,
        tags,
        hashVisual: null, // Videos don't have visual hash
        hashMd5: null, // We could compute this if needed
        nsfw: nsfw ? 1 : 0,
        extractedText: null
      });
      
      console.log('[DownloadCommand] Video saved to database with ID:', mediaId);
      
      // Get saved media record
      const savedMedia = await findById(mediaId);
      
      // Try to send as sticker if it's GIF-like (reuse the previously computed value)
      try {
        if (isGifLike) {
          console.log('[DownloadCommand] Attempting to send as animated sticker...');
          await sendStickerForMediaRecord(client, chatId, savedMedia);
        }
      } catch (stickerError) {
        console.warn('[DownloadCommand] Could not send as sticker:', stickerError.message);
        // Continue anyway - we'll send text response
      }
      
      // Send success response
      let responseMessage = generateResponseMessage(result.mimetype, false);
      responseMessage += `📝 ${description || ''}\n`;
      responseMessage += `🏷️ ${tags ? tags.split(',').map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n`;
      responseMessage += `🆔 ${savedMedia.id}\n\n`;
      responseMessage += `🔗 *Origem:* ${url.slice(0, 50)}${url.length > 50 ? '...' : ''}`;
      
      await safeReply(client, chatId, responseMessage, message.id);
      
      console.log('[DownloadCommand] Video processed and saved successfully');
      
    } catch (error) {
      console.error('[DownloadCommand] Error:', error.message);
      
      // Provide helpful error messages
      let errorMessage = '❌ *Erro ao processar vídeo*\n\n';
      
      if (error.message.includes('muito longo')) {
        errorMessage += error.message + '\n\n';
        errorMessage += '💡 *Dica:* Procure por vídeos mais curtos ou clips/shorts.';
      } else if (error.message.includes('não disponível') || error.message.includes('unavailable')) {
        errorMessage += '🔒 O vídeo não está disponível ou é privado.\n\n';
        errorMessage += '💡 *Verifique se:*\n';
        errorMessage += '• O vídeo não foi deletado\n';
        errorMessage += '• O vídeo não é privado\n';
        errorMessage += '• O link está correto';
      } else if (error.message.includes('URL não suportada') || error.message.includes('Unsupported')) {
        errorMessage += '🌐 Esta plataforma ou tipo de link não é suportada.\n\n';
        errorMessage += '💡 *Tente:*\n';
        errorMessage += '• Usar o link direto do vídeo\n';
        errorMessage += '• Verificar se é uma plataforma suportada';
      } else {
        errorMessage += `⚠️ ${error.message}\n\n`;
        errorMessage += '💡 *Tente novamente* ou use um link diferente.';
      }
      
      await safeReply(client, chatId, errorMessage, message.id);
    } finally {
      // Clean up downloaded file (but keep the final media file)
      if (downloadedFile && fs.existsSync(downloadedFile)) {
        try {
          fs.unlinkSync(downloadedFile);
          console.log('[DownloadCommand] Cleaned up temporary download file:', downloadedFile);
        } catch (cleanupError) {
          console.warn('[DownloadCommand] Failed to clean up file:', cleanupError.message);
        }
      }
    }
  });
}

module.exports = {
  handleDownloadCommand
};
