#!/usr/bin/env node
/**
 * Script para reprocessar WebPs sem hash_md5 que não carregam no celular
 *
 * Problema: 671 figurinhas WebP sem hash_md5 não carregam no WhatsApp
 * Solução: Reprocessar com Sharp, gerar novo WebP válido, calcular hashes
 *
 * Usage:
 *   node scripts/reprocess-broken-webps.js [--dry-run] [--limit N]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { dbHandler } = require('../database/connection');
const { getMD5, getHashVisual, isValidHash, isDegenerateHash } = require('../database/utils');

// Configuração para WebP otimizado para WhatsApp
const WEBP_CONFIG = {
  quality: 90,
  effort: 4, // Balance entre qualidade e velocidade
  lossless: false,
  nearLossless: false,
  smartSubsample: true,
  mixed: true
};

const STICKER_MAX_SIZE = 512;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;

  console.log('🔧 Reprocessamento de WebPs Problemáticos');
  console.log('==========================================');
  console.log(`Modo: ${dryRun ? 'DRY RUN (sem modificar arquivos)' : 'LIVE (irá reprocessar)'}`);
  if (limit) console.log(`Limite: ${limit} registros`);
  console.log('');

  const stats = {
    total: 0,
    processed: 0,
    fileNotFound: 0,
    reprocessed: 0,
    alreadyValid: 0,
    errors: 0,
    hashesUpdated: 0
  };

  const errors = [];

  try {
    // Busca todas as imagens WebP sem hash_md5
    const sql = limit
      ? `SELECT id, file_path FROM media
         WHERE mimetype = 'image/webp'
         AND (hash_md5 IS NULL OR hash_md5 = '')
         ORDER BY id ASC
         LIMIT ?`
      : `SELECT id, file_path FROM media
         WHERE mimetype = 'image/webp'
         AND (hash_md5 IS NULL OR hash_md5 = '')
         ORDER BY id ASC`;

    const params = limit ? [limit] : [];
    const media = await dbHandler.all(sql, params);
    stats.total = media.length;

    console.log(`Encontradas ${stats.total} figurinhas WebP sem hash_md5\n`);

    if (stats.total === 0) {
      console.log('✅ Nenhuma figurinha para reprocessar!');
      await dbHandler.close();
      return;
    }

    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      const progress = `[${i + 1}/${stats.total}]`;

      process.stdout.write(`\r${progress} Processando ID ${item.id}...    `);

      stats.processed++;

      // Verifica se arquivo existe
      if (!fs.existsSync(item.file_path)) {
        stats.fileNotFound++;
        errors.push({
          id: item.id,
          path: item.file_path,
          error: 'Arquivo não encontrado'
        });
        continue;
      }

      try {
        // Lê arquivo original
        const originalBuffer = await fs.promises.readFile(item.file_path);
        const originalSize = originalBuffer.length;

        // Valida se é um WebP válido
        let needsReprocessing = false;
        try {
          const metadata = await sharp(originalBuffer).metadata();
          if (!metadata.format || metadata.format !== 'webp') {
            needsReprocessing = true;
          }
        } catch (err) {
          needsReprocessing = true;
        }

        let finalBuffer = originalBuffer;
        let wasReprocessed = false;

        if (needsReprocessing && !dryRun) {
          // Reprocessa imagem com Sharp
          const image = sharp(originalBuffer);
          const metadata = await image.metadata();

          // Redimensiona se necessário (mantém aspect ratio)
          if (metadata.width > STICKER_MAX_SIZE || metadata.height > STICKER_MAX_SIZE) {
            image.resize(STICKER_MAX_SIZE, STICKER_MAX_SIZE, {
              fit: 'inside',
              withoutEnlargement: true
            });
          }

          // Gera novo WebP otimizado
          finalBuffer = await image
            .webp(WEBP_CONFIG)
            .toBuffer();

          // Salva arquivo reprocessado (backup do original)
          const backupPath = item.file_path + '.backup';
          await fs.promises.copyFile(item.file_path, backupPath);
          await fs.promises.writeFile(item.file_path, finalBuffer);

          // Define permissões readonly
          try {
            await fs.promises.chmod(item.file_path, 0o444);
          } catch (chmodErr) {
            console.warn(`\nWarning: Failed to set readonly for ${item.id}`);
          }

          wasReprocessed = true;
          stats.reprocessed++;
        } else if (needsReprocessing && dryRun) {
          stats.reprocessed++; // Conta o que SERIA reprocessado
        } else {
          stats.alreadyValid++;
        }

        // Calcula hashes do arquivo final
        const hashMd5 = getMD5(finalBuffer);

        // Para hash visual, precisa converter para PNG primeiro
        const pngBuffer = await sharp(finalBuffer, { animated: false, page: 0 })
          .png()
          .toBuffer();

        const hashVisual = await getHashVisual(pngBuffer);

        // Valida hash visual
        const hashIsValid = hashVisual &&
                           isValidHash(hashVisual, false) &&
                           !isDegenerateHash(hashVisual);

        if (!dryRun) {
          // Atualiza banco de dados
          await dbHandler.run(
            `UPDATE media
             SET hash_md5 = ?, hash_visual = ?
             WHERE id = ?`,
            [hashMd5, hashIsValid ? hashVisual : null, item.id]
          );
          stats.hashesUpdated++;
        }

        // Log detalhado a cada 50 itens
        if ((i + 1) % 50 === 0) {
          process.stdout.write(
            `\r${progress} Processados ${i + 1}/${stats.total} ` +
            `(reprocessados: ${stats.reprocessed}, válidos: ${stats.alreadyValid}, erros: ${stats.errors})    \n`
          );
        }

      } catch (err) {
        stats.errors++;
        errors.push({
          id: item.id,
          path: item.file_path,
          error: err.message
        });
        console.error(`\n❌ Erro ao processar ${item.id}: ${err.message}`);
      }
    }

    // Limpa linha de progresso
    process.stdout.write('\r' + ' '.repeat(80) + '\r');

    // Relatório final
    console.log('\n📊 Relatório de Reprocessamento');
    console.log('================================\n');
    console.log(`Total analisado: ${stats.processed}/${stats.total}`);
    console.log(`Arquivos não encontrados: ${stats.fileNotFound}`);
    console.log(`WebPs ${dryRun ? 'que precisam' : 'reprocessados'}: ${stats.reprocessed}`);
    console.log(`WebPs já válidos: ${stats.alreadyValid}`);
    console.log(`Hashes ${dryRun ? 'que seriam' : ''} atualizados: ${dryRun ? stats.processed - stats.fileNotFound : stats.hashesUpdated}`);
    console.log(`Erros: ${stats.errors}\n`);

    if (errors.length > 0) {
      console.log('⚠️  Erros Encontrados (primeiros 10):');
      errors.slice(0, 10).forEach(e => {
        console.log(`  - ID ${e.id}: ${e.error}`);
        console.log(`    Arquivo: ${e.path}`);
      });
      if (errors.length > 10) {
        console.log(`  ... e mais ${errors.length - 10} erros`);
      }
      console.log('');
    }

    if (dryRun && stats.reprocessed > 0) {
      console.log('💡 Para aplicar as correções, rode sem --dry-run:');
      console.log('   node scripts/reprocess-broken-webps.js');
    }

    if (!dryRun && stats.reprocessed > 0) {
      console.log('✅ WebPs reprocessados com sucesso!');
      console.log('📁 Backups salvos como .backup (pode deletar se tudo funcionar)');
    }

    if (stats.fileNotFound > 0) {
      console.log(`⚠️  ${stats.fileNotFound} arquivos não encontrados - considere cleanup`);
    }

  } catch (err) {
    console.error('\n❌ Erro fatal:', err);
    await dbHandler.close();
    process.exit(1);
  }

  // Fecha database
  try {
    await dbHandler.close();
  } catch (closeErr) {
    console.warn('Warning: Database close error:', closeErr.message);
  }

  console.log('\n✅ Reprocessamento concluído');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Erro não tratado:', err);
  process.exit(1);
});
