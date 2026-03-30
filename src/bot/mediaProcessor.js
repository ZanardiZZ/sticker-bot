const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { downloadMediaForMessage } = require('../utils/mediaDownload');
const {
  getMD5,
  getHashVisual,
  isDegenerateHash,
  isValidHash,
  findByHashVisual,
  findSimilarByHashVisual,
  findById,
  saveMedia,
  getTagsForMedia,
  linkMessageToMedia
} = require('../database/index.js');
const { logProcessing } = require('../database/models/mediaMetrics');
const { isNSFW } = require('../services/nsfwFilter');
const { isVideoNSFW } = require('../services/nsfwVideoFilter');
const {
  getAiAnnotations,
  transcribeAudioBuffer,
  getAiAnnotationsForGif,
  getTagsFromTextPrompt
} = require('../services/ai');
const { processVideo, processGif, processAnimatedWebp } = require('../services/videoProcessor');
const { updateMediaDescription, updateMediaTags } = require('../database/index.js');
const { forceMap, MAX_TAGS_LENGTH, clearDescriptionCmds, forceVideoToStickerMap } = require('../commands');
const { cleanDescriptionTags } = require('../utils/messageUtils');
const { generateResponseMessage } = require('../utils/responseMessage');
const { safeReply } = require('../utils/safeMessaging');
const { isAnimatedWebpBuffer, sendStickerForMediaRecord } = require('./stickers');
const { isGifLikeVideo } = require('../utils/gifDetection');
const { withTyping } = require('../utils/typingIndicator');
const { BOT_MEDIA_DIR, BOT_TEMP_DIR } = require('../paths');

const MAX_STICKER_BYTES = 1024 * 1024; // WhatsApp animated sticker limit ≈1MB
let ffmpegFactory = null;

function isValidHashSafe(hash, isAnimated = false) {
  if (typeof isValidHash === 'function') {
    return isValidHash(hash, isAnimated);
  }
  return Boolean(hash);
}

function isDegenerateHashSafe(hash) {
  if (typeof isDegenerateHash === 'function') {
    return isDegenerateHash(hash);
  }
  return false;
}

async function findSimilarMediaSafe(hashVisual) {
  if (!hashVisual) return null;
  if (typeof findSimilarByHashVisual === 'function') {
    return findSimilarByHashVisual(hashVisual, 102);
  }
  if (typeof findByHashVisual === 'function') {
    return findByHashVisual(hashVisual);
  }
  return null;
}

async function updateMediaTagsSafe(mediaId, tags) {
  if (typeof updateMediaTags === 'function') {
    return updateMediaTags(mediaId, tags);
  }
}

async function linkMessageToMediaSafe(messageId, mediaId, chatId) {
  if (typeof linkMessageToMedia === 'function') {
    return linkMessageToMedia(messageId, mediaId, chatId);
  }
}

async function getTagsForMediaSafe(mediaId) {
  if (typeof getTagsForMedia === 'function') {
    return getTagsForMedia(mediaId);
  }
  return [];
}

const STOPWORDS_PT = new Set([
  'de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'por', 'com', 'que', 'quem', 'quando',
  'onde', 'como', 'uma', 'umas', 'uns', 'um', 'ao', 'aos', 'e', 'em', 'no', 'na', 'nos',
  'nas', 'sobre', 'entre', 'sem', 'mais', 'menos', 'muito', 'muita', 'muitos', 'muitas',
  'pouco', 'pouca', 'poucos', 'poucas', 'esse', 'essa', 'isso', 'aquele', 'aquela', 'aquilo',
  'dessa', 'desse', 'isso', 'isso', 'já', 'tão', 'também', 'porque', 'porquê', 'ser', 'está',
  'estão', 'estou', 'estamos', 'fui', 'foi', 'são', 'era', 'era', 'vai', 'vou', 'vamos',
  'assim', 'aqui', 'ali', 'lá', 'então', 'agora', 'hoje', 'amanhã', 'ontem'
]);

function fallbackTagsFromText(text, limit = 5) {
  if (!text || typeof text !== 'string') return [];
  const normalized = text
    .toLowerCase()
    .replace(/[#!?,.;:()"'`]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return [];

  const words = normalized.split(' ');
  const tags = [];
  for (const word of words) {
    const clean = word.replace(/[^\p{L}\p{N}_-]+/gu, '');
    if (clean.length < 3) continue;
    if (STOPWORDS_PT.has(clean)) continue;
    if (!tags.includes(clean)) tags.push(clean);
    if (tags.length >= limit) break;
  }
  return tags;
}

function inferExtensionFromMimetype(mimetype) {
  if (!mimetype || typeof mimetype !== 'string') return 'bin';
  const slashIndex = mimetype.indexOf('/');
  if (slashIndex === -1) return 'bin';
  let subtype = mimetype.slice(slashIndex + 1);
  const semicolonIndex = subtype.indexOf(';');
  if (semicolonIndex !== -1) subtype = subtype.slice(0, semicolonIndex);
  const plusIndex = subtype.indexOf('+');
  if (plusIndex !== -1) subtype = subtype.slice(0, plusIndex);
  const clean = subtype.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return clean || 'bin';
}

function setFfmpegFactory(factory) {
  ffmpegFactory = typeof factory === 'function' ? factory : null;
}

function loadFfmpeg() {
  if (ffmpegFactory) {
    return ffmpegFactory();
  }
  return require('fluent-ffmpeg');
}

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

async function processIncomingMedia(client, message, resolvedSenderId = null) {
  const chatId = message.from;

  // Metrics tracking
  const processingStartTs = Math.floor(Date.now() / 1000);
  const processingStartMs = Date.now();
  let savedMediaId = null;
  let mediaType = null;
  let fileSizeBytes = null;

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
    const ext = inferExtensionFromMimetype(effectiveMimetype);
  const tmpDir = BOT_TEMP_DIR;
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  tmpFilePath = path.join(tmpDir, `media-tmp-${Date.now()}-${Math.floor(Math.random()*10000)}.${ext}`);
  await fs.promises.writeFile(tmpFilePath, buffer);
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
        const calculatedHash = await getHashVisual(pngBuffer);

        // Validate hash before using
        // NOTE: Accept degenerate hashes (e.g. transparent images with many zeros)
        // Degenerate filtering happens only during duplicate comparison
        if (calculatedHash && isValidHashSafe(calculatedHash, false)) {
          hashVisual = calculatedHash;
          const isDegenerate = isDegenerateHashSafe(calculatedHash);
          if (isDegenerate) {
            console.log(`[MediaProcessor] Accepting degenerate hash for static image (likely transparent/low entropy): ${calculatedHash.substring(0, 40)}...`);
          }
        } else {
          console.warn(`[MediaProcessor] Calculated hash rejected for static image:
  Hash: ${calculatedHash ? calculatedHash.substring(0, 40) + '...' : 'NULL'}
  isValid: ${calculatedHash ? isValidHashSafe(calculatedHash, false) : false}
  Reason: ${!calculatedHash ? 'null hash' : 'invalid hash format'}`);
          hashVisual = null;
        }

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
              // Only include valid, non-degenerate hashes to prevent false positives
              if (frameHash && isValidHashSafe(frameHash, false) && !isDegenerateHashSafe(frameHash)) {
                sampleHashes.push(frameHash);
              } else if (frameHash) {
                console.warn(`[MediaProcessor] Frame ${frameIndex} hash is invalid or degenerate (${contextLabel}), skipping`);
              }
            } catch (frameErr) {
              console.warn(`[MediaProcessor] Falha ao extrair frame ${frameIndex} para hash (${contextLabel || 'sem contexto'}):`, frameErr.message);
            }
          }
        }

        if (sampleHashes.length > 0) {
          hashVisual = sampleHashes.join(':');
          // Validate multi-frame hash
          if (!isValidHashSafe(hashVisual, true)) {
            console.warn(`[MediaProcessor] Multi-frame hash is invalid (${contextLabel}), discarding`);
            hashVisual = null;
          }
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
          const calculatedHash = await getHashVisual(pngBuffer);
          // Validate hash before using
          // NOTE: Accept degenerate hashes - filtering happens during duplicate comparison
          if (calculatedHash && isValidHashSafe(calculatedHash, false)) {
            hashVisual = calculatedHash;
            const isDegenerate = isDegenerateHashSafe(calculatedHash);
            if (isDegenerate) {
              console.log(`[MediaProcessor] Accepting degenerate hash (${contextLabel}, likely low entropy): ${calculatedHash.substring(0, 40)}...`);
            }
          } else {
            console.warn(`[MediaProcessor] Calculated hash rejected (${contextLabel}):
  Hash: ${calculatedHash ? calculatedHash.substring(0, 40) + '...' : 'NULL'}
  isValid: ${calculatedHash ? isValidHashSafe(calculatedHash, false) : false}
  Reason: ${!calculatedHash ? 'null hash' : 'invalid hash format'}`);
            hashVisual = null;
          }
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
      console.error(`[MediaProcessor] Image processing failed:
  Mimetype: ${message.mimetype}
  pngBuffer: ${pngBuffer === null ? 'NULL' : 'OK'}
  hashVisual: ${hashVisual === null ? 'NULL' : hashVisual ? hashVisual.substring(0, 30) + '...' : 'empty'}
  hashMd5: ${hashMd5 === null ? 'NULL' : 'OK'}
  File: ${tmpFilePath}`);
      await safeReply(client, chatId, 'Erro: formato de imagem não suportado para processamento de sticker.', message.id);
      return; // finally block will cleanup tmpFilePath
    }
    if (message.mimetype === 'image/gif' && (pngBuffer === null || hashMd5 === null)) {
      await safeReply(client, chatId, 'Erro: não foi possível processar este GIF para sticker.', message.id);
      return; // finally block will cleanup tmpFilePath
    }
    if (message.mimetype.startsWith('image/') && message.mimetype !== 'image/gif') {
      const isStickerMessage = message.type === 'sticker' || message.isSticker === true;
      const incomingAnimatedWebp = message.mimetype === 'image/webp' && isAnimatedWebpBuffer(buffer);
      const shouldPreserveOriginalWebp = message.mimetype === 'image/webp' && (isStickerMessage || incomingAnimatedWebp);
      if (shouldPreserveOriginalWebp) {
        bufferWebp = Buffer.from(buffer);
        await ensureVisualHashFromBuffer(bufferWebp, incomingAnimatedWebp ? 'animated-webp' : 'sticker');
      } else {
        const TARGET_STICKER_SIZE = 512;
        const maintainAlphaBackground = { r: 0, g: 0, b: 0, alpha: 0 };
        const webpOptions = {
          quality: 90,
          alphaQuality: 100,
          smartSubsample: true,
          effort: 6
        };

        const sharpOptions = message.mimetype === 'image/webp' ? { animated: true } : undefined;
        const makeSharp = () => (sharpOptions ? sharp(tmpFilePath, sharpOptions) : sharp(tmpFilePath));

        // Replica a estratégia usada nos GIFs animados: mantêm aspecto original,
        // centraliza em canvas 512x512 e evita cortes ou distorções.
        bufferWebp = await makeSharp()
          .resize(TARGET_STICKER_SIZE, TARGET_STICKER_SIZE, {
            fit: 'contain',
            position: 'centre',
            background: maintainAlphaBackground,
            withoutEnlargement: true
          })
          .webp(webpOptions)
          .toBuffer();

        // Garante compatibilidade com stickers muito pequenos preservando dimensões originais
        // quando nenhuma transformação é necessária.
        if (!bufferWebp || bufferWebp.length === 0) {
          bufferWebp = await makeSharp().webp(webpOptions).toBuffer();
        }

        if (!bufferWebp || bufferWebp.length === 0) {
          throw new Error('Falha ao converter imagem estática para WebP padronizado');
        }
      }

      extToSave = 'webp';
      mimetypeToSave = 'image/webp';
    } else if (message.mimetype === 'image/gif') {
      try {
        const gifSharp = sharp(tmpFilePath, { animated: true });
        const metadata = await gifSharp.metadata();
        const { pageHeight, height, width } = metadata;
        const animatedBase = {
          loop: 0,
          effort: 6,
          smartSubsample: true,
        };
        const targetPageHeight = pageHeight || height;
        if (targetPageHeight) {
          animatedBase.pageHeight = targetPageHeight;
        }

        // Strategy: Try quality reduction first, then combine with dimension reduction if needed
        const qualityLevels = [
          { quality: 85, nearLossless: true },
          { quality: 75, nearLossless: false },
          { quality: 65, nearLossless: false }
        ];
        
        // Dimension reduction targets if quality alone doesn't work
        const dimensionTargets = [512, 480, 400, 320];
        
        let lastBuffer = null;
        let successfulDimension = null;
        let successfulQuality = null;

        // Try quality reduction without resizing in parallel
        try {
          const qualityAttempts = qualityLevels.map(async (qualityAttempt) => {
            try {
              const candidate = await gifSharp
                .clone()
                .webp({ ...animatedBase, lossless: false, ...qualityAttempt })
                .toBuffer();

              if (candidate.length <= MAX_STICKER_BYTES) {
                return {
                  success: true,
                  buffer: candidate,
                  quality: qualityAttempt.quality,
                  size: candidate.length
                };
              }
              return { success: false, buffer: candidate, quality: qualityAttempt.quality };
            } catch (attemptErr) {
              console.warn('[MediaProcessor] GIF WebP quality attempt falhou:', attemptErr.message);
              return { success: false, error: attemptErr.message };
            }
          });

          // Wait for all attempts and find the best one
          const results = await Promise.all(qualityAttempts);
          const successful = results.find(r => r.success);

          if (successful) {
            lastBuffer = successful.buffer;
            successfulQuality = successful.quality;
            console.log(`[MediaProcessor] GIF convertido com qualidade ${successful.quality} - Tamanho: ${Math.round(successful.size / 1024)}KB`);
          } else {
            // Use the smallest buffer even if above limit
            const sorted = results.filter(r => r.buffer).sort((a, b) => a.buffer.length - b.buffer.length);
            if (sorted.length > 0) {
              lastBuffer = sorted[0].buffer;
              successfulQuality = sorted[0].quality;
            }
          }
        } catch (qualityErr) {
          console.warn('[MediaProcessor] Erro nas tentativas paralelas de qualidade:', qualityErr.message);
        }

        // If still too large, try combining dimension reduction with quality reduction in parallel
        if (lastBuffer && lastBuffer.length > MAX_STICKER_BYTES) {
          console.log(`[MediaProcessor] GIF ainda grande (${Math.round(lastBuffer.length / 1024)}KB), tentando redução de dimensões em paralelo...`);

          // Generate all combinations of dimensions and qualities
          const resizeAttempts = [];
          for (const targetSize of dimensionTargets) {
            // Skip if already smaller than target
            if (width <= targetSize && height <= targetSize) {
              continue;
            }

            for (const qualityAttempt of qualityLevels) {
              resizeAttempts.push({ targetSize, quality: qualityAttempt });
            }
          }

          // Try all combinations in parallel
          const resizeResults = await Promise.all(
            resizeAttempts.map(async ({ targetSize, quality }) => {
              try {
                const resizedMetadata = metadata;
                const resizedPageHeight = resizedMetadata.pageHeight || resizedMetadata.height;

                const resizedBase = {
                  loop: 0,
                  effort: 6,
                  smartSubsample: true,
                };

                if (resizedPageHeight) {
                  const scaleFactor = targetSize / Math.max(width, height);
                  resizedBase.pageHeight = Math.round(resizedPageHeight * scaleFactor);
                }

                const candidate = await gifSharp
                  .clone()
                  .resize(targetSize, targetSize, {
                    fit: 'inside',
                    withoutEnlargement: true
                  })
                  .webp({ ...resizedBase, lossless: false, ...quality })
                  .toBuffer();

                if (candidate.length <= MAX_STICKER_BYTES) {
                  return {
                    success: true,
                    buffer: candidate,
                    dimension: targetSize,
                    quality: quality.quality,
                    size: candidate.length
                  };
                }
                return {
                  success: false,
                  buffer: candidate,
                  dimension: targetSize,
                  quality: quality.quality,
                  size: candidate.length
                };
              } catch (resizeErr) {
                console.warn(`[MediaProcessor] GIF resize to ${targetSize}px failed:`, resizeErr.message);
                return { success: false, error: resizeErr.message };
              }
            })
          );

          // Find the best successful result or smallest buffer
          const successfulResize = resizeResults.find(r => r.success);
          if (successfulResize) {
            lastBuffer = successfulResize.buffer;
            successfulDimension = successfulResize.dimension;
            successfulQuality = successfulResize.quality;
            console.log(`[MediaProcessor] GIF convertido com redimensionamento ${successfulResize.dimension}px e qualidade ${successfulResize.quality} - Tamanho: ${Math.round(successfulResize.size / 1024)}KB`);
          } else {
            // Use the smallest result even if above limit
            const sorted = resizeResults.filter(r => r.buffer).sort((a, b) => a.size - b.size);
            if (sorted.length > 0) {
              lastBuffer = sorted[0].buffer;
              successfulDimension = sorted[0].dimension;
              successfulQuality = sorted[0].quality;
            }
          }
        }

        bufferWebp = lastBuffer;
        await ensureVisualHashFromBuffer(bufferWebp, 'gif');
        gifSourceForAnalysis = tmpFilePath;
        
        if (bufferWebp && bufferWebp.length > MAX_STICKER_BYTES) {
          const sizeInMB = (bufferWebp.length / (1024 * 1024)).toFixed(2);
          console.warn(`[MediaProcessor] GIF muito grande para figurinha animada (${sizeInMB}MB mesmo após todas tentativas de compressão)`);
          console.warn(`[MediaProcessor] WhatsApp pode rejeitar ou converter para figurinha estática`);
          
          // Last resort: try converting to static sticker at highest quality
          console.log('[MediaProcessor] Tentando conversão para figurinha estática como fallback...');
          try {
            const staticSharp = sharp(tmpFilePath, { animated: false, page: 0 });
            const staticBuffer = await staticSharp
              .resize(512, 512, {
                fit: 'inside',
                withoutEnlargement: true
              })
              .webp({ quality: 90, effort: 6 })
              .toBuffer();
            
            if (staticBuffer && staticBuffer.length <= MAX_STICKER_BYTES) {
              console.log(`[MediaProcessor] GIF convertido para figurinha estática - Tamanho: ${Math.round(staticBuffer.length / 1024)}KB`);
              bufferWebp = staticBuffer;
              // Notify user that GIF was converted to static
              await safeReply(client, chatId, 
                '⚠️ Este GIF é muito grande para ser enviado como figurinha animada. Foi convertido para figurinha estática.',
                message.id
              );
            }
          } catch (staticErr) {
            console.warn('[MediaProcessor] Falha na conversão para figurinha estática:', staticErr.message);
          }
        } else if (successfulDimension) {
          console.log(`[MediaProcessor] GIF redimensionado de ${width}x${height} para max ${successfulDimension}px para caber em 1MB`);
        }
      } catch (e) {
        console.warn('[MediaProcessor] Erro ao converter GIF para webp animado:', e.message);
        bufferWebp = null;
      }
      extToSave = 'webp';
      mimetypeToSave = 'image/webp';
    } else if (message.mimetype.startsWith('video/')) {
      // Detecta se é um vídeo GIF-like (curto, sem áudio, etc.) ou se o usuário forçou a conversão
      const forceVideoSticker = !!(forceVideoToStickerMap instanceof Map
        ? forceVideoToStickerMap.get(chatId)
        : forceVideoToStickerMap?.[chatId]);

      if (forceVideoSticker) {
        if (forceVideoToStickerMap instanceof Map) {
          forceVideoToStickerMap.delete(chatId);
        } else {
          forceVideoToStickerMap[chatId] = false;
        }
        console.log('[MediaProcessor] Conversão para figurinha animada forçada pelo usuário (ignorando áudio do vídeo)');
      }

      // Check if this is a WhatsApp GIF (MP4 video with isGif flag)
      const isWhatsAppGif = message.isWhatsAppGif === true;
      if (isWhatsAppGif) {
        console.log('[MediaProcessor] WhatsApp GIF detected (isWhatsAppGif=true), forcing GIF-like processing');
      }

      let isGifLike = false;
      if (forceVideoSticker || isWhatsAppGif) {
        isGifLike = true;
      } else {
        try {
          isGifLike = await isGifLikeVideo(tmpFilePath, message.mimetype);
        } catch (e) {
          console.warn('[MediaProcessor] Erro ao detectar GIF-like:', e.message);
        }
      }

      if (isGifLike) {
        // Converte vídeo GIF-like para webp animado usando ffmpeg
        gifSourceForAnalysis = tmpFilePath;
        try {
          const ffmpeg = loadFfmpeg();
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
          let compressionNoticeSent = false;
          const sendCompressionNotice = async (candidateSizeBytes = null) => {
            if (compressionNoticeSent) return;

            const sizeInMb = candidateSizeBytes
              ? (candidateSizeBytes / MAX_STICKER_BYTES).toFixed(2)
              : null;
            const noticeMessage = sizeInMb
              ? `Recebi um GIF curtinho mas grandinho (~${sizeInMb}MB). Estou compactando para caber como figurinha animada, aguarde só um instante...`
              : 'Recebi um GIF curtinho mas grandinho. Estou compactando para caber como figurinha animada, aguarde só um instante...';

            try {
              await safeReply(client, chatId, noticeMessage, message.id);
            } catch (noticeErr) {
              console.warn('[MediaProcessor] Aviso de compactação falhou:', noticeErr.message);
            }

            if (typeof client?.simulateTyping === 'function') {
              try {
                await client.simulateTyping(chatId, true);
              } catch (typingErr) {
                console.warn('[MediaProcessor] Falha ao manter indicador de digitação ativo durante compactação:', typingErr.message);
              }
            }

            compressionNoticeSent = true;
          };

          if (String(message.mimetype || '').startsWith('video/')) {
            await sendCompressionNotice();
          }

          for (const [attemptIndex, attempt] of ffmpegAttempts.entries()) {
            try {
              if (attemptIndex > 0 && !compressionNoticeSent) {
                await sendCompressionNotice();
              }

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

              const candidate = await fs.promises.readFile(outPath);
              convertedBuffer = candidate;

              const withinStickerLimit = candidate.length <= MAX_STICKER_BYTES;
              if (!withinStickerLimit && !compressionNoticeSent) {
                await sendCompressionNotice(candidate.length);
              }

              if (withinStickerLimit) {
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
        // Não é GIF-like, salva vídeo no formato original
        console.log('[MediaProcessor] Vídeo regular (não GIF-like) detectado, salvando no formato original');
        bufferWebp = null;
        // Mantém extToSave e mimetypeToSave originais (ext e message.mimetype)
        // Não define extToSave/mimetypeToSave aqui - usa os valores padrão definidos anteriormente
      }
    }

  // ...

    const forceInsert = !!(forceMap instanceof Map ? forceMap.get(chatId) : forceMap?.[chatId]);

    console.log(`[DuplicateCheck] forceInsert: ${forceInsert}, hashVisual: ${hashVisual ? hashVisual.substring(0, 40) + '...' : 'NULL'}`);

    if (!forceInsert && hashVisual) {
      // Use Hamming distance matching with threshold of 102 bits (out of 1024)
      // This represents ~90% similarity (10% difference allowed)
      console.log('[DuplicateCheck] Calling duplicate lookup');
      const existing = await findSimilarMediaSafe(hashVisual);
      console.log(`[DuplicateCheck] duplicate lookup returned: ${existing ? `ID ${existing.id}, distance ${existing._hammingDistance}` : 'NULL (no match)'}`);
      if (existing) {
        const similarity = existing._hammingDistance === 0
          ? 'idêntica'
          : `${Math.round((1024 - existing._hammingDistance) / 1024 * 100)}% similar`;
        console.log(`[DuplicateCheck] BLOCKING save - duplicate found (ID ${existing.id}, ${similarity})`);
        await safeReply(
          client,
          chatId,
          `Mídia visualmente semelhante já existe no banco (${similarity}). ID: ${existing.id}. Use #forçar respondendo à mídia para salvar duplicado ou use #ID ${existing.id} para solicitar esta mídia.`,
          message.id
        );
        return;
      }
      console.log(`[DuplicateCheck] No duplicate found - proceeding with save`);
    } else {
      if (!hashVisual) {
        console.log(`[DuplicateCheck] SKIPPED - hashVisual is NULL/empty`);
      } else if (forceInsert) {
        console.log(`[DuplicateCheck] SKIPPED - forceInsert is true`);
      }
      if (forceMap instanceof Map) {
        forceMap.delete(chatId);
      } else {
        forceMap[chatId] = false;
      }
    }

    const dir = BOT_MEDIA_DIR;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const fileName = `media-${Date.now()}.${extToSave}`;
    const filePath = path.join(dir, fileName);
    // Salva webp para stickers (imagens e GIF-like), ou formato original para vídeos regulares
    if (extToSave === 'webp') {
      if (bufferWebp) {
        await fs.promises.writeFile(filePath, bufferWebp);
        fileSizeBytes = bufferWebp.length;

        // Protect file from modification (readonly)
        try {
          await fs.promises.chmod(filePath, 0o444);
        } catch (chmodErr) {
          console.warn('[MediaProcessor] Failed to set file readonly:', chmodErr.message);
        }
      } else {
        await safeReply(client, chatId, 'Erro ao converter a mídia para sticker. O formato pode não ser suportado.', message.id);
        return;
      }
    } else {
      try {
        fs.copyFileSync(tmpFilePath, filePath);
        const stats = await fs.promises.stat(filePath);
        fileSizeBytes = stats.size;

        // Protect file from modification (readonly)
        try {
          await fs.promises.chmod(filePath, 0o444);
        } catch (chmodErr) {
          console.warn('[MediaProcessor] Failed to set file readonly:', chmodErr.message);
        }
      } catch (copyErr) {
        console.error('[MediaProcessor] Falha ao persistir mídia original:', copyErr);
        throw copyErr;
      }
    }

    const groupId = message.from.endsWith('@g.us') ? message.from : null;
    
    // Determine chat_id for database storage
    // In groups: use sender's ID (not group ID) to ensure proper counting
    // In 1-on-1: use message.from (which is the sender's chat)
    const chatIdForDb = groupId ? (resolvedSenderId || message?.sender?.id || message?.author || message.from) : chatId;

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
          let rawTags = [];

          if (description) {
            const prompt = [
              'Você receberá a transcrição de um áudio em português.',
              'Gere no máximo 5 tags curtas, sem espaços, relacionadas ao conteúdo.',
              'Responda apenas com as tags separadas por vírgula.',
              'Transcrição:',
              description
            ].join('\n');

            const tagResult = await getTagsFromTextPrompt(prompt);
            if (tagResult && Array.isArray(tagResult.tags) && tagResult.tags.length > 0) {
              rawTags = tagResult.tags;
            } else {
              console.warn('Tags por IA ausentes, gerando fallback baseado na transcrição.');
              rawTags = fallbackTagsFromText(description);
            }
          }

          if (!rawTags || rawTags.length === 0) {
            rawTags = fallbackTagsFromText(description);
          }

          const clean = (cleanDescriptionTags || fallbackCleanDescriptionTags)(description, rawTags);
          tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
        } catch (err) {
          console.warn('Erro ao processar áudio:', err);
          description = description || '';
          const fallback = fallbackTagsFromText(description);
          tags = fallback.length > 0 ? fallback.join(',') : '';
        }
      }
    } else {
      description = '';
      tags = '';
    }

    const senderId = resolvedSenderId ||
      message?.sender?.id ||
      message?.author ||
      (message?.from && !String(message.from).endsWith('@g.us') ? message.from : null);

    const mediaId = await saveMedia({
      chatId: chatIdForDb,
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

    // Capture media ID and type for metrics
    savedMediaId = mediaId;
    if (wasProcessedAsGifLike || mimetypeToSave === 'image/gif') {
      mediaType = 'gif';
    } else if (mimetypeToSave === 'image/webp' && extToSave === 'webp') {
      mediaType = 'animated_webp';
    } else if (mimetypeToSave.startsWith('video/')) {
      mediaType = 'video';
    } else if (mimetypeToSave.startsWith('image/')) {
      mediaType = 'image';
    } else {
      mediaType = 'other';
    }

    // Save tags if any were extracted
    if (tags && tags.trim()) {
      console.log(`[MediaProcessor] Salvando tags para media ${mediaId}: "${tags}"`);
      await updateMediaTagsSafe(mediaId, tags);
    } else {
      console.log(`[MediaProcessor] Nenhuma tag para salvar para media ${mediaId}, tags: "${tags}"`);
    }

    // Link this message to the saved media for reaction tracking
    const messageId = message.id || message.key?.id;
    if (messageId && mediaId) {
      try {
        await linkMessageToMediaSafe(messageId, mediaId, chatId);
        console.log(`[MediaProcessor] Linked message ${messageId} to media ${mediaId}`);
      } catch (linkErr) {
        console.warn(`[MediaProcessor] Failed to link message to media: ${linkErr.message}`);
      }
    }

    const savedMedia = await findById(mediaId);
    const savedTags = await getTagsForMediaSafe(mediaId);
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

    // Send sticker before textual description for any image-based media
    const isImageBasedMedia = typeof mimetypeToSave === 'string' && mimetypeToSave.startsWith('image/');
    const treatedAsGif = isGifLike || message?.mimetype === 'image/gif';

    if (isImageBasedMedia) {
      console.log(treatedAsGif ? '🎞️ Enviando GIF como sticker animado...' : '🖼️ Enviando imagem como sticker...');
      try {
        await sendStickerForMediaRecord(client, chatId, savedMedia);
      } catch (stickerError) {
        const contextLabel = treatedAsGif ? 'GIF' : 'imagem';
        console.warn(`Erro ao enviar sticker da ${contextLabel}, continuando com resposta de texto:`, stickerError.message);
      }
    }

    let responseMessage = generateResponseMessage(mimetypeToSave, isGifLike);
    responseMessage += `📝 ${clean.description || ''}\n`;
    responseMessage += `🏷️ ${clean.tags.length > 0 ? clean.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n`;
    responseMessage += `🆔 ${savedMedia.id}`;

    await safeReply(client, chatId, responseMessage, message.id);

    // Log processing metrics
    try {
      const processingEndTs = Math.floor(Date.now() / 1000);
      const durationMs = Date.now() - processingStartMs;
      await logProcessing({
        mediaId: savedMediaId,
        processingStartTs,
        processingEndTs,
        durationMs,
        mediaType: mediaType || 'unknown',
        fileSizeBytes,
        success: true
      });
    } catch (metricsErr) {
      console.warn('[MediaProcessor] Failed to log processing metrics:', metricsErr.message);
    }

    } catch (e) {
      console.error('Erro ao processar mídia:', e);
      if (e.response && e.response.data) {
        console.error('Detalhes do erro de resposta:', e.response.data);
      }
      
      // Provide more specific error messages based on the error type
      let userMessage = 'Erro ao processar sua mídia.';
      
      if (e.message && e.message.includes('media_download_failed')) {
        userMessage = '⚠️ Não foi possível baixar a mídia. Isso pode acontecer se:\n' +
                     '• A mídia expirou no WhatsApp (tente reenviar)\n' +
                     '• Há problemas de conexão temporários\n' +
                     '• O arquivo é muito grande\n\n' +
                     'Por favor, tente enviar novamente.';
      } else if (e.message && e.message.includes('timeout')) {
        userMessage = '⏱️ O download da mídia demorou muito e foi cancelado. Por favor, tente enviar novamente ou envie um arquivo menor.';
      } else if (e.message && e.message.includes('media_expired')) {
        userMessage = '⚠️ Esta mídia expirou no WhatsApp. Por favor, envie novamente.';
      } else if (e.message && e.message.includes('media_not_found')) {
        userMessage = '❌ Mídia não encontrada. Por favor, envie novamente.';
      }
      
      await safeReply(client, message.from, userMessage, message.id);

      // Log failed processing metrics
      try {
        const processingEndTs = Math.floor(Date.now() / 1000);
        const durationMs = Date.now() - processingStartMs;
        await logProcessing({
          mediaId: savedMediaId,
          processingStartTs,
          processingEndTs,
          durationMs,
          mediaType: mediaType || 'unknown',
          fileSizeBytes,
          success: false
        });
      } catch (metricsErr) {
        console.warn('[MediaProcessor] Failed to log error metrics:', metricsErr.message);
      }
    } finally {
      if (tmpFilePath) {
        try {
          await fs.promises.unlink(tmpFilePath);
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
  processIncomingMedia,
  __setFfmpegFactory: setFfmpegFactory
};
