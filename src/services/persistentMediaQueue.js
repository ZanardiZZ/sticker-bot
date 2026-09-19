const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { EventEmitter } = require('events');

class PersistentMediaQueue extends EventEmitter {
  constructor(options = {}) {
    super(); this.concurrency = 1; this.retryAttempts = options.retryAttempts ?? 2; this.retryDelay = options.retryDelay ?? 5000;
    this.maxWaiting = Number.isInteger(options.maxWaiting) && options.maxWaiting >= 0 ? options.maxWaiting : 12;
    this.dbPath = options.dbPath || path.join(process.cwd(), 'storage', 'data', 'media-processing-queue.sqlite');
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true }); this.db = new sqlite3.Database(this.dbPath); this.running = false; this.executor = null; this.waiters = new Map(); this.stats = { processed: 0, failed: 0, rejected: 0 }; this.ready = this.initialize();
  }
  run(sql, params = []) { return new Promise((resolve, reject) => this.db.run(sql, params, function(err) { if (err) return reject(err); resolve({ lastID: this.lastID, changes: this.changes }); })); }
  get(sql, params = []) { return new Promise((resolve, reject) => this.db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))); }
  async initialize() { await this.run('PRAGMA journal_mode=WAL'); await this.run(`CREATE TABLE IF NOT EXISTS media_processing_jobs (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('waiting','processing','completed','failed')), attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL, last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER)`); await this.run('CREATE INDEX IF NOT EXISTS idx_media_processing_ready ON media_processing_jobs(status, available_at, created_at)'); await this.run("UPDATE media_processing_jobs SET status='waiting', updated_at=? WHERE status='processing'", [Date.now()]); this.emit('ready'); }
  setExecutor(executor) { if (typeof executor !== 'function') throw new TypeError('executor must be a function'); this.executor = executor; this.pump(); }
  async add(payload) {
    await this.ready;
    const active = await this.get("SELECT COUNT(*) AS count FROM media_processing_jobs WHERE status IN ('waiting','processing')");
    if (Number(active?.count || 0) >= this.maxWaiting) {
      this.stats.rejected++;
      const error = new Error(`Media queue is full (max active/waiting: ${this.maxWaiting})`);
      error.code = 'QUEUE_FULL';
      this.emit('queueFull', this.maxWaiting, Number(active?.count || 0));
      throw error;
    }
    const id = `media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const now = Date.now();
    await this.run("INSERT INTO media_processing_jobs (id,payload_json,status,attempts,available_at,created_at,updated_at) VALUES (?,?,'waiting',0,?,?,?)", [id, JSON.stringify(payload), now, now, now]);
    this.emit('jobAdded', id);
    this.pump();
    return new Promise((resolve, reject) => this.waiters.set(id, { resolve, reject }));
  }
  async pump() { if (this.running || !this.executor) return; await this.ready; const row = await this.get("SELECT * FROM media_processing_jobs WHERE status='waiting' AND available_at<=? ORDER BY created_at ASC LIMIT 1", [Date.now()]); if (!row) return; this.running = true; await this.run("UPDATE media_processing_jobs SET status='processing', attempts=attempts+1, updated_at=? WHERE id=?", [Date.now(), row.id]); const attempt = row.attempts + 1; try { const result = await this.executor(JSON.parse(row.payload_json)); await this.run("UPDATE media_processing_jobs SET status='completed', completed_at=?, updated_at=? WHERE id=?", [Date.now(), Date.now(), row.id]); this.stats.processed++; this.emit('jobCompleted', row.id, result); this.waiters.get(row.id)?.resolve(result); this.waiters.delete(row.id); } catch (error) { const message = error?.message || String(error); if (attempt < this.retryAttempts) { const delay = this.retryDelay * Math.pow(2, attempt - 1); await this.run("UPDATE media_processing_jobs SET status='waiting', available_at=?, last_error=?, updated_at=? WHERE id=?", [Date.now()+delay, message, Date.now(), row.id]); this.emit('jobRetry', row.id, attempt, error); setTimeout(() => this.pump(), delay); } else { await this.run("UPDATE media_processing_jobs SET status='failed', last_error=?, updated_at=? WHERE id=?", [message, Date.now(), row.id]); this.stats.failed++; this.emit('jobFailed', row.id, error); this.waiters.get(row.id)?.reject(error); this.waiters.delete(row.id); } } finally { this.running = false; setImmediate(() => this.pump()); } }
  async getStats() { await this.ready; const row = await this.get("SELECT SUM(status='waiting') AS waiting, SUM(status='processing') AS processing, SUM(status='failed') AS failed FROM media_processing_jobs"); return { ...this.stats, waiting: Number(row?.waiting || 0), processing: Number(row?.processing || 0), failed: Number(row?.failed || 0), capacity: 'durable' }; }
}
module.exports = PersistentMediaQueue;
