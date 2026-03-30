/**
 * CSRF Protection Middleware
 * Provides protection against Cross-Site Request Forgery attacks
 */

const csrf = require('csrf');

// Reuse a single token generator for the process
const tokens = new csrf();
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function ensureSecret(req) {
  if (!req.session) {
    throw new Error('Session middleware is required before CSRF protection middleware');
  }
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync();
  }
  return req.session.csrfSecret;
}

function defaultSkip(req) {
  const method = (req.method || '').toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return true;
  }

  const path = req.path || req.originalUrl || '';

  if (method === 'POST' && (path === '/api/login' || path === '/api/register')) {
    return true;
  }

  if (path.startsWith('/api/debug/')) {
    return true;
  }

  if (path.startsWith('/api/admin/')) {
    return true;
  }

  if (path === '/api/captcha' || path.startsWith('/api/captcha/')) {
    return true;
  }

  if (path === '/login' || path === '/register') {
    return true;
  }

  return false;
}

function attachTokenHelpers(req, res) {
  let cachedToken;
  const targetRes = res || {};
  targetRes.locals = targetRes.locals || {};
  req.csrfToken = () => {
    const secret = ensureSecret(req);
    cachedToken = cachedToken || tokens.create(secret);
    return cachedToken;
  };
  targetRes.locals.csrfToken = req.csrfToken();
  return targetRes.locals.csrfToken;
}

function createCSRFMiddleware(options = {}) {
  const { skip = defaultSkip } = options;

  return (req, res, next) => {
    try {
      attachTokenHelpers(req, res);

      if (typeof skip === 'function' && skip(req)) {
        return next();
      }

      const method = (req.method || '').toUpperCase();
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        return next();
      }

      const secret = ensureSecret(req);
      const submittedToken = req.body?._csrf || req.get('x-csrf-token') || req.get('x-xsrf-token');

      if (!submittedToken || !tokens.verify(secret, submittedToken)) {
        const error = new Error('Invalid CSRF token');
        error.code = 'EBADCSRFTOKEN';
        error.status = 403;
        return next(error);
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function getCSRFToken(req, res) {
  return attachTokenHelpers(req, res);
}

module.exports = {
  createCSRFMiddleware,
  getCSRFToken
};
