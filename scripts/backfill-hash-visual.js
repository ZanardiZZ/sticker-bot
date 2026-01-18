#!/usr/bin/env node
/**
 * Backfill script to compute visual hashes for legacy media rows.
 *
 * Usage: node scripts/backfill-hash-visual.js [--dry-run] [--recalculate-all]
 *
 * Options:
 *   --dry-run          Show what would be updated without making changes
 *   --recalculate-all  Recalculate ALL hashes, not just missing ones
 */

try {
  require('dotenv').config();
} catch (err) {
  // Dotenv is optional for this script.
}

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const mime = require('mime-types');
const ffmpeg = (() => {
  try {
    const instance = require('fluent-ffmpeg');
    const ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath) instance.setFfmpegPath(ffmpegPath);
    return instance;
  } catch (err) {
    console.warn('[Backfill] FFmpeg indisponível. Vídeos não serão processados:', err.message);
    return null;
  }
})();

const crypto = require('crypto');

const { db } = require('../database');
const { getHashVisual } = require('../database/utils');

const DRY_RUN = process.argv.includes('--dry-run');
const RECALCULATE_ALL = process.argv.includes('--recalculate-all');
const MAX_VIDEO_FRAMES = 5;

async function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function runUpdate(sql, params = []) {
  if (DRY_RUN) return;
  return new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) reject(err);
      else resolve(this.changes || 0);
    });
  });
}

async function hashAnimatedBuffer(buffer) {
  const hashes = [];
  try {
    const animated = sharp(buffer, { animated: true });
    const metadata = await animated.metadata();
    const totalFrames = Number(metadata.pages && metadata.pages > 0 ? metadata.pages : 1) || 1;
    const sampleCount = Math.min(totalFrames, MAX_VIDEO_FRAMES);

    for (let i = 0; i < sampleCount; i += 1) {
      const page = sampleCount === 1 ? 0 : Math.round((i * (totalFrames - 1)) / (sampleCount - 1));
      try {
        const frameBuf = await sharp(buffer, { animated: true, page }).png().toBuffer();
        const frameHash = await getHashVisual(frameBuf);
        if (frameHash) hashes.push(frameHash);
      } catch (frameErr) {
        console.warn('[Backfill] Falha ao extrair quadro para hash:', frameErr.message);
      }
    }
  } catch (err) {
    console.warn('[Backfill] Falha ao processar buffer animado:', err.message);
  }

  return hashes
    .filter(Boolean)
    .join(':');
}

async function hashStaticBuffer(buffer) {
  try {
    const png = await sharp(buffer).png().toBuffer();
    return await getHashVisual(png);
  } catch (err) {
    console.warn('[Backfill] Falha ao gerar hash estático:', err.message);
    return null;
  }
}

async function hashImage(filePath, mimetype) {
  const buffer = await fsp.readFile(filePath);
  const lower = (mimetype || '').toLowerCase();

  if (lower.includes('gif') || lower.includes('webp')) {
    const animatedHash = await hashAnimatedBuffer(buffer);
    if (animatedHash) return animatedHash;
  }

  return hashStaticBuffer(buffer);
}

async function hashVideo(filePath) {
  if (!ffmpeg) {
    return { hash: null, reason: 'ffmpeg_unavailable' };
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'hashframes-'));
  const frameHashes = [];

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .on('error', reject)
        .on('end', resolve)
        .screenshots({
          count: MAX_VIDEO_FRAMES,
          folder: tempDir,
          filename: 'frame-%i.png',
          size: '512x?',
        });
    });

    const files = (await fsp.readdir(tempDir))
      .filter((name) => name.startsWith('frame-'))
      .sort();

    for (const file of files) {
      try {
        const framePath = path.join(tempDir, file);
        const frameBuf = await fsp.readFile(framePath);
        const frameHash = await getHashVisual(frameBuf);
        if (frameHash) frameHashes.push(frameHash);
      } catch (frameErr) {
        console.warn('[Backfill] Falha ao processar frame de vídeo:', frameErr.message);
      }
    }
  } catch (err) {
    console.warn('[Backfill] Falha ao extrair frames de vídeo:', err.message);
  } finally {
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn('[Backfill] Falha ao remover diretório temporário:', cleanupErr.message);
    }
  }

  return {
    hash: frameHashes.length ? frameHashes.join(':') : null,
    reason: frameHashes.length ? null : 'no_frames',
  };
}

async function computeMd5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function computeVisualHash(record) {
  const { file_path: filePath, mimetype, hash_md5: hashMd5 } = record;
  if (!filePath) {
    return { hash: null, reason: 'missing_path' };
  }

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    return { hash: null, reason: 'missing_file' };
  }

  const effectiveMimetype = (mimetype || mime.lookup(absolutePath) || '').toLowerCase();

  try {
    if (effectiveMimetype.startsWith('image/')) {
      const hash = await hashImage(absolutePath, effectiveMimetype);
      return { hash, reason: hash ? null : 'image_hash_failed' };
    }

    if (effectiveMimetype.startsWith('video/')) {
      const { hash, reason } = await hashVideo(absolutePath);
      return { hash, reason };
    }

    if (effectiveMimetype.startsWith('audio/')) {
      let md5Value = hashMd5;
      if (!md5Value) {
        try {
          md5Value = await computeMd5(absolutePath);
        } catch (md5Err) {
          return { hash: null, reason: `audio_md5_failed:${md5Err.message}` };
        }
      }
      return md5Value
        ? { hash: `audio:${md5Value}`, reason: null }
        : { hash: null, reason: 'audio_md5_empty' };
    }

    if (effectiveMimetype === 'application/was') {
      let md5Value = hashMd5;
      if (!md5Value) {
        try {
          md5Value = await computeMd5(absolutePath);
        } catch (md5Err) {
          return { hash: null, reason: `bin_md5_failed:${md5Err.message}` };
        }
      }
      return md5Value
        ? { hash: `bin:${md5Value}`, reason: null }
        : { hash: null, reason: 'bin_md5_empty' };
    }

    return { hash: null, reason: 'unsupported_mimetype' };
  } catch (err) {
    return { hash: null, reason: `exception:${err.message}` };
  }
}

async function main() {
  console.log('=== Backfill de hash_visual para mídias legadas ===');
  if (DRY_RUN) {
    console.log('Executando em modo DRY-RUN. Nenhuma alteração será gravada.');
  }
  if (RECALCULATE_ALL) {
    console.log('Modo --recalculate-all: recalculando TODOS os hashes.');
  }

  const query = RECALCULATE_ALL
    ? `SELECT id, file_path, mimetype, hash_md5 FROM media ORDER BY id ASC`
    : `SELECT id, file_path, mimetype, hash_md5 FROM media WHERE hash_visual IS NULL OR hash_visual = '' ORDER BY id ASC`;

  const rows = await queryAll(query);

  if (!rows.length) {
    console.log('Nenhuma mídia pendente de hash_visual. Nada a fazer.');
    return;
  }

  console.log(`Encontradas ${rows.length} mídias sem hash_visual.`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of rows) {
    const { id, file_path: filePath, mimetype } = record;
    process.stdout.write(`Processando ID ${id}... `);

    try {
      const { hash, reason } = await computeVisualHash(record);

      if (hash) {
        await runUpdate('UPDATE media SET hash_visual = ? WHERE id = ?', [hash, id]);
        updated += 1;
        console.log(DRY_RUN ? 'simulado ✅' : 'atualizado ✅');
      } else {
        skipped += 1;
        console.log(`ignorado ⚠️  (${reason || 'sem hash gerado'})`);
      }
    } catch (err) {
      errors += 1;
      console.log(`erro ❌  (${err.message})`);
    }
  }

  console.log('\n=== Resumo ===');
  console.log(`Atualizados: ${updated}`);
  console.log(`Ignorados: ${skipped}`);
  console.log(`Erros:     ${errors}`);
  if (DRY_RUN) {
    console.log('\nRemova --dry-run para aplicar as mudanças.');
  }
}

main()
  .then(() => {
    console.log('\nBackfill concluído.');
    if (!DRY_RUN) {
      console.log('Recomenda-se executar uma verificação de duplicatas após o script.');
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('Backfill falhou:', err);
    process.exit(1);
  });
