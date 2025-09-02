/**
 * Processing model - handles media processing operations like WebP repair and old stickers
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const os = require('os');
const mime = require('mime-types');
const { getAiAnnotations } = require('../../services/ai');
const { getMD5, getHashVisual, isFileProcessed, upsertProcessedFile } = require('../utils');
const { findByHashVisual, saveMedia } = require('./media');

// Conditional loading for FFmpeg - these may fail in some environments due to network restrictions
let ffmpeg = null;
let ffmpegPath = null;

try {
  ffmpeg = require('fluent-ffmpeg');
  ffmpegPath = require('ffmpeg-static');
  
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
} catch (ffmpegError) {
  console.warn('[Processing] FFmpeg não disponível:', ffmpegError.message);
  console.warn('[Processing] Funcionalidades de reparo de WebP serão desabilitadas');
}

// Variable for old stickers path will be read from .env
const OLD_STICKERS_PATH = process.env.OLD_STICKERS_PATH || null;
// Limit of stickers to process at once
const PROCESS_BATCH_SIZE = 5;

/**
 * Robustly processes WebP files with corruption handling and repair attempts
 * @param {Buffer} buffer - Original file buffer
 * @param {string} fileName - File name for logging
 * @returns {Promise<Buffer>} - Processed WebP buffer
 */
async function processWebpWithRepair(buffer, fileName) {
  // First attempt: Try standard Sharp processing
  try {
    const webpBuffer = await sharp(buffer, { animated: true }).webp().toBuffer();
    return webpBuffer;
  } catch (sharpError) {
    console.warn(`[old-stickers] Sharp failed for ${fileName}: ${sharpError.message}`);
    
    // Second attempt: Try without animated flag (may help with some corrupted animated WebPs)
    try {
      const webpBuffer = await sharp(buffer).webp().toBuffer();
      console.log(`[old-stickers] ✅ Recovered ${fileName} by disabling animated flag`);
      return webpBuffer;
    } catch (secondError) {
      console.warn(`[old-stickers] Sharp non-animated failed for ${fileName}: ${secondError.message}`);
      
      // Third attempt: Try to repair using ffmpeg conversion
      if (ffmpeg && ffmpegPath) {
        try {
          const tempDir = path.join(os.tmpdir(), 'myapp-temp');
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
          const uniqueId = crypto.randomBytes(16).toString('hex');
          const tempInput = path.join(tempDir, `repair_input_${uniqueId}.webp`);
          const tempOutput = path.join(tempDir, `repair_output_${uniqueId}.webp`);
          try {
            // Write corrupted file to temp location
            fs.writeFileSync(tempInput, buffer);
            
            // Use ffmpeg to repair/re-encode the WebP
            await new Promise((resolve, reject) => {
              ffmpeg(tempInput)
                .outputOptions(['-c:v libwebp', '-q:v 80', '-preset default', '-an'])
                .output(tempOutput)
                .on('end', resolve)
                .on('error', reject)
                .run();
            });
            
            // Read the repaired file
            const repairedBuffer = fs.readFileSync(tempOutput);
            
            // Process with Sharp again
            const webpBuffer = await sharp(repairedBuffer, { animated: true }).webp().toBuffer();
            console.log(`[old-stickers] ✅ Recovered ${fileName} using ffmpeg repair`);
            return webpBuffer;
            
          } finally {
            // Always clean up temp files
            try { fs.unlinkSync(tempInput); } catch (err) {
              if (err.code !== 'ENOENT') {
                console.warn(`[old-stickers] Failed to delete tempInput (${tempInput}): ${err.message}`);
              }
            }
            try { fs.unlinkSync(tempOutput); } catch (err) {
              if (err.code !== 'ENOENT') {
                console.warn(`[old-stickers] Failed to delete tempOutput (${tempOutput}): ${err.message}`);
              }
            }
          }
        } catch (ffmpegErr) {
          console.warn(`[old-stickers] FFmpeg repair failed for ${fileName}: ${ffmpegErr.message}`);
        }
      } else {
        console.warn(`[old-stickers] FFmpeg não disponível, pulando tentativa de reparo para ${fileName}`);
      }
      
      // Fourth attempt: Try to extract first frame only if it's a WebP
      try {
        // For WebP files, try to extract just the first frame
        const metadata = await sharp(buffer).metadata();
        if (metadata.pages && metadata.pages > 1) {
          // This is animated, try to get first frame
          const webpBuffer = await sharp(buffer, { animated: false, page: 0 }).webp().toBuffer();
          console.log(`[old-stickers] ⚠️ Recovered ${fileName} by extracting first frame only (animation lost)`);
          return webpBuffer;
        }
      } catch (frameErr) {
        console.warn(`[old-stickers] Frame extraction failed for ${fileName}: ${frameErr.message}`);
      }
      
      // Final attempt: Return original buffer or throw error
      console.error(`[old-stickers] ❌ All repair attempts failed for ${fileName}. Skipping.`);
      throw new Error(`Cannot process corrupted WebP file: ${fileName}`);
    }
  }
}

/**
 * Processes old stickers from folder to insert into database those that don't exist or were modified
 * @returns {Promise<object[]>} Array of inserted media objects
 */
async function processOldStickers() {
  if (!OLD_STICKERS_PATH) {
    console.warn('OLD_STICKERS_PATH não configurado no .env');
    return [];
  }

  const insertedMedias = [];
  
  // Allowed image file extensions
  const allowedExts = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.bmp']);

  try {
    const files = fs.readdirSync(OLD_STICKERS_PATH);
    
    // Filter files that haven't been processed yet or were modified
    const filesToProcess = [];
    for (const file of files) {
      const filePath = path.join(OLD_STICKERS_PATH, file);
      
      try {
        const stats = fs.statSync(filePath);
        
        // Ignore if not a file, is hidden, or doesn't have allowed extension
        if (!stats.isFile()) continue;
        if (file.startsWith('.')) continue;
        
        const ext = path.extname(file).toLowerCase();
        if (!allowedExts.has(ext)) continue;
        
        const lastModified = stats.mtimeMs;

        const alreadyProcessed = await isFileProcessed(file, lastModified);
        if (!alreadyProcessed) {
          filesToProcess.push({ file, filePath, lastModified });
        }
        if (filesToProcess.length >= PROCESS_BATCH_SIZE) break;
      } catch (errStat) {
        console.warn(`[old-stickers] Erro ao verificar arquivo: ${file} - Motivo: ${errStat?.message || errStat}`);
        continue;
      }
    }

    // Process the limited batch
    for (const { file, filePath, lastModified } of filesToProcess) {
      try {
        const bufferOriginal = fs.readFileSync(filePath);

        // Convert to webp before visual hash to standardize, with animated support
        // Uses robust function to handle corrupted files
        const bufferWebp = await processWebpWithRepair(bufferOriginal, file);


        // Detecta animada pelo metadata
        let hashes = null;
        let isAnimated = false;
        try {
          const meta = await sharp(bufferWebp, { animated: true }).metadata();
          isAnimated = meta.pages && meta.pages > 1;
        } catch {}

        if (isAnimated) {
          hashes = await require('../utils').getAnimatedDHashes(bufferWebp);
        } else {
          const hash = await require('../utils').getDHash(bufferWebp);
          hashes = hash ? [hash] : null;
        }

        if (!hashes) continue;

        // Para animadas, busca por duplicidade considerando 2 de 3 hashes iguais
        let isDuplicate = false;
        if (isAnimated) {
          // Busca todos registros que tenham pelo menos 2 hashes iguais
          const db = require('../connection').db;
          const rows = await new Promise((resolve, reject) => {
            db.all('SELECT hash_visual FROM media WHERE hash_visual IS NOT NULL', [], (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });
          for (const row of rows) {
            try {
              const otherHashes = row.hash_visual.split(',');
              let count = 0;
              for (const h of hashes) {
                if (otherHashes.includes(h)) count++;
              }
              if (count >= 2) {
                isDuplicate = true;
                break;
              }
            } catch {}
          }
        } else {
          // Estática: busca hash exato
          const existing = await findByHashVisual(hashes[0]);
          if (existing) isDuplicate = true;
        }

        if (isDuplicate) {
          await upsertProcessedFile(file, lastModified);
          continue;
        }

        // Determine mimetype based on original extension
        const mimetype = mime.lookup(filePath) || 'application/octet-stream';

        // Call AI to generate description and tags
        let description = null;
        let tags = null;
        try {
          const aiResult = await getAiAnnotations(bufferWebp);
          if (aiResult && typeof aiResult === 'object') {
            description = aiResult.description || null;
            tags = aiResult.tags ? aiResult.tags.join(',') : null;
          } else {
            console.warn('Resultado inválido da IA para figurinha antiga:', aiResult);
            description = null;
            tags = null;
          }
        } catch (e) {
          console.warn('Erro ao chamar IA para figurinha antiga:', e);
        }

        const mediaId = await saveMedia({
          chatId: 'old-stickers',
          groupId: null,
          filePath,
          mimetype,
          timestamp: Date.now(),
          description,
          tags,
          hashVisual,
          hashMd5: getMD5(bufferWebp),
          nsfw: 0,
        });

        await upsertProcessedFile(file, lastModified);

        insertedMedias.push({ id: mediaId, filePath });

        console.log(`Figurinha antiga processada e salva: ${file}`);
      } catch (errFile) {
        console.warn(`[old-stickers] Ignorando arquivo inválido/corrompido: ${file} - Motivo: ${errFile?.message || errFile}`);
        continue;
      }
    }
  } catch (e) {
    console.error('Erro ao processar figurinhas antigas:', e);
  }

  return insertedMedias;
}

module.exports = {
  processWebpWithRepair,
  processOldStickers
};