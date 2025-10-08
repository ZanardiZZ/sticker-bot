const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { downloadMediaForMessage } = require('../utils/mediaDownload');
const {
  getMD5,
  getHashVisual,
  findByHashVisual,
  findById,
  saveMedia,
  getTagsForMedia
} = require('../database/index.js');
const { isNSFW } = require('../services/nsfwFilter');
const { isVideoNSFW } = require('../services/nsfwVideoFilter');
const { getAiAnnotations, transcribeAudioBuffer, getAiAnnotationsFromPrompt, getAiAnnotationsForGif } = require('../services/ai');
const { processVideo, processGif, processAnimatedWebp } = require('../services/videoProcessor');
const { updateMediaDescription, updateMediaTags } = require('../database/index.js');
const { forceMap, MAX_TAGS_LENGTH, clearDescriptionCmds } = require('../commands');
const { cleanDescriptionTags } = require('../utils/messageUtils');
const { generateResponseMessage } = require('../utils/responseMessage');
const { safeReply } = require('../utils/safeMessaging');
const { isAnimatedWebpBuffer, sendStickerForMediaRecord } = require('./stickers');
const { isGifLikeVideo } = require('../utils/gifDetection');
const { withTyping } = require('../utils/typingIndicator');

const MAX_STICKER_BYTES = 1024 * 1024; // WhatsApp animated sticker limit ≈1MB

// Fallback function if cleanDescriptionTags is not available
function fallbackCleanDescriptionTags(description, tags) {
  const badPhrases = [
    'desculpe', 'não posso ajudar', 'não disponível', 'sem descrição',
    'erro', 'falha', 'não foi possível'
  ];
  
  let cleanDesc = description ? String(description) : '';
  if (badPhrases.some((p) => cleanDesc.toLowerCase().includes(p))) {
    cleanDesc = '';
  }

  let cleanTags = [];
  if (Array.isArray(tags)) {
    cleanTags = tags
      .filter(Boolean)
      .map((t) => String(t).trim())
      .filter((t) => t && !t.includes('##') && !badPhrases.some((p) => t.toLowerCase().includes(p)));
  } else if (typeof tags === 'string') {
    cleanTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t);
  }

  return { description: cleanDesc, tags: cleanTags };
}

async function processIncomingMedia(client, message) {
  const chatId = message.from;

  // Show typing indicator while processing media
  await withTyping(client, chatId, async () => {
  let description = null;
  let tags = null;
  let extractedText = null;
  let tmpFilePath = null;
  let gifSourceForAnalysis = null;
  try {
    const { buffer, mimetype: downloadedMimetype } = await downloadMediaForMessage(client, message);
    if (!message.mimetype && downloadedMimetype) {
      message.mimetype = downloadedMimetype;
    }
    const effectiveMimetype = message.mimetype || downloadedMimetype || 'application/octet-stream';
    message.mimetype = effectiveMimetype;
    console.log('[MediaProcessor] Mimetype recebido:', effectiveMimetype);
    console.log('[MediaProcessor] Tamanho do buffer:', buffer ? buffer.length : 'null');
    const ext = (effectiveMimetype.split('/')[1]) || 'bin';
  const tmpDir = path.resolve(__dirname, 'temp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  tmpFilePath = path.join(tmpDir, `media-tmp-${Date.now()}-${Math.floor(Math.random()*10000)}.${ext}`);
  fs.writeFileSync(tmpFilePath, buffer);
  console.log('[MediaProcessor] Arquivo temporário salvo em:', tmpFilePath);

    let wasProcessedAsGifLike = false;
    let bufferWebp = null;
    let extToSave = ext;
    let mimetypeToSave = message.mimetype;

    // 1. PROCESSAMENTO: sempre usa o arquivo original tmpFilePath
    // NSFW, AI, análise, etc. usam tmpFilePath

    // Only convert to PNG and generate visual hash for image formats that Sharp supports
    let pngBuffer = null;
    let hashVisual = null;
    let hashMd5 = null;
    if (message.mimetype === 'image/gif') {
      try {
        pngBuffer = await sharp(tmpFilePath, { animated: true, page: 0 }).png().toBuffer();
        hashMd5 = getMD5(await fs.promises.readFile(tmpFilePath));
        gifSourceForAnalysis = tmpFilePath;
      } catch (err) {
        console.warn('Erro ao preparar GIF para hash visual:', err.message);
        pngBuffer = null;
        hashVisual = null;
        hashMd5 = null;
      }
    } else if (mimetypeToSave.startsWith('image/')) {
      try {
        const sharpSource = sharp(tmpFilePath);
        pngBuffer = await sharpSource.png().toBuffer();
        hashVisual = await getHashVisual(pngBuffer);
        hashMd5 = getMD5(await fs.promises.readFile(tmpFilePath));
      } catch (err) {
        console.warn('Erro ao processar mídia com sharp (formato não suportado):', err.message);
        pngBuffer = null;
        hashVisual = null;
        hashMd5 = null;
      }
    } else {
      // For videos and other non-image formats, skip Sharp processing entirely
      try {
        hashMd5 = getMD5(await fs.promises.readFile(tmpFilePath));
      } catch (err) {
        hashMd5 = null;
      }
    }

    async function ensureVisualHashFromBuffer(buffer, contextLabel = '') {
      if (!buffer || hashVisual) return;

      const sampleHashes = [];
      try {
        const animatedProbe = sharp(buffer, { animated: true });
        const meta = await animatedProbe.metadata();
        const totalFrames = Number(meta.pages && meta.pages > 0 ? meta.pages : 1) || 1;
        const hasAnimation = totalFrames > 1;

        if (hasAnimation) {
          const sampleCount = Math.min(totalFrames, 5);
          for (let i = 0; i < sampleCount; i++) {
            const frameIndex = sampleCount === 1 ? 0 : Math.round((i * (totalFrames - 1)) / (sampleCount - 1));
            try {
              const frameBuffer = await sharp(buffer, { animated: true, page: frameIndex })
                .png()
                .toBuffer();

              if (!pngBuffer) pngBuffer = frameBuffer;

              const frameHash = await getHashVisual(frameBuffer);
              if (frameHash) sampleHashes.push(frameHash);
            } catch (frameErr) {
              console.warn(`[MediaProcessor] Falha ao extrair frame ${frameIndex} para hash (${contextLabel || 'sem contexto'}):`, frameErr.message);
            }
          }
        }

        if (sampleHashes.length > 0) {
          hashVisual = sampleHashes.join(':');
          return;
        }

        if (!pngBuffer) {
          try {
            pngBuffer = await sharp(buffer, { animated: true, page: 0 }).png().toBuffer();
          } catch (pngErr) {
            console.warn(`[MediaProcessor] Falha ao gerar PNG base para hash (${contextLabel || 'sem contexto'}):`, pngErr.message);
            pngBuffer = null;
          }
        }
      } catch (probeErr) {
        console.warn(`[MediaProcessor] Falha ao analisar buffer para hash (${contextLabel || 'sem contexto'}):`, probeErr.message);
      }

      if (!hashVisual && pngBuffer) {
        try {
          hashVisual = await getHashVisual(pngBuffer);
        } catch (hashErr) {
          console.warn(`[MediaProcessor] Falha ao calcular hash visual (${contextLabel || 'sem contexto'}):`, hashErr.message);
          hashVisual = null;
        }
      }
    }

    // Se o arquivo não for suportado por Sharp, interrompe e avisa o usuário
    const requiresImmediateHash = message.mimetype.startsWith('image/') && message.mimetype !== 'image/gif';
    if (
      (requiresImmediateHash && (pngBuffer === null || hashVisual === null || hashMd5 === null))
    ) {
      await safeReply(client, chatId, 'Erro: formato de imagem não suportado para processamento de sticker.', message.id);
      try { fs.unlinkSync(tmpFilePath); } catch (e) {}
      return;
    }
    if (message.mimetype === 'image/gif' && (pngBuffer === null || hashMd5 === null)) {
      await safeReply(client, chatId, 'Erro: não foi possível processar este GIF para sticker.', message.id);
      try { fs.unlinkSync(tmpFilePath); } catch (e) {}
      return;
    }
    if (message.mimetype.startsWith('image/') && message.mimetype !== 'image/gif') {
      // Ajuste de aspect ratio: centraliza a imagem em um canvas quadrado com fundo transparente
      const image = sharp(tmpFilePath);
      const metadata = await image.metadata();
      const { width, height } = metadata;
      if (width !== height) {
        const size = Math.max(width, height);
        bufferWebp = await image
          .extend({
            top: Math.floor((size - height) / 2),
            bottom: Math.ceil((size - height) / 2),
            left: Math.floor((size - width) / 2),
            right: Math.ceil((size - width) / 2),
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .resize(size, size)
          .webp()
          .toBuffer();
      } else {
        bufferWebp = await image.webp().toBuffer();
      }
      extToSave = 'webp';
      mimetypeToSave = 'image/webp';
    } else if (message.mimetype === 'image/gif') {
      try {
        const gifSharp = sharp(tmpFilePath, { animated: true });
        const { pageHeight, height } = await gifSharp.metadata();
        const animatedBase = {
          loop: 0,
          effort: 6,
          smartSubsample: true,
        };
        const targetPageHeight = pageHeight || height;
        if (targetPageHeight) {
          animatedBase.pageHeight = targetPageHeight;
        }

        const gifAttempts = [
          { lossless: false, quality: 85, nearLossless: 60 },
          { lossless: false, quality: 75, nearLossless: 50 },
          { lossless: false, quality: 65 }
        ];

        let lastBuffer = null;
        for (const attempt of gifAttempts) {
          try {
            const candidate = await gifSharp
              .clone()
              .webp({ ...animatedBase, ...attempt })
              .toBuffer();
            lastBuffer = candidate;
            if (candidate.length <= MAX_STICKER_BYTES) {
              break;
            }
          } catch (attemptErr) {
            console.warn('[MediaProcessor] GIF WebP attempt falhou:', attemptErr.message);
          }
        }

        bufferWebp = lastBuffer;
        await ensureVisualHashFromBuffer(bufferWebp, 'gif');
        gifSourceForAnalysis = tmpFilePath;
        if (bufferWebp && bufferWebp.length > MAX_STICKER_BYTES) {
          console.warn('[MediaProcessor] GIF convertido excede 1MB mesmo após tentativas de compressão. Tamanho:', bufferWebp.length);
        }
      } catch (e) {
        console.warn('[MediaProcessor] Erro ao converter GIF para webp animado:', e.message);
        bufferWebp = null;
      }
      extToSave = 'webp';
      mimetypeToSave = 'image/webp';
    } else if (message.mimetype.startsWith('video/')) {
      // Detecta se é um vídeo GIF-like (curto, sem áudio, etc.)
      let isGifLike = false;
      try {
        isGifLike = await isGifLikeVideo(tmpFilePath, message.mimetype);
      } catch (e) {
        console.warn('[MediaProcessor] Erro ao detectar GIF-like:', e.message);
      }
      if (isGifLike) {
        // Converte vídeo GIF-like para webp animado usando ffmpeg
        gifSourceForAnalysis = tmpFilePath;
        try {
          const ffmpeg = require('fluent-ffmpeg');
          const ffmpegPath = require('ffmpeg-static');
          if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
          const outPath = tmpFilePath.replace(/\.[^.]+$/, '.webp');
          const ffmpegAttempts = [
            { fps: 15, quality: 80 },
            { fps: 12, quality: 70 },
            { fps: 10, quality: 60 }
          ];

          let convertedBuffer = null;
          let ffmpegError = null;

          for (const attempt of ffmpegAttempts) {
            try {
              if (fs.existsSync(outPath)) {
                try { fs.unlinkSync(outPath); } catch {}
              }

              const filter = `fps=${attempt.fps},scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,setsar=1`;
              const outputOptions = [
                '-vcodec', 'libwebp',
                '-vf', filter,
                '-loop', '0',
                '-preset', 'default',
                '-an',
                '-vsync', '0',
                '-quality', String(attempt.quality),
                '-lossless', '0',
                '-compression_level', '6',
                '-pix_fmt', 'yuva420p'
              ];

              await new Promise((resolve, reject) => {
                ffmpeg(tmpFilePath)
                  .outputOptions(outputOptions)
                  .toFormat('webp')
                  .save(outPath)
                  .on('end', resolve)
                  .on('error', reject);
              });

              const candidate = fs.readFileSync(outPath);
              convertedBuffer = candidate;
              if (candidate.length <= MAX_STICKER_BYTES) {
                break;
              }
            } catch (attemptErr) {
              ffmpegError = attemptErr;
              console.warn('[MediaProcessor] WebP via ffmpeg falhou:', attemptErr.message);
            }
          }

          if (!convertedBuffer) {
            throw ffmpegError || new Error('ffmpeg_failed');
          }

          bufferWebp = convertedBuffer;
          await ensureVisualHashFromBuffer(bufferWebp, 'gif-like');
          if (bufferWebp.length > MAX_STICKER_BYTES) {
            console.warn('[MediaProcessor] GIF-like convertido continua acima de 1MB. Tamanho:', bufferWebp.length);
          }
          try { fs.unlinkSync(outPath); } catch {}
        } catch (e) {
          console.warn('[MediaProcessor] Erro ao converter GIF-like para webp:', e.message);
          bufferWebp = null;
        }
        extToSave = 'webp';
        mimetypeToSave = 'image/webp';
        wasProcessedAsGifLike = true;
      } else {
        // Não é GIF-like, não processa
        bufferWebp = null;
        extToSave = 'webp';
        mimetypeToSave = 'image/webp';
      }
    }

  // ...

    const forceInsert = !!forceMap[chatId];

    if (!forceInsert && hashVisual) {
      const existing = await findByHashVisual(hashVisual);
      if (existing) {
        await safeReply(
          client,
          chatId,
          `Mídia visualmente semelhante já existe no banco. ID: ${existing.id}. Use #forçar respondendo à mídia para salvar duplicado ou use #ID ${existing.id} para solicitar esta mídia.`,
          message.id
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
    // Salva apenas o arquivo convertido (webp), nunca o original nem mp4
    if (extToSave === 'webp') {
      if (bufferWebp) {
        fs.writeFileSync(filePath, bufferWebp);
      } else {
        await safeReply(client, chatId, 'Erro ao converter a mídia para sticker. O formato pode não ser suportado.', message.id);
        return;
      }
    }

    const groupId = message.from.endsWith('@g.us') ? message.from : null;

  // NSFW filtering - different approaches for different media types
  let nsfw = false;
    if (mimetypeToSave.startsWith('image/') && pngBuffer) {
      // Image NSFW checking using PNG buffer
      nsfw = await isNSFW(pngBuffer);
    } else if (mimetypeToSave.startsWith('video/') || mimetypeToSave === 'image/gif') {
      // Video/GIF NSFW checking using frame analysis
      try {
        nsfw = await isVideoNSFW(filePath);
        console.log(`[MediaProcessor] NSFW check for ${mimetypeToSave}: ${nsfw ? 'DETECTED' : 'safe'}`);
      } catch (nsfwErr) {
        console.warn('[MediaProcessor] Erro na verificação NSFW de vídeo/GIF:', nsfwErr.message);
        nsfw = false; // Assume safe if error occurs
      }
    }

  // description and tags are declared earlier; do not redeclare here to avoid TDZ errors

    if (!nsfw) {
      if (wasProcessedAsGifLike) {
        try {
          const aiResult = await processGif(gifSourceForAnalysis || filePath);
          if (aiResult && typeof aiResult === 'object') {
            let descBase = aiResult.description || '';
            if (aiResult.text && typeof aiResult.text === 'string' && aiResult.text.trim()) {
              const trimmed = aiResult.text.trim();
              if (!descBase.includes(trimmed)) {
                descBase = descBase ? `${descBase} | Texto: ${trimmed}` : trimmed;
              }
            }
            const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(descBase, aiResult.tags);
            description = clean.description;
            tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
            console.log(`[MediaProcessor] Tags extraídas para GIF-like: "${tags}"`);
          } else {
            console.warn('Resultado inválido do processamento de GIF-like:', aiResult);
          }
        } catch (err) {
          console.warn('Erro ao processar GIF-like após deduplicação:', err.message);
        }
      } else if (message.mimetype.startsWith('video/') && !wasProcessedAsGifLike) {
        try {
          const aiResult = await processVideo(filePath);
          if (aiResult && typeof aiResult === 'object') {
            // Garante que o texto extraído (se existir) seja incluído na descrição
            let descBase = aiResult.description || '';
            if (aiResult.text && typeof aiResult.text === 'string' && aiResult.text.trim().length > 0) {
              if (!descBase.includes(`Texto: ${aiResult.text.trim()}`)) {
                descBase = descBase ? `${descBase} | Texto: ${aiResult.text.trim()}` : aiResult.text.trim();
              }
            }
            const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(descBase, aiResult.tags);
            description = clean.description;
            tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
            console.log(`[MediaProcessor] Tags extraídas para vídeo: "${tags}", aiResult.tags:`, aiResult.tags);
          } else {
            console.warn('Resultado inválido do processamento de vídeo:', aiResult);
            description = '';
            tags = '';
          }
        } catch (err) {
          console.warn('Erro ao processar vídeo:', err);
        }
      } else if (message.mimetype === 'image/gif') {
        // For GIFs, use specialized GIF processing logic to analyze multiple frames
        try {
          console.log('🎞️ Processing GIF using multi-frame analysis...');
          const aiResult = await processGif(filePath);
          
          if (aiResult && typeof aiResult === 'object' && aiResult.description) {
            // Garante que o texto extraído (se existir) seja incluído na descrição
            let descBase = aiResult.description || '';
            if (aiResult.text && typeof aiResult.text === 'string' && aiResult.text.trim().length > 0) {
              if (!descBase.includes(aiResult.text.trim())) {
                descBase = descBase ? `${descBase} | Texto: ${aiResult.text.trim()}` : aiResult.text.trim();
              }
            }
            const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(descBase, aiResult.tags);
            description = clean.description;
            tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
            console.log(`✅ GIF processed successfully: ${description ? description.slice(0, 50) : 'no description'}...`);
          } else {
            console.warn('Resultado inválido do processamento de GIF:', aiResult);
            // Still use fallback even if result format is invalid
            throw new Error('Formato de resultado inválido do processamento de GIF');
          }
          
        } catch (err) {
          console.warn('Erro ao processar GIF com lógica de frames múltiplos:', err.message);
          console.log('🔄 Tentando fallback para análise de frame único...');
          
          // Enhanced fallback to single frame analysis if video processing fails
          try {
            // Only try Sharp conversion for GIF files, not video files
            console.log('🖼️ Convertendo GIF para PNG para análise estática...');
            const pngBuffer = await sharp(buffer).png().toBuffer();
            
            if (!pngBuffer || pngBuffer.length === 0) {
              throw new Error('Falha na conversão do GIF para PNG');
            }
            
            console.log('🧠 Analisando GIF como imagem estática...');
            const aiResult = await getAiAnnotationsForGif(pngBuffer);
            
            if (aiResult && typeof aiResult === 'object' && aiResult.description) {
              const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(aiResult.description, aiResult.tags);
              description = clean.description;
              tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
              extractedText = aiResult.text || null;
              // Incorporate extracted text into description if available
              if (extractedText && extractedText.trim()) {
                description = `${description} [Texto: ${extractedText.trim()}]`;
              }
              console.log('⚠️ GIF processed using fallback single-frame analysis');
            } else {
              console.warn('Resultado inválido do fallback para GIF:', aiResult);
              description = 'GIF detectado - análise de conteúdo não disponível';
              tags = 'gif,sem-analise';
              extractedText = null;
            }
          } catch (fallbackErr) {
            console.error('Erro também no fallback de imagem para GIF:', fallbackErr.message);
            
            // Check if this is a Sharp-specific error
            if (fallbackErr.message.includes('corrupt') || fallbackErr.message.includes('gifload') || fallbackErr.message.includes('Invalid frame')) {
              console.warn('⚠️ GIF possui formato que não pode ser processado pelo Sharp');
              description = 'GIF detectado - formato não suportado para análise';
              tags = 'gif,formato-nao-suportado';
            } else {
              // Last resort - basic GIF tagging
              description = 'GIF detectado - processamento não disponível';
              tags = 'gif,erro-processamento';
            }
            
            console.log('🏷️ Usando tags básicas para GIF após falhas de processamento');
          }
        }
      } else if (mimetypeToSave.startsWith('image/') && pngBuffer && !wasProcessedAsGifLike) {
        // Check if this is an animated WebP (animated sticker) - should be analyzed as video (3 frames)
        if (mimetypeToSave === 'image/webp' && isAnimatedWebpBuffer(bufferWebp)) {
          
          // Check if multi-frame analysis is disabled via environment variable
          const disableMultiFrameAnalysis = process.env.DISABLE_MULTIFRAME_WEBP_ANALYSIS === 'true';
          
          if (disableMultiFrameAnalysis) {
            console.log('⚠️ Multi-frame analysis disabled via DISABLE_MULTIFRAME_WEBP_ANALYSIS - using single-frame analysis for animated sticker');
            // Process as single-frame image directly
            const aiResult = await getAiAnnotations(pngBuffer);
            if (aiResult && typeof aiResult === 'object') {
              const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(aiResult.description, aiResult.tags);
              description = clean.description;
              tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
              extractedText = aiResult.text || null;
              // Incorporate extracted text into description if available
              if (extractedText && extractedText.trim()) {
                description = `${description} [Texto: ${extractedText.trim()}]`;
              }
              console.log('✅ Animated sticker processed using single-frame analysis (disabled multi-frame)');
            } else {
              console.warn('Resultado inválido do processamento de sticker animado (single-frame):', aiResult);
              description = 'Sticker animado detectado - análise de conteúdo não disponível';
              tags = 'sticker,animado,sem-analise';
              extractedText = null;
            }
          } else {
            // Normal multi-frame processing using dedicated WebP processor
            try {
              console.log('🎬 Processing animated WebP using Sharp-based analysis...');
              const aiResult = await processAnimatedWebp(filePath);
              
              if (aiResult && typeof aiResult === 'object' && aiResult.description) {
                const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(aiResult.description, aiResult.tags);
                description = clean.description;
                tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
                extractedText = aiResult.text || null;
                // Incorporate extracted text into description if available
                if (extractedText && extractedText.trim()) {
                  description = `${description} [Texto: ${extractedText.trim()}]`;
                }
                console.log(`✅ Animated WebP processed successfully: ${description ? description.slice(0, 50) : 'no description'}...`);
              } else {
                console.warn('Resultado inválido do processamento de sticker animado:', aiResult);
                // Still use fallback even if result format is invalid
                throw new Error('Formato de resultado inválido do processamento de sticker animado');
              }
              
            } catch (err) {
              console.warn('Erro ao processar sticker animado com análise WebP:', err.message);
              console.log('🔄 Tentando fallback para análise de frame único...');
              
              // Fallback to single frame analysis if multi-frame processing fails
              const aiResult = await getAiAnnotations(pngBuffer);
              if (aiResult && typeof aiResult === 'object') {
                const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(aiResult.description, aiResult.tags);
                description = clean.description;
                tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
                console.log('⚠️ Animated sticker processed using fallback single-frame analysis');
              } else {
                console.warn('Resultado inválido do fallback para sticker animado:', aiResult);
                description = 'Sticker animado detectado - análise de conteúdo não disponível';
                tags = 'sticker,animado,sem-analise';
              }
            }
          }
        } else {
          // Regular static image processing
          const aiResult = await getAiAnnotations(pngBuffer);
          if (aiResult && typeof aiResult === 'object') {
            const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(aiResult.description, aiResult.tags);
            description = clean.description;
            tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
            extractedText = aiResult.text || null;
            // Incorporate extracted text into description if available
            if (extractedText && extractedText.trim()) {
              description = `${description} [Texto: ${extractedText.trim()}]`;
            }
          } else {
            console.warn('Resultado inválido do processamento de imagem:', aiResult);
            description = '';
            tags = '';
            extractedText = null;
          }
        }
      } else if (message.mimetype.startsWith('audio/')) {
        try {
          description = await transcribeAudioBuffer(buffer);
          if (description) {
            const prompt = `\nVocê é um assistente que recebe a transcrição de um áudio em português e deve gerar até 5 tags relevantes, separadas por vírgula, relacionadas ao conteúdo dessa transcrição.\n\nTranscrição:\n${description}\n\nResposta (tags separadas por vírgula):\n              `.trim();
            const tagResult = await getAiAnnotationsFromPrompt(prompt);
            if (tagResult && typeof tagResult === 'object') {
              const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(null, tagResult.tags);
              tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
            } else {
              console.warn('Resultado inválido do processamento de tags de áudio:', tagResult);
              tags = '';
            }
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

    const mediaId = await saveMedia({
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
      nsfw: nsfw ? 1 : 0,
      extractedText
    });

    // Save tags if any were extracted
    if (tags && tags.trim()) {
      console.log(`[MediaProcessor] Salvando tags para media ${mediaId}: "${tags}"`);
      await updateMediaTags(mediaId, tags);
    } else {
      console.log(`[MediaProcessor] Nenhuma tag para salvar para media ${mediaId}, tags: "${tags}"`);
    }

    const savedMedia = await findById(mediaId);
    const savedTags = await getTagsForMedia(mediaId);
    const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(savedMedia.description, savedTags);

    // Check if this video is actually a GIF-like animation
    let isGifLike = wasProcessedAsGifLike; // Use the flag from processing
    //console.log(`[MediaProcessor] wasProcessedAsGifLike: ${wasProcessedAsGifLike}, mimetypeToSave: ${mimetypeToSave}`);
    if (!isGifLike && mimetypeToSave.startsWith('video/')) {
      // Só tenta analisar se o arquivo realmente existe
      if (fs.existsSync(filePath)) {
        isGifLike = await isGifLikeVideo(filePath, mimetypeToSave);
      } else {
        console.warn(`[MediaProcessor] Arquivo de vídeo não existe para análise GIF-like: ${filePath}`);
      }
    }

    // Check if this is a GIF (either image/gif or GIF-like video)
    const isGif = mimetypeToSave === 'image/gif' || isGifLike;

    // For GIFs, send the animated sticker first, then the description
    if (isGif) {
      console.log('🎞️ Enviando GIF como sticker animado...');
      try {
        await sendStickerForMediaRecord(client, chatId, savedMedia);
      } catch (stickerError) {
        console.warn('Erro ao enviar sticker do GIF, continuando com resposta de texto:', stickerError.message);
      }
    }

    let responseMessage = generateResponseMessage(mimetypeToSave, isGifLike);
    responseMessage += `📝 ${clean.description || ''}\n`;
    responseMessage += `🏷️ ${clean.tags.length > 0 ? clean.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n`;
    responseMessage += `🆔 ${savedMedia.id}`;

    await safeReply(client, chatId, responseMessage, message.id);

    } catch (e) {
      console.error('Erro ao processar mídia:', e);
      if (e.response && e.response.data) {
        console.error('Detalhes do erro de resposta:', e.response.data);
      }
      await safeReply(client, message.from, 'Erro ao processar sua mídia.', message.id);
    } finally {
      if (tmpFilePath) {
        try {
          fs.unlinkSync(tmpFilePath);
        } catch (cleanupErr) {
          if (cleanupErr && cleanupErr.code !== 'ENOENT') {
            console.warn('[MediaProcessor] Falha ao remover arquivo temporário:', cleanupErr.message);
          }
        }
      }
    }
  });
}

module.exports = {
  processIncomingMedia
};
