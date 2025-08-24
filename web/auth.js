const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { db } = require('../database.js');

const sessions = new Map(); // sid -> sessão
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
  app.use(cookieParser());
  app.use((req, _res, next) => {
    // Read both cookie names for backward compatibility
    const cookieName = getCookieName();
    let sid = req.cookies[cookieName];
    
    // Fallback to 'sid' for backward compatibility in production
    if (!sid && process.env.NODE_ENV === 'production') {
      sid = req.cookies.sid;
    }
    
    if (sid && sessions.has(sid)) {
      const sess = sessions.get(sid);
      sess.lastSeen = Date.now();
      req.user = { id: sess.userId, username: sess.username, role: sess.role };
    }
    next();
  });
}

function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  const u = req.user;
  if (u && (u.role === 'admin' || ADMIN_USERS.includes(u.username))) return next();
  return res.status(403).json({ error: 'forbidden' });
}

function registerAuthRoutes(app) {
  app.post('/api/login', loginRateLimit, (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing_credentials' });
    db.get(
      `SELECT id, username, password_hash, role, COALESCE(must_change_password, 0) AS must_change_password
       FROM users WHERE username = ?`,
      [username],
      async (err, row) => {
        if (err) {
          console.error('[AUTH] /api/login db error:', err);
          return res.status(500).json({ error: 'db_error' });
        }
        if (!row) return res.status(401).json({ error: 'invalid_credentials' });
        const ok = await bcrypt.compare(password, row.password_hash);
        if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
        const sid = uuidv4();
        sessions.set(sid, {
          userId: row.id,
          username: row.username,
          role: row.role,
          createdAt: Date.now(),
          lastSeen: Date.now()
        });
        
        const cookieName = getCookieName();
        const cookieOptions = {
          httpOnly: true,
          sameSite: 'lax',
          path: '/'
        };
        
        // Force secure in production
        if (process.env.NODE_ENV === 'production') {
          cookieOptions.secure = true;
        }
        
        res.cookie(cookieName, sid, cookieOptions);
        res.json({ username: row.username, role: row.role, must_change_password: !!row.must_change_password });
      }
    );
  });

  app.post('/api/logout', (req, res) => {
    const cookieName = getCookieName();
    let sid = req.cookies[cookieName];
    
    // Fallback to 'sid' for backward compatibility in production
    if (!sid && process.env.NODE_ENV === 'production') {
      sid = req.cookies.sid;
    }
    
    if (sid) sessions.delete(sid);
    
    // Clear both cookies for safety
    res.clearCookie(cookieName, { path: '/' });
    if (process.env.NODE_ENV === 'production') {
      res.clearCookie('sid', { path: '/' });
    }
    
    res.json({ ok: true });
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