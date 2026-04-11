const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.MEMORY_BRIDGE_DB_PATH || path.resolve(process.cwd(), 'storage', 'data', 'memory-bridge.db');

function nowIso() {
  return new Date().toISOString();
}

class MemoryStore {
  constructor() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new sqlite3.Database(DB_PATH);
    this.ready = false;
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  async init() {
    if (this.ready) return;

    await this.run('PRAGMA journal_mode = WAL');
    await this.run('PRAGMA synchronous = NORMAL');

    await this.run(`
      CREATE TABLE IF NOT EXISTS memory_users (
        user_id TEXT PRIMARY KEY,
        name TEXT,
        metadata_json TEXT,
        first_seen TEXT,
        updated_at TEXT
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS memory_groups (
        group_id TEXT PRIMARY KEY,
        name TEXT,
        metadata_json TEXT,
        first_seen TEXT,
        updated_at TEXT
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS memory_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        fact TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        confidence REAL NOT NULL DEFAULT 0.7,
        source TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, fact, category)
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS memory_running_jokes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT NOT NULL,
        name TEXT NOT NULL,
        origin TEXT,
        context TEXT,
        created_at TEXT NOT NULL
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS memory_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        group_id TEXT,
        user_id TEXT,
        description TEXT,
        content TEXT,
        topic TEXT,
        participants_json TEXT,
        importance TEXT,
        confidence REAL,
        timestamp TEXT,
        created_at TEXT NOT NULL
      )
    `);

    await this.run('CREATE INDEX IF NOT EXISTS idx_memory_facts_user_id ON memory_facts(user_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_memory_events_group_id ON memory_events(group_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_memory_events_type ON memory_events(type)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_memory_events_ts ON memory_events(timestamp DESC)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_memory_jokes_group_id ON memory_running_jokes(group_id)');

    this.ready = true;
  }

  async getUser(userId) {
    return this.get('SELECT * FROM memory_users WHERE user_id = ? LIMIT 1', [userId]);
  }

  async saveUser(userId, payload = {}) {
    const stamp = nowIso();
    const existing = await this.getUser(userId);
    const name = payload.name || existing?.name || null;
    const firstSeen = payload.firstSeen || existing?.first_seen || stamp;
    const metadata = JSON.stringify(payload || {});

    await this.run(
      `INSERT INTO memory_users (user_id, name, metadata_json, first_seen, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         name = excluded.name,
         metadata_json = excluded.metadata_json,
         updated_at = excluded.updated_at`,
      [userId, name, metadata, firstSeen, stamp]
    );

    return this.getUser(userId);
  }

  async addFact(userId, fact, category = 'general', confidence = 0.7, source = 'memory_bridge') {
    const stamp = nowIso();
    await this.run(
      `INSERT INTO memory_facts (user_id, fact, category, confidence, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, fact, category) DO UPDATE SET
         confidence = MAX(confidence, excluded.confidence),
         source = COALESCE(excluded.source, source)`,
      [userId, fact, category, confidence, source, stamp]
    );

    return { ok: true };
  }

  async getFacts(userId, { category = null, limit = 20 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    if (category) {
      return this.all(
        `SELECT fact, category, confidence, source, created_at
         FROM memory_facts
         WHERE user_id = ? AND category = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [userId, category, safeLimit]
      );
    }

    return this.all(
      `SELECT fact, category, confidence, source, created_at
       FROM memory_facts
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, safeLimit]
    );
  }

  async getGroup(groupId) {
    return this.get('SELECT * FROM memory_groups WHERE group_id = ? LIMIT 1', [groupId]);
  }

  async saveGroup(groupId, payload = {}) {
    const stamp = nowIso();
    const existing = await this.getGroup(groupId);
    const name = payload.name || existing?.name || null;
    const firstSeen = payload.firstSeen || existing?.first_seen || stamp;
    const metadata = JSON.stringify(payload || {});

    await this.run(
      `INSERT INTO memory_groups (group_id, name, metadata_json, first_seen, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(group_id) DO UPDATE SET
         name = excluded.name,
         metadata_json = excluded.metadata_json,
         updated_at = excluded.updated_at`,
      [groupId, name, metadata, firstSeen, stamp]
    );

    return this.getGroup(groupId);
  }

  async addRunningJoke(groupId, name, origin, context) {
    const stamp = nowIso();
    await this.run(
      `INSERT INTO memory_running_jokes (group_id, name, origin, context, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [groupId, name, origin || null, context || null, stamp]
    );
    return { ok: true };
  }

  async getRunningJokes(groupId, limit = 15) {
    const safeLimit = Math.min(Math.max(Number(limit) || 15, 1), 100);
    return this.all(
      `SELECT name, origin, context, created_at
       FROM memory_running_jokes
       WHERE group_id = ?
       ORDER BY id DESC
       LIMIT ?`,
      [groupId, safeLimit]
    );
  }

  async logEvent(event = {}) {
    const stamp = nowIso();
    await this.run(
      `INSERT INTO memory_events (
         type, group_id, user_id, description, content, topic, participants_json,
         importance, confidence, timestamp, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.type || 'message',
        event.groupId || null,
        event.userId || null,
        event.description || null,
        event.content || null,
        event.topic || null,
        JSON.stringify(Array.isArray(event.participants) ? event.participants : []),
        event.importance || null,
        Number.isFinite(Number(event.confidence)) ? Number(event.confidence) : null,
        event.timestamp || stamp,
        stamp
      ]
    );
    return { ok: true };
  }

  async getEvents({ groupId = null, type = null, limit = 20 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);

    if (groupId && type) {
      return this.all(
        `SELECT * FROM memory_events
         WHERE group_id = ? AND type = ?
         ORDER BY timestamp DESC, id DESC
         LIMIT ?`,
        [groupId, type, safeLimit]
      );
    }

    if (groupId) {
      return this.all(
        `SELECT * FROM memory_events
         WHERE group_id = ?
         ORDER BY timestamp DESC, id DESC
         LIMIT ?`,
        [groupId, safeLimit]
      );
    }

    if (type) {
      return this.all(
        `SELECT * FROM memory_events
         WHERE type = ?
         ORDER BY timestamp DESC, id DESC
         LIMIT ?`,
        [type, safeLimit]
      );
    }

    return this.all(
      `SELECT * FROM memory_events
       ORDER BY timestamp DESC, id DESC
       LIMIT ?`,
      [safeLimit]
    );
  }
}

module.exports = {
  MemoryStore,
  DB_PATH
};
