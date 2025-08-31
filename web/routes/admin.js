/**
 * Admin routes - handles admin-only functionality like logs, user management, etc.
 */

const express = require('express');
const { requireAdmin } = require('../auth');
const { getLogCollector } = require('../../utils/logCollector');

/**
 * Creates admin routes with authentication middleware
 * @param {object} db - Database instance
 */
function createAdminRoutes(db) {
  const router = express.Router();
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