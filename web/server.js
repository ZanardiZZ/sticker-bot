const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ENABLE_INTERNAL_ANALYTICS = process.env.ENABLE_INTERNAL_ANALYTICS === '1';
try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
  console.log('[ENV] .env carregado');
} catch (e) {
  console.warn('[ENV] dotenv não carregado:', e.message);
}
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const UMAMI_ORIGIN = process.env.UMAMI_ORIGIN || 'https://analytics.zanardizz.uk';
const ALLOW_CF_INSIGHTS = process.env.ALLOW_CF_INSIGHTS === '1';
process.on('unhandledRejection', (err) => {
  console.error('[FATAL] UnhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] UncaughtException:', err);
});

console.time('[BOOT] total');

const app = express();
app.set('trust proxy', true);

const { db } = require('../database.js');

function initAnalyticsTables(db) {
  db.run(`CREATE TABLE IF NOT EXISTS request_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    ip TEXT,
    path TEXT,
    method TEXT,
    status INTEGER,
    duration_ms INTEGER,
    referrer TEXT,
    user_agent TEXT,
    user_id INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS ip_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    created_by TEXT
  )`);
}

function initUsersTable(db) {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    must_change_password INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now')*1000),
    password_updated_at INTEGER
  )`);
}
function ensureUsersSchema(db) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(users)`, [], (err, rows) => {
      if (err) { console.warn('[INIT] users schema check error:', err.message); return resolve(); }
      const names = new Set((rows || []).map(r => r.name));
      const stmts = [];
      if (rows.length === 0) {
        // tabela não existe
        initUsersBaseTable(db);
        return resolve();
      }
      if (!names.has('role')) stmts.push(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`);
      if (!names.has('must_change_password')) stmts.push(`ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0`);
      if (!names.has('created_at')) stmts.push(`ALTER TABLE users ADD COLUMN created_at INTEGER DEFAULT (strftime('%s','now')*1000)`);
      if (!names.has('password_updated_at')) stmts.push(`ALTER TABLE users ADD COLUMN password_updated_at INTEGER`);
      if (!stmts.length) return resolve();
      db.serialize(() => {
        stmts.forEach(sql => db.run(sql));
        resolve();
      });
    });
  });
}
// Garante um admin inicial (primeira execução)
async function ensureInitialAdmin() {
  await ensureUsersSchema(db);
  return new Promise((resolve) => {
    db.get(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`, [], async (err, row) => {
      if (err) { console.error('[INIT] users count error:', err); return resolve(); }
      if (row && row.c > 0) {
        console.log('[INIT] Admin já existente, pulando criação inicial.');
        return resolve();
      }
      const username = process.env.ADMIN_INITIAL_USERNAME || 'admin';
      const initialPass = process.env.ADMIN_INITIAL_PASSWORD || Math.random().toString(36).slice(-12);
      const hash = await bcrypt.hash(initialPass, 12);
      db.run(
        `INSERT INTO users (username, password_hash, role, must_change_password, password_updated_at)
         VALUES (?, ?, 'admin', 1, NULL)
         ON CONFLICT(username) DO UPDATE SET role='admin', must_change_password=1`,
        [username, hash],
        (e2) => {
          if (e2) {
            console.error('[INIT] erro ao criar admin inicial:', e2.message);
          } else {
            console.log('======================================================');
            console.log('[INIT] Admin inicial criado/garantido:');
            console.log('        username:', username);
            if (process.env.ADMIN_INITIAL_PASSWORD) {
              console.log('        senha: definida via ADMIN_INITIAL_PASSWORD (não exibida).');
            } else {
              console.log('        senha gerada:', initialPass);
            }
            console.log('        Será solicitado trocar a senha no painel /admin.');
            console.log('======================================================');
          }
          resolve();
        }
      );
    });
  });
}
if (ENABLE_INTERNAL_ANALYTICS){
  initAnalyticsTables(db);
}
initUsersTable(db);
ensureInitialAdmin().catch(err => console.error('[INIT] migration error:', err));
console.time('[BOOT] requires');
const {
  listMedia,
  getMediaById,
  getRandomMedia,
  listTags,
  addTagsToMedia,
  removeTagFromMedia,
  rankTags,
  rankUsers,
  updateMediaMeta,
  setMediaTagsExact
} = require('./dataAccess.js');
const { bus } = require('./eventBus.js');
const { authMiddleware, registerAuthRoutes, requireLogin, requireAdmin } = require('./auth.js');
console.timeEnd('[BOOT] requires');

const PORT = process.env.PORT || 3000;

const ROOT_DIR = path.resolve(__dirname, '..');
const STICKERS_DIR = process.env.STICKERS_DIR || path.join(ROOT_DIR, 'media');
console.log('[WEB] STICKERS_DIR:', STICKERS_DIR, 'exists:', fs.existsSync(STICKERS_DIR));
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.resolve(__dirname, 'public');
console.log('[WEB] PUBLIC_DIR:', PUBLIC_DIR, 'exists:', fs.existsSync(PUBLIC_DIR));
app.use(cors());
app.use(express.json({ limit: '2mb' }));

console.time('[BOOT] auth');
authMiddleware(app);
registerAuthRoutes(app);
console.timeEnd('[BOOT] auth');

console.time('[BOOT] static');
app.use(express.static(PUBLIC_DIR, {
  etag: false,
  lastModified: false,
  maxAge: 0,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}));
console.timeEnd('[BOOT] static');

// Compat antigo
app.use('/figurinhas', express.static('/mnt/nas/Media/Figurinhas'));

//Compatibilidade com CSP
app.use((req, res, next) => {
  const scriptSrc = ["'self'", UMAMI_ORIGIN];
  const connectSrc = ["'self'", UMAMI_ORIGIN];

  if (ALLOW_CF_INSIGHTS) {
    scriptSrc.push('https://static.cloudflareinsights.com');
    // o beacon do CF usa cloudflareinsights.com (sem "static.")
    connectSrc.push('https://cloudflareinsights.com', 'https://*.cloudflareinsights.com');
  }

  // Estilos inline já usados na UI
  const csp = [
    `default-src 'self'`,
    `img-src 'self' data:`,
    `style-src 'self' 'unsafe-inline'`,
    `script-src ${scriptSrc.join(' ')}`,
    `connect-src ${connectSrc.join(' ')}`
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  next();
});


// Diretório de mídia novo (alias /stickers e /media)
const staticOpts = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.webp')) res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public,max-age=3600');
  }
};
app.use('/stickers', express.static(STICKERS_DIR, staticOpts));
app.use('/media', express.static(STICKERS_DIR, staticOpts));

// Helpers
function now() { return Date.now(); }
function clientIp(req) {
  return (req.ip || '').replace(/^::ffff:/, '');
}
function isRuleActive(rule) {
  return !rule.expires_at || rule.expires_at > Date.now();
}

// Middleware de blocklist/allowlist
async function ipRulesMiddleware(req, res, next) {
  try {
    const ip = clientIp(req);
    db.all(`SELECT * FROM ip_rules WHERE ip = ?`, [ip], (err, rules) => {
      if (err) return next(err);
      const active = (rules || []).filter(isRuleActive);
      const hasAllow = active.some(r => r.action === 'allow');
      const hasDeny = active.some(r => r.action === 'deny');
      if (hasAllow) return next();
      if (hasDeny) return res.status(403).send('Forbidden');
      return next();
    });
  } catch (e) {
    next(e);
  }
}
if (ENABLE_INTERNAL_ANALYTICS) {
  app.use(ipRulesMiddleware);
}

// Rate limit
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => clientIp(req),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/admin') || req.path.startsWith('/admin')
});
app.use(limiter);

// Logger de requisições
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const ip = clientIp(req);
  const ua = req.headers['user-agent'] || '';
  const ref = req.headers['referer'] || req.headers['referrer'] || '';
  const userId = req.user?.id || null;

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    const row = {
      ts: now(),
      ip,
      path: req.path,
      method: req.method,
      status: res.statusCode,
      duration_ms: Math.round(durationMs),
      referrer: ref?.slice(0, 500) || null,
      user_agent: ua?.slice(0, 500) || null,
      user_id: userId
    };
    if (req.path.startsWith('/media') || req.path.startsWith('/figurinhas')) return;
    db.run(
      `INSERT INTO request_log (ts, ip, path, method, status, duration_ms, referrer, user_agent, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.ts, row.ip, row.path, row.method, row.status, row.duration_ms, row.referrer, row.user_agent, row.user_id]
    );
  });
  next();
}
if (ENABLE_INTERNAL_ANALYTICS) {app.use(requestLogger);}

// ========= Endpoints de Conta (troca de senha) =========
app.get('/api/account', requireLogin, (req, res) => {
  db.get(`SELECT id, username, role, COALESCE(must_change_password,0) AS must_change_password, password_updated_at
          FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'db_error' });
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json(row);
  });
});

app.post('/api/account/change-password', requireLogin, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'weak_password', msg: 'A senha deve ter pelo menos 8 caracteres.' });
  }
  db.get(`SELECT password_hash FROM users WHERE id = ?`, [req.user.id], async (err, row) => {
    if (err) return res.status(500).json({ error: 'db_error' });
    if (!row) return res.status(404).json({ error: 'not_found' });
    const ok = await bcrypt.compare(current_password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_password' });
    const hash = await bcrypt.hash(new_password, 12);
    db.run(`UPDATE users SET password_hash = ?, must_change_password = 0, password_updated_at = ? WHERE id = ?`,
      [hash, Date.now(), req.user.id],
      function (e2) {
        if (e2) return res.status(500).json({ error: 'db_error' });
        res.json({ ok: true });
      });
  });
});


// Sirva a UI do dashboard
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.use('/admin-assets', express.static(path.join(__dirname, 'public')));

// APIs do dashboard
if (ENABLE_INTERNAL_ANALYTICS) {
app.get('/api/admin/metrics/summary', requireAdmin, (req, res) => {
  const to = Number(req.query.to || Date.now());
  const from = Number(req.query.from || (to - 24 * 60 * 60 * 1000));
  const queries = {
    totals: `SELECT COUNT(*) as total, COUNT(DISTINCT ip) as unique_ips FROM request_log WHERE ts BETWEEN ? AND ?`,
    statusDist: `SELECT status, COUNT(*) as c FROM request_log WHERE ts BETWEEN ? AND ? GROUP BY status ORDER BY c DESC`,
    topPaths: `SELECT path, COUNT(*) as c FROM request_log WHERE ts BETWEEN ? AND ? GROUP BY path ORDER BY c DESC LIMIT 10`,
    topRef: `SELECT COALESCE(referrer,'') as referrer, COUNT(*) as c FROM request_log WHERE ts BETWEEN ? AND ? GROUP BY referrer ORDER BY c DESC LIMIT 10`,
    recent: `SELECT ts, ip, path, method, status, duration_ms FROM request_log WHERE ts BETWEEN ? AND ? ORDER BY ts DESC LIMIT 50`
  };

  const result = {};
  db.get(queries.totals, [from, to], (e1, r1) => {
    if (e1) return res.status(500).json({ error: 'db', details: e1.message });
    result.totals = r1 || { total: 0, unique_ips: 0 };
    db.all(queries.statusDist, [from, to], (e2, r2) => {
      if (e2) return res.status(500).json({ error: 'db', details: e2.message });
      result.status = r2 || [];
      db.all(queries.topPaths, [from, to], (e3, r3) => {
        if (e3) return res.status(500).json({ error: 'db', details: e3.message });
        result.top_paths = r3 || [];
        db.all(queries.topRef, [from, to], (e4, r4) => {
          if (e4) return res.status(500).json({ error: 'db', details: e4.message });
          result.top_referrers = r4 || [];
          db.all(queries.recent, [from, to], (e5, r5) => {
            if (e5) return res.status(500).json({ error: 'db', details: e5.message });
            result.recent = r5 || [];
            res.json(result);
          });
        });
      });
    });
  });
});
}
app.get('/api/admin/ip-rules', requireAdmin, (req, res) => {
  db.all(`SELECT * FROM ip_rules ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'db', details: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/ip-rules', express.json(), requireAdmin, (req, res) => {
  const { ip, action, reason, ttl_minutes } = req.body || {};
  if (!ip || !['deny','allow'].includes(action)) return res.status(400).json({ error: 'invalid_params' });
  const created_at = Date.now();
  const expires_at = ttl_minutes ? (created_at + Number(ttl_minutes) * 60 * 1000) : null;
  const created_by = req.user?.username || 'admin';
  db.run(`INSERT INTO ip_rules (ip, action, reason, expires_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    [ip, action, reason || null, expires_at, created_at, created_by],
    function(err){ if (err) return res.status(500).json({ error: 'db', details: err.message }); res.json({ id: this.lastID }); }
  );
});

app.delete('/api/admin/ip-rules/:id', requireAdmin, (req, res) => {
  db.run(`DELETE FROM ip_rules WHERE id = ?`, [req.params.id], function(err){
    if (err) return res.status(500).json({ error: 'db', details: err.message });
    res.json({ deleted: this.changes });
  });
});

// Security headers
app.use((req, res, next) => {
  // Existing headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Additional security headers
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // HSTS only in production (assumes HTTPS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
});

// Rotas SPA
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
app.get('/ranking/tags', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'ranking-tags.html')));
app.get('/ranking/users', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'ranking-users.html')));

// Health
app.get('/healthz', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, ts: Date.now() });
});

// Bot Configuration
app.get('/api/bot-config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const whatsappNumber = process.env.BOT_WHATSAPP_NUMBER || process.env.ADMIN_NUMBER?.replace('@c.us', '') || '5511999999999';
  res.json({ whatsappNumber });
});

// ====================== APIs ======================
app.get('/api/stickers', async (req, res) => {
  try {
    const {
      q = '', page = '1', per_page = '60',
      tags = '', any_tag = '', nsfw = 'all', sort = 'newest'
    } = req.query;

    const result = await listMedia({
      q,
      page: parseInt(page, 10),
      perPage: parseInt(per_page, 10),
      tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [],
      anyTag: any_tag ? any_tag.split(',').map(s => s.trim()).filter(Boolean) : [],
      nsfw,
      sort
    });

    if (Array.isArray(result?.results)) {
      result.results = result.results.map(fixMediaUrl);
    }

    res.json(result);
  } catch (e) {
    console.error('[API] /api/stickers ERRO:', e);
    res.status(500).json({ error: 'internal_error', msg: e?.message });
  }
});

app.get('/api/stickers/:id', async (req, res) => {
  try {
    const row = await getMediaById(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'not_found' });
    fixMediaUrl(row);
    res.json(row);
  } catch (e) {
    console.error('[API] /api/stickers/:id ERRO:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/random', async (req, res) => {
  try {
    const { q = '', tag = null, nsfw = 'all' } = req.query;
    const row = await getRandomMedia({ q, tag, nsfw });
    if (!row) return res.status(404).json({ error: 'no_results' });
    fixMediaUrl(row);
    res.json(row);
  } catch (e) {
    console.error('[API] /api/random ERRO:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/tags', async (req, res) => {
  try {
    const { q = '', order = 'usage' } = req.query;
    const tags = await listTags({ q, order });
    res.json({ total: tags.length, results: tags });
  } catch (e) {
    console.error('[API] /api/tags ERRO:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/stickers/:id/tags', requireLogin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags_array_required' });
    const added = await addTagsToMedia(id, tags);
    res.json({ added });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

app.delete('/api/stickers/:id/tags/:tag', requireLogin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const tag = req.params.tag;
    const ok = await removeTagFromMedia(id, tag);
    if (!ok) return res.status(404).json({ error: 'tag_or_media_not_found' });
    res.json({ removed: tag });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

app.put('/api/stickers/:id/tags', requireLogin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { tags } = req.body || {};
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags_array_required' });
    const result = await setMediaTagsExact(id, tags);
    const media = await getMediaById(id);
    bus.emit('media:tagsUpdated', { media_id: id, set: media.tags });
    res.json({ ok: true, ...result, media });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

app.patch('/api/stickers/:id', requireLogin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { description, nsfw } = req.body || {};
    const nsfwVal = (nsfw === 0 || nsfw === 1) ? nsfw : undefined;
    const r = await updateMediaMeta(id, { description, nsfw: nsfwVal });
    if (!r.updated) return res.status(400).json({ error: 'nothing_to_update' });
    const updated = await getMediaById(id);
    bus.emit('media:updated', { id, fields: ['description','nsfw'] });
    res.json({ ok: true, media: updated });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// Ranking de tags
app.get('/api/rank/tags', (req, res) => {
  const metric = (req.query.metric || 'media').toLowerCase(); // 'media' ou 'usage'
  const nsfw = (req.query.nsfw || 'all').toLowerCase();       // 'all' | 'safe' | 'nsfw'
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || '50', 10), 500));

  let sql = '';
  const params = [];

  if (metric === 'usage') {
    sql = `SELECT t.name, t.usage_count AS count
           FROM tags t
           ORDER BY count DESC, t.name ASC
           LIMIT ?`;
    params.push(limit);
  } else {
    if (nsfw === 'safe') {
      sql = `SELECT t.name, COUNT(mt.media_id) AS count
             FROM tags t
             JOIN media_tags mt ON t.id = mt.tag_id
             JOIN media m ON m.id = mt.media_id
             WHERE m.nsfw = 0
             GROUP BY t.id
             ORDER BY count DESC, t.name ASC
             LIMIT ?`;
      params.push(limit);
    } else if (nsfw === 'nsfw') {
      sql = `SELECT t.name, COUNT(mt.media_id) AS count
             FROM tags t
             JOIN media_tags mt ON t.id = mt.tag_id
             JOIN media m ON m.id = mt.media_id
             WHERE m.nsfw = 1
             GROUP BY t.id
             ORDER BY count DESC, t.name ASC
             LIMIT ?`;
      params.push(limit);
    } else {
      sql = `SELECT t.name, COUNT(mt.media_id) AS count
             FROM tags t
             JOIN media_tags mt ON t.id = mt.tag_id
             GROUP BY t.id
             ORDER BY count DESC, t.name ASC
             LIMIT ?`;
      params.push(limit);
    }
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('[rank/tags] db error:', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    }
    res.json(rows || []);
  });
});

app.get('/api/rank/users', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '50', 10), 500));
    const nsfw = String(req.query.nsfw || 'all').toLowerCase();
    const groupId = (req.query.group_id || '').trim() || null;

    const where = [];
    const params = [];
    if (groupId) { where.push('m.group_id = ?'); params.push(groupId); }
    if (nsfw === 'safe') where.push('m.nsfw = 0');
    else if (nsfw === 'nsfw') where.push('m.nsfw = 1');
    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';

    const sql = `
      SELECT
        COALESCE(m.sender_id, m.chat_id, m.group_id) AS sender_id,
        m.group_id,
        COALESCE(NULLIF(TRIM(c.display_name), ''), '') AS display_name,
        COUNT(*) AS sticker_count,
        -- Identifica se é grupo
        CASE WHEN m.group_id IS NOT NULL AND m.sender_id IS NULL THEN 1 ELSE 0 END as is_group
      FROM media m
      LEFT JOIN contacts c
        ON replace(replace(lower(trim(c.sender_id)), '@s.whatsapp.net',''),'@c.us','')
         = replace(replace(lower(trim(COALESCE(m.sender_id, m.chat_id, m.group_id))), '@s.whatsapp.net',''),'@c.us','')
      ${whereSql}
      GROUP BY COALESCE(m.sender_id, m.chat_id, m.group_id)
      HAVING COALESCE(m.sender_id, m.chat_id, m.group_id) IS NOT NULL 
        AND COALESCE(m.sender_id, m.chat_id, m.group_id) <> ''
        -- Exclui envios do bot das contagens de ranking
        AND NOT (
          COALESCE(m.sender_id, m.chat_id) LIKE '%bot%' OR
          (m.sender_id = m.chat_id AND m.group_id IS NULL)
        )
      ORDER BY sticker_count DESC
      LIMIT ?
    `;
    params.push(limit);

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('[rank/users] db error:', err);
        return res.status(500).json({ error: 'db_error', message: err.message });
      }
      const normalized = (rows || []).map(r => {
        let displayName = r.display_name || null;
        
        // Se é um grupo e não tem display_name, gera um nome de grupo
        if (r.is_group && !displayName && r.group_id) {
          displayName = `Grupo ${r.group_id.replace('@g.us', '').substring(0, 10)}...`;
        }
        
        return {
          sender_id: r.sender_id,
          chat_id: r.sender_id,
          display_name: displayName,
          count: r.sticker_count,
          sticker_count: r.sticker_count,
          is_group: r.is_group || 0
        };
      });
      res.json(normalized);
    });
  } catch (err) {
    console.error('[rank/users] db error:', err);
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-cache',
    Connection:'keep-alive',
    'Access-Control-Allow-Origin':'*'
  });
  const send = (event, payload) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const onNew = d => send('media:new', d);
  const onTags = d => send('media:tags', d);
  const onUpd = d => send('media:updated', d);

  bus.on('media:new', onNew);
  bus.on('media:tagsUpdated', onTags);
  bus.on('media:updated', onUpd);

  res.write(`data: ${JSON.stringify({ hello: true })}\n\n`);

  req.on('close', () => {
    bus.off('media:new', onNew);
    bus.off('media:tagsUpdated', onTags);
    bus.off('media:updated', onUpd);
  });
});

function fixMediaUrl(row) {
  try {
    if (row?.url?.startsWith('/figurinhas/')) return row;

    const candidates = [];

    if (row?.file_path) candidates.push(row.file_path);
    if (row?.file_name) candidates.push(row.file_name);
    if (row?.filename) candidates.push(row.filename);
    if (row?.file) candidates.push(row.file);
    if (row?.path) candidates.push(row.path);
    if (row?.local_path) candidates.push(row.local_path);

    if (row?.url?.startsWith('/media/')) candidates.push(row.url.replace(/^\/media\//, ''));

    for (const c of candidates) {
      if (!c) continue;
      let base = require('path').basename(c);
      if (!base.includes('.') && row?.mimetype) {
        if (row.mimetype === 'image/webp') base += '.webp';
        else if (row.mimetype === 'video/mp4') base += '.mp4';
      }
      const abs = require('path').join(STICKERS_DIR, base);
      if (fs.existsSync(abs)) {
        row.url = '/media/' + base;
        return row;
      }
    }

    if (row?.url?.startsWith('/media/')) {
      const base = require('path').basename(row.url);
      const abs = require('path').join(STICKERS_DIR, base);
      if (!fs.existsSync(abs)) {
        console.warn('[MEDIA] Arquivo não encontrado no disco para URL:', row.url, 'id:', row?.id, 'file_path:', row?.file_path);
      }
    }
  } catch (e) {
    console.error('[MEDIA] Erro ao fixar URL:', e, 'row.id:', row?.id);
  }
  return row;
}

app.use((err, _req, res, _next) => {
  console.error('[ERROR] Middleware:', err);
  res.status(500).json({ error: 'internal_error' });
});

console.time('[BOOT] listen');
const server = app.listen(PORT, '0.0.0.0', () => {
  console.timeEnd('[BOOT] listen');
  console.timeEnd('[BOOT] total');
  console.log('Webserver de stickers ouvindo em http://localhost:' + PORT);
});
server.on('error', (err) => {
  console.error('[FATAL] Listen error:', err);
  process.exit(1);
});