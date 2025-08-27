const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { decryptMedia } = require('@open-wa/wa-decrypt');
const {
  getMD5,
  getHashVisual,
  findByHashVisual,
  saveMedia
} = require('./database');
const { isNSFW } = require('./services/nsfwFilter');
const { getAiAnnotations, transcribeAudioBuffer, getAiAnnotationsFromPrompt } = require('./services/ai');
const { processVideo } = require('./services/videoProcessor');
const { updateMediaDescription, updateMediaTags } = require('./database');
const { forceMap, MAX_TAGS_LENGTH, clearDescriptionCmds } = require('./commands');
const { cleanDescriptionTags } = require('./utils/messageUtils');

async function processIncomingMedia(client, message) {
  const chatId = message.from;

  try {
    const buffer = await decryptMedia(message);
    const ext = message.mimetype.split('/')[1] || 'bin';

    let bufferWebp = buffer;
    let extToSave = ext;
    let mimetypeToSave = message.mimetype;

    if (message.mimetype.startsWith('image/') && message.mimetype !== 'image/gif') {
      bufferWebp = await sharp(buffer).webp().toBuffer();
      extToSave = 'webp';
      mimetypeToSave = 'image/webp';
    } else if (message.mimetype === 'image/gif') {
      bufferWebp = buffer;
      extToSave = 'gif';
      mimetypeToSave = 'image/gif';
    }

    const pngBuffer = await sharp(bufferWebp).png().toBuffer();
    const hashMd5 = getMD5(bufferWebp);
    const hashVisual = await getHashVisual(bufferWebp);

    const forceInsert = !!forceMap[chatId];

    if (!forceInsert) {
      const existing = await findByHashVisual(hashVisual);
      if (existing) {
        await client.sendText(
          chatId,
          `Mídia visualmente semelhante já existe no banco. ID: ${existing.id}. Use #forçar respondendo à mídia para salvar duplicado ou use #ID ${existing.id} para solicitar esta mídia.`
        );
        return;
      }
    } else {
      forceMap[chatId] = false;
    }

    const dir = path.resolve(__dirname, 'media');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const fileName = `media-${Date.now()}.${extToSave}`;
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, bufferWebp);

    const groupId = message.from.endsWith('@g.us') ? message.from : null;

    const nsfw = await isNSFW(pngBuffer);

    let description = null;
    let tags = null;

    if (!nsfw) {
      if (message.mimetype.startsWith('video/')) {
        try {
          const aiResult = await processVideo(filePath);
          const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(aiResult.description, aiResult.tags);
          description = clean.description;
          tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
        } catch (err) {
          console.warn('Erro ao processar vídeo:', err);
        }
      } else if (message.mimetype === 'image/gif') {
        // For GIFs, use video processing logic to analyze multiple frames
        try {
          console.log('🎬 Processing GIF using multi-frame video analysis...');
          const aiResult = await processVideo(filePath);
          const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(aiResult.description, aiResult.tags);
          description = clean.description;
          tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
          console.log(`✅ GIF processed successfully: ${description ? description.slice(0, 50) : 'no description'}...`);
        } catch (err) {
          console.warn('Erro ao processar GIF com lógica de vídeo, usando fallback de imagem:', err);
          // Fallback to single frame analysis if video processing fails
          try {
            const aiResult = await getAiAnnotations(pngBuffer);
            const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(aiResult.description, aiResult.tags);
            description = clean.description;
            tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
            console.log('⚠️ GIF processed using fallback single-frame analysis');
          } catch (fallbackErr) {
            console.warn('Erro também no fallback de imagem para GIF:', fallbackErr);
          }
        }
      } else if (mimetypeToSave.startsWith('image/')) {
        const aiResult = await getAiAnnotations(pngBuffer);
        const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(aiResult.description, aiResult.tags);
        description = clean.description;
        tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
      } else if (message.mimetype.startsWith('audio/')) {
        try {
          description = await transcribeAudioBuffer(buffer);
          if (description) {
            const prompt = `\nVocê é um assistente que recebe a transcrição de um áudio em português e deve gerar até 5 tags relevantes, separadas por vírgula, relacionadas ao conteúdo dessa transcrição.\n\nTranscrição:\n${description}\n\nResposta (tags separadas por vírgula):\n              `.trim();
            const tagResult = await getAiAnnotationsFromPrompt(prompt);
            const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(null, tagResult.tags);
            tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
          } else {
            tags = '';
          }
        } catch (err) {
          console.warn('Erro ao processar áudio:', err);
          description = '';
          tags = '';
        }
      }
    } else {
      description = '';
      tags = '';
    }

    const senderId =
      message?.sender?.id ||
      message?.author ||
      (message?.from && !String(message.from).endsWith('@g.us') ? message.from : null);

    await saveMedia({
      chatId,
      groupId,
      senderId,
      filePath,
      mimetype: mimetypeToSave,
      timestamp: Date.now(),
      description,
      tags,
      hashVisual,
      hashMd5,
      nsfw: nsfw ? 1 : 0
    });

    const savedMedia = await findByHashVisual(hashVisual);

    const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(savedMedia.description, savedMedia.tags ? (typeof savedMedia.tags === 'string' ? savedMedia.tags.split(',') : savedMedia.tags) : []);

    let responseMessage = `✅ Figurinha adicionada!\n\n`;
    responseMessage += `📝 ${clean.description || ''}\n`;
    responseMessage += `🏷️ ${clean.tags.length > 0 ? clean.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n`;
    responseMessage += `🆔 ${savedMedia.id}`;

    await client.sendText(chatId, responseMessage);

  } catch (e) {
    console.error('Erro ao processar mídia:', e);
    if (e.response && e.response.data) {
      console.error('Detalhes do erro de resposta:', e.response.data);
    }
    await client.sendText(message.from, 'Erro ao processar sua mídia.');
  }
}

module.exports = {
  processIncomingMedia
};
