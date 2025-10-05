/**
 * Processing model - handles media processing operations like WebP repair and old stickers
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const sharp = require('sharp');
const { spawnSync } = require('child_process');
const { getAiAnnotations } = require('../../services/ai');
const { getMD5, isFileProcessed, upsertProcessedFile, getDHash, getAnimatedDHashes } = require('../utils');
const { findByHashVisual, findByHashMd5, saveMedia } = require('./media');

const repoRoot = path.resolve(__dirname, '..', '..');
const SANITIZED_OLD_STICKERS_DIR = path.join(repoRoot, 'media', 'old-stickers');

let puppeteerCore = null;
let chromeExecutablePath = null;
let chromeDetectionAttempted = false;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeBaseName(name) {
  const base = String(name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return base || 'sticker';
}

function buildSanitizedFilePath(originalName, hashMd5) {
  const safeBase = sanitizeBaseName(originalName).slice(-80);
  const suffix = (hashMd5 || '').slice(0, 12);
  return path.join(
    SANITIZED_OLD_STICKERS_DIR,
    `${safeBase}${suffix ? `-${suffix}` : ''}.webp`
  );
}

function deleteCorruptSticker(filePath, fileName) {
  if (!filePath) return false;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.warn(`[old-stickers] Arquivo corrompido removido: ${fileName}`);
      return true;
    }
  } catch (err) {
    console.warn(`[old-stickers] Falha ao remover arquivo corrompido ${fileName}: ${err.message}`);
  }
  return false;
}

function binaryExists(candidate) {
  if (!candidate) return false;
  if (path.isAbsolute(candidate)) {
    return fs.existsSync(candidate);
  }
  const result = spawnSync('which', [candidate]);
  return result.status === 0;
}

function collectChromeCandidates() {
  const candidates = new Set([
    process.env.OLD_STICKERS_CHROME_PATH,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH
  ].filter(Boolean));

  const chromeDir = path.join(repoRoot, 'chrome');
  if (fs.existsSync(chromeDir)) {
    for (const entry of fs.readdirSync(chromeDir)) {
      const candidate = path.join(chromeDir, entry, 'chrome-linux64', 'chrome');
      if (fs.existsSync(candidate)) {
        candidates.add(candidate);
      }
    }
    const direct = path.join(chromeDir, 'chrome-linux64', 'chrome');
    if (fs.existsSync(direct)) {
      candidates.add(direct);
    }
  }

  [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/chrome',
    '/snap/bin/chromium',
    'google-chrome-stable',
    'google-chrome',
    'chromium-browser',
    'chromium'
  ].forEach((item) => candidates.add(item));

  return Array.from(candidates);
}

function getChromeBinary() {
  if (!chromeDetectionAttempted) {
    chromeDetectionAttempted = true;
    for (const candidate of collectChromeCandidates()) {
      if (binaryExists(candidate)) {
        chromeExecutablePath = candidate;
        break;
      }
    }
    if (!chromeExecutablePath) {
      console.warn('[old-stickers] Chromium executable not found. Chrome-based fallback disabled.');
    }
  }
  return chromeExecutablePath;
}

function getPuppeteer() {
  if (!puppeteerCore) {
    try {
      puppeteerCore = require('puppeteer-core');
    } catch (err) {
      console.warn('[old-stickers] puppeteer-core not available. Chrome fallback disabled:', err.message);
      return null;
    }
  }
  return puppeteerCore;
}

async function renderWithChromeFallback(buffer, fileName) {
  const puppeteer = getPuppeteer();
  const executablePath = getChromeBinary();
  if (!puppeteer || !executablePath) {
    return null;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--mute-audio'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
    await page.setContent(`
      <html>
        <body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;height:100vh;">
          <img id="sticker" src="data:image/webp;base64,${buffer.toString('base64')}" style="max-width:100%;max-height:100%;object-fit:contain;" />
        </body>
      </html>
    `, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('#sticker', { timeout: 5000 });
    await page.waitForFunction(() => {
      const img = document.getElementById('sticker');
      return img && img.complete;
    }, { timeout: 5000 });

    const element = await page.$('#sticker');
    if (!element) {
      throw new Error('Unable to locate rendered <img> element');
    }

    const pngBuffer = await element.screenshot({ omitBackground: true, type: 'png' });
    return await sharp(pngBuffer).webp({ lossless: true }).toBuffer();
  } catch (err) {
    console.warn(`[old-stickers] Chrome fallback failed for ${fileName}: ${err.message}`);
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn('[old-stickers] Failed to close Chrome instance:', closeError.message);
      }
    }
  }
}

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
const PROCESS_BATCH_SIZE = 1;

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
      
      // Final attempt: Try Chromium renderer fallback
      try {
        const chromeBuffer = await renderWithChromeFallback(buffer, fileName);
        if (chromeBuffer) {
          console.log(`[old-stickers] ✅ Recovered ${fileName} via Chromium renderer`);
          return chromeBuffer;
        }
      } catch (chromeErr) {
        console.warn(`[old-stickers] Chrome renderer threw for ${fileName}: ${chromeErr.message}`);
      }

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
        const bufferWebp = await processWebpWithRepair(bufferOriginal, file);
        const hashMd5 = getMD5(bufferWebp);

        ensureDir(SANITIZED_OLD_STICKERS_DIR);
        const sanitizedPath = buildSanitizedFilePath(file, hashMd5);

        let hashes = null;
        let hashVisual = null;
        let isAnimated = false;

        try {
          const meta = await sharp(bufferWebp, { animated: true }).metadata();
          isAnimated = Boolean(meta.pages && meta.pages > 1);
          if (isAnimated) {
            hashes = await getAnimatedDHashes(bufferWebp);
          } else {
            const hash = await getDHash(bufferWebp);
            hashes = hash ? [hash] : null;
          }
        } catch (metaErr) {
          console.warn(`[old-stickers] Falha ao obter metadata para ${file}: ${metaErr?.message || metaErr}`);
        }

        let isDuplicate = false;
        if (hashes && hashes.length > 0) {
          hashVisual = isAnimated ? hashes.join(',') : hashes[0];

          if (isAnimated) {
            const db = require('../connection').db;
            const rows = await new Promise((resolve, reject) => {
              db.all('SELECT hash_visual FROM media WHERE hash_visual IS NOT NULL', [], (err, allRows) => {
                if (err) reject(err);
                else resolve(allRows);
              });
            });

            for (const row of rows) {
              if (!row?.hash_visual) continue;
              try {
                const otherHashes = row.hash_visual.split(',');
                let count = 0;
                for (const h of hashes) {
                  if (otherHashes.includes(h)) count++;
                }
                if (count >= 2) {
                  isDuplicate = true;
                  console.log(`[old-stickers] Ignorando duplicata animada (hash visual) para ${file}`);
                  break;
                }
              } catch {}
            }
          } else {
            const existing = await findByHashVisual(hashVisual);
            if (existing) {
              console.log(`[old-stickers] Ignorando duplicata visual para ${file}`);
              isDuplicate = true;
            }
          }
        } else {
          console.warn(`[old-stickers] Visual hash indisponível para ${file}, utilizando verificação por MD5.`);
        }

        if (!isDuplicate) {
          const existingByMd5 = await findByHashMd5(hashMd5);
          if (existingByMd5) {
            console.log(`[old-stickers] Ignorando duplicata por MD5 para ${file}`);
            isDuplicate = true;
          }
        }

        if (isDuplicate) {
          await upsertProcessedFile(file, lastModified);
          continue;
        }

        try {
          let shouldWrite = true;
          if (fs.existsSync(sanitizedPath)) {
            const existing = fs.readFileSync(sanitizedPath);
            if (getMD5(existing) === hashMd5) {
              shouldWrite = false;
            }
          }
          if (shouldWrite) {
            fs.writeFileSync(sanitizedPath, bufferWebp);
          }
        } catch (writeErr) {
          throw new Error(`Falha ao salvar cópia sanitizada de ${file}: ${writeErr?.message || writeErr}`);
        }

        const mimetype = 'image/webp';

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
          filePath: sanitizedPath,
          mimetype,
          timestamp: Date.now(),
          description,
          tags,
          hashVisual,
          hashMd5,
          nsfw: 0,
        });

        await upsertProcessedFile(file, lastModified);

        insertedMedias.push({ id: mediaId, filePath: sanitizedPath });

        console.log(`[old-stickers] Figurinha antiga processada e salva: ${file}`);
      } catch (errFile) {
        console.warn(`[old-stickers] Ignorando arquivo inválido/corrompido: ${file} - Motivo: ${errFile?.message || errFile}`);
        deleteCorruptSticker(filePath, file);
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
