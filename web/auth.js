const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { db } = require('../database/index.js');

// JWT secret (fallback em desenvolvimento)
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret-change-me';
// Tempo de expiração padrão (7 dias)
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Implementação antiga usava Map em memória. Mantemos somente para tokens legados emitidos
// antes da migração (se ainda houver). Assim evitamos quebrar sessões ativas durante deploy.
const legacySessions = new Map(); // sid -> sessão (LEGADO)
const ADMIN_USERS = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim()).filter(Boolean);

// Rate limiter for login endpoint
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: 'too_many_attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Cookie name selection: __Host-sid in production for security, sid otherwise
const getCookieName = () => {
  return process.env.NODE_ENV === 'production' ? '__Host-sid' : 'sid';
};

function authMiddleware(app) {
  // cookieParser is already called in server.js
  app.use(async (req, _res, next) => {
    try {
      console.log('[DEBUG] Auth middleware - Path:', req.path, 'Cookies:', Object.keys(req.cookies || {}));
      const cookieName = getCookieName();
      console.log('[DEBUG] Looking for cookie:', cookieName);
      // Lê ambos para retrocompatibilidade
      const raw = req.cookies[cookieName] || (process.env.NODE_ENV === 'production' ? req.cookies.sid : undefined);
      console.log('[DEBUG] Raw token found:', !!raw, raw ? 'Length: ' + raw.length : 'No token');

      if (raw) {
        // 1) Tenta interpretar como JWT novo
        const parts = String(raw).split('.');
        if (parts.length === 3) {
          try {
            const payload = jwt.verify(raw, JWT_SECRET);
            // Busca usuário para confirmar role e (futuramente) token_version
            await new Promise((resolve) => {
              db.get(`SELECT id, username, role, COALESCE(token_version,0) AS token_version FROM users WHERE id = ?`, [payload.uid], (err, row) => {
                if (!err && row && row.token_version === (payload.tv || 0)) {
                  req.user = { id: row.id, username: row.username, role: row.role };
                }
                resolve();
              });
            });
          } catch (e) {
            // Silencioso: token inválido/expirado => não autentica
          }
        } else if (legacySessions.has(raw)) {
          // 2) Sessão legado
          const sess = legacySessions.get(raw);
          sess.lastSeen = Date.now();
          req.user = { id: sess.userId, username: sess.username, role: sess.role };
        }
      }

      if (!req.user && process.env.ADMIN_AUTOLOGIN_DEBUG === '1') {
        // Check both parsed cookies and raw header
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
}

function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  const u = req.user;
  
  // Handle ADMIN_AUTOLOGIN_DEBUG if req.user is not set
  if (!u && process.env.ADMIN_AUTOLOGIN_DEBUG === '1') {
    const debugUser = req.cookies?.DEBUG_USER || 
      (req.headers.cookie && req.headers.cookie.match(/DEBUG_USER=([^;]+)/)?.[1]);
    
    if (debugUser === 'admin') {
      return next();
    }
  }
  
  if (u && (u.role === 'admin' || ADMIN_USERS.includes(u.username))) return next();
  return res.status(403).json({ error: 'forbidden' });
}

function registerAuthRoutes(app) {
  app.post('/api/login', loginRateLimit, (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing_credentials' });
    
    db.get(
      `SELECT id, username, password_hash, role, status, email_confirmed, COALESCE(must_change_password, 0) AS must_change_password, COALESCE(token_version,0) as token_version
       FROM users WHERE username = ?`,
      [username],
      async (err, row) => {
        if (err) {
          console.error('[AUTH] /api/login db error:', err);
          return res.status(500).json({ error: 'db_error' });
        }
        if (!row) return res.status(401).json({ error: 'invalid_credentials' });
        
        // Check if user is approved
        if (row.status !== 'approved' && row.role !== 'admin') {
          return res.status(403).json({ 
            error: 'account_not_approved', 
            message: row.status === 'pending' ? 'Sua conta está aguardando aprovação.' : 'Sua conta foi rejeitada.'
          });
        }
        
        // Check if email is confirmed (only for non-admin users)
        if (row.role !== 'admin' && !row.email_confirmed) {
          return res.status(403).json({ 
            error: 'email_not_confirmed', 
            message: 'Confirme seu email antes de fazer login.'
          });
        }
        
        const ok = await bcrypt.compare(password, row.password_hash);
        if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  const payload = { uid: row.id, username: row.username, role: row.role, tv: row.token_version || 0 };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const cookieName = getCookieName();
  const cookieOptions = { httpOnly: true, sameSite: 'lax', path: '/' };
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;
  res.cookie(cookieName, token, cookieOptions);
        res.json({ username: row.username, role: row.role, must_change_password: !!row.must_change_password });
      }
    );
  });

  app.post('/api/logout', (req, res) => {
    const cookieName = getCookieName();
    // Invalidação baseada em versão: incrementa token_version do usuário autenticado
    if (req.user && req.user.id) {
      db.run(`UPDATE users SET token_version = COALESCE(token_version,0) + 1 WHERE id = ?`, [req.user.id], () => {
        res.clearCookie(cookieName, { path: '/' });
        if (process.env.NODE_ENV === 'production') res.clearCookie('sid', { path: '/' });
        res.json({ ok: true });
      });
    } else {
      res.clearCookie(cookieName, { path: '/' });
      if (process.env.NODE_ENV === 'production') res.clearCookie('sid', { path: '/' });
      res.json({ ok: true });
    }
  });

  // Debug-only: auto-login as initial admin when enabled via env var
  // Use GET to avoid CSRF token requirement on POST (debug only)
  app.get('/api/admin/_debug/auto-login', (req, res) => {
    if (process.env.ADMIN_AUTOLOGIN_DEBUG !== '1') {
      return res.status(404).json({ error: 'not_enabled' });
    }
    const adminUser = process.env.ADMIN_INITIAL_USERNAME || process.env.ADMIN_INITIAL_USERNAME;
    if (!adminUser) return res.status(400).json({ error: 'missing_admin_username' });

    db.get(`SELECT id, username, role, COALESCE(token_version,0) AS token_version FROM users WHERE username = ? LIMIT 1`, [adminUser], (err, row) => {
      if (err) return res.status(500).json({ error: 'db_error', details: err.message });
      if (!row) return res.status(404).json({ error: 'admin_not_found' });
      if (row.role !== 'admin') return res.status(403).json({ error: 'not_admin' });
      const payload = { uid: row.id, username: row.username, role: row.role, tv: row.token_version || 0 };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      const cookieName = getCookieName();
      const cookieOptions = { httpOnly: true, sameSite: 'lax', path: '/' };
      if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;
      res.cookie(cookieName, token, cookieOptions);
      // Also set a DEBUG_USER cookie for client-side debug fallback
      try {
        res.cookie('DEBUG_USER', row.username, { path: '/', sameSite: 'lax' });
      } catch (e) {}
      res.json({ ok: true, username: row.username });
    });
  });

  app.get('/api/me', (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json({ user: req.user });
  });
}

// Limpa sessões inativas > 24h
setInterval(() => {
  const now = Date.now();
  for (const [sid, sess] of sessions) {
    if (now - sess.lastSeen > 1000 * 60 * 60 * 24) {
      sessions.delete(sid);
    }
  }
}, 1000 * 60 * 30);

module.exports = {
  authMiddleware,
  registerAuthRoutes,
  requireLogin,
  requireAdmin
};