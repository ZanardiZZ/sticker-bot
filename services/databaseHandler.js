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
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.promisifyOperation(operation, params);
      } catch (error) {
        lastError = error;
        
        const isBusyError = error.code === 'SQLITE_BUSY' || 
                           error.message.includes('SQLITE_BUSY') ||
                           error.message.includes('database is locked');
        
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
   * Execute a transaction with retry logic
   */
  async transaction(operations) {
    return this.executeWithRetry(async () => {
      return new Promise((resolve, reject) => {
        this.db.serialize(() => {
          this.db.run('BEGIN TRANSACTION');
          
          const executeOperations = async () => {
            try {
              const results = [];
              
              for (const op of operations) {
                const result = await this.promisifyOperation(op.sql, op.params);
                results.push(result);
              }
              this.db.run('COMMIT', (err) => {
                if (err) {
                  const formatError = require('../utils/formatError');
                  console.error('[DB] Commit failed:', formatError(err));
                  return reject(err);
                }
                resolve(results);
              });
              
            } catch (error) {
              // Attempt rollback and log any rollback errors as well
              this.db.run('ROLLBACK', (rbErr) => {
                const formatError = require('../utils/formatError');
                if (rbErr) {
                  console.error('[DB] Rollback failed after error:', formatError(rbErr), 'original error:', formatError(error));
                } else {
                  console.warn('[DB] Rolled back transaction due to error:', formatError(error));
                }
                reject(error);
              });
            }
          };
          
          executeOperations();
        });
      });
    });
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
    return this.executeWithRetry(() => {
      return new Promise((resolve, reject) => {
        this.db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
          if (err) reject(err);
          else resolve();
        });
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