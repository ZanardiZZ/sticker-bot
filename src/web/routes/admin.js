
/**
 * Admin routes - handles admin-only functionality like logs, user management, etc.
 */

const express = require('express');
const { requireAdmin } = require('../auth');
const { getLogCollector } = require('../../utils/logCollector');

// Try to require pm2 once at module load to avoid repeated requires per-request.
// If PM2 is not installed, pm2 will be null and the restart endpoint will return a clear error.
let pm2 = null;
try {
  pm2 = require('pm2');
} catch (e) {
  console.warn('[ADMIN] PM2 module not available:', e && e.message);
}


/**
 * Creates admin routes with authentication middleware
 * @param {object} db - Database instance
 */
function createAdminRoutes(db) {
  const router = express.Router();
  // GET /api/admin/duplicates/dhash-scan - Detecta duplicatas usando dHash (full scan)
  router.get('/admin/duplicates/dhash-scan', requireAdmin, async (req, res) => {
    try {
      const { db } = require('../../database/connection');
      const sharp = require('sharp');
      const { getDHash, getAnimatedDHashes } = require('../../database/utils');
      // Busca todas mídias
      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT id, file_path, hash_visual FROM media WHERE file_path IS NOT NULL', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      // Calcula hashes e agrupa duplicatas
      const hashMap = {};
      for (const row of rows) {
        try {
          const fs = require('fs').promises;
          const buffer = await fs.readFile(row.file_path);
          let hashes = null;
          let isAnimated = false;
          try {
            const meta = await sharp(buffer, { animated: true }).metadata();
            isAnimated = meta.pages && meta.pages > 1;
          } catch {}
          if (isAnimated) {
            hashes = await getAnimatedDHashes(buffer);
          } else {
            const hash = await getDHash(buffer);
            hashes = hash ? [hash] : null;
          }
          if (!hashes) continue;
          // Para animadas, agrupa por combinação de 2 de 3 hashes
          let key = null;
          if (isAnimated) {
            // Usa as 3 combinações possíveis de 2 hashes
            const combos = [
              hashes[0] + '_' + hashes[1],
              hashes[0] + '_' + hashes[2],
              hashes[1] + '_' + hashes[2]
            ];
            key = combos.find(k => hashMap[k]);
            if (!key) key = combos[0];
          } else {
            key = hashes[0];
          }
          if (!hashMap[key]) hashMap[key] = [];
          hashMap[key].push(row);
        } catch {}
      }
      // Monta grupos de duplicatas (2 ou mais)
      const duplicateGroups = Object.values(hashMap).filter(arr => arr.length > 1);
      res.json({ groups: duplicateGroups });
    } catch (error) {
      console.error('[API] Erro ao escanear duplicatas dHash:', error);
      res.status(500).json({ error: 'internal_error' });
    }
  });
  // DELETE /api/admin/media/:id - Deleta mídia individual por ID
  router.delete('/admin/media/:id', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) return res.status(400).json({ error: 'invalid_id' });
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM media WHERE id = ?', [id], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Erro ao deletar mídia:', error);
      res.status(500).json({ error: 'internal_error' });
    }
  });
  const logCollector = getLogCollector();

  // GET /api/admin/logs - Buscar logs
  router.get('/admin/logs', requireAdmin, (req, res) => {
    try {
      const { level, search, limit = 50, offset = 0 } = req.query;
      
      const options = {
        level: level || 'all',
        search: search || '',
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      const result = logCollector.getLogs(options);
      const stats = logCollector.getLogStats();

      res.json({
        ...result,
        stats
      });
    } catch (error) {
      console.error('[API] Erro ao buscar logs:', error);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // GET /api/admin/logs/stats - Estatísticas dos logs
  router.get('/admin/logs/stats', requireAdmin, (req, res) => {
    try {
      const stats = logCollector.getLogStats();
      res.json(stats);
    } catch (error) {
      console.error('[API] Erro ao buscar estatísticas dos logs:', error);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // DELETE /api/admin/logs - Limpar logs
  router.delete('/admin/logs', requireAdmin, (req, res) => {
    try {
      logCollector.clearLogs();
      console.log('[ADMIN] Logs limpos pelo usuário:', req.user.username);
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Erro ao limpar logs:', error);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // POST /api/admin/restart-client - Reinicia o processo do sticker-client (via PM2 quando disponível)
  router.post('/admin/restart-client', requireAdmin, async (req, res) => {
    try {
      if (!pm2) {
        return res.status(500).json({
          error: 'pm2_not_available',
          message: 'PM2 não está disponível no ambiente. Instale o PM2 ou reinicie o bot manualmente.'
        });
      }

      // Connect to PM2 daemon
      pm2.connect((connErr) => {
        if (connErr) {
          console.error('[ADMIN] PM2 connect error:', connErr);
          return res.status(500).json({ error: 'pm2_connect_failed', message: 'PM2 connect falhou. Verifique se o PM2 está instalado/rodando.' });
        }

        // Try to find a running process that points to [index.js](http://_vscodecontentref_/1) or has name 'sticker-bot'
        pm2.list((listErr, list) => {
          if (listErr) {
            console.error('[ADMIN] PM2 list error:', listErr);
            pm2.disconnect();
            return res.status(500).json({ error: 'pm2_list_failed' });
          }

          let target = null;
          for (const proc of list || []) {
            const execPath = (proc.pm2_env && proc.pm2_env.pm_exec_path) || '';
            const name = (proc.name || '').toLowerCase();
            if (execPath.endsWith('index.js') || name === 'sticker-bot') {
              target = proc;
              break;
            }
          }

          const doRestart = (procInfo) => {
            if (!procInfo) {
              pm2.disconnect();
              return res.status(404).json({ error: 'pm2_process_not_found', message: 'Nenhum processo gerenciado pelo PM2 correspondente foi encontrado. Reinicie o bot manualmente.' });
            }
            const id = procInfo.pm_id;
            pm2.restart(id, (restartErr) => {
              pm2.disconnect();
              if (restartErr) {
                console.error('[ADMIN] PM2 restart error:', restartErr);
                return res.status(500).json({ error: 'pm2_restart_failed', message: restartErr.message });
              }
              console.log('[ADMIN] Bot reiniciado via PM2 por', req.user && req.user.username);
              return res.json({ success: true, message: 'Restart solicitado via PM2' });
            });
          };

          if (target) return doRestart(target);

          // No target found - disconnect and inform
          pm2.disconnect();
          return res.status(404).json({ error: 'pm2_process_not_found', message: 'Nenhum processo PM2 identificado para reiniciar. Use PM2 para gerenciar o processo com nome "sticker-bot".' });
        });
      });
    } catch (error) {
      console.error('[ADMIN] Erro ao tentar reiniciar o bot:', error);
      return res.status(500).json({ error: 'unexpected_error', message: String(error) });
    }
  });

  // GET /api/admin/logs/stream - Server-Sent Events para logs em tempo real
  router.get('/admin/logs/stream', requireAdmin, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Enviar dados iniciais
    const initialData = logCollector.getLogs({ limit: 20 });
    res.write(`data: ${JSON.stringify({ type: 'initial', ...initialData })}\n\n`);

    // Interceptar novos logs (implementação básica)
    let lastLogCount = logCollector.getLogCount();
    
    const checkForNewLogs = () => {
      const currentLogCount = logCollector.getLogCount();
      if (currentLogCount !== lastLogCount) {
        const newLogs = logCollector.getLogs({ limit: 10 });
        res.write(`data: ${JSON.stringify({ type: 'update', ...newLogs })}\n\n`);
        lastLogCount = currentLogCount;
      }
    };

    // Verificar por novos logs a cada 2 segundos
    const interval = setInterval(checkForNewLogs, 2000);

    // Limpar quando o cliente desconectar
    req.on('close', () => {
      clearInterval(interval);
      console.log('[SSE] Cliente de logs desconectado');
    });

    // Keep-alive ping
    const pingInterval = setInterval(() => {
      res.write(': ping\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(pingInterval);
    });
  });

  return router;
}

module.exports = createAdminRoutes;