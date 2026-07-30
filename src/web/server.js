// ... route definitions moved later so `app` is initialized first
const express = require('express');
const compression = require('compression');
const { authMiddleware, registerAuthRoutes, requireLogin, requireAdmin } = require('./auth.js');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ENABLE_INTERNAL_ANALYTICS = process.env.ENABLE_INTERNAL_ANALYTICS === '1';
const { ROOT_DIR, MEDIA_DIR, BOT_MEDIA_DIR, OLD_STICKERS_DIR } = require('../paths');

// Initialize log collector before any console logs
const { getLogCollector } = require('../utils/logCollector');
const logCollector = getLogCollector(2000); // Buffer de 2000 logs

try {
  require('dotenv').config({ path: path.resolve(ROOT_DIR, '.env') });
  console.log('[ENV] .env carregado');
} catch (e) {
  console.warn('[ENV] dotenv não carregado:', e.message);
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_SECRET = process.env.JWT_SECRET || SESSION_SECRET;
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const csurf = require('csurf');
const rateLimit = require('express-rate-limit');

// Import modularized middlewares and routes
const {
  createCSPMiddleware,
  createMainRateLimiter,
  createLoginRateLimiter,
  createRegistrationRateLimiter,
  createRequestLogger,
  createIPRulesMiddleware,
  shouldSkipCSRF,
  getCSRFToken
} = require('./middlewares');
const { registerRoutes } = require('./routes');
const {
  getGroupPermissionSummary,
  evaluateGroupCommandPermission,
  invalidateGroupPermissionCache,
  invalidateGroupUserCache
} = require('../services/permissionEvaluator');
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

// Basic middleware setup - MUST be before any routes
app.use(cors());
app.use(compression({
  level: 6, // Balance between compression ratio and CPU usage
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req, res) => {
    // Don't compress if client doesn't accept it
    if (req.headers['x-no-compression']) return false;
    // Use compression filter defaults (compresses text, json, etc.)
    return compression.filter(req, res);
  }
}));
app.use(cookieParser());

// Session middleware must run before CSRF protection
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  // Não criar sessão/cookie para visitantes anônimos que apenas leem o catálogo.
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 15 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Body parsers must run before CSRF so tokens in the body are available
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// CSRF protection is wired directly through `csurf` so CodeQL recognizes token validation.
const csrfProtection = csurf({
  cookie: false,
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
});
app.use((req, res, next) => {
  if (shouldSkipCSRF(req)) {
    return next();
  }
  // Métodos seguros de leitura não precisam inicializar sessão CSRF.
  // O endpoint de token é a exceção explícita usada por operações mutáveis.
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase());
  if (safeMethod && req.path !== '/api/csrf-token') {
    return next();
  }
  return csrfProtection(req, res, next);
});

// Global rate limiter to protect expensive authorization logic against abuse
// Adjust values depending on expected traffic patterns
const globalLimiter = createMainRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1500, // Limit each IP to 1500 requests per windowMs (broader protection layer)
  skipPaths: []
});
app.use(globalLimiter);

// Auth middleware - MUST be after cookieParser but before routes
app.use(async (req, res, next) => {
  try {
    const jwt = require('jsonwebtoken');
    const getCookieName = () => process.env.NODE_ENV === 'production' ? '__Host-sid' : 'sid';
    
    const cookieName = getCookieName();
    const raw = req.cookies[cookieName] || (process.env.NODE_ENV === 'production' ? req.cookies.sid : undefined);

    if (raw) {
      const parts = String(raw).split('.');
      if (parts.length === 3) {
        try {
          const payload = jwt.verify(raw, JWT_SECRET);
          
          // Get user from database
          await new Promise((resolve) => {
            db.get(`SELECT id, username, role, COALESCE(token_version,0) AS token_version FROM users WHERE id = ?`, [payload.uid], (err, row) => {
              if (!err && row && row.token_version === (payload.tv || 0)) {
                req.user = { id: row.id, username: row.username, role: row.role };
              }
              resolve();
            });
          });
        } catch (e) {
          // Invalid/expired token - don't authenticate
        }
      }
    }

    // Handle debug mode
    if (!req.user && process.env.ADMIN_AUTOLOGIN_DEBUG === '1') {
      const debugUser = req.cookies?.DEBUG_USER || 
        (req.headers.cookie && req.headers.cookie.match(/DEBUG_USER=([^;]+)/)?.[1]);
      
      if (debugUser) {
        req.user = { id: null, username: String(debugUser), role: 'admin' };
      }
    }
    
    next();
  } catch (error) {
    console.error('[AUTH] Middleware error:', error);
    next(error);
  }
});

const { ensurePrivacySchema, runPrivacyRetention } = require('../services/privacyRetention');
const { db, findDuplicateMedia, getDuplicateMediaDetails, deleteDuplicateMedia, deleteMediaByIds, getDuplicateStats } = require('../database/index.js');

function recordAdminAudit(req, action, entity, entityId = null, details = {}) {
  if (!req?.user || !db) return;
  const safeDetails = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (['password', 'token', 'secret', 'cookie', 'authorization'].some(part => key.toLowerCase().includes(part))) continue;
    safeDetails[key] = typeof value === 'string' ? value.slice(0, 300) : value;
  }
  db.run(`INSERT INTO admin_audit_log (created_at, admin_id, admin_username, action, entity, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [Date.now(), req.user.id || null, String(req.user.username || '').slice(0, 160), action, entity, entityId == null ? null : String(entityId).slice(0, 160), JSON.stringify(safeDetails)],
    (err) => { if (err) console.warn('[ADMIN_AUDIT] write failed:', err.message); });
}

// Capture only administrative mutations after the handler has decided the outcome.
app.use('/api/admin', (req, res, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(String(req.method || '').toUpperCase())) return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400 && req.user) {
      recordAdminAudit(req, String(req.method).toLowerCase(), req.path, req.params?.id || req.params?.userId || null, { status: res.statusCode });
    }
  });
  next();
});

const paymentService = require('../services/mercadoPagoPayment');
let whatsappClient = null;
let whatsappClientPromise = null;

async function resolveWhatsAppClient() {
  if (global.getCurrentWhatsAppClient) {
    try {
      return global.getCurrentWhatsAppClient();
    } catch (err) {
      console.warn('[WEB] Failed to access global WhatsApp client:', err?.message || err);
    }
  }

  if (whatsappClient && (typeof whatsappClient.listChats === 'function' || typeof whatsappClient.getAllChats === 'function')) {
    return whatsappClient;
  }

  if (whatsappClientPromise) {
    return whatsappClientPromise;
  }

  whatsappClientPromise = (async () => {
    try {
      const { createAdapter } = require('../waAdapter');
      const client = await createAdapter();
      whatsappClient = client;
      return client;
    } catch (err) {
      console.warn('[WEB] Unable to initialize WhatsApp adapter for group listing:', err?.message || err);
      whatsappClient = null;
      return null;
    } finally {
      whatsappClientPromise = null;
    }
  })();

  return whatsappClientPromise;
}

// Function to check if string contains WhatsApp group ID pattern
function isGroupId(str) {
  return str && typeof str === 'string' && str.includes('@g.us');
}

function looksLikePersonName(raw) {
  if (!raw) return false;
  const clean = raw.trim();
  if (/grupo|figurinhas|stickers|turma|clube/i.test(clean)) return false;
  const words = clean.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  const capitalizedWords = words.filter((w) => /^[A-ZÀ-Ý][a-zà-ÿ.'-]{1,}$/.test(w));
  return capitalizedWords.length === words.length;
}

// Function to validate and clean group display names
function cleanGroupDisplayName(name, groupId) {
  if (!name || name.trim() === '') {
    return null;
  }
  
  const cleanName = name.trim();
  const normalized = cleanName.toLowerCase();
  const normalizedGroup = String(groupId || '').trim().toLowerCase();
  const normalizedGroupBase = normalizedGroup.replace('@g.us', '');
  const normalizedNameBase = normalized.replace('@g.us', '');

  // Never trust a value that is literally the group JID (or its numeric base)
  if (normalized === normalizedGroup || normalizedNameBase === normalizedGroupBase) {
    return null;
  }

  // Drop anything that still looks like a JID
  if (normalized.endsWith('@g.us')) {
    return null;
  }

  if (looksLikePersonName(cleanName)) {
    return null;
  }

  return cleanName;
}

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
  )`);  db.run(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    admin_id INTEGER,
    admin_username TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    details_json TEXT
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_log(created_at DESC)`);
}

function initAdminAuditTable(db) {
  db.run(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    admin_id INTEGER,
    admin_username TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    details_json TEXT
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_log(created_at DESC)`);
}

function initDmUsersTable(db) {
  db.run(`CREATE TABLE IF NOT EXISTS dm_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    allowed INTEGER DEFAULT 0,
    blocked INTEGER DEFAULT 0,
    note TEXT,
    last_activity INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
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
        initUsersTable(db);
        return resolve();
      }
      if (!names.has('role')) stmts.push(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`);
      if (!names.has('must_change_password')) stmts.push(`ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0`);
      if (!names.has('created_at')) stmts.push(`ALTER TABLE users ADD COLUMN created_at INTEGER DEFAULT (strftime('%s','now')*1000)`);
      if (!names.has('password_updated_at')) stmts.push(`ALTER TABLE users ADD COLUMN password_updated_at INTEGER`);
  if (!names.has('token_version')) stmts.push(`ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0`);
      // New fields for user registration and management
      if (!names.has('phone_number')) stmts.push(`ALTER TABLE users ADD COLUMN phone_number TEXT`);
      if (!names.has('status')) stmts.push(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'pending'`);
      if (!names.has('can_edit')) stmts.push(`ALTER TABLE users ADD COLUMN can_edit INTEGER DEFAULT 0`);
      if (!names.has('approved_at')) stmts.push(`ALTER TABLE users ADD COLUMN approved_at INTEGER`);
      if (!names.has('approved_by')) stmts.push(`ALTER TABLE users ADD COLUMN approved_by INTEGER`);
      // Email confirmation fields
      if (!names.has('email')) stmts.push(`ALTER TABLE users ADD COLUMN email TEXT`);
      if (!names.has('email_confirmed')) stmts.push(`ALTER TABLE users ADD COLUMN email_confirmed INTEGER DEFAULT 0`);
      if (!names.has('email_confirmation_token')) stmts.push(`ALTER TABLE users ADD COLUMN email_confirmation_token TEXT`);
      if (!names.has('email_confirmation_expires')) stmts.push(`ALTER TABLE users ADD COLUMN email_confirmation_expires INTEGER`);
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
    `INSERT INTO users (username, password_hash, role, status, must_change_password, created_at, password_updated_at, token_version)
     VALUES (?, ?, 'admin', 'approved', 1, ?, NULL, 0)
     ON CONFLICT(username) DO UPDATE SET role='admin', status='approved', must_change_password=1`,
        [username, hash, Date.now()],
        (e2) => {
          if (e2) {
            console.error('[INIT] erro ao criar admin inicial:', e2.message);
          } else {
            console.log('======================================================');
            console.log('[INIT] Admin inicial criado/garantido:');
            if (process.env.ADMIN_INITIAL_USERNAME) {
              console.log('        username: definido via ADMIN_INITIAL_USERNAME (não exibido).');
            } else {
              console.log('        username: definido (não exibido).');
            }
            if (process.env.ADMIN_INITIAL_PASSWORD) {
              console.log('        senha: definida via ADMIN_INITIAL_PASSWORD (não exibida).');
            } else {
              console.log('        senha gerada: definida (não exibida).');
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
// Auditoria administrativa é independente do analytics interno e permanece ativa.
initAdminAuditTable(db);
initUsersTable(db);
ensureInitialAdmin().catch(err => console.error('[INIT] migration error:', err));
initDmUsersTable(db);
ensurePrivacySchema(db).then(() => {
  runPrivacyRetention(db).catch((err) => console.warn('[PRIVACY] Initial retention cleanup failed:', err.message));
  const retentionTimer = setInterval(() => runPrivacyRetention(db).catch((err) => console.warn('[PRIVACY] Retention cleanup failed:', err.message)), 6 * 60 * 60 * 1000);
  retentionTimer.unref?.();
}).catch((err) => console.error('[PRIVACY] Schema initialization failed:', err));
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
  setMediaTagsExact,
  listGroups,
  upsertGroupMetadata,
  listGroupUsers,
  getGroupUser,
  upsertGroupUser,
  updateGroupUserField,
  deleteGroupUser,
  listGroupCommandPermissions,
  setGroupCommandPermission,
  deleteGroupCommandPermission,
  listDmUsers,
  getDmUser,
  upsertDmUser,
  deleteDmUser,
  getBotConfig,
  setBotConfig
} = require('./dataAccess.js');
const publicDmAccess = require('../services/publicDmStickerAccess');
const { DEFAULT_DELETE_VOTE_THRESHOLD } = require('../../config/botDefaults');
const { invalidateVoteThresholdCache } = require('../commands/handlers/delete');

// Approval system imports
const {
  createPendingEdit,
  getPendingEdits,
  getPendingEditsForMedia,
  voteOnEdit,
  getVoteCounts,
  approvePendingEdit,
  getPendingEditById,
  getUserVote,
  isOriginalSender
} = require('../database');

const { canEditDirectly, hasEnoughVotesToApprove, hasEnoughVotesToReject } = require('../utils/approvalUtils');

// Tenta obter o client WhatsApp da instância principal
// whatsappClient é resolvido sob demanda via resolveWhatsAppClient()

console.time('[BOOT] auth');
authMiddleware(app);
registerAuthRoutes(app);
console.timeEnd('[BOOT] auth');

// ====== API: Listar grupos conectados ======
app.get('/api/admin/connected-groups', requireAdmin, async (req, res) => {
  try {
    const archivedGroups = await listGroups({ includeDormant: true });
    const dbNameMap = new Map();
    const groupMap = new Map();

    // Pull raw display names straight from the DB for stronger fallback
    const rawDbNames = await new Promise((resolve) => {
      db.all(`SELECT group_id, display_name FROM groups WHERE TRIM(COALESCE(display_name, '')) != ''`, (err, rows) => {
        if (err || !rows) return resolve([]);
        resolve(rows);
      });
    });
    rawDbNames.forEach((row) => {
      if (row?.group_id && row?.display_name) {
        const cleaned = cleanGroupDisplayName(row.display_name, row.group_id);
        if (cleaned) {
          dbNameMap.set(row.group_id, cleaned);
        }
      }
    });

    archivedGroups.forEach((group) => {
      // Validate and clean the group name from database, but keep the stored name as fallback
      const rawName = (group.name || '').trim();
      const cleanedName = cleanGroupDisplayName(rawName, group.id);
      const displayName = cleanedName || group.id;
      if (cleanedName) dbNameMap.set(group.id, cleanedName);
      
      groupMap.set(group.id, {
        id: group.id,
        name: displayName,
        lastInteractionTs: group.lastInteractionTs || null,
        source: 'database'
      });
    });

    const client = await resolveWhatsAppClient();
    if (client && (typeof client.listChats === 'function' || typeof client.getAllChats === 'function')) {
      try {
        console.log('[DEBUG] Getting chats from WhatsApp client...');
        const chats = await (typeof client.listChats === 'function' ? client.listChats() : client.getAllChats());
        const whatsappGroups = chats.filter((c) => isGroupId(c?.id));
        console.log('[DEBUG] WhatsApp groups found:', whatsappGroups.length);

        if (whatsappGroups.length) {
          const upserts = [];

          whatsappGroups.forEach((chat) => {
            const id = chat.id;
            const rawName = (chat.subject || chat.name || '').trim();
            const cleanedName = cleanGroupDisplayName(rawName, id);
            const displayName = cleanedName || '';
            const existing = groupMap.get(id) || { id };
            const lastInteractionTs =
              chat?.conversationTimestamp
              || chat?.lastInteractionTs
              || chat?.lastInteraction
              || existing.lastInteractionTs
              || null;

            // Prefer any already-known name over an empty/ID-only fallback
            const bestName = displayName
              ? displayName
              : (existing.name || id);

            // Update the group in our map with WhatsApp data
            groupMap.set(id, {
              id,
              name: bestName,
              lastInteractionTs,
              source: 'whatsapp'
            });

            // Only update database if we have useful metadata to persist
            if (cleanedName || lastInteractionTs) {
              upserts.push(
                upsertGroupMetadata({
                  groupId: id,
                  displayName: cleanedName || null,
                  lastInteractionTs
                }).catch((err) => {
                  console.warn('[WEB] failed to persist group metadata', id, err?.message || err);
                  return null;
                })
              );
            }
          });

          if (upserts.length) {
            await Promise.allSettled(upserts);
          }
        }
      } catch (err) {
        console.warn('[WEB] Failed to fetch chats from WhatsApp client:', err?.message || err);
        whatsappClient = null; // force re-init on next request
      }
    } else {
      console.log('[DEBUG] WhatsApp client not available - using database-only group data');
    }

    // Reinforce display names from database metadata when we still only have IDs
    archivedGroups.forEach((group) => {
      const id = group.id;
      const rawName = (group.name || '').trim();
      if (!id || !groupMap.has(id)) return;
      const entry = groupMap.get(id);
      const hasMeaningfulName = entry.name && entry.name !== id;
      if (!hasMeaningfulName && rawName && rawName !== id) {
        groupMap.set(id, { ...entry, name: rawName, source: entry.source || 'database' });
      }
    });

    const groups = Array.from(groupMap.values())
      .filter(group => isGroupId(group.id)) // Only include actual WhatsApp groups
      .map((group) => {
        const dbName = dbNameMap.get(group.id);
        if ((!group.name || group.name === group.id) && dbName && dbName !== group.id) {
          return { ...group, name: dbName, source: group.source || 'database' };
        }
        return group;
      })
      .sort((a, b) => {
        const nameA = (a.name || a.id || '').toLocaleLowerCase('pt-BR');
        const nameB = (b.name || b.id || '').toLocaleLowerCase('pt-BR');
        return nameA.localeCompare(nameB, 'pt-BR');
      });

    console.log('[DEBUG] Final groups count:', groups.length);
    res.json({ groups });
  } catch (err) {
    console.error('[ERROR] Failed to get connected groups:', err);
    res.status(500).json({ error: 'failed_to_list_groups', details: err.message });
  }
});
const { bus } = require('./eventBus.js');
const emailService = require('./emailService.js');
console.timeEnd('[BOOT] requires');

const PORT = process.env.PORT || 3001;

const DEFAULT_MEDIA_DIR = MEDIA_DIR;
const resolveDir = (preferred, fallback) => {
  if (preferred) {
    const resolved = path.resolve(preferred);
    if (fs.existsSync(resolved)) return resolved;
    console.warn('[WEB] Diretório não encontrado, usando fallback:', resolved, '->', fallback);
  }
  return fallback;
};

// Alguns ambientes antigos apontam STICKERS_DIR para "/media", que neste host
// é apenas o mount raiz e não o diretório real dos arquivos do app.
// Para evitar quebrar as URLs /media/*.webp, preferimos o diretório interno
// storage/media quando a configuração vier como o mount genérico /media.
const configuredStickersDir = process.env.STICKERS_DIR ? path.resolve(process.env.STICKERS_DIR) : '';
const STICKERS_DIR = configuredStickersDir && configuredStickersDir !== '/media'
  ? resolveDir(configuredStickersDir, DEFAULT_MEDIA_DIR)
  : DEFAULT_MEDIA_DIR;
console.log('[WEB] STICKERS_DIR config:', configuredStickersDir || '(none)');
console.log('[WEB] STICKERS_DIR efetivo:', STICKERS_DIR, 'exists:', fs.existsSync(STICKERS_DIR));

const oldStickersConfigured = process.env.OLD_STICKERS_DIR || process.env.OLD_STICKERS_PATH;
const OLD_STICKERS_DIRS = Array.from(new Set([
  oldStickersConfigured && path.resolve(oldStickersConfigured),
  OLD_STICKERS_DIR,
  path.join(STICKERS_DIR, 'old-stickers'),
].filter(Boolean)));
const PRIMARY_OLD_STICKERS_DIR = OLD_STICKERS_DIRS.find((dir) => fs.existsSync(dir));
console.log('[WEB] OLD_STICKERS_DIR candidates:', OLD_STICKERS_DIRS);
console.log('[WEB] OLD_STICKERS_DIR primary:', PRIMARY_OLD_STICKERS_DIR, 'exists:', !!PRIMARY_OLD_STICKERS_DIR);
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.resolve(__dirname, 'public');

// DEBUG: Add early middleware
// app.use((req, res, next) => {
//   if (req.path.startsWith('/api/admin/') || req.path.startsWith('/api/debug/')) {
//     console.log('[DEBUG] EARLY MIDDLEWARE:', req.path, req.method);
//   }
//   next();
// });
console.log('[WEB] PUBLIC_DIR:', PUBLIC_DIR, 'exists:', fs.existsSync(PUBLIC_DIR));

console.time('[BOOT] static');
app.use(express.static(PUBLIC_DIR, {
  etag: false,
  lastModified: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  },
}));
console.timeEnd('[BOOT] static');

// Compat antigo
app.use('/figurinhas', express.static('/mnt/nas/Media/Figurinhas'));

//Compatibilidade com CSP
const cspMiddleware = createCSPMiddleware({
  umamiOrigin: UMAMI_ORIGIN,
  allowCfInsights: ALLOW_CF_INSIGHTS
});
app.use(cspMiddleware);


// Diretório de mídia novo (alias /stickers e /media)
const staticOpts = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.webp')) res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public,max-age=3600');
  }
};
app.use('/stickers', express.static(STICKERS_DIR, staticOpts));
app.use('/media', express.static(STICKERS_DIR, staticOpts));

// Additional media directories for backward compatibility
console.log('[WEB] BOT_MEDIA_DIR:', BOT_MEDIA_DIR, 'exists:', fs.existsSync(BOT_MEDIA_DIR));
console.log('[WEB] OLD_STICKERS_DIR:', PRIMARY_OLD_STICKERS_DIR, 'exists:', PRIMARY_OLD_STICKERS_DIR ? fs.existsSync(PRIMARY_OLD_STICKERS_DIR) : false);

// Serve bot media files
app.use('/bot/media', express.static(BOT_MEDIA_DIR, staticOpts));
// Serve old stickers
OLD_STICKERS_DIRS.forEach((dir) => {
  if (fs.existsSync(dir)) {
    app.use('/media/old-stickers', express.static(dir, staticOpts));
  } else {
    console.warn('[WEB] OLD_STICKERS_DIR inexistente, ignorando:', dir);
  }
});

// Setup middlewares using modularized components
const ipRulesMiddleware = createIPRulesMiddleware(db, { enableAnalytics: ENABLE_INTERNAL_ANALYTICS });
app.use(ipRulesMiddleware);

const limiter = createMainRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  skipPaths: ['/api/admin', '/admin']
});
app.use(limiter);

const requestLogger = createRequestLogger(db, {
  enableAnalytics: ENABLE_INTERNAL_ANALYTICS,
  skipPaths: ['/media', '/figurinhas']
});
app.use(requestLogger);

// Setup wizard routes (only active when SETUP_MODE=true)
const setupRoutes = require('./routes/setup');
app.use('/', setupRoutes);

// Register modularized routes
registerRoutes(app, db);

// Lista as figurinhas enviadas pelo usuário autenticado
app.get('/api/my-stickers', requireLogin, async (req, res) => {
  try {
    const userId = req.user.id;
    // Busca as figurinhas enviadas por esse usuário, ordenadas da mais recente para a mais antiga
    const { page = 1, perPage = 20 } = req.query;
    const result = await listMedia({
      q: '',
      tags: [],
      anyTag: [],
      nsfw: 'all',
      sort: 'newest',
      page: parseInt(page, 10),
      perPage: parseInt(perPage, 10),
      senderId: userId
    });
    res.json(result);
  } catch (e) {
    console.error('[API] /api/my-stickers ERRO:', e);
    res.status(500).json({ error: 'internal_error', msg: e?.message });
  }
});

// CSRF Token endpoint
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: getCSRFToken(req, res) });
});

// Mercado Pago Checkout Transparente via Orders.
app.get('/api/payments/mercadopago/config', async (req, res) => {
  try {
    const context = await paymentService.getTokenContext(req.query.token);
    const config = paymentService.getConfig();
    if (!context) return res.status(400).json({ valid: false, error: 'invalid_or_expired_access_link' });
    return res.json({
      valid: true,
      configured: paymentService.isConfigured(),
      publicKey: config.publicKey || null,
      amountCents: config.amountCents,
      planDays: config.planDays,
      currency: 'BRL',
      environment: config.environment
    });
  } catch (error) {
    console.error('[PAYMENTS] config error:', error?.message || error);
    return res.status(500).json({ valid: false, error: 'payment_configuration_unavailable' });
  }
});

app.post('/api/payments/mercadopago/order', async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.payer?.email || '').trim().toLowerCase();
    const order = await paymentService.createOrder({
      rawToken: body.access_token || body.accessToken,
      method: body.method,
      token: body.token,
      paymentMethodId: body.payment_method_id,
      paymentType: body.payment_type_id || body.payment_type,
      installments: body.installments,
      deviceId: body.device_id || body.deviceId,
      payer: {
        email, first_name: body.payer?.first_name, last_name: body.payer?.last_name,
        identification: body.payer?.identification
      }
    });
    return res.status(201).json(order);
  } catch (error) {
    const known = new Map([
      ['invalid_or_expired_access_token', [400, 'Este link de pagamento expirou. Solicite um novo link pelo WhatsApp.']],
      ['mercadopago_not_configured', [503, 'O checkout de testes ainda não está configurado.']],
      ['invalid_payment_method', [400, 'Meio de pagamento inválido.']],
      ['invalid_card_payment', [400, 'Não foi possível validar os dados do cartão.']],
      ['invalid_payer_email', [400, 'Informe um e-mail válido.']]
    ]);
    const [status, message] = known.get(error.message) || [502, 'O Mercado Pago não aprovou a criação do pagamento. Tente novamente.'];
    if (status >= 500) console.error('[PAYMENTS] order error:', error?.message || error, error?.providerCode || '');
    return res.status(status).json({ error: error.message, message });
  }
});

app.get('/api/payments/mercadopago/status', async (req, res) => {
  try {
    return res.json(await paymentService.getStatus(req.query.token));
  } catch (error) {
    console.error('[PAYMENTS] status error:', error?.message || error);
    return res.status(500).json({ error: 'payment_status_unavailable', message: 'Não foi possível consultar o status agora.' });
  }
});

app.post('/api/payments/mercadopago/webhook', async (req, res) => {
  const body = req.body || {};
  const orderId = String(body.data?.id || req.query['data.id'] || req.query.id || '').trim();
  const requestId = String(req.headers['x-request-id'] || '').trim();
  const signature = String(req.headers['x-signature'] || '').trim();
  if (!orderId || !paymentService.verifyWebhookSignature({ signature, requestId, dataId: orderId })) {
    console.warn('[PAYMENTS] webhook rejeitado: assinatura ou order ausente');
    return res.status(401).json({ error: 'invalid_webhook' });
  }
  const eventType = String(body.type || req.query.type || 'order');
  const eventKey = `mercadopago:${eventType}:${orderId}:${requestId || 'unsigned'}`;
  try {
    await paymentService.processWebhook({ eventKey, orderId });
    return res.status(200).json({ received: true });
  } catch (error) {
    const code = String(error?.message || error);
    console.error('[PAYMENTS] webhook processing error:', code);
    // Mercado Pago's dashboard test may use a synthetic/nonexistent Order ID.
    // The event was authenticated, but it cannot grant entitlement without a
    // real provider Order linked to a local payment record. Acknowledge these
    // benign provider-side test/unknown-order cases to avoid endless retries;
    // keep invalid signatures as 401 and unexpected failures as 500.
    if (['payment_order_not_linked', 'mercadopago_http_400', 'mercadopago_http_404'].includes(code)) {
      return res.status(200).json({ received: true, ignored: true });
    }
    return res.status(500).json({ error: 'webhook_processing_failed' });
  }
});

app.get('/api/admin/payments/summary', requireAdmin, async (req, res) => {
  try {
    const orders = await new Promise((resolve, reject) => db.all(`SELECT id,user_id,provider_order_id,status,provider_status,amount_cents,created_at,updated_at FROM payment_orders ORDER BY created_at DESC LIMIT 100`, (err, rows) => err ? reject(err) : resolve(rows || [])));
    const entitlements = await new Promise((resolve, reject) => db.all(`SELECT user_id,provider,provider_order_id,status,amount_cents,granted_at,expires_at,updated_at FROM dm_entitlements ORDER BY updated_at DESC LIMIT 100`, (err, rows) => err ? reject(err) : resolve(rows || [])));
    return res.json({ orders, entitlements });
  } catch (error) {
    console.error('[PAYMENTS] admin summary error:', error?.message || error);
    return res.status(500).json({ error: 'payment_summary_unavailable' });
  }
});


const privacyRequestRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 3, standardHeaders: true, legacyHeaders: false });
app.post('/api/privacy/requests', privacyRequestRateLimit, async (req, res) => {
  const allowedTypes = new Set(['access','correction','deletion','opposition','other']);
  const { request_type: requestType, email, message } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';
  if (!allowedTypes.has(requestType) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254 || !normalizedMessage || normalizedMessage.length > 5000) return res.status(400).json({ error: 'invalid_privacy_request', message: 'Informe o tipo, um e-mail válido e uma mensagem de até 5000 caracteres.' });
  const now=Date.now();
  try { await new Promise((resolve,reject)=>db.run(`INSERT INTO privacy_requests (request_type,email,message,user_id,status,created_at,updated_at) VALUES (?,?,?,?, 'pending', ?, ?)`,[requestType,normalizedEmail,normalizedMessage,req.user?.id||null,now,now],err=>err?reject(err):resolve())); res.status(201).json({success:true,message:'Solicitação recebida.'}); } catch(error) { console.error('[PRIVACY] Request persistence failed:',error.message); res.status(500).json({error:'privacy_request_unavailable',message:'Não foi possível registrar a solicitação agora.'}); }
});
  // ========= Email Confirmation API =========
app.get('/confirm-email', async (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(400).send(`
      <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h2>Token inválido</h2>
        <p>Link de confirmação inválido.</p>
        <a href="/login">Voltar ao login</a>
      </body></html>
    `);
  }
  
  try {
    db.get(`
      SELECT id, username, email, email_confirmation_expires 
      FROM users 
      WHERE email_confirmation_token = ? AND email_confirmed = 0
    `, [token], (err, user) => {
      if (err) {
        console.error('[EMAIL-CONFIRM] DB error:', err);
        return res.status(500).send(`
          <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>Erro interno</h2>
            <p>Ocorreu um erro ao confirmar seu email. Tente novamente.</p>
            <a href="/login">Voltar ao login</a>
          </body></html>
        `);
      }
      
      if (!user) {
        return res.status(400).send(`
          <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>Token inválido</h2>
            <p>Link de confirmação inválido ou já utilizado.</p>
            <a href="/login">Voltar ao login</a>
          </body></html>
        `);
      }
      
      // Check if token is expired
      if (user.email_confirmation_expires < Date.now()) {
        return res.status(400).send(`
          <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>Link expirado</h2>
            <p>Este link de confirmação expirou. Solicite um novo cadastro.</p>
            <a href="/register">Novo cadastro</a>
          </body></html>
        `);
      }
      
      // Confirm email
      db.run(`
        UPDATE users 
        SET email_confirmed = 1, email_confirmation_token = NULL, email_confirmation_expires = NULL
        WHERE id = ?
      `, [user.id], (updateErr) => {
        if (updateErr) {
          console.error('[EMAIL-CONFIRM] Error updating user:', updateErr);
          return res.status(500).send(`
            <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2>Erro interno</h2>
              <p>Ocorreu um erro ao confirmar seu email. Tente novamente.</p>
              <a href="/login">Voltar ao login</a>
            </body></html>
          `);
        }
        
        console.log(`[EMAIL-CONFIRM] Email confirmed for user: ${user.username}`);
        res.send(`
          <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #28a745;">Email confirmado!</h2>
            <p>Seu email foi confirmado com sucesso, <strong>${user.username}</strong>!</p>
            <p>Agora você pode fazer login assim que um administrador aprovar sua conta.</p>
            <a href="/login" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Fazer Login</a>
          </body></html>
        `);
      });
    });
  } catch (error) {
    console.error('[EMAIL-CONFIRM] Unexpected error:', error);
    res.status(500).send(`
      <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h2>Erro interno</h2>
        <p>Ocorreu um erro ao confirmar seu email. Tente novamente.</p>
        <a href="/login">Voltar ao login</a>
      </body></html>
    `);
  }
});

// Rate limiter for registration endpoint 
const registerRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 registration attempts per window
  message: { error: 'too_many_registration_attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ========= User Registration API =========
app.post('/api/register', registerRateLimit, async (req, res) => {
  const { username, password, phoneNumber, email, captchaAnswer, captchaSession } = req.body || {};
  
  // Validation
  if (!username || !password || !phoneNumber || !email || !captchaAnswer || !captchaSession) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  
  // Validate CAPTCHA first
  console.log(`[CAPTCHA] Validating session ${captchaSession}`);
  console.log(`[CAPTCHA] Has session:`, !!req.session);
  console.log(`[CAPTCHA] Has captcha:`, !!req.session?.captcha);
  console.log(`[CAPTCHA] Session matches:`, req.session?.captcha?.session === captchaSession);
  
  if (!req.session || !req.session.captcha || req.session.captcha.session !== captchaSession) {
    console.log(`[CAPTCHA] Invalid session. Expected: ${req.session?.captcha?.session}, Got: ${captchaSession}`);
    return res.status(400).json({ error: 'invalid_captcha_session' });
  }
  
  // Check if CAPTCHA has expired
  if (Date.now() > req.session.captcha.expires) {
    console.log(`[CAPTCHA] Expired. Now: ${Date.now()}, Expires: ${req.session.captcha.expires}`);
    delete req.session.captcha;
    return res.status(400).json({ error: 'invalid_captcha_session' });
  }
  
  console.log(`[CAPTCHA] Checking answer. Expected: ${req.session.captcha.answer}, Got: ${parseInt(captchaAnswer)}`);
  if (parseInt(captchaAnswer) !== req.session.captcha.answer) {
    return res.status(400).json({ error: 'invalid_captcha' });
  }
  
  console.log(`[CAPTCHA] Validation successful`);
  
  // Clear CAPTCHA after validation
  delete req.session.captcha;
  
  if (typeof username !== 'string' || username.length < 3) {
    return res.status(400).json({ error: 'invalid_username' });
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'invalid_username' });
  }
  
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'invalid_password' });
  }
  
  if (typeof phoneNumber !== 'string' || !/^[0-9]{10,15}$/.test(phoneNumber)) {
    return res.status(400).json({ error: 'invalid_phone' });
  }
  
  // Email validation
  const MAX_EMAIL_LENGTH = 254;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (
  typeof email !== 'string' ||
  email.length > MAX_EMAIL_LENGTH ||
  !emailRegex.test(email)
) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  
  try {
    // Check if username already exists
    db.get(`SELECT id FROM users WHERE username = ?`, [username.toLowerCase()], async (err, existingUser) => {
      if (err) {
        console.error('[REGISTER] DB error checking username:', err);
        return res.status(500).json({ error: 'db_error' });
      }
      
      if (existingUser) {
        return res.status(409).json({ error: 'username_taken' });
      }
      
      // Check if email already exists
      db.get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase()], async (errEmail, existingEmail) => {
        if (errEmail) {
          console.error('[REGISTER] DB error checking email:', errEmail);
          return res.status(500).json({ error: 'db_error' });
        }
        
        if (existingEmail) {
          return res.status(409).json({ error: 'email_taken' });
        }
      
        // Check if phone number already exists
        db.get(`SELECT id FROM users WHERE phone_number = ?`, [phoneNumber], async (err2, existingPhone) => {
          if (err2) {
            console.error('[REGISTER] DB error checking phone:', err2);
            return res.status(500).json({ error: 'db_error' });
          }
          
          if (existingPhone) {
            return res.status(409).json({ error: 'phone_taken' });
          }
          
          // Check if this phone number has chatted with the bot (DM user)
          const dmUserId = phoneNumber + '@c.us'; // WhatsApp format
          db.get(`SELECT id, allowed, blocked, note FROM dm_users WHERE user_id = ?`, [dmUserId], async (errDm, dmUser) => {
            if (errDm) {
              console.error('[REGISTER] DB error checking DM user:', errDm);
              return res.status(500).json({ error: 'db_error' });
            }
            
            // Generate email confirmation token
            const confirmationToken = emailService.generateConfirmationToken();
            const confirmationExpires = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
            
            // Hash password and create user
            try {
              const passwordHash = await bcrypt.hash(password, 12);
              const now = Date.now();
              
              // Determine initial status based on DM user status
              let initialStatus = 'pending';
              let initialCanEdit = 0;
              
              if (dmUser) {
                // If user has chatted with bot and is allowed, give them approved status
                if (dmUser.allowed && !dmUser.blocked) {
                  initialStatus = 'approved';
                  initialCanEdit = 1;
                  console.log(`[REGISTER] WhatsApp user ${dmUserId} registering - auto-approving`);
                } else if (dmUser.blocked) {
                  return res.status(403).json({ error: 'phone_blocked', message: 'Este número está bloqueado no WhatsApp.' });
                }
              }
              
              db.run(`
                INSERT INTO users (username, password_hash, phone_number, email, role, status, can_edit, must_change_password, created_at, email_confirmed, email_confirmation_token, email_confirmation_expires)
                VALUES (?, ?, ?, ?, 'user', ?, ?, 0, ?, 0, ?, ?)
              `, [username.toLowerCase(), passwordHash, phoneNumber, email.toLowerCase(), initialStatus, initialCanEdit, now, confirmationToken, confirmationExpires], async function(err3) {
                if (err3) {
                  console.error('[REGISTER] DB error creating user:', err3);
                  return res.status(500).json({ error: 'db_error' });
                }
                
                console.log(`[REGISTER] New user registered: ${username} (email: ${email}, phone: ${phoneNumber}, status: ${initialStatus})`);
                
                // Send confirmation email
                const emailSent = await emailService.sendConfirmationEmail(email, username, confirmationToken);
                
                const responseMessage = dmUser ? 
                  'Cadastro realizado com sucesso! Como você já conversou conosco no WhatsApp, sua conta foi pré-aprovada.' :
                  'Cadastro realizado com sucesso! Aguarde aprovação do administrador.';
                
                res.status(201).json({ 
                  success: true,
                  message: emailSent ? 
                    responseMessage + ' Verifique seu email para confirmar sua conta.' :
                    responseMessage + ' (Email de confirmação não pôde ser enviado).',
                  userId: this.lastID,
                  emailSent: emailSent,
                  autoApproved: initialStatus === 'approved'
                });
              });
            } catch (hashErr) {
              console.error('[REGISTER] Error hashing password:', hashErr);
              res.status(500).json({ error: 'db_error' });
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('[REGISTER] Unexpected error:', error);
    res.status(500).json({ error: 'db_error' });
  }
});


// Sirva a UI do dashboard
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.use('/admin-assets', express.static(path.join(__dirname, 'public')));

// Auditoria administrativa — ações relevantes, sem expor logs técnicos ou segredos.
app.get('/api/admin/audit', requireAdmin, (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
  db.all(`SELECT id, created_at, admin_id, admin_username, action, entity, entity_id, details_json FROM admin_audit_log ORDER BY created_at DESC LIMIT ?`, [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: 'admin_audit_unavailable' });
    res.json({ entries: (rows || []).map(row => ({ ...row, details: (() => { try { return JSON.parse(row.details_json || '{}'); } catch (_) { return {}; } })() })) });
  });
});

// APIs administrativas de privacidade
app.get('/api/admin/privacy/requests', requireAdmin, (req, res) => {
  const status=['pending','in_progress','completed','rejected'].includes(String(req.query.status||''))?String(req.query.status):null; const limit=Math.min(Math.max(Number.parseInt(req.query.limit,10)||100,1),200); const params=status?[status,limit]:[limit]; const where=status?'WHERE status = ?':'';
  db.all(`SELECT id,request_type,email,message,user_id,status,admin_note,created_at,updated_at,resolved_at FROM privacy_requests ${where} ORDER BY created_at ASC LIMIT ?`,params,(err,rows)=>{if(err)return res.status(500).json({error:'privacy_requests_unavailable'});res.json({requests:rows||[]})});
});
app.patch('/api/admin/privacy/requests/:id', requireAdmin, (req,res)=>{const status=String(req.body?.status||'');const allowed=new Set(['pending','in_progress','completed','rejected']);const note=typeof req.body?.admin_note==='string'?req.body.admin_note.trim().slice(0,2000):null;if(!allowed.has(status))return res.status(400).json({error:'invalid_privacy_request_status'});const now=Date.now();db.run(`UPDATE privacy_requests SET status=?,admin_note=?,updated_at=?,resolved_at=? WHERE id=?`,[status,note,now,['completed','rejected'].includes(status)?now:null,Number.parseInt(req.params.id,10)],function(err){if(err)return res.status(500).json({error:'privacy_request_update_failed'});if(!this.changes)return res.status(404).json({error:'privacy_request_not_found'});res.json({success:true})})});

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
// ====== Group Users Management ======
app.get('/api/admin/group-users/:groupId', requireAdmin, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const users = await listGroupUsers(groupId);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

app.get('/api/admin/group-users/:groupId/:userId', requireAdmin, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const user = await getGroupUser(groupId, userId);
    if (!user) return res.status(404).json({ error: 'not_found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

// ========= WhatsApp Verification API =========
app.post('/api/verify-whatsapp', requireLogin, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code || typeof code !== 'string' || code.length !== 8) {
      return res.status(400).json({ error: 'invalid_code' });
    }

    // Import verification functions
    const { linkVerificationCode, getUserVerificationStatus } = require('../database/index');

    // Check if user is already verified
    const verificationStatus = await getUserVerificationStatus(db, userId);
    if (verificationStatus.whatsapp_verified) {
      return res.status(409).json({ 
        error: 'already_verified',
        message: 'Sua conta já está verificada via WhatsApp'
      });
    }

    // Try to link the verification code
    const success = await linkVerificationCode(db, code.toUpperCase(), userId);
    
    if (!success) {
      return res.status(400).json({ 
        error: 'invalid_or_expired_code',
        message: 'Código inválido ou expirado. Gere um novo código enviando #verificar para o bot.'
      });
    }

    console.log(`[VERIFY] User ${req.user.username} (ID: ${userId}) successfully verified WhatsApp`);
    
    res.json({ 
      success: true,
      message: 'WhatsApp verificado com sucesso! Agora você pode editar figurinhas.'
    });
    
  } catch (error) {
    console.error('[VERIFY] Error in WhatsApp verification endpoint:', error);
    res.status(500).json({ 
      error: 'server_error',
      message: 'Erro interno do servidor'
    });
  }
});

app.get('/api/verify-whatsapp/status', requireLogin, async (req, res) => {
  try {
    const { getUserVerificationStatus } = require('../database/index');
    const status = await getUserVerificationStatus(db, req.user.id);
    
    res.json({
      whatsapp_verified: !!status.whatsapp_verified,
      whatsapp_jid: status.whatsapp_jid || null
    });
    
  } catch (error) {
    console.error('[VERIFY] Error getting verification status:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/admin/group-users/:groupId/:userId', requireAdmin, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const { role, blocked, allowed_commands, restricted_commands } = req.body;
    await upsertGroupUser({
      group_id: groupId,
      user_id: userId,
      role: role || 'user',
      blocked: blocked ? 1 : 0,
      allowed_commands: allowed_commands ? JSON.stringify(allowed_commands) : null,
      restricted_commands: restricted_commands ? JSON.stringify(restricted_commands) : null
    });
    invalidateGroupUserCache(groupId, userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

app.patch('/api/admin/group-users/:groupId/:userId', requireAdmin, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const { field, value } = req.body;
    // Field validation is now enforced in updateGroupUserField for defense in depth
    if (field === 'display_name') {
      const name = typeof value === 'string' && value.trim() ? value.trim() : null;
      db.run(`
        INSERT INTO contacts(sender_id, display_name, updated_at)
        VALUES (?, ?, strftime('%s','now'))
        ON CONFLICT(sender_id) DO UPDATE SET
          display_name = excluded.display_name,
          updated_at = excluded.updated_at
      `, [userId, name], (err) => {
        if (err) {
          return res.status(500).json({ error: 'db_error', details: err.message });
        }
        invalidateGroupUserCache(groupId, userId);
        return res.json({ ok: true });
      });
      return;
    }
    await updateGroupUserField(groupId, userId, field, field.endsWith('_commands') ? JSON.stringify(value) : value);
    invalidateGroupUserCache(groupId, userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

app.delete('/api/admin/group-users/:groupId/:userId', requireAdmin, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    await deleteGroupUser(groupId, userId);
    invalidateGroupUserCache(groupId, userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

// ====== DM Users Management (bot-level direct-message authorization) ======
app.get('/api/admin/dm-users', requireAdmin, async (req, res) => {
  try {
    const users = await listDmUsers();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

app.post('/api/admin/dm-users', requireAdmin, async (req, res) => {
  try {
    const { user_id, allowed, blocked, note } = req.body;
    if (!user_id) return res.status(400).json({ error: 'missing_user_id' });
    await upsertDmUser({ user_id, allowed: allowed ? 1 : 0, blocked: blocked ? 1 : 0, note: note || null });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

app.delete('/api/admin/dm-users/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    await deleteDmUser(userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

app.get('/api/admin/public-dm/status', requireAdmin, async (req, res) => {
  try {
    const usage = await publicDmAccess.listUsage(req.query.limit);
    res.json({ settings: publicDmAccess.getPublicDmSettings(), usage });
  } catch (err) {
    res.status(500).json({ error: 'public_dm_status_unavailable', message: 'Não foi possível carregar o status do acesso público.' });
  }
});

// ====== Group Command Permissions ======
app.get('/api/admin/group-commands/:groupId', requireAdmin, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const permissions = await listGroupCommandPermissions(groupId);
    const summary = await getGroupPermissionSummary(groupId);
    res.json({ permissions, summary });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

app.post('/api/admin/group-commands/:groupId', requireAdmin, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { command, allowed } = req.body;
    if (!command) return res.status(400).json({ error: 'missing_command' });
    await setGroupCommandPermission(groupId, command, allowed ? 1 : 0);
    invalidateGroupPermissionCache(groupId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

app.get('/api/admin/group-commands/:groupId/check', requireAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { command, userId } = req.query;
    if (!command) {
      return res.status(400).json({ error: 'missing_command' });
    }
    const evaluation = await evaluateGroupCommandPermission({
      groupId,
      userId: userId || undefined,
      command
    });
    res.json(evaluation);
  } catch (err) {
    console.error('[ADMIN] Erro ao avaliar permissão de comando:', err);
    res.status(500).json({ error: 'evaluation_failed', details: err.message });
  }
});

app.delete('/api/admin/group-commands/:groupId/:command', requireAdmin, async (req, res) => {
  try {
    const { groupId, command } = req.params;
    await deleteGroupCommandPermission(groupId, command);
    invalidateGroupPermissionCache(groupId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

// ====== Bot Config (frequency) ======
app.get('/api/admin/bot-config/:key', requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    const value = await getBotConfig(key);
    res.json({ key, value });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});

app.post('/api/admin/bot-config/:key', requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    const { value } = req.body;
    await setBotConfig(key, value);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error', details: err.message });
  }
});
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

// ========= User Management APIs =========
// Debug endpoint to check current user
app.get('/api/debug/user', (req, res) => {
  if (!req.user) {
    return res.json({ error: 'not_logged_in' });
  }
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
    is_admin: req.user.role === 'admin'
  });
});

// Debug endpoint to promote user to admin
app.post('/api/debug/make-admin', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'not_logged_in' });
  }
  
  db.run(`UPDATE users SET role = 'admin', status = 'approved' WHERE id = ?`, [req.user.id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'db_error' });
    }
    res.json({ success: true, message: 'User promoted to admin' });
  });
});

// Debug endpoint to add test groups
app.post('/api/debug/add-test-groups', requireAdmin, async (req, res) => {
  try {
    const testGroups = [
      { id: '120363000000000000@g.us', name: 'Grupo de Teste 1' },
      { id: '120363111111111111@g.us', name: 'Grupo de Teste 2' }
    ];

    for (const group of testGroups) {
      await upsertGroupMetadata({
        groupId: group.id,
        displayName: group.name,
        lastInteractionTs: Date.now()
      });
    }

    res.json({ success: true, message: 'Test groups added' });
  } catch (err) {
    res.status(500).json({ error: 'failed', details: err.message });
  }
});
// List all users for admin management
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;

  let sql = `
    SELECT 
      u.id,
      u.username,
      u.email,
      u.phone_number,
      u.role,
      u.status,
      u.can_edit,
      u.email_confirmed,
      u.created_at,
      u.approved_at,
      u.approved_by,
      approver.username as approved_by_username,
      u.contact_display_name,
      CASE WHEN dm.id IS NOT NULL THEN 1 ELSE 0 END as has_whatsapp_account,
      dm.allowed as whatsapp_allowed,
      dm.blocked as whatsapp_blocked
    FROM users u
    LEFT JOIN users approver ON u.approved_by = approver.id
    LEFT JOIN contacts c ON c.sender_id = u.phone_number
    LEFT JOIN dm_users dm ON dm.user_id = (u.phone_number || '@c.us')
  `;  const params = [];

  if (status) {
    sql += ` WHERE u.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('[ADMIN] Error fetching users:', err);
      return res.status(500).json({ error: 'db_error', details: err.message });
    }

    // Get total count
    const countSql = status ?
      `SELECT COUNT(*) as total FROM users WHERE status = ?` :
      `SELECT COUNT(*) as total FROM users`;
    const countParams = status ? [status] : [];

    db.get(countSql, countParams, (err2, countRow) => {
      if (err2) {
        console.error('[ADMIN] Error counting users:', err2);
        return res.status(500).json({ error: 'db_error' });
      }

      res.json({
        users: rows || [],
        total: countRow?.total || 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    });
  });
});

// Approve or reject a user
app.patch('/api/admin/users/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }

  const now = Date.now();
  const approverId = req.user.id;
  // Allow admin to set status regardless of current value (override)
  db.run(`
    UPDATE users
    SET status = ?, approved_at = CASE WHEN ? = 'approved' THEN ? ELSE NULL END, approved_by = CASE WHEN ? = 'approved' THEN ? ELSE NULL END
    WHERE id = ?
  `, [status, status, now, status, approverId, id], function(err) {
    if (err) {
      console.error('[ADMIN] Error updating user status:', err);
      return res.status(500).json({ error: 'db_error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    console.log(`[ADMIN] User ${id} ${status} by ${req.user.username}`);
    res.json({ success: true, status, approved_at: now });
  });
});

// Delete a user (admin only)
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  // Prevent deleting admin users via this endpoint
  db.get(`SELECT role FROM users WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'db_error', details: err.message });
    if (!row) return res.status(404).json({ error: 'user_not_found' });
    if (row.role === 'admin') return res.status(403).json({ error: 'cannot_delete_admin' });

    db.run(`DELETE FROM users WHERE id = ?`, [id], function(deleteErr) {
      if (deleteErr) return res.status(500).json({ error: 'db_error', details: deleteErr.message });
      res.json({ deleted: this.changes });
    });
  });
});

// Update user edit permissions
app.patch('/api/admin/users/:id/permissions', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { can_edit } = req.body;

  if (typeof can_edit !== 'boolean') {
    return res.status(400).json({ error: 'invalid_permissions' });
  }

  db.run(`UPDATE users SET can_edit = ? WHERE id = ?`, [can_edit ? 1 : 0, id], function(err) {
    if (err) {
      console.error('[ADMIN] Error updating user permissions:', err);
      return res.status(500).json({ error: 'db_error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    console.log(`[ADMIN] User ${id} edit permission set to ${can_edit} by ${req.user.username}`);
    res.json({ success: true, can_edit });
  });
});

// Update user profile data
app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { contact_display_name, phone_number, email } = req.body;

  // Validate input
  if (contact_display_name !== undefined && typeof contact_display_name !== 'string') {
    return res.status(400).json({ error: 'invalid_contact_name' });
  }
  if (phone_number !== undefined && typeof phone_number !== 'string') {
    return res.status(400).json({ error: 'invalid_phone' });
  }
  if (email !== undefined && typeof email !== 'string') {
    return res.status(400).json({ error: 'invalid_email' });
  }

  // Build update query dynamically
  const updates = [];
  const values = [];
  
  if (contact_display_name !== undefined) {
    updates.push('contact_display_name = ?');
    values.push(contact_display_name);
  }
  if (phone_number !== undefined) {
    updates.push('phone_number = ?');
    values.push(phone_number);
  }
  if (email !== undefined) {
    updates.push('email = ?');
    values.push(email);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'no_updates' });
  }
  
  values.push(id);
  
  db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
    if (err) {
      console.error('[ADMIN] Error updating user data:', err);
      return res.status(500).json({ error: 'db_error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    console.log(`[ADMIN] User ${id} data updated by ${req.user.username}`);
    res.json({ success: true });
  });
});

// ---- Duplicate Media Management API Endpoints ----

// Get duplicate media statistics
app.get('/api/admin/duplicates/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await getDuplicateStats();
    res.json(stats);
  } catch (error) {
    console.error('[ADMIN] Error getting duplicate stats:', error);
    res.status(500).json({ error: 'Failed to get duplicate statistics' });
  }
});

// Get list of duplicate media groups
app.get('/api/admin/duplicates', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const duplicates = await findDuplicateMedia(limit);
    res.json(duplicates);
  } catch (error) {
    console.error('[ADMIN] Error getting duplicates:', error);
    res.status(500).json({ error: 'Failed to get duplicate media' });
  }
});

// Get detailed information about a specific duplicate group
app.get('/api/admin/duplicates/:hashVisual', requireAdmin, async (req, res) => {
  try {
    const { hashVisual } = req.params;
    const details = await getDuplicateMediaDetails(hashVisual);
    res.json(details);
  } catch (error) {
    console.error('[ADMIN] Error getting duplicate details:', error);
    res.status(500).json({ error: 'Failed to get duplicate details' });
  }
});

// Delete several duplicate groups in one authenticated request. Processing remains
// sequential to keep SQLite/file operations bounded, while avoiding one HTTP/session
// round-trip per group through the reverse proxy.
app.delete('/api/admin/duplicates/bulk', requireAdmin, async (req, res) => {
  const hashes = Array.isArray(req.body?.hashVisuals) ? req.body.hashVisuals : [];
  const uniqueHashes = [...new Set(hashes.filter((value) => typeof value === 'string' && value.length > 0))];
  if (uniqueHashes.length === 0 || uniqueHashes.length > 50) {
    return res.status(400).json({ error: 'invalid_duplicate_groups', message: 'Informe entre 1 e 50 grupos de duplicatas.' });
  }

  const results = [];
  for (const hashVisual of uniqueHashes) {
    try {
      const beforeDetails = await getDuplicateMediaDetails(hashVisual);
      const deletedCount = await deleteDuplicateMedia(hashVisual, true);
      const afterDetails = await getDuplicateMediaDetails(hashVisual);
      results.push({
        hash_visual: hashVisual,
        ok: true,
        deleted_count: deletedCount,
        before_count: beforeDetails.length,
        remaining_count: afterDetails.length
      });
    } catch (error) {
      console.error('[ADMIN] Error deleting duplicate group in bulk:', error.message);
      results.push({ hash_visual: hashVisual, ok: false, error: 'delete_failed' });
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  res.status(failed === results.length ? 500 : 200).json({
    ok: failed === 0,
    processed: results.length,
    success_count: results.length - failed,
    error_count: failed,
    results
  });
});

// Delete duplicate media (auto-keep oldest)
app.delete('/api/admin/duplicates/:hashVisual', requireAdmin, async (req, res) => {
  try {
    const { hashVisual } = req.params;
    const keepOldest = req.query.keepOldest !== 'false'; // Default to true
    
    console.log(`[ADMIN] User ${req.user.username} is deleting duplicates for hash ${hashVisual}, keepOldest: ${keepOldest}`);
    
    // Check how many duplicates exist before deletion
    const beforeDetails = await getDuplicateMediaDetails(hashVisual);
    console.log(`[ADMIN] Found ${beforeDetails.length} media files with hash ${hashVisual} before deletion`);
    
    const deletedCount = await deleteDuplicateMedia(hashVisual, keepOldest);
    
    // Check remaining after deletion
    const afterDetails = await getDuplicateMediaDetails(hashVisual);
    console.log(`[ADMIN] After deletion: ${afterDetails.length} files remain, ${deletedCount} were deleted`);
    
    // The post-delete detail query is the bounded confirmation. Avoid a full
    // duplicate-list scan here: this route can be called once per selected group.
    console.log(`[ADMIN] Confirmed deletion state for ${hashVisual}: ${afterDetails.length} files remain`);
    
    console.log(`[ADMIN] Completed deletion for hash ${hashVisual}: deleted ${deletedCount}, remaining ${afterDetails.length}`);
    res.json({ 
      deleted_count: deletedCount, 
      hash_visual: hashVisual,
      remaining_count: afterDetails.length 
    });
    
  } catch (error) {
    console.error('[ADMIN] Error deleting duplicates:', error);
    res.status(500).json({ error: 'Failed to delete duplicate media' });
  }
});

// Delete specific media by IDs (manual selection)
app.delete('/api/admin/media/bulk', requireAdmin, express.json(), async (req, res) => {
  try {
    const { mediaIds } = req.body;
    
    if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
      return res.status(400).json({ error: 'Invalid media IDs provided' });
    }
    
    // Validate IDs are numbers
    const validIds = mediaIds.filter(id => Number.isInteger(id) && id > 0);
    if (validIds.length !== mediaIds.length) {
      return res.status(400).json({ error: 'All media IDs must be positive integers' });
    }
    
    console.log(`[ADMIN] User ${req.user.username} is deleting media IDs: ${validIds.join(', ')}`);
    
    const deletedCount = await deleteMediaByIds(validIds);
    
    console.log(`[ADMIN] Deleted ${deletedCount} media files`);
    res.json({ deleted_count: deletedCount, media_ids: validIds });
    
  } catch (error) {
    console.error('[ADMIN] Error deleting media by IDs:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
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
app.get('/register', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'register.html')));
app.get('/ranking/tags', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'ranking-tags.html')));
app.get('/ranking/users', requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, 'admin-ranking-users.html')));
app.get('/privacidade', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'privacy.html')));
function escapeHtmlAttribute(value) {
  return String(value ?? '').replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]));
}

function stickerPublicUrl(req, relativeUrl) {
  const configured = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || process.env.WEB_SERVER_URL;
  const base = String(configured || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  if (!relativeUrl) return '';
  if (/^https?:\/\//i.test(String(relativeUrl))) return String(relativeUrl);
  return `${base}/${String(relativeUrl).replace(/^\/+/, '')}`;
}

app.get('/sticker/:id', async (req, res) => {
  if (!/^\d+$/.test(String(req.params.id || ''))) return res.status(404).send('Figurinha não encontrada.');
  const pagePath = path.join(PUBLIC_DIR, 'sticker.html');
  let page = fs.readFileSync(pagePath, 'utf8');
  const id = Number.parseInt(req.params.id, 10);
  let row = null;
  try { row = await getMediaById(id); } catch (_) { row = null; }

  if (row) fixMediaUrl(row);

  // Não expor descrição/imagem de conteúdo NSFW em previews públicos.
  const publicSafe = Boolean(row && !row.nsfw && row.url);
  const description = publicSafe
    ? String(row.description || 'Encontre esta figurinha e envie diretamente para o WhatsApp.').replace(/\s+/g, ' ').trim().slice(0, 180)
    : 'Encontre esta figurinha e envie diretamente para o WhatsApp.';
  const title = publicSafe ? `Figurinha #${id} | Sticker Browser` : 'Sticker Browser';
  const url = stickerPublicUrl(req, `/sticker/${id}`);
  const image = publicSafe ? stickerPublicUrl(req, row.url) : '';
  const values = {
    '__STICKER_TITLE__': title,
    '__STICKER_DESCRIPTION__': description,
    '__STICKER_URL__': url,
    '__STICKER_IMAGE__': image,
    '__STICKER_IMAGE_ALT__': publicSafe ? `Figurinha #${id}` : 'Sticker Browser',
    '__STICKER_ROBOTS__': publicSafe ? 'index,follow' : 'noindex,nofollow'
  };
  for (const [marker, value] of Object.entries(values)) page = page.split(marker).join(escapeHtmlAttribute(value));
  return res.type('html').send(page);
});

// Reaction analytics
app.get('/api/admin/reactions/analytics', requireAdmin, async (req, res) => {
  try {
    const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 7, 1), 30);
    const chatId = req.query.chatId && /^[0-9]+@g\.us$/.test(String(req.query.chatId)) ? String(req.query.chatId) : null;
    const { getReactionAnalytics } = require('../database/models/reactions');
    const data = await getReactionAnalytics({ from: Date.now() - days * 86400000, to: Date.now(), chatId, limit: 20 });
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (error) { res.status(500).json({ error: 'reaction_analytics_unavailable' }); }
});

// Health
async function collectDeepHealth() {
  const checks = { process: { ok: true }, memory: { ok: false }, whatsapp: { ok: false }, ai: { ok: false } };
  try { const m = require('../client/memory-client'); const h = await m.healthcheck(); checks.memory = { ok: !!h.ok, url: '127.0.0.1:1933' }; } catch (_) { checks.memory = { ok: false, error: 'memory_unavailable' }; }
  try { const c = global.getCurrentWhatsAppClient ? global.getCurrentWhatsAppClient() : null; checks.whatsapp = { ok: !!c, state: c && c.getConnectionState ? await c.getConnectionState() : 'unknown' }; } catch (_) { checks.whatsapp = { ok: false, error: 'whatsapp_unavailable' }; }
  try { const axios = require('axios'); const base = String(process.env.CONVERSATION_BASE_URL || '').replace(/\/$/, ''); const r = await axios.get(base + '/models', { timeout: 4000 }); checks.ai = { ok: r.status === 200 }; } catch (_) { checks.ai = { ok: false, error: 'ai_unavailable' }; }
  return { ok: Object.values(checks).every((x) => x.ok), checks, ts: new Date().toISOString() };
}
app.get('/api/health/deep', requireAdmin, async (_req, res) => {
  const payload = await collectDeepHealth();
  res.status(payload.ok ? 200 : 503).json(payload);
});
// Admin UI endpoint: returns the same sanitized diagnosis with HTTP 200 even when degraded,
// so a known dependency outage is rendered as degraded rather than logged as a browser request error.
app.get('/api/admin/health/deep', requireAdmin, async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await collectDeepHealth());
});
app.get('/healthz', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, ts: Date.now() });
});

// Bot Configuration
app.get('/api/bot-config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const whatsappNumber = process.env.BOT_WHATSAPP_NUMBER || process.env.ADMIN_NUMBER?.replace('@c.us', '') || '';
  res.json({ whatsappNumber });
});

// Simple in-memory cache for API responses
const apiCache = new Map();
const CACHE_DURATION = 300000; // 5 minutes

function getCacheKey(req) {
  const { q = '', page = '1', per_page = '60', tags = '', any_tag = '', nsfw = 'all', sort = 'newest' } = req.query;
  return `stickers:${q}:${page}:${per_page}:${tags}:${any_tag}:${nsfw}:${sort}`;
}

function getFromCache(key) {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  apiCache.delete(key);
  return null;
}

function setCache(key, data) {
  apiCache.set(key, { data, timestamp: Date.now() });
  
  // Cleanup old cache entries to prevent memory leaks
  if (apiCache.size > 100) {
    const oldestKey = apiCache.keys().next().value;
    apiCache.delete(oldestKey);
  }
}

// Clear cache on media updates
bus.on('media:updated', () => {
  apiCache.clear();
});

bus.on('media:new', () => {
  apiCache.clear();
});

// ====================== APIs ======================
app.get('/api/stickers', async (req, res) => {
  try {
    const {
      q = '', page = '1', per_page = '60',
      tags = '', any_tag = '', nsfw = 'all', sort = 'newest'
    } = req.query;

    const allowNsfw = Boolean(req.user);
    const effectiveNsfw = allowNsfw ? nsfw : '0';

    const cacheKey = getCacheKey({ query: { ...req.query, nsfw: effectiveNsfw } });

    // Check cache first for non-random sorts
    if (sort !== 'random') {
      const cached = getFromCache(cacheKey);
      if (cached) {
        return res.json({ ...cached, nsfw_filter: effectiveNsfw, nsfw_locked: !allowNsfw });
      }
    }

    const result = await listMedia({
      q,
      page: parseInt(page, 10),
      perPage: parseInt(per_page, 10),
      tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [],
      anyTag: any_tag ? any_tag.split(',').map(s => s.trim()).filter(Boolean) : [],
      nsfw: effectiveNsfw,
      sort
    });

    if (Array.isArray(result?.results)) {
      result.results = result.results.map(fixMediaUrl);
    }

    // Cache the result for non-random sorts
    if (sort !== 'random') {
      setCache(cacheKey, result);
    }

    res.json({ ...result, nsfw_filter: effectiveNsfw, nsfw_locked: !allowNsfw });
  } catch (e) {
    console.error('[API] /api/stickers ERRO:', e);
    res.status(500).json({ error: 'internal_error', msg: e?.message });
  }
});

app.get('/api/stickers/:id', async (req, res) => {
  try {
    const row = await getMediaById(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (row.nsfw && !req.user) {
      return res.status(403).json({ error: 'login_required', message: 'Sticker NSFW requer usuário autenticado' });
    }
    fixMediaUrl(row);
    
    // Fetch tags for this sticker using db directly
    try {
      const tagsRows = await new Promise((resolve, reject) => {
        db.all(`
          SELECT t.name 
          FROM media_tags mt
          JOIN tags t ON t.id = mt.tag_id
          WHERE mt.media_id = ?
          ORDER BY t.name
        `, [row.id], (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
      row.tags = tagsRows.map(r => r.name);
    } catch (tagsError) {
      console.warn('[API] Error fetching tags for sticker', row.id, ':', tagsError);
      row.tags = [];
    }
    
    res.json(row);
  } catch (e) {
    console.error('[API] /api/stickers/:id ERRO:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/random', async (req, res) => {
  try {
    const { q = '', tag = null, nsfw = 'all' } = req.query;
    const allowNsfw = Boolean(req.user);
    const effectiveNsfw = allowNsfw ? nsfw : '0';
    const row = await getRandomMedia({ q, tag, nsfw: effectiveNsfw });
    if (!row) return res.status(404).json({ error: 'no_results' });
    fixMediaUrl(row);
    res.json({ ...row, nsfw_filter: effectiveNsfw, nsfw_locked: !allowNsfw });
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
    
    const media = await getMediaById(id);
    if (!media) return res.status(404).json({ error: 'media_not_found' });
    
    // Check if user can edit directly (admin or original sender)
    const canEdit = await canEditDirectly(req.user, id, req.user.id);
    
    if (canEdit) {
      // Direct edit - no approval needed
      const result = await setMediaTagsExact(id, tags);
      const updatedMedia = await getMediaById(id);
      bus.emit('media:tagsUpdated', { media_id: id, set: updatedMedia.tags });
      res.json({ ok: true, ...result, media: updatedMedia, direct_edit: true });
    } else {
      // Create pending edit request
      const currentTags = media.tags || [];
      const pendingEditId = await createPendingEdit(id, req.user.id, 'tags', currentTags, tags);
      res.json({ 
        ok: true, 
        pending_edit_id: pendingEditId, 
        requires_approval: true,
        message: 'Edit submitted for approval. Need 3 user votes or 1 admin approval.' 
      });
    }
  } catch (error) {
    console.error('Error in tags edit:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.patch('/api/stickers/:id', requireLogin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { description, nsfw } = req.body || {};
    const nsfwVal = (nsfw === 0 || nsfw === 1) ? nsfw : undefined;
    
    const media = await getMediaById(id);
    if (!media) return res.status(404).json({ error: 'media_not_found' });
    
    // Check if user can edit directly (admin or original sender)
    const canEdit = await canEditDirectly(req.user, id, req.user.id);
    
    if (canEdit) {
      // Direct edit - no approval needed
      const r = await updateMediaMeta(id, { description, nsfw: nsfwVal });
      if (!r.updated) return res.status(400).json({ error: 'nothing_to_update' });
      const updated = await getMediaById(id);
      bus.emit('media:updated', { id, fields: ['description','nsfw'] });
      res.json({ ok: true, media: updated, direct_edit: true });
    } else {
      // Create pending edit requests for each field that's being changed
      const pendingEdits = [];
      
      if (description !== undefined && description !== media.description) {
        const pendingEditId = await createPendingEdit(id, req.user.id, 'description', media.description, description);
        pendingEdits.push({ field: 'description', pending_edit_id: pendingEditId });
      }
      
      if (nsfwVal !== undefined && nsfwVal !== media.nsfw) {
        const pendingEditId = await createPendingEdit(id, req.user.id, 'nsfw', media.nsfw, nsfwVal);
        pendingEdits.push({ field: 'nsfw', pending_edit_id: pendingEditId });
      }
      
      if (pendingEdits.length === 0) {
        return res.status(400).json({ error: 'nothing_to_update' });
      }
      
      res.json({ 
        ok: true, 
        pending_edits: pendingEdits,
        requires_approval: true,
        message: 'Edits submitted for approval. Need 3 user votes or 1 admin approval for each change.' 
      });
    }
  } catch (error) {
    console.error('Error in media edit:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Gerar descrição via IA para um sticker (usuários logados)
app.post('/api/stickers/:id/generate-description', requireLogin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'invalid_id' });
    const media = await getMediaById(id);
    if (!media) return res.status(404).json({ error: 'not_found' });

    const filePath = media.file_path;
    if (!filePath) return res.status(400).json({ error: 'no_file_path' });

    // Load file buffer
    const absPath = filePath.startsWith('/') ? filePath : path.join(STICKERS_DIR || process.cwd(), filePath);
    if (!fs.existsSync(absPath)) {
      // Try located in STICKERS_DIR by basename
      const alt = path.join(STICKERS_DIR || process.cwd(), path.basename(filePath));
      if (fs.existsSync(alt)) {
        // use alt
        buffer = fs.readFileSync(alt);
      } else {
        return res.status(404).json({ error: 'file_not_found' });
      }
    }
    let buffer = fs.readFileSync(absPath);

    const aiService = require('../services/ai.js');
    let aiResult = null;
    try {
      if (media.mimetype && media.mimetype.includes('gif')) {
        aiResult = await aiService.getAiAnnotationsForGif(buffer);
      } else {
        aiResult = await aiService.getAiAnnotations(buffer);
      }
    } catch (aiErr) {
      console.error('[API] IA erro:', aiErr);
      return res.status(500).json({ error: 'ai_error', message: aiErr.message });
    }

    // Return suggestion (description, tags, text)
    res.json({ ok: true, suggestion: aiResult });
  } catch (e) {
    console.error('[API] /api/stickers/:id/generate-description ERRO:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// === APPROVAL SYSTEM ENDPOINTS ===

// Get pending edits (for approval interface)
app.get('/api/pending-edits', requireLogin, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const pendingEdits = await getPendingEdits(status);
    res.json({ ok: true, pending_edits: pendingEdits });
  } catch (error) {
    console.error('Error getting pending edits:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Get pending edits for a specific media item
app.get('/api/stickers/:id/pending-edits', requireLogin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pendingEdits = await getPendingEditsForMedia(id);
    res.json({ ok: true, pending_edits: pendingEdits });
  } catch (error) {
    console.error('Error getting pending edits for media:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Vote on a pending edit
app.post('/api/pending-edits/:id/vote', requireLogin, async (req, res) => {
  try {
    const pendingEditId = parseInt(req.params.id, 10);
    const { vote } = req.body || {};
    
    if (!['approve', 'reject'].includes(vote)) {
      return res.status(400).json({ error: 'invalid_vote' });
    }
    
    const pendingEdit = await getPendingEditById(pendingEditId);
    if (!pendingEdit) {
      return res.status(404).json({ error: 'pending_edit_not_found' });
    }
    
    if (pendingEdit.status !== 'pending') {
      return res.status(400).json({ error: 'edit_already_processed' });
    }
    
    // Users can't vote on their own edits
    if (pendingEdit.user_id === req.user.id) {
      return res.status(400).json({ error: 'cannot_vote_own_edit' });
    }
    
    await voteOnEdit(pendingEditId, req.user.id, vote);
    const voteCounts = await getVoteCounts(pendingEditId);
    
    // Check if we have enough votes to auto-approve/reject
    let autoProcessed = false;
    if (hasEnoughVotesToApprove(voteCounts)) {
      await approvePendingEdit(pendingEditId, req.user.id, 'approved');
      await applyPendingEdit(pendingEdit);
      autoProcessed = 'approved';
    } else if (hasEnoughVotesToReject(voteCounts)) {
      await approvePendingEdit(pendingEditId, req.user.id, 'rejected', 'Rejected by community votes');
      autoProcessed = 'rejected';
    }
    
    res.json({ 
      ok: true, 
      vote_counts: voteCounts,
      auto_processed: autoProcessed
    });
  } catch (error) {
    console.error('Error voting on pending edit:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Admin approve/reject pending edit
app.post('/api/pending-edits/:id/admin-decision', requireAdmin, async (req, res) => {
  try {
    const pendingEditId = parseInt(req.params.id, 10);
    const { decision, reason } = req.body || {};
    
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'invalid_decision' });
    }
    
    const pendingEdit = await getPendingEditById(pendingEditId);
    if (!pendingEdit) {
      return res.status(404).json({ error: 'pending_edit_not_found' });
    }
    
    if (pendingEdit.status !== 'pending') {
      return res.status(400).json({ error: 'edit_already_processed' });
    }
    
    const status = decision === 'approve' ? 'approved' : 'rejected';
    await approvePendingEdit(pendingEditId, req.user.id, status, reason);
    
    if (status === 'approved') {
      await applyPendingEdit(pendingEdit);
    }
    
    res.json({ ok: true, status });
  } catch (error) {
    console.error('Error in admin decision:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Helper function to apply approved edits
async function applyPendingEdit(pendingEdit) {
  const { media_id, edit_type, new_value } = pendingEdit;
  
  try {
    if (edit_type === 'tags') {
      await setMediaTagsExact(media_id, new_value);
      const media = await getMediaById(media_id);
      bus.emit('media:tagsUpdated', { media_id, set: media.tags });
    } else if (edit_type === 'description') {
      await updateMediaMeta(media_id, { description: new_value });
      bus.emit('media:updated', { id: media_id, fields: ['description'] });
    } else if (edit_type === 'nsfw') {
      await updateMediaMeta(media_id, { nsfw: new_value });
      bus.emit('media:updated', { id: media_id, fields: ['nsfw'] });
    }
  } catch (error) {
    console.error('Error applying pending edit:', error);
    throw error;
  }
}

app.delete('/api/stickers/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) {
      return res.status(400).json({ error: 'invalid_id' });
    }

    console.log(`[ADMIN] User ${req.user.username} is deleting sticker ID: ${id}`);

    // Use the existing deleteMediaByIds function
    const deletedCount = await deleteMediaByIds([id]);
    
    if (deletedCount === 0) {
      return res.status(404).json({ error: 'sticker_not_found' });
    }

    console.log(`[ADMIN] Successfully deleted sticker ID ${id}`);
    res.json({ success: true, deleted_count: deletedCount, sticker_id: id });
  } catch (error) {
    console.error('[ADMIN] Error deleting sticker:', error);
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

app.get('/api/rank/users', requireAdmin, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '50', 10), 500));
    const nsfw = String(req.query.nsfw || 'all').toLowerCase();
    const groupId = (req.query.group_id || '').trim() || null;

    const filters = [];
    const params = [];
    if (groupId) { filters.push('nm.group_id = ?'); params.push(groupId); }
    if (nsfw === 'safe') filters.push('nm.nsfw = 0');
    else if (nsfw === 'nsfw') filters.push('nm.nsfw = 1');
    const filtersSql = filters.length ? (' AND ' + filters.join(' AND ')) : '';

    const sql = `
      WITH inferred_mapping AS (
        SELECT lid, MAX(pn) AS pn
        FROM (
          SELECT
            CASE
              WHEN sender_id LIKE '%@lid' THEN sender_id
              WHEN chat_id LIKE '%@lid' THEN chat_id
              WHEN group_id LIKE '%@lid' THEN group_id
            END AS lid,
            CASE
              WHEN sender_id LIKE '%@s.whatsapp.net' OR sender_id LIKE '%@c.us' THEN sender_id
              WHEN chat_id LIKE '%@s.whatsapp.net' OR chat_id LIKE '%@c.us' THEN chat_id
              WHEN group_id LIKE '%@s.whatsapp.net' OR group_id LIKE '%@c.us' THEN group_id
            END AS pn
          FROM media
        )
        WHERE lid IS NOT NULL AND pn IS NOT NULL
        GROUP BY lid
      ),
      normalized_media AS (
        SELECT
          m.*,
          COALESCE(m.sender_id, m.chat_id, m.group_id) AS primary_id,
          CASE
            WHEN m.sender_id LIKE '%@lid' THEN m.sender_id
            WHEN m.chat_id LIKE '%@lid' THEN m.chat_id
            WHEN m.group_id LIKE '%@lid' THEN m.group_id
          END AS lid_in_row,
          CASE
            WHEN m.sender_id LIKE '%@s.whatsapp.net' OR m.sender_id LIKE '%@c.us' THEN m.sender_id
            WHEN m.chat_id LIKE '%@s.whatsapp.net' OR m.chat_id LIKE '%@c.us' THEN m.chat_id
            WHEN m.group_id LIKE '%@s.whatsapp.net' OR m.group_id LIKE '%@c.us' THEN m.group_id
          END AS pn_in_row
        FROM media m
      ),
      resolved AS (
        SELECT
          CASE
            WHEN nm.lid_in_row IS NOT NULL THEN
              COALESCE(
                NULLIF(lm.pn, ''),
                im.pn,
                nm.pn_in_row,
                nm.lid_in_row
              )
            WHEN nm.pn_in_row IS NOT NULL THEN nm.pn_in_row
            ELSE nm.primary_id
          END AS effective_sender,
          nm.group_id,
          nm.chat_id,
          nm.nsfw
        FROM normalized_media nm
        LEFT JOIN lid_mapping lm ON nm.lid_in_row IS NOT NULL AND lm.lid = nm.lid_in_row
        LEFT JOIN inferred_mapping im ON nm.lid_in_row IS NOT NULL AND im.lid = nm.lid_in_row
        WHERE nm.primary_id IS NOT NULL 
          AND nm.primary_id <> ''
          AND NOT (
            COALESCE(nm.sender_id, nm.chat_id) LIKE '%bot%' OR
            (nm.sender_id = nm.chat_id AND nm.group_id IS NULL)
          )
          ${filtersSql}
      )
      SELECT
        (
          SELECT COALESCE(NULLIF(TRIM(c.display_name), ''), '')
          FROM contacts c
          WHERE REPLACE(REPLACE(LOWER(TRIM(c.sender_id)), '@s.whatsapp.net',''),'@c.us','') =
                REPLACE(REPLACE(LOWER(TRIM(r.effective_sender)), '@s.whatsapp.net',''),'@c.us','')
          ORDER BY c.updated_at DESC
          LIMIT 1
        ) AS display_name,
        r.effective_sender AS sender_id,
        MAX(r.group_id) AS group_id,
        COUNT(*) AS sticker_count,
        CASE WHEN r.effective_sender LIKE '%@g.us' THEN 1 ELSE 0 END as is_group
      FROM resolved r
      GROUP BY r.effective_sender
      HAVING r.effective_sender IS NOT NULL AND r.effective_sender <> '' AND r.effective_sender LIKE '%@%'
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
// Função para gerar expressão CRON para intervalos de 5,10,15,30,45,60 minutos
function buildCronExpr(start, end, interval) {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  let minutes = [];
  let hours = [];

  // Gera lista de horários válidos
  for (let h = startH; h <= endH; h++) {
    let minStart = (h === startH) ? startM : 0;
    let minEnd = (h === endH) ? endM : 59;
    for (let m = minStart; m <= minEnd; m += interval) {
      minutes.push(m);
      hours.push(h);
    }
  }

  // Remove duplicatas e ordena
  minutes = [...new Set(minutes)].sort((a, b) => a - b);
  hours = [...new Set(hours)].sort((a, b) => a - b);

  // Se cobre todas as horas e minutos, pode simplificar
  if (minutes.length === 60 / interval && hours.length === (endH - startH + 1)) {
    return `${minutes.join(',')} ${hours.join(',')} * * *`;
  }

  // Exemplo: "0,15,30,45 8-21 * * *"
  return `${minutes.join(',')} ${hours.join(',')} * * *`;
}

// Endpoint para configuração de agendamento do bot
app.get('/api/admin/bot-config/schedule', requireAdmin, async (req, res) => {
  const start = await getBotConfig('auto_send_start') || '08:00';
  const end = await getBotConfig('auto_send_end') || '21:00';
  const interval = await getBotConfig('auto_send_interval') || '60';
  const cronExpr = await getBotConfig('auto_send_cron') || buildCronExpr(start, end, Number(interval));
  res.json({ start, end, interval, cron: cronExpr });
});

app.post('/api/admin/bot-config/schedule', requireAdmin, express.json(), async (req, res) => {
  const { start, end, interval } = req.body;
  const validIntervals = [5, 10, 15, 30, 45, 60];
  if (!start || !end || !interval) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
  }
  if (!validIntervals.includes(Number(interval))) {
    return res.status(400).json({ error: 'Intervalo inválido.' });
  }
  const cronExpr = buildCronExpr(start, end, Number(interval));
  console.log(`[WEB] new schedule requested: start=${start} end=${end} interval=${interval} -> cron='${cronExpr}'`);
  await setBotConfig('auto_send_start', start);
  await setBotConfig('auto_send_end', end);
  await setBotConfig('auto_send_interval', interval);
  const cronSaveRes = await setBotConfig('auto_send_cron', cronExpr);
  console.log('[WEB] setBotConfig auto_send_cron result:', cronSaveRes);
  // Emit an event so the running scheduler can reload immediately
  try {
    const { bus } = require('./eventBus.js');
    bus.emit('bot:scheduleUpdated', cronExpr);
  } catch (e) {
    console.warn('[WEB] eventBus emit failed:', e.message);
  }
  // Return the computed cron expression so UI and other services can display it
  res.json({ ok: true, cron: cronExpr });
});

app.get('/api/admin/bot-config/delete-threshold', requireAdmin, async (req, res) => {
  try {
    const stored = await getBotConfig('delete_vote_threshold');
    const parsed = Number(stored);
    const threshold = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : DEFAULT_DELETE_VOTE_THRESHOLD;
    res.json({ threshold });
  } catch (error) {
    console.error('[WEB] Erro ao carregar limiar de exclusão:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/admin/bot-config/delete-threshold', requireAdmin, express.json(), async (req, res) => {
  try {
    const { threshold } = req.body || {};
    const parsed = Number(threshold);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
      return res.status(400).json({ error: 'invalid_threshold', message: 'O limiar deve estar entre 1 e 10.' });
    }

    const finalValue = Math.floor(parsed);
    await setBotConfig('delete_vote_threshold', String(finalValue));

    try {
      invalidateVoteThresholdCache();
    } catch (cacheError) {
      console.warn('[WEB] Não foi possível invalidar cache de limiar:', cacheError?.message || cacheError);
    }

    res.json({ ok: true, threshold: finalValue });
  } catch (error) {
    console.error('[WEB] Erro ao salvar limiar de exclusão:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Temporary debug endpoint (token-protected) to inspect persisted bot config and process identity
// Usage: /api/debug/bot-config?token=YOUR_TOKEN
app.get('/api/debug/bot-config', async (req, res) => {
  try {
    const token = req.query.token;
    const ourToken = process.env.DEBUG_BOT_CONFIG_TOKEN;
    if (!ourToken || token !== ourToken) return res.status(403).json({ error: 'forbidden' });
    const start = await getBotConfig('auto_send_start');
    const end = await getBotConfig('auto_send_end');
    const interval = await getBotConfig('auto_send_interval');
    const cronExpr = await getBotConfig('auto_send_cron');
    return res.json({ pid: process.pid, start, end, interval, cron: cronExpr });
  } catch (e) {
    return res.status(500).json({ error: 'internal_error', msg: e.message });
  }
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
      let base = path.basename(c);
      if (!base.includes('.') && row?.mimetype) {
        if (row.mimetype === 'image/webp') base += '.webp';
        else if (row.mimetype === 'video/mp4') base += '.mp4';
      }
      
      // Check main STICKERS_DIR first
      const abs = path.join(STICKERS_DIR, base);
      if (fs.existsSync(abs)) {
        row.url = '/media/' + base;
        return row;
      }
      
      // Check if file is in bot/media directory
      const botMediaPath = path.join(BOT_MEDIA_DIR, base);
      if (fs.existsSync(botMediaPath)) {
        row.url = '/bot/media/' + base;
        return row;
      }
     
      // Check if file is in any old-stickers directory
      for (const dir of OLD_STICKERS_DIRS) {
        const oldStickersPath = path.join(dir, base);
        if (fs.existsSync(oldStickersPath)) {
          row.url = '/media/old-stickers/' + base;
          return row;
        }
      }
      
      // If the original file_path contains directory structure, try to match it
      if (c.includes('/')) {
        // For paths like '<PROJECT_ROOT>/storage/media/bot/filename.webp'
        if (c.includes('/bot/media/')) {
          const filename = path.basename(c);
          const botMediaFullPath = path.join(BOT_MEDIA_DIR, filename);
          if (fs.existsSync(botMediaFullPath)) {
            row.url = '/bot/media/' + filename;
            return row;
          }
        }
        
        // For paths like '<PROJECT_ROOT>/media/old-stickers/filename.webp'
        if (c.includes('/old-stickers/')) {
          const filename = path.basename(c);
          for (const dir of OLD_STICKERS_DIRS) {
            const oldStickersFullPath = path.join(dir, filename);
            if (fs.existsSync(oldStickersFullPath)) {
              row.url = '/media/old-stickers/' + filename;
              return row;
            }
          }
        }
      }
    }

    if (row?.url?.startsWith('/media/old-stickers/')) {
      const base = path.basename(row.url);
      const found = OLD_STICKERS_DIRS.some((dir) => fs.existsSync(path.join(dir, base)));
      if (!found) {
        console.warn('[MEDIA] Arquivo (old-stickers) não encontrado para URL:', row.url, 'id:', row?.id, 'file_path:', row?.file_path);
      }
    } else if (row?.url?.startsWith('/media/')) {
      const base = path.basename(row.url);
      const abs = path.join(STICKERS_DIR, base);
      if (!fs.existsSync(abs)) {
        console.warn('[MEDIA] Arquivo não encontrado no disco para URL:', row.url, 'id:', row?.id, 'file_path:', row?.file_path);
      }
    }
  } catch (e) {
    console.error('[MEDIA] Erro ao fixar URL:', e, 'row.id:', row?.id);
  }
  return row;
}

// Global error handler - logs rich context to help debug 500s (including DELETE)
app.use((err, req, res, _next) => {
  // Handle CSRF errors explicitly to return 403 instead of being treated as 500
  if (err && (err.code === 'EBADCSRFTOKEN' || (err.status === 403 && /csrf/i.test(String(err.message || ''))))) {
    try {
      console.warn('[SECURITY] Invalid CSRF token - method=%s url=%s ip=%s user=%s',
        req.method, req.originalUrl, req.ip, (req.user && req.user.username) || 'anon');
    } catch (logErr) {
      console.warn('[SECURITY] Invalid CSRF token and failed to log context:', logErr);
    }

    if (req.xhr || (req.originalUrl && req.originalUrl.startsWith('/api/'))) {
      return res.status(403).json({ error: 'invalid_csrf', message: 'Invalid CSRF token' });
    }
    return res.status(403).send('Forbidden - Invalid CSRF token');
  }

  try {
    const safeHeaders = { ...req.headers };
    if (safeHeaders.cookie) safeHeaders.cookie = '[REDACTED]';

    console.error('[ERROR] Unhandled error - method=%s url=%s user=%s',
      req.method, req.originalUrl, (req.user && req.user.username) || 'anon');
    const formatError = require('../utils/formatError');
    console.error('[ERROR] Error message:', err && err.message);
    console.error('[ERROR] Stack:', formatError(err));
    console.error('[ERROR] Request body:', req.body);
    console.error('[ERROR] Request headers (safe):', safeHeaders);
  } catch (logErr) {
    // If logging itself fails, ensure we still output both errors
    console.error('[ERROR] Failed to log error context:', logErr);
  }

  // Respond as JSON for API calls, otherwise plain text
  if (req.xhr || (req.originalUrl && req.originalUrl.startsWith('/api/'))) {
    return res.status(500).json({ error: 'internal_error', message: err?.message });
  }

  res.status(500).send('Internal Server Error');
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
