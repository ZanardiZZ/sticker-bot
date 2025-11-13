const { EventEmitter } = require('events');

/**
 * Media Processing Queue System
 * Handles high-volume media processing with controlled concurrency
 * and proper error handling to avoid SQLite BUSY errors
 */
class MediaQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency = options.concurrency || 3; // Max concurrent processes
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000; // Initial retry delay in ms
    this.maxQueueSize = options.maxQueueSize || 100; // Max queue size to prevent memory issues
    
    this.queue = [];
    this.processing = new Set();
    this.stats = {
      processed: 0,
      failed: 0,
      queued: 0,
      rejected: 0 // Track rejected items due to queue overflow
    };
  }

  /**
   * Add media processing job to queue
   */
  async add(job) {
    return new Promise((resolve, reject) => {
      // Check if queue is full (excluding items currently processing)
      if (this.queue.length >= this.maxQueueSize) {
        const error = new Error(`Queue is full (max: ${this.maxQueueSize}). Please try again later.`);
        error.code = 'QUEUE_FULL';
        this.stats.rejected++;
        this.emit('queueFull', this.maxQueueSize, this.queue.length);
        reject(error);
        return;
      }
      
      const queueItem = {
        id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        job,
        resolve,
        reject,
        attempts: 0,
        addedAt: Date.now()
      };
      
      // Optimization: If queue is empty and nothing is processing, execute immediately
      if (this.queue.length === 0 && this.processing.size === 0) {
        this.processing.add(queueItem.id);
        this.emit('jobAdded', queueItem.id);
        
        // Execute immediately without queueing
        setImmediate(async () => {
          try {
            await this.executeJob(queueItem);
          } catch (error) {
            console.error(`Immediate job ${queueItem.id} failed:`, error);
          } finally {
            // Ensure cleanup happens in all cases
            this.processing.delete(queueItem.id);
            // Process next item in queue if any
            setImmediate(() => this.processNext());
          }
        });
        
        return;
      }
      
      // Otherwise, use normal queueing
      this.queue.push(queueItem);
      this.stats.queued++;
      this.emit('jobAdded', queueItem.id);
      
      // Emit warning if queue is getting large (>75% full)
      const queueUsage = this.queue.length / this.maxQueueSize;
      if (queueUsage >= 0.75) {
        this.emit('queueWarning', this.queue.length, this.maxQueueSize, queueUsage);
      }
      
      // Start processing if we have capacity
      this.processNext();
    });
  }

  /**
   * Process next item in queue if we have capacity
   */
  async processNext() {
    if (this.processing.size >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    this.stats.queued--;
    this.processing.add(item.id);

    try {
      await this.executeJob(item);
    } catch (error) {
      console.error(`Queue job ${item.id} failed:`, error);
    }

    this.processing.delete(item.id);
    
    // Process next item
    setImmediate(() => this.processNext());
  }

  /**
   * Execute a single job with retry logic
   */
  async executeJob(item) {
    const { job, resolve, reject } = item;
    
    const executeWithRetry = async (attempt = 1) => {
      try {
        this.emit('jobStarted', item.id, attempt);
        const result = await job();
        
        this.stats.processed++;
        this.emit('jobCompleted', item.id, result);
        resolve(result);
        
      } catch (error) {
        const isSqlBusy = error.code === 'SQLITE_BUSY' || (error.message && error.message.includes('SQLITE_BUSY'));
        
        // Detect resource contention errors for media processing
        const isResourceContention = error.message && (
          error.message.includes('resource contention detected') ||
          error.message.includes('retryable') ||
          error.message.includes('Timeout ao extrair frame') ||
          error.message.includes('FFmpeg não consegue processar') ||
          error.message.includes('Cannot find ffprobe') ||
          error.message.includes('Erro ao criar diretório temp') ||
          error.message.includes('processamento concorrente')
        );
        
        const shouldRetry = attempt < this.retryAttempts && (isSqlBusy || isResourceContention);
        
        if (shouldRetry) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          
          if (isResourceContention) {
            console.warn(`Job ${item.id} attempt ${attempt} failed due to resource contention (${error.message}), retrying in ${delay}ms`);
          } else {
            console.warn(`Job ${item.id} attempt ${attempt} failed (${error.message}), retrying in ${delay}ms`);
          }
          
          this.emit('jobRetry', item.id, attempt, error);
          
          setTimeout(() => {
            executeWithRetry(attempt + 1);
          }, delay);
        } else {
          this.stats.failed++;
          this.emit('jobFailed', item.id, error);
          reject(error);
        }
      }
    };

    await executeWithRetry();
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      processing: this.processing.size,
      waiting: this.queue.length,
      capacity: this.maxQueueSize,
      usage: this.queue.length / this.maxQueueSize
    };
  }

  /**
   * Clear the queue (useful for shutdown)
   */
  clear() {
    // Reject all pending jobs
    this.queue.forEach(item => {
      item.reject(new Error('Queue cleared'));
    });
    
    this.queue = [];
    this.stats.queued = 0;
    this.emit('queueCleared');
  }

  /**
   * Wait for all jobs to complete
   */
  async drain() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.queue.length === 0 && this.processing.size === 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
}

module.exports = MediaQueue;