#!/usr/bin/env node

/**
 * Migra hashes visuais de GIFs animados que usam vírgula como separador
 * para o formato correto com dois-pontos
 *
 * Bug: database/models/processing.js estava usando hashes.join(',')
 * Correto: deve ser hashes.join(':') para compatibilidade com hammingDistance
 *
 * Este script:
 * 1. Busca todos os hash_visual que contêm vírgulas
 * 2. Substitui vírgulas por dois-pontos
 * 3. Atualiza o banco de dados
 * 4. Recalcula bucket_key para LSH (se necessário)
 */

const path = require('path');
const { db } = require('../database/connection');

async function migrateHashSeparators() {
  console.log('[MigrateHashSeparator] Iniciando migração de separadores de hash...\n');

  // Buscar todos os hashes que contêm vírgula
  const rows = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, hash_visual, description
      FROM media
      WHERE hash_visual IS NOT NULL AND hash_visual LIKE '%,%'
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  if (rows.length === 0) {
    console.log('✅ Nenhum hash com vírgula encontrado. Todos já estão no formato correto.\n');
    return;
  }

  console.log(`📊 Encontrados ${rows.length} hashes com vírgulas que precisam migração\n`);

  let migrated = 0;
  let failed = 0;

  for (const row of rows) {
    const oldHash = row.hash_visual;
    const newHash = oldHash.replace(/,/g, ':');

    try {
      // Atualizar hash_visual
      await new Promise((resolve, reject) => {
        db.run(`
          UPDATE media
          SET hash_visual = ?
          WHERE id = ?
        `, [newHash, row.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Recalcular bucket_key (primeiro 64 bits do hash para LSH)
      const bucketKey = newHash.substring(0, 16);

      // Atualizar ou inserir no hash_buckets
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT OR REPLACE INTO hash_buckets (media_id, bucket_key, hash_visual)
          VALUES (?, ?, ?)
        `, [row.id, bucketKey, newHash], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      migrated++;
      console.log(`✓ ID ${row.id}: ${oldHash.substring(0, 30)}... → ${newHash.substring(0, 30)}...`);
    } catch (err) {
      failed++;
      console.error(`✗ ID ${row.id}: Falha - ${err.message}`);
    }
  }

  console.log(`\n📊 Resumo da migração:`);
  console.log(`   Total encontrados: ${rows.length}`);
  console.log(`   Migrados com sucesso: ${migrated}`);
  console.log(`   Falhas: ${failed}`);
  console.log(`\n✅ Migração concluída!\n`);
}

// Executar migração
migrateHashSeparators()
  .then(() => {
    console.log('[MigrateHashSeparator] Script finalizado com sucesso');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[MigrateHashSeparator] Erro fatal:', err);
    process.exit(1);
  });
