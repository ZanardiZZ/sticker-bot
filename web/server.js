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
const session = require('express-session');
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

const { db, findDuplicateMedia, getDuplicateMediaDetails, deleteDuplicateMedia, deleteMediaByIds, getDuplicateStats } = require('../database.js');

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
        `INSERT INTO users (username, password_hash, role, status, must_change_password, created_at, password_updated_at)
         VALUES (?, ?, 'admin', 'approved', 1, ?, NULL)
         ON CONFLICT(username) DO UPDATE SET role='admin', status='approved', must_change_password=1`,
        [username, hash, Date.now()],
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
const emailService = require('./emailService.js');
console.timeEnd('[BOOT] requires');

const PORT = process.env.PORT || 3000;

const ROOT_DIR = path.resolve(__dirname, '..');
const STICKERS_DIR = process.env.STICKERS_DIR || path.join(ROOT_DIR, 'media');
console.log('[WEB] STICKERS_DIR:', STICKERS_DIR, 'exists:', fs.existsSync(STICKERS_DIR));
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.resolve(__dirname, 'public');
console.log('[WEB] PUBLIC_DIR:', PUBLIC_DIR, 'exists:', fs.existsSync(PUBLIC_DIR));
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Session middleware for CAPTCHA
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000, // 10 minutes
    httpOnly: true
  }
}));

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

// ========= CAPTCHA API =========
app.get('/api/captcha', (req, res) => {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  const operation = Math.random() < 0.5 ? 'add' : 'subtract';
  
  let question, answer;
  if (operation === 'add') {
    question = `${num1} + ${num2}`;
    answer = num1 + num2;
  } else {
    // Make sure we don't get negative results
    const bigger = Math.max(num1, num2);
    const smaller = Math.min(num1, num2);
    question = `${bigger} - ${smaller}`;
    answer = bigger - smaller;
  }
  
  const sessionId = require('crypto').randomBytes(16).toString('hex');
  
  // Store CAPTCHA answer in session
  req.session.captcha = {
    answer: answer,
    session: sessionId,
    created: Date.now()
  };
  
  res.json({
    question: question,
    session: sessionId
  });
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
  if (!req.session || !req.session.captcha || req.session.captcha.session !== captchaSession) {
    return res.status(400).json({ error: 'invalid_captcha_session' });
  }
  
  if (parseInt(captchaAnswer) !== req.session.captcha.answer) {
    return res.status(400).json({ error: 'invalid_captcha' });
  }
  
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
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof email !== 'string' || !emailRegex.test(email)) {
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
          
          // Generate email confirmation token
          const confirmationToken = emailService.generateConfirmationToken();
          const confirmationExpires = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
          
          // Hash password and create user
          try {
            const passwordHash = await bcrypt.hash(password, 12);
            const now = Date.now();
            
            db.run(`
              INSERT INTO users (username, password_hash, phone_number, email, role, status, can_edit, must_change_password, created_at, email_confirmed, email_confirmation_token, email_confirmation_expires)
              VALUES (?, ?, ?, ?, 'user', 'pending', 0, 0, ?, 0, ?, ?)
            `, [username.toLowerCase(), passwordHash, phoneNumber, email.toLowerCase(), now, confirmationToken, confirmationExpires], async function(err3) {
              if (err3) {
                console.error('[REGISTER] DB error creating user:', err3);
                return res.status(500).json({ error: 'db_error' });
              }
              
              console.log(`[REGISTER] New user registered: ${username} (email: ${email}, phone: ${phoneNumber})`);
              
              // Send confirmation email
              const emailSent = await emailService.sendConfirmationEmail(email, username, confirmationToken);
              
              res.status(201).json({ 
                success: true,
                message: emailSent ? 
                  'Cadastro realizado com sucesso! Verifique seu email para confirmar sua conta.' :
                  'Cadastro realizado com sucesso! Aguarde aprovação (email de confirmação não pôde ser enviado).',
                userId: this.lastID,
                emailSent: emailSent
              });
            });
          } catch (hashErr) {
            console.error('[REGISTER] Error hashing password:', hashErr);
            res.status(500).json({ error: 'db_error' });
          }
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

// ========= User Management APIs =========
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
      c.display_name as contact_display_name
    FROM users u
    LEFT JOIN users approver ON u.approved_by = approver.id
    LEFT JOIN contacts c ON c.sender_id = u.phone_number
  `;
  
  const params = [];
  
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
  
  db.run(`
    UPDATE users 
    SET status = ?, approved_at = ?, approved_by = ?
    WHERE id = ? AND status = 'pending'
  `, [status, now, approverId, id], function(err) {
    if (err) {
      console.error('[ADMIN] Error updating user status:', err);
      return res.status(500).json({ error: 'db_error' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'user_not_found_or_not_pending' });
    }
    
    console.log(`[ADMIN] User ${id} ${status} by ${req.user.username}`);
    res.json({ success: true, status, approved_at: now });
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

// Delete duplicate media (auto-keep oldest)
app.delete('/api/admin/duplicates/:hashVisual', requireAdmin, async (req, res) => {
  try {
    const { hashVisual } = req.params;
    const keepOldest = req.query.keepOldest !== 'false'; // Default to true
    
    console.log(`[ADMIN] User ${req.user.username} is deleting duplicates for hash ${hashVisual}`);
    
    const deletedCount = await deleteDuplicateMedia(hashVisual, keepOldest);
    
    console.log(`[ADMIN] Deleted ${deletedCount} duplicate media for hash ${hashVisual}`);
    res.json({ deleted_count: deletedCount, hash_visual: hashVisual });
    
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

// Simple in-memory cache for API responses
const apiCache = new Map();
const CACHE_DURATION = 30000; // 30 seconds

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
    const cacheKey = getCacheKey(req);
    
    // Check cache first for non-random sorts
    if (req.query.sort !== 'random') {
      const cached = getFromCache(cacheKey);
      if (cached) {
        return res.json(cached);
      }
    }
    
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

    // Cache the result for non-random sorts
    if (sort !== 'random') {
      setCache(cacheKey, result);
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