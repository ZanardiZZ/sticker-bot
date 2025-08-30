/**
 * CSRF Protection Middleware
 * Provides protection against Cross-Site Request Forgery attacks
 */

const csrf = require('csrf');

function createCSRFMiddleware() {
  const tokens = new csrf();
  
  return (req, res, next) => {
    // Skip CSRF for safe methods and API endpoints that use other auth
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    // Skip for certain API endpoints that use alternative auth
    const skipPaths = [
      '/api/admin/logs/stream', // SSE endpoint
      '/api/captcha', // Already has CAPTCHA protection
      '/login', // Login form (needs special handling)
      '/register', // Registration form
    ];
    
    if (skipPaths.some(path => req.path.includes(path))) {
      return next();
    }

    // Initialize CSRF secret in session if not present
    if (!req.session.csrfSecret) {
      req.session.csrfSecret = tokens.secretSync();
    }

    // Generate token for the current session
    const token = tokens.create(req.session.csrfSecret);
    
    // Make token available to templates
    res.locals.csrfToken = token;

    // For POST/PUT/DELETE requests, verify the token
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      const submittedToken = req.body._csrf || req.headers['x-csrf-token'];
      
      if (!submittedToken || !tokens.verify(req.session.csrfSecret, submittedToken)) {
        const error = new Error('Invalid CSRF token');
        error.code = 'EBADCSRFTOKEN';
        error.status = 403;
        return next(error);
      }
    }

    next();
  };
}

function getCSRFToken(req, res) {
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = new csrf().secretSync();
  }
  
  const tokens = new csrf();
  return tokens.create(req.session.csrfSecret);
}

module.exports = {
  createCSRFMiddleware,
  getCSRFToken
};