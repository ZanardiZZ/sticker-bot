const sqlite3 = require('sqlite3').verbose();

/**
 * Enhanced Database Handler with better concurrency control
 * and automatic retry for SQLITE_BUSY errors
 */
class DatabaseHandler {
  constructor(db) {
    this.db = db;
    this.busyTimeout = 30000; // 30 seconds
    this.maxRetries = 5;
    this.retryDelay = 100; // Initial delay in ms
    this.isClosed = false; // Track if database is closed
    this.slowQueryMs = Number(process.env.SQLITE_SLOW_QUERY_MS || 250);
    this.writeQueue = Promise.resolve();
    this.writeQueue = Promise.resolve();

    // Configure SQLite for better concurrency
    this.db.configure('busyTimeout', this.busyTimeout);
    this.db.run('PRAGMA journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    this.db.run('PRAGMA synchronous = NORMAL'); // Balance between safety and performance
  }

  /**
   * Execute a database operation with retry logic
   */
  async executeWithRetry(operation, params = []) {
    let lastError;
    const operationLabel = this.describeOperation(operation);
    const startedAt = Date.now();
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.promisifyOperation(operation, params);
        const durationMs = Date.now() - startedAt;
        if (durationMs >= this.slowQueryMs) {
          console.warn(`[DB:Slow] op=${operationLabel} duration_ms=${durationMs}`);
        }
        return result;
      } catch (error) {
        lastError = error;
        
        const errorMessage = error?.message || '';
        const isBusyError = error.code === 'SQLITE_BUSY' ||
                           error.code === 'SQLITE_LOCKED' ||
                           errorMessage.includes('SQLITE_BUSY') ||
                           errorMessage.includes('SQLITE_LOCKED') ||
                           errorMessage.includes('database is locked') ||
                           errorMessage.includes('database table is locked');
        
        if (isBusyError) {
          console.warn(`[DB:Busy] op=${operationLabel} attempt=${attempt} code=${error.code || 'unknown'}`);
        }
        if (isBusyError && attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.warn(`Database busy, retrying attempt ${attempt}/${this.maxRetries} in ${delay}ms`);
          await this.sleep(delay);
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }

  /**
   * Promisify database operations
   */
  promisifyOperation(operation, params = []) {
    return new Promise((resolve, reject) => {
      if (typeof operation === 'string') {
        // SQL query
        if (operation.trim().toLowerCase().startsWith('select') || 
            operation.trim().toLowerCase().startsWith('with')) {
          // SELECT query
          this.db.all(operation, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        } else {
          // INSERT/UPDATE/DELETE query
          this.db.run(operation, params, function(err) {
            if (err) reject(err);
            else resolve({ 
              changes: this.changes, 
              lastID: this.lastID 
            });
          });
        }
      } else if (typeof operation === 'function') {
        // Custom function
        try {
          const result = operation();
          if (result && typeof result.then === 'function') {
            result.then(resolve).catch(reject);
          } else {
            resolve(result);
          }
        } catch (err) {
          reject(err);
        }
      }
    });
  }

  /**
   * Serialize write transactions in this process and retry the whole
   * transaction only after a rollback has completed.
   */
  withWriteLock(operation) {
    const run = this.writeQueue.then(operation, operation);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  async transaction(nameOrOperations, maybeOperations) {
    let name = 'transaction';
    let operations = nameOrOperations;
    if (typeof nameOrOperations === 'string') {
      name = nameOrOperations;
      operations = maybeOperations;
    }
    if (!Array.isArray(operations) && typeof operations !== 'function') {
      throw new TypeError('Transaction operations must be an array or callback');
    }
    return this.withWriteLock(() =>
      this.executeWithRetry(() => this.runTransaction(name, operations))
    );
  }

  async runTransaction(name, operations) {
    const startedAt = Date.now();
    let began = false;
    try {
      await this.promisifyOperation('BEGIN IMMEDIATE TRANSACTION');
      began = true;
      let results;
      if (typeof operations === 'function') {
        const tx = {
          run: (sql, params = []) => this.promisifyOperation(sql, params),
          get: async (sql, params = []) => {
            const rows = await this.promisifyOperation(sql, params);
            return Array.isArray(rows) ? (rows[0] || null) : rows;
          },
          all: (sql, params = []) => this.promisifyOperation(sql, params)
        };
        results = await operations(tx);
      } else {
        results = [];
        for (const op of operations) {
          results.push(await this.promisifyOperation(op.sql, op.params || []));
        }
      }
      await this.promisifyOperation('COMMIT');
      const durationMs = Date.now() - startedAt;
      console.log(`[DB:Tx] name=${name} status=committed duration_ms=${durationMs}`);
      return results;
    } catch (error) {
      if (began) {
        try {
          await this.promisifyOperation('ROLLBACK');
        } catch (rollbackError) {
          console.error('[DB] Rollback failed:', rollbackError.message);
        }
      }
      const durationMs = Date.now() - startedAt;
      console.warn(`[DB:Tx] name=${name} status=rolled_back duration_ms=${durationMs}`);
      throw error;
    }
  }

  /**
   * Get a single record with retry
   */
  async get(sql, params = []) {
    const rows = await this.executeWithRetry(sql, params);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  /**
   * Get all records with retry
   */
  async all(sql, params = []) {
    return this.executeWithRetry(sql, params);
  }

  /**
   * Run a query with retry
   */
  async run(sql, params = []) {
    return this.executeWithRetry(sql, params);
  }

  describeOperation(operation) {
    if (typeof operation !== 'string') return 'CUSTOM';
    const sql = operation.trim().replace(/\s+/g, ' ');
    const verb = (sql.match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|PRAGMA)\b/i) || [])[1];
    if (!verb) return 'SQL';
    const table = (sql.match(/\b(?:FROM|INTO|UPDATE|TABLE)\s+([A-Za-z0-9_]+)/i) || [])[1];
    return `${verb.toUpperCase()}${table ? `:${table}` : ''}`;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Perform WAL checkpoint to commit WAL data to main database
   */
  async checkpointWAL() {
    // Skip checkpoint if database is closed
    if (this.isClosed) {
      return;
    }

    return this.executeWithRetry(() => {
      return new Promise((resolve, reject) => {
        // Double-check before executing
        if (this.isClosed) {
          resolve();
          return;
        }

        this.db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  /**
   * Close the database connection and stop periodic operations
   */
  close() {
    this.isClosed = true;

    // Stop periodic checkpoint if running
    const connection = require('../database/connection');
    if (connection.stopPeriodicCheckpoint) {
      connection.stopPeriodicCheckpoint();
    }

    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get database statistics
   */
  async getStats() {
    try {
      const [mediaCount, tagCount, processed] = await Promise.all([
        this.get('SELECT COUNT(*) as count FROM media'),
        this.get('SELECT COUNT(*) as count FROM tags'),
        this.get('SELECT COUNT(*) as count FROM processed_files')
      ]);

      return {
        media: mediaCount.count,
        tags: tagCount.count,
        processedFiles: processed.count
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      return { media: 0, tags: 0, processedFiles: 0 };
    }
  }
}

module.exports = DatabaseHandler;
