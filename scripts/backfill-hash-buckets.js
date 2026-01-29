#!/usr/bin/env node

/**
 * Backfill hash_buckets table with missing entries
 *
 * Bug: saveMedia() não estava inserindo na hash_buckets, causando falha
 * na detecção de duplicatas via LSH (Locality-Sensitive Hashing)
 *
 * Este script preenche os registros faltantes
 */

const { db } = require('../database/connection');

async function backfillHashBuckets() {
  console.log('[BackfillHashBuckets] Iniciando backfill...\n');

  // Encontrar mídias que têm hash_visual mas não estão na hash_buckets
  const missingRows = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, hash_visual
      FROM media
      WHERE hash_visual IS NOT NULL
        AND id NOT IN (SELECT media_id FROM hash_buckets)
      ORDER BY id
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  if (missingRows.length === 0) {
    console.log('✅ Nenhum registro faltando. Tabela hash_buckets está completa.\n');
    return;
  }

  console.log(`📊 Encontrados ${missingRows.length} registros faltando na hash_buckets`);
  console.log(`   Range: ID ${missingRows[0].id} até ${missingRows[missingRows.length - 1].id}\n`);

  let inserted = 0;
  let failed = 0;

  for (const row of missingRows) {
    try {
      const bucketKey = row.hash_visual.substring(0, 16); // First 64 bits

      await new Promise((resolve, reject) => {
        db.run(`
          INSERT OR REPLACE INTO hash_buckets (media_id, bucket_key, hash_visual)
          VALUES (?, ?, ?)
        `, [row.id, bucketKey, row.hash_visual], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      inserted++;
      if (inserted % 50 === 0) {
        console.log(`  ✓ Processados ${inserted}/${missingRows.length}...`);
      }
    } catch (err) {
      failed++;
      console.error(`  ✗ Falha no ID ${row.id}: ${err.message}`);
    }
  }

  console.log(`\n📊 Resumo do backfill:`);
  console.log(`   Total faltando: ${missingRows.length}`);
  console.log(`   Inseridos: ${inserted}`);
  console.log(`   Falhas: ${failed}`);
  console.log(`\n✅ Backfill concluído!\n`);
}

// Executar backfill
backfillHashBuckets()
  .then(() => {
    console.log('[BackfillHashBuckets] Script finalizado com sucesso');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[BackfillHashBuckets] Erro fatal:', err);
    process.exit(1);
  });
