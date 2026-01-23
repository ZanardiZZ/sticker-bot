#!/usr/bin/env node
/**
 * Benchmark different hash sizes (64, 128, 256 bits)
 * Tests processing time for 10 images
 */

const fs = require('fs');
const sharp = require('sharp');
const { performance } = require('perf_hooks');

/**
 * Generates dHash of specified size
 * @param {Buffer} buffer - Image buffer
 * @param {number} width - Hash width (height = width for square, or width/2 for aspect 2:1)
 * @returns {Promise<string|null>} Hash hex string or null if error
 */
async function getDHashCustomSize(buffer, width, height) {
  try {
    // Resize to (width+1) x height for dHash calculation
    const small = await sharp(buffer)
      .resize(width + 1, height, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer();

    // Calculate dHash (compare adjacent pixels horizontally)
    let hash = '';
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const left = small[row * (width + 1) + col];
        const right = small[row * (width + 1) + col + 1];
        hash += left > right ? '1' : '0';
      }
    }

    // Convert binary string to hex
    const totalBits = width * height;
    const hexLength = Math.ceil(totalBits / 4);
    const hexHash = BigInt('0b' + hash).toString(16).padStart(hexLength, '0');
    return hexHash;
  } catch (err) {
    return null;
  }
}

async function benchmarkImageProcessing(imagePaths) {
  const results = {
    '64-bit (8x8)': { times: [], total: 0, avg: 0 },
    '128-bit (16x8)': { times: [], total: 0, avg: 0 },
    '256-bit (16x16)': { times: [], total: 0, avg: 0 },
    '512-bit (32x16)': { times: [], total: 0, avg: 0 },
    '1024-bit (32x32)': { times: [], total: 0, avg: 0 }
  };

  console.log('=== Benchmark de Tamanhos de Hash ===\n');
  console.log(`Testando com ${imagePaths.length} imagens\n`);

  for (const imagePath of imagePaths) {
    if (!fs.existsSync(imagePath)) {
      console.log(`⚠️  Imagem não encontrada: ${imagePath}`);
      continue;
    }

    const buffer = await fs.promises.readFile(imagePath);
    const fileName = imagePath.split('/').pop();

    // Test 64-bit (8x8) - current
    const start64 = performance.now();
    await getDHashCustomSize(buffer, 8, 8);
    const time64 = performance.now() - start64;
    results['64-bit (8x8)'].times.push(time64);

    // Test 128-bit (16x8)
    const start128 = performance.now();
    await getDHashCustomSize(buffer, 16, 8);
    const time128 = performance.now() - start128;
    results['128-bit (16x8)'].times.push(time128);

    // Test 256-bit (16x16)
    const start256 = performance.now();
    await getDHashCustomSize(buffer, 16, 16);
    const time256 = performance.now() - start256;
    results['256-bit (16x16)'].times.push(time256);

    // Test 512-bit (32x16)
    const start512 = performance.now();
    await getDHashCustomSize(buffer, 32, 16);
    const time512 = performance.now() - start512;
    results['512-bit (32x16)'].times.push(time512);

    // Test 1024-bit (32x32)
    const start1024 = performance.now();
    await getDHashCustomSize(buffer, 32, 32);
    const time1024 = performance.now() - start1024;
    results['1024-bit (32x32)'].times.push(time1024);

    console.log(`✓ ${fileName}`);
    console.log(`  64-bit:   ${time64.toFixed(2)}ms`);
    console.log(`  128-bit:  ${time128.toFixed(2)}ms`);
    console.log(`  256-bit:  ${time256.toFixed(2)}ms`);
    console.log(`  512-bit:  ${time512.toFixed(2)}ms`);
    console.log(`  1024-bit: ${time1024.toFixed(2)}ms`);
  }

  // Calculate totals and averages
  for (const [size, data] of Object.entries(results)) {
    data.total = data.times.reduce((sum, t) => sum + t, 0);
    data.avg = data.times.length > 0 ? data.total / data.times.length : 0;
  }

  console.log('\n=== Resultados Finais ===\n');
  console.log('Tamanho   | Total      | Média/imagem | vs 64-bit');
  console.log('----------|------------|--------------|----------');

  const baseline = results['64-bit (8x8)'].avg;
  for (const [size, data] of Object.entries(results)) {
    const totalSec = (data.total / 1000).toFixed(3);
    const avgMs = data.avg.toFixed(2);
    const ratio = (data.avg / baseline).toFixed(2);
    console.log(`${size.padEnd(9)} | ${totalSec.padEnd(8)}s | ${avgMs.padEnd(10)}ms | ${ratio}x`);
  }

  console.log('\n=== Recomendação ===\n');
  const ratio128 = results['128-bit (16x8)'].avg / results['64-bit (8x8)'].avg;
  const ratio256 = results['256-bit (16x16)'].avg / results['64-bit (8x8)'].avg;
  const ratio512 = results['512-bit (32x16)'].avg / results['64-bit (8x8)'].avg;
  const ratio1024 = results['1024-bit (32x32)'].avg / results['64-bit (8x8)'].avg;

  // Find best option (fastest)
  let best = { name: '64-bit (8x8)', avg: results['64-bit (8x8)'].avg, bits: 64 };
  for (const [name, data] of Object.entries(results)) {
    if (data.avg < best.avg) {
      const bits = parseInt(name.match(/\d+/)[0]);
      best = { name, avg: data.avg, bits };
    }
  }

  console.log(`🏆 Mais rápido: ${best.name} (${best.avg.toFixed(2)}ms/imagem)`);
  console.log(`   Precisão: ${best.bits}x melhor que 64-bit`);

  if (ratio1024 < 1.5) {
    console.log('\n✅ 1024-bit é VIÁVEL! Overhead < 50% com 16x mais precisão!');
  } else if (ratio512 < 1.5) {
    console.log('\n✅ 512-bit é VIÁVEL! Overhead < 50% com 8x mais precisão!');
  } else if (ratio256 < 1.5) {
    console.log('\n✅ 256-bit é viável! Overhead < 50% com 4x mais precisão');
  } else if (ratio128 < 1.3) {
    console.log('\n✅ 128-bit é recomendado! Overhead < 30% com 2x mais precisão');
  } else {
    console.log('\n⚠️  Considere manter 64-bit e ajustar threshold');
  }

  console.log('\n=== Estimativa de Backfill (10,098 imagens) ===\n');
  for (const [name, data] of Object.entries(results)) {
    const totalSec = (data.avg * 10098 / 1000).toFixed(1);
    const totalMin = (totalSec / 60).toFixed(1);
    const bits = parseInt(name.match(/\d+/)[0]);
    const precision = (bits / 64).toFixed(0);
    console.log(`${name.padEnd(18)}: ~${totalSec.padStart(5)}s (${totalMin.padStart(4)} min) - ${precision}x precisão`);
  }
}

// Main execution
(async () => {
  const { db } = require('../database');

  // Get 10 sample images
  const rows = await new Promise((resolve, reject) => {
    db.all(
      `SELECT file_path FROM media
       WHERE mimetype LIKE 'image/%'
       AND file_path IS NOT NULL
       LIMIT 10`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });

  const imagePaths = rows
    .map(r => r.file_path)
    .filter(p => p && fs.existsSync(p));

  if (imagePaths.length === 0) {
    console.error('❌ Nenhuma imagem válida encontrada para benchmark');
    process.exit(1);
  }

  await benchmarkImageProcessing(imagePaths);

  db.close();
})().catch(err => {
  console.error('Erro no benchmark:', err);
  process.exit(1);
});
