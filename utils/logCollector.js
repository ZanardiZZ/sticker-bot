/**
 * Log Collector - Sistema de captura e armazenamento de logs em memória
 * Implementa buffer circular para evitar vazamentos de memória
 */

class LogCollector {
  constructor(maxLogs = 1000) {
    this.maxLogs = maxLogs;
    this.logs = [];
    this.logIndex = 0;
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };
    this.isIntercepting = false;
    
    // Interceptar console methods
    this.setupConsoleInterception();
    
    console.log('[LogCollector] Inicializado com buffer de', maxLogs, 'logs');
  }

  setupConsoleInterception() {
    // Prevent multiple instances from intercepting console simultaneously
    if (LogCollector._isConsoleIntercepted) {
      console.warn('[LogCollector] Console já está sendo interceptado por outra instância');
      return;
    }

    const self = this;
    LogCollector._isConsoleIntercepted = true;
    LogCollector._activeInstance = this;
    this.isIntercepting = true;

    // Interceptar console.log
    console.log = function(...args) {
      self.addLog('info', args);
      self.originalConsole.log.apply(console, args);
    };

    // Interceptar console.warn
    console.warn = function(...args) {
      self.addLog('warn', args);
      self.originalConsole.warn.apply(console, args);
    };

    // Interceptar console.error
    console.error = function(...args) {
      self.addLog('error', args);
      self.originalConsole.error.apply(console, args);
    };

    // Interceptar console.info
    console.info = function(...args) {
      self.addLog('info', args);
      self.originalConsole.info.apply(console, args);
    };
  }

  addLog(level, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    const logEntry = {
      timestamp,
      level,
      message,
      source: this.getCallerInfo()
    };

    // Buffer circular - substituir logs antigos
    if (this.logs.length >= this.maxLogs) {
      this.logs[this.logIndex] = logEntry;
      this.logIndex = (this.logIndex + 1) % this.maxLogs;
    } else {
      this.logs.push(logEntry);
    }
  }

  getCallerInfo() {
    const stack = new Error().stack;
    if (!stack) return 'unknown';
    
    const lines = stack.split('\n');
    // Pular as primeiras linhas (Error, addLog, console interceptor)
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (line && !line.includes('node_modules') && !line.includes('logCollector.js')) {
        const match = line.match(/at\s+(?:(.+?)\s+)?\(?([^)]+):(\d+):(\d+)\)?/);
        if (match) {
          const [, funcName, filepath, lineNum] = match;
          const filename = filepath ? filepath.split('/').pop() : 'unknown';
          return funcName ? `${funcName} (${filename}:${lineNum})` : `${filename}:${lineNum}`;
        }
      }
    }
    return 'unknown';
  }

  getLogs(options = {}) {
    const { level, search, limit = 100, offset = 0 } = options;
    
    let filteredLogs = [...this.logs];
    
    // Filtrar por nível se especificado
    if (level && level !== 'all') {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    
    // Filtrar por busca de texto se especificada
    if (search) {
      const searchLower = search.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.message.toLowerCase().includes(searchLower) ||
        log.source.toLowerCase().includes(searchLower)
      );
    }
    
    // Ordenar por timestamp mais recente primeiro
    filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Aplicar paginação
    const total = filteredLogs.length;
    const logs = filteredLogs.slice(offset, offset + limit);
    
    return {
      logs,
      total,
      offset,
      limit
    };
  }

  getLogStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {
        info: 0,
        warn: 0,
        error: 0
      }
    };

    this.logs.forEach(log => {
      if (stats.byLevel[log.level] !== undefined) {
        stats.byLevel[log.level]++;
      }
    });

    return stats;
  }

  getLogCount() {
    return this.logs.length;
  }

  clearLogs() {
    this.logs = [];
    this.logIndex = 0;
    console.log('[LogCollector] Logs limpos');
  }

  // Método para adicionar logs customizados (não apenas do console)
  addCustomLog(level, message, source = 'system') {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message: String(message),
      source
    };

    if (this.logs.length >= this.maxLogs) {
      this.logs[this.logIndex] = logEntry;
      this.logIndex = (this.logIndex + 1) % this.maxLogs;
    } else {
      this.logs.push(logEntry);
    }
  }

  // Restaurar console original (para testes ou desativação)
  restore() {
    if (this.isIntercepting && LogCollector._activeInstance === this) {
      console.log = this.originalConsole.log;
      console.warn = this.originalConsole.warn;
      console.error = this.originalConsole.error;
      console.info = this.originalConsole.info;
      
      LogCollector._isConsoleIntercepted = false;
      LogCollector._activeInstance = null;
      this.isIntercepting = false;
      
      console.log('[LogCollector] Console methods restaurados');
    } else if (this.isIntercepting) {
      console.warn('[LogCollector] Não é possível restaurar - outra instância está ativa');
    }
  }
}

// Static properties for tracking console interception state
LogCollector._isConsoleIntercepted = false;
LogCollector._activeInstance = null;

// Singleton instance
let logCollectorInstance = null;

function getLogCollector(maxLogs = 1000) {
  if (!logCollectorInstance || (logCollectorInstance && !logCollectorInstance.isIntercepting && !LogCollector._isConsoleIntercepted)) {
    logCollectorInstance = new LogCollector(maxLogs);
  }
  return logCollectorInstance;
}

module.exports = {
  LogCollector,
  getLogCollector
};