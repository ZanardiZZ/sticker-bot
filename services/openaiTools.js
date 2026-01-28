/**
 * OpenAI Function Calling Tools for Admin Watcher
 *
 * Defines 15 tools available to GPT-4 for diagnosing and fixing bot issues:
 *
 * DIAGNOSTIC TOOLS:
 * 1. getBotLogs - Read recent logs
 * 2. searchLogsForPattern - Search logs with regex
 * 3. getServiceStatus - Check PM2 service status
 * 4. getLastSentSticker - Get last sent sticker info
 * 5. getSchedulerStatus - Check scheduler status
 * 6. getQueueStatus - Check processing queue status
 * 7. readFile - Read source code files
 * 8. runHealthCheck - Run system health check
 * 9. analyzeDatabaseSchema - Analyze database structure
 *
 * FIX/REMEDIATION TOOLS:
 * 10. restartService - Restart PM2 service
 * 11. executeSqlQuery - Execute SQL queries (safe operations only, NO TABLE CREATION)
 * 12. modifyBotConfig - Modify bot configuration values
 * 13. clearProcessingQueue - Clear stuck processing queue
 * 14. writeFile - Write content to files (restricted paths)
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Returns OpenAI Function Calling tool definitions
 * @returns {Array} Array of tool schemas
 */
function getOpenAITools() {
  return [
    // ===== LOGS =====
    {
      type: 'function',
      function: {
        name: 'getBotLogs',
        description: 'Lê logs recentes do bot, baileys ou web interface. Use para investigar erros recentes.',
        parameters: {
          type: 'object',
          properties: {
            service: {
              type: 'string',
              enum: ['bot', 'baileys', 'web'],
              description: 'Qual serviço consultar'
            },
            lines: {
              type: 'number',
              description: 'Número de linhas a retornar (padrão: 50)',
              default: 50
            },
            level: {
              type: 'string',
              enum: ['all', 'error', 'warn', 'info'],
              description: 'Filtrar por nível de log (padrão: all)',
              default: 'all'
            }
          },
          required: ['service']
        }
      }
    },

    {
      type: 'function',
      function: {
        name: 'searchLogsForPattern',
        description: 'Busca padrão específico nos logs usando grep. Use para encontrar erros específicos ou rastrear eventos.',
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Padrão (string ou regex) para buscar nos logs'
            },
            service: {
              type: 'string',
              enum: ['bot', 'baileys', 'web'],
              description: 'Qual serviço pesquisar (padrão: bot)'
            }
          },
          required: ['pattern']
        }
      }
    },

    // ===== SYSTEM =====
    {
      type: 'function',
      function: {
        name: 'getServiceStatus',
        description: 'Verifica status de um ou todos os serviços PM2 (uptime, restarts, memory, CPU)',
        parameters: {
          type: 'object',
          properties: {
            service: {
              type: 'string',
              enum: ['baileys-bridge', 'sticker-bot', 'web-interface', 'all'],
              description: 'Nome do serviço ou "all" para todos'
            }
          },
          required: ['service']
        }
      }
    },

    {
      type: 'function',
      function: {
        name: 'restartService',
        description: 'Reinicia um serviço PM2. USE APENAS quando diagnosticar que o serviço está offline, crashado ou travado.',
        parameters: {
          type: 'object',
          properties: {
            service: {
              type: 'string',
              enum: ['baileys-bridge', 'sticker-bot', 'web-interface'],
              description: 'Nome do serviço a reiniciar'
            }
          },
          required: ['service']
        }
      }
    },

    // ===== DATABASE =====
    {
      type: 'function',
      function: {
        name: 'getLastSentSticker',
        description: 'Retorna informações do último sticker enviado automaticamente. Útil para troubleshoot do scheduler.',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    },

    {
      type: 'function',
      function: {
        name: 'getSchedulerStatus',
        description: 'Verifica status do scheduler de envio automático (habilitado/desabilitado, último envio, próximo envio)',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    },

    {
      type: 'function',
      function: {
        name: 'getQueueStatus',
        description: 'Retorna status da fila de processamento de mídia (pending, processing, completed, failed)',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    },

    // ===== FILE SYSTEM =====
    {
      type: 'function',
      function: {
        name: 'readFile',
        description: 'Lê conteúdo de um arquivo do projeto (código-fonte, configs). Use para analisar bugs ou verificar configurações.',
        parameters: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Caminho relativo do arquivo (ex: bot/scheduler.js, package.json)'
            },
            lines: {
              type: 'number',
              description: 'Número de linhas a retornar (padrão: 100)',
              default: 100
            }
          },
          required: ['filePath']
        }
      }
    },

    // ===== HEALTH CHECKS =====
    {
      type: 'function',
      function: {
        name: 'runHealthCheck',
        description: 'Executa health check completo do sistema (database, WhatsApp connection, disk space, memory)',
        parameters: {
          type: 'object',
          properties: {
            checkType: {
              type: 'string',
              enum: ['full', 'database', 'whatsapp', 'system'],
              description: 'Tipo de health check a executar (padrão: full)',
              default: 'full'
            }
          }
        }
      }
    },

    {
      type: 'function',
      function: {
        name: 'analyzeDatabaseSchema',
        description: 'Analisa a estrutura do banco de dados SQLite. Retorna lista de tabelas, colunas e índices. Use para investigar problemas de schema.',
        parameters: {
          type: 'object',
          properties: {
            tableName: {
              type: 'string',
              description: 'Nome da tabela específica para analisar (opcional). Se omitido, lista todas as tabelas.'
            }
          }
        }
      }
    },

    // ===== FIX/REMEDIATION TOOLS =====
    {
      type: 'function',
      function: {
        name: 'executeSqlQuery',
        description: 'Executa query SQL no banco de dados. APENAS operações seguras: SELECT, INSERT, UPDATE, CREATE INDEX. PROIBIDO criar tabelas novas - use apenas para queries de leitura ou correção de dados existentes. NUNCA use esta tool para adicionar estruturas novas ao schema.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Query SQL a executar. Apenas SELECT, INSERT, UPDATE, CREATE INDEX são permitidos. CREATE TABLE é PROIBIDO.'
            },
            params: {
              type: 'array',
              description: 'Parâmetros para query parametrizada (opcional)',
              items: {
                type: 'string'
              }
            }
          },
          required: ['query']
        }
      }
    },

    {
      type: 'function',
      function: {
        name: 'modifyBotConfig',
        description: 'Modifica valores de configuração do bot na tabela bot_settings. Use para corrigir configs perdidas ou incorretas.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Chave da configuração (ex: scheduler_enabled, auto_send_cron)'
            },
            value: {
              type: 'string',
              description: 'Novo valor da configuração'
            }
          },
          required: ['key', 'value']
        }
      }
    },


    {
      type: 'function',
      function: {
        name: 'compareMediaHashes',
        description: 'Compara hashes visuais de dois IDs de mídia para investigar falsos positivos em detecção de duplicatas. Calcula Hamming distance e mostra detalhes das mídias.',
        parameters: {
          type: 'object',
          properties: {
            mediaId1: {
              type: 'number',
              description: 'ID da primeira mídia'
            },
            mediaId2: {
              type: 'number',
              description: 'ID da segunda mídia'
            }
          },
          required: ['mediaId1', 'mediaId2']
        }
      }
    },

    {
      type: 'function',
      function: {
        name: 'writeFile',
        description: 'Escreve conteúdo em arquivo. APENAS para scripts de correção temporários ou patches. PROIBIDO: arquivos .sql, .db, .env, auth, node_modules. NUNCA use para criar schemas de banco de dados.',
        parameters: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Caminho do arquivo (relativo ao projeto)'
            },
            content: {
              type: 'string',
              description: 'Conteúdo a escrever'
            },
            append: {
              type: 'boolean',
              description: 'Se true, adiciona ao final do arquivo. Se false, sobrescreve (padrão: false)',
              default: false
            }
          },
          required: ['filePath', 'content']
        }
      }
    }
  ];
}

/**
 * Routes tool calls to appropriate handlers
 * @param {string} toolName - Name of the tool to call
 * @param {Object} toolInput - Tool parameters
 * @returns {Promise<Object>} Tool result
 */
async function handleToolCall(toolName, toolInput) {
  console.log(`[OpenAITools] Calling ${toolName} with:`, toolInput);

  try {
    switch (toolName) {
      case 'getBotLogs':
        return await getBotLogs(toolInput);

      case 'searchLogsForPattern':
        return await searchLogsForPattern(toolInput);

      case 'getServiceStatus':
        return await getServiceStatus(toolInput);

      case 'restartService':
        return await restartService(toolInput);

      case 'getLastSentSticker':
        return await getLastSentSticker();

      case 'getSchedulerStatus':
        return await getSchedulerStatus();

      case 'getQueueStatus':
        return await getQueueStatus();

      case 'readFile':
        return await readFile(toolInput);

      case 'runHealthCheck':
        return await runHealthCheck(toolInput);

      case 'analyzeDatabaseSchema':
        return await analyzeDatabaseSchema(toolInput);

      case 'executeSqlQuery':
        return await executeSqlQuery(toolInput);

      case 'modifyBotConfig':
        return await modifyBotConfig(toolInput);

      case 'compareMediaHashes':
        return await compareMediaHashes(toolInput);

      case 'writeFile':
        return await writeFileContent(toolInput);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    console.error(`[OpenAITools] Error in ${toolName}:`, error);
    return {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

// ===== TOOL IMPLEMENTATIONS =====

/**
 * Get recent bot logs
 */
async function getBotLogs({ service, lines = 50, level = 'all' }) {
  // Option 1: Read from logCollector in-memory (FASTEST - for bot service)
  if (service === 'bot') {
    try {
      const { getLogCollector } = require('../utils/logCollector');
      const logCollector = getLogCollector();

      const result = logCollector.getLogs({
        level: level === 'all' ? undefined : level,
        limit: lines
      });

      return {
        service: 'bot (in-memory)',
        lines: result.logs.length,
        total: result.total,
        logs: result.logs.map(log =>
          `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}`
        ).join('\n')
      };
    } catch (err) {
      console.warn('[getBotLogs] LogCollector not available, falling back to file read');
    }
  }

  // Option 2: Read from PM2 log files
  const logFiles = {
    'bot': 'logs/bot-out.log',
    'baileys': 'logs/baileys-out.log',
    'web': 'logs/web-out.log'
  };

  const logPath = path.join(process.cwd(), logFiles[service]);

  try {
    const { stdout } = await execAsync(`tail -n ${lines} "${logPath}" 2>&1`);
    let logs = stdout.trim().split('\n').filter(Boolean);

    // Filter by level if needed
    if (level !== 'all') {
      const levelUpper = level.toUpperCase();
      logs = logs.filter(line => line.includes(`[${levelUpper}]`));
    }

    return {
      service,
      lines: logs.length,
      logs: logs.join('\n')
    };
  } catch (err) {
    return {
      service,
      error: `Failed to read log file: ${err.message}`,
      logs: '',
      hint: 'Log file may not exist yet. Service might not have started.'
    };
  }
}

/**
 * Search logs for specific pattern
 */
async function searchLogsForPattern({ pattern, service = 'bot' }) {
  const logFiles = {
    'bot': 'logs/bot-out.log',
    'baileys': 'logs/baileys-out.log',
    'web': 'logs/web-out.log'
  };

  const logPath = path.join(process.cwd(), logFiles[service]);

  try {
    // Escape special chars for grep, but allow basic regex
    const safePattern = pattern.replace(/"/g, '\\"');
    const { stdout } = await execAsync(`grep -i "${safePattern}" "${logPath}" 2>&1 | tail -n 20`);

    const matches = stdout.trim().split('\n').filter(Boolean);

    return {
      pattern,
      service,
      matchCount: matches.length,
      matches: matches.join('\n')
    };
  } catch (err) {
    // grep returns exit code 1 when no matches found
    if (err.code === 1) {
      return {
        pattern,
        service,
        matchCount: 0,
        matches: '',
        note: 'No matches found'
      };
    }

    return {
      pattern,
      service,
      error: `Search failed: ${err.message}`
    };
  }
}

/**
 * Get PM2 service status
 */
async function getServiceStatus({ service }) {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const processes = JSON.parse(stdout);

    if (service === 'all') {
      return processes.map(p => ({
        name: p.name,
        status: p.pm2_env.status,
        uptime: p.pm2_env.pm_uptime,
        uptimeHuman: formatUptime(Date.now() - p.pm2_env.pm_uptime),
        restarts: p.pm2_env.restart_time,
        memory: Math.round(p.monit.memory / 1024 / 1024) + 'MB',
        cpu: p.monit.cpu + '%'
      }));
    }

    const proc = processes.find(p => p.name === service);

    if (!proc) {
      return {
        error: `Service ${service} not found in PM2`,
        availableServices: processes.map(p => p.name)
      };
    }

    return {
      name: proc.name,
      status: proc.pm2_env.status,
      uptime: proc.pm2_env.pm_uptime,
      uptimeHuman: formatUptime(Date.now() - proc.pm2_env.pm_uptime),
      restarts: proc.pm2_env.restart_time,
      memory: Math.round(proc.monit.memory / 1024 / 1024) + 'MB',
      cpu: proc.monit.cpu + '%',
      pid: proc.pid
    };
  } catch (err) {
    return {
      error: `Failed to get PM2 status: ${err.message}`,
      hint: 'PM2 may not be running or not installed'
    };
  }
}

/**
 * Restart PM2 service
 */
async function restartService({ service }) {
  try {
    // CRITICAL SAFETY: Never restart the bot process itself during diagnosis
    // This would kill AdminWatcher before it can send the final response
    const selfServiceNames = ['Bot-Client', 'sticker-bot'];
    if (selfServiceNames.includes(service)) {
      console.warn(`[AdminWatcher] ⚠️ Blocked self-restart attempt: ${service}`);
      return {
        success: false,
        blocked: true,
        error: `Cannot restart ${service} during diagnosis - would kill AdminWatcher`,
        hint: 'The bot process cannot restart itself. If needed, ask admin to restart manually: sudo -u dev pm2 restart Bot-Client',
        suggestion: 'Instead of restarting, try other fixes first (create tables, modify configs, etc.)'
      };
    }

    console.log(`[AdminWatcher] 🔄 Restarting service: ${service}`);

    const { stdout } = await execAsync(`pm2 restart ${service}`);

    // Wait for service to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));

    const status = await getServiceStatus({ service });

    return {
      success: true,
      restarted: true,
      service,
      output: stdout.trim(),
      newStatus: status
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to restart ${service}: ${err.message}`,
      hint: 'Check if PM2 is running and service name is correct'
    };
  }
}

/**
 * Get last sent sticker info
 */
async function getLastSentSticker() {
  try {
    const { db } = require('../database/connection');

    return new Promise((resolve, reject) => {
      db.get(`
        SELECT id, file_hash, sent_at, nsfw, tags, description
        FROM media
        WHERE sent_at IS NOT NULL
        ORDER BY sent_at DESC
        LIMIT 1
      `, (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve({
            error: 'No stickers sent yet',
            note: 'Database might be empty or scheduler never ran'
          });
        } else {
          resolve({
            id: row.id,
            fileHash: row.file_hash,
            sentAt: row.sent_at,
            sentAtHuman: new Date(row.sent_at * 1000).toISOString(),
            timeSinceLastSend: formatUptime(Date.now() - (row.sent_at * 1000)),
            nsfw: row.nsfw,
            tags: row.tags
          });
        }
      });
    });
  } catch (err) {
    return {
      error: `Database error: ${err.message}`
    };
  }
}

/**
 * Get scheduler status
 */
async function getSchedulerStatus() {
  try {
    const { db } = require('../database/connection');

    return new Promise((resolve, reject) => {
      // Check if scheduler is enabled in bot_settings
      db.get(`
        SELECT value FROM bot_settings WHERE key = 'scheduler_enabled'
      `, (err, row) => {
        if (err) return reject(err);

        const enabled = row?.value === '1' || row?.value === 'true';

        // Get last sent sticker time
        db.get(`
          SELECT sent_at FROM media
          WHERE sent_at IS NOT NULL
          ORDER BY sent_at DESC LIMIT 1
        `, (err2, lastSent) => {
          if (err2) return reject(err2);

          // Get cron expression
          db.get(`
            SELECT value FROM bot_settings WHERE key = 'auto_send_cron'
          `, (err3, cronRow) => {
            if (err3) return reject(err3);

            resolve({
              enabled,
              cronExpression: cronRow?.value || 'Not configured',
              lastSentAt: lastSent?.sent_at,
              lastSentAtHuman: lastSent ? new Date(lastSent.sent_at * 1000).toISOString() : null,
              timeSinceLastSend: lastSent ? formatUptime(Date.now() - (lastSent.sent_at * 1000)) : null
            });
          });
        });
      });
    });
  } catch (err) {
    return {
      error: `Database error: ${err.message}`
    };
  }
}

/**
 * Get processing queue status
 */
async function getQueueStatus() {
  try {
    const { db } = require('../database/connection');

    return new Promise((resolve) => {
      // Query media_processing_log to see recent processing activity
      // Note: This system does NOT use a media_queue table - processing is handled in-memory
      db.all(`
        SELECT
          success,
          COUNT(*) as count,
          AVG(duration_ms) as avg_duration_ms
        FROM media_processing_log
        WHERE processing_start_ts > strftime('%s', 'now', '-1 day')
        GROUP BY success
      `, (err, rows) => {
        if (err) {
          return resolve({
            note: 'Processing log shows activity from last 24h',
            error: err.message
          });
        }

        const summary = {
          note: 'Media processing activity (last 24h)',
          successful: 0,
          failed: 0,
          total: 0
        };

        rows.forEach(r => {
          if (r.success === 1) {
            summary.successful = r.count;
            summary.avgDurationMs = Math.round(r.avg_duration_ms);
          } else {
            summary.failed = r.count;
          }
          summary.total += r.count;
        });

        if (summary.total === 0) {
          summary.note = 'No media processing in last 24h';
        }

        resolve(summary);
      });
    });
  } catch (err) {
    return {
      error: `Database error: ${err.message}`
    };
  }
}

/**
 * Read file from project
 */
async function readFile({ filePath, lines = 100 }) {
  try {
    const fullPath = path.join(process.cwd(), filePath);

    // Security: prevent path traversal
    if (!fullPath.startsWith(process.cwd())) {
      return {
        error: 'Invalid file path (path traversal detected)',
        filePath
      };
    }

    // Security: block sensitive paths (but allow .env.example)
    const forbiddenPaths = ['auth_info_baileys', 'node_modules/.', '.git/'];
    const isEnvFile = filePath === '.env' || filePath.endsWith('/.env');

    if (forbiddenPaths.some(p => filePath.includes(p)) || isEnvFile) {
      return {
        error: `Access denied: ${filePath} is a sensitive path`,
        hint: 'Cannot read .env (but .env.example is ok), auth files, node_modules or .git',
        allowedAlternatives: filePath === '.env' ? ['.env.example'] : []
      };
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    const allLines = content.split('\n');

    // Return first N lines
    const selectedLines = allLines.slice(0, lines);

    return {
      filePath,
      totalLines: allLines.length,
      returnedLines: selectedLines.length,
      content: selectedLines.join('\n'),
      truncated: allLines.length > lines
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        filePath,
        error: 'File not found',
        hint: 'Check if file path is correct'
      };
    }

    return {
      filePath,
      error: `Failed to read file: ${err.message}`
    };
  }
}

/**
 * Run system health check
 */
async function runHealthCheck({ checkType = 'full' }) {
  const results = {};

  try {
    // Database health
    if (checkType === 'full' || checkType === 'database') {
      const { db } = require('../database/connection');

      const dbHealth = await new Promise((resolve) => {
        const checks = {};

        // Check media table
        db.get('SELECT COUNT(*) as count FROM media', (err, row) => {
          if (err) {
            checks.media = { status: 'error', error: err.message };
          } else {
            checks.media = { status: 'healthy', count: row.count };
          }

          // Check contacts table
          db.get('SELECT COUNT(*) as count FROM contacts', (err2, row2) => {
            if (err2) {
              checks.contacts = { status: 'error', error: err2.message };
            } else {
              checks.contacts = { status: 'healthy', count: row2.count };
            }

            // Check database file size
            const dbPath = path.join(process.cwd(), 'media.db');
            fs.stat(dbPath).then(stats => {
              checks.fileSize = Math.round(stats.size / 1024 / 1024) + 'MB';
              resolve(checks);
            }).catch(() => {
              checks.fileSize = 'unknown';
              resolve(checks);
            });
          });
        });
      });

      results.database = dbHealth;
    }

    // WhatsApp connection
    if (checkType === 'full' || checkType === 'whatsapp') {
      try {
        // Check if waAdapter is initialized
        const waAdapterPath = path.join(process.cwd(), 'waAdapter.js');
        const waAdapterExists = await fs.access(waAdapterPath).then(() => true).catch(() => false);

        if (waAdapterExists) {
          results.whatsapp = {
            adapterExists: true,
            note: 'Use getServiceStatus to check baileys-bridge status'
          };
        } else {
          results.whatsapp = {
            adapterExists: false,
            error: 'waAdapter.js not found'
          };
        }
      } catch (err) {
        results.whatsapp = {
          error: err.message
        };
      }
    }

    // System resources
    if (checkType === 'full' || checkType === 'system') {
      const os = require('os');

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      results.system = {
        platform: os.platform(),
        uptimeSeconds: os.uptime(),
        uptimeHuman: formatUptime(os.uptime() * 1000),
        memory: {
          total: Math.round(totalMem / 1024 / 1024) + 'MB',
          used: Math.round(usedMem / 1024 / 1024) + 'MB',
          free: Math.round(freeMem / 1024 / 1024) + 'MB',
          usagePercent: Math.round((usedMem / totalMem) * 100) + '%'
        },
        loadAverage: os.loadavg().map(l => l.toFixed(2))
      };

      // Disk space (Linux only)
      if (os.platform() === 'linux') {
        try {
          const { stdout } = await execAsync('df -h / | tail -1');
          const parts = stdout.trim().split(/\s+/);
          results.system.disk = {
            total: parts[1],
            used: parts[2],
            available: parts[3],
            usagePercent: parts[4]
          };
        } catch (err) {
          results.system.disk = { error: 'Failed to get disk info' };
        }
      }
    }

    return {
      checkType,
      timestamp: new Date().toISOString(),
      results
    };
  } catch (err) {
    return {
      checkType,
      error: `Health check failed: ${err.message}`
    };
  }
}

/**
 * Analyze database schema
 */
async function analyzeDatabaseSchema({ tableName }) {
  try {
    const { db } = require('../database/connection');

    if (tableName) {
      // Get schema for specific table
      return new Promise((resolve, reject) => {
        db.get(`
          SELECT sql FROM sqlite_master
          WHERE type='table' AND name=?
        `, [tableName], (err, row) => {
          if (err) return reject(err);

          if (!row) {
            return resolve({
              tableName,
              exists: false,
              error: `Table ${tableName} does not exist`
            });
          }

          // Get column info
          db.all(`PRAGMA table_info(${tableName})`, (err2, columns) => {
            if (err2) return reject(err2);

            // Get indexes
            db.all(`PRAGMA index_list(${tableName})`, (err3, indexes) => {
              if (err3) return reject(err3);

              resolve({
                tableName,
                exists: true,
                schema: row.sql,
                columns: columns.map(c => ({
                  name: c.name,
                  type: c.type,
                  notNull: c.notnull === 1,
                  defaultValue: c.dflt_value,
                  primaryKey: c.pk === 1
                })),
                indexes: indexes.map(i => i.name)
              });
            });
          });
        });
      });
    }

    // List all tables
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT name, sql FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `, (err, tables) => {
        if (err) return reject(err);

        resolve({
          tableCount: tables.length,
          tables: tables.map(t => ({
            name: t.name,
            schema: t.sql
          }))
        });
      });
    });
  } catch (err) {
    return {
      error: `Failed to analyze schema: ${err.message}`
    };
  }
}

/**
 * Execute SQL query (safe operations only)
 */
async function executeSqlQuery({ query, params = [] }) {
  try {
    const { db } = require('../database/connection');

    // Security: only allow safe read/update operations - NO SCHEMA CHANGES
    const normalizedQuery = query.trim().toUpperCase();
    const allowedOperations = ['SELECT', 'INSERT', 'UPDATE', 'CREATE INDEX'];

    const isAllowed = allowedOperations.some(op => normalizedQuery.startsWith(op));

    // Block dangerous operations AND schema modifications
    const forbiddenPatterns = [
      'DROP', 'DELETE FROM', 'TRUNCATE', 'PRAGMA',
      'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE'  // Block all schema modifications
    ];
    const isForbidden = forbiddenPatterns.some(pattern => normalizedQuery.includes(pattern));

    if (!isAllowed || isForbidden) {
      return {
        success: false,
        error: 'Query contains forbidden operation. Schema modifications (CREATE TABLE, ALTER TABLE, DROP) are BLOCKED.',
        allowed: allowedOperations,
        forbidden: forbiddenPatterns,
        hint: 'Only SELECT, INSERT, UPDATE, CREATE INDEX are allowed. NO TABLE CREATION OR MODIFICATION.'
      };
    }

    console.log(`[executeSqlQuery] Executing: ${query.substring(0, 100)}...`);

    return new Promise((resolve, reject) => {
      if (normalizedQuery.startsWith('SELECT')) {
        // For SELECT, use db.all to get all rows
        db.all(query, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              success: true,
              operation: 'SELECT',
              rowCount: rows.length,
              rows: rows.slice(0, 50), // Limit to first 50 rows
              truncated: rows.length > 50
            });
          }
        });
      } else {
        // For INSERT, UPDATE, CREATE, use db.run
        db.run(query, params, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({
              success: true,
              operation: normalizedQuery.split(' ')[0],
              changes: this.changes,
              lastID: this.lastID
            });
          }
        });
      }
    });
  } catch (err) {
    return {
      success: false,
      error: `SQL execution failed: ${err.message}`
    };
  }
}

// createDatabaseTable tool REMOVED
// Schema modifications should be done via code changes and migrations, NOT by AI agents
// This prevents agents from creating unnecessary tables like media_queue

/**
 * Modify bot configuration
 */
async function modifyBotConfig({ key, value }) {
  try {
    const { db } = require('../database/connection');

    console.log(`[modifyBotConfig] Setting ${key} = ${value}`);

    return new Promise((resolve, reject) => {
      // Use INSERT OR REPLACE to upsert config value in bot_config table
      db.run(`
        INSERT OR REPLACE INTO bot_config (key, value)
        VALUES (?, ?)
      `, [key, value], function(err) {
        if (err) {
          reject(err);
        } else {
          // Verify new value
          db.get(`
            SELECT key, value FROM bot_config WHERE key=?
          `, [key], (err2, row) => {
            if (err2) return reject(err2);

            resolve({
              success: true,
              key,
              oldValue: null, // We don't track old value
              newValue: row?.value
            });
          });
        }
      });
    });
  } catch (err) {
    return {
      success: false,
      error: `Failed to modify config: ${err.message}`
    };
  }
}

/**
 * Clear processing queue
 */
// clearProcessingQueue REMOVED
// This system does NOT use a media_queue table - processing is in-memory
// The existence of this function was confusing the agent into thinking
// a media_queue table should exist but was missing

/**
 * Write file content
 */
async function writeFileContent({ filePath, content, append = false }) {
  try {
    const fullPath = path.join(process.cwd(), filePath);

    // Security: prevent path traversal
    if (!fullPath.startsWith(process.cwd())) {
      return {
        success: false,
        error: 'Invalid file path (path traversal detected)',
        filePath
      };
    }

    // Security: block sensitive paths
    const forbiddenPaths = ['.env', 'auth_info_baileys', 'node_modules', '.git', 'media.db'];
    const forbiddenExtensions = ['.key', '.pem', '.crt', '.sql', '.db'];  // Block SQL and DB files

    const pathLower = filePath.toLowerCase();
    const isForbiddenPath = forbiddenPaths.some(p => pathLower.includes(p));
    const isForbiddenExt = forbiddenExtensions.some(ext => pathLower.endsWith(ext));

    if (isForbiddenPath || isForbiddenExt) {
      return {
        success: false,
        error: `Access denied: ${filePath} is a sensitive path`,
        hint: 'Cannot write to .env, auth files, node_modules, .git, database files (.db, .sql) or key files (.key, .pem, .crt)'
      };
    }

    console.log(`[writeFile] Writing to: ${filePath} (append: ${append})`);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    if (append) {
      await fs.appendFile(fullPath, content, 'utf-8');
    } else {
      await fs.writeFile(fullPath, content, 'utf-8');
    }

    // Verify write
    const stats = await fs.stat(fullPath);

    return {
      success: true,
      filePath,
      size: stats.size,
      mode: append ? 'append' : 'overwrite',
      writtenAt: new Date().toISOString()
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to write file: ${err.message}`
    };
  }
}

/**
 * Compare media hashes for investigating false positives
 */
async function compareMediaHashes({ mediaId1, mediaId2 }) {
  try {
    const { db } = require('../database/connection');
    const { hammingDistance } = require('../database/utils');

    console.log(`[compareMediaHashes] Comparing media #${mediaId1} vs #${mediaId2}`);

    // Get both media records
    const media1 = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, description, mimetype, hash_visual, file_path, width, height, duration, file_size
        FROM media
        WHERE id = ?
      `, [mediaId1], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const media2 = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, description, mimetype, hash_visual, file_path, width, height, duration, file_size
        FROM media
        WHERE id = ?
      `, [mediaId2], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!media1) {
      return {
        success: false,
        error: `Media ID ${mediaId1} not found`
      };
    }

    if (!media2) {
      return {
        success: false,
        error: `Media ID ${mediaId2} not found`
      };
    }

    if (!media1.hash_visual || !media2.hash_visual) {
      return {
        success: false,
        error: 'One or both media items are missing hash_visual values',
        media1_has_hash: !!media1.hash_visual,
        media2_has_hash: !!media2.hash_visual
      };
    }

    // Calculate Hamming distance
    const distance = hammingDistance(media1.hash_visual, media2.hash_visual);
    const totalBits = 1024; // Standard dHash size
    const similarity = Math.round((totalBits - distance) / totalBits * 100);
    const threshold = 102; // 90% similarity threshold

    // Analyze hash structure
    const hash1Frames = media1.hash_visual.split(':');
    const hash2Frames = media2.hash_visual.split(':');

    return {
      success: true,
      media1: {
        id: media1.id,
        description: media1.description || '(sem descrição)',
        mimetype: media1.mimetype,
        dimensions: media1.width && media1.height ? `${media1.width}x${media1.height}` : 'unknown',
        duration: media1.duration ? `${media1.duration}s` : null,
        file_size: media1.file_size ? `${Math.round(media1.file_size / 1024)}KB` : 'unknown',
        hash_visual: media1.hash_visual,
        hash_frames: hash1Frames.length,
        file_path: media1.file_path
      },
      media2: {
        id: media2.id,
        description: media2.description || '(sem descrição)',
        mimetype: media2.mimetype,
        dimensions: media2.width && media2.height ? `${media2.width}x${media2.height}` : 'unknown',
        duration: media2.duration ? `${media2.duration}s` : null,
        file_size: media2.file_size ? `${Math.round(media2.file_size / 1024)}KB` : 'unknown',
        hash_visual: media2.hash_visual,
        hash_frames: hash2Frames.length,
        file_path: media2.file_path
      },
      comparison: {
        hamming_distance: distance,
        similarity_percent: similarity,
        threshold_bits: threshold,
        threshold_percent: 90,
        would_block_as_duplicate: distance <= threshold,
        bits_different: distance,
        total_bits: totalBits,
        hash1_prefix: media1.hash_visual.substring(0, 32) + '...',
        hash2_prefix: media2.hash_visual.substring(0, 32) + '...',
        hash1_is_multiframe: hash1Frames.length > 1,
        hash2_is_multiframe: hash2Frames.length > 1
      },
      diagnosis: distance <= threshold
        ? '🚨 FALSE POSITIVE: These media are flagged as duplicates but are completely different!'
        : '✅ Correctly identified as different media (distance above threshold)'
    };
  } catch (err) {
    return {
      success: false,
      error: `Comparison failed: ${err.message}`,
      stack: err.stack
    };
  }
}

// ===== HELPERS =====

/**
 * Format uptime/duration in human-readable format
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

module.exports = {
  getOpenAITools,
  handleToolCall
};
