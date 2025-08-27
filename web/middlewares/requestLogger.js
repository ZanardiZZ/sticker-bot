/**
 * Request logging middleware for analytics
 */

const { clientIp } = require('./rateLimit');

/**
 * Creates request logger middleware
 * @param {object} db - Database instance
 * @param {object} options - Logging options
 * @returns {function} Express middleware function
 */
function createRequestLogger(db, options = {}) {
  const {
    enableAnalytics = process.env.ENABLE_INTERNAL_ANALYTICS === '1',
    skipPaths = ['/media', '/figurinhas']
  } = options;

  if (!enableAnalytics) {
    return (req, res, next) => next(); // No-op middleware
  }

  return function requestLogger(req, res, next) {
    const start = process.hrtime.bigint();
    const ip = clientIp(req);
    const ua = req.headers['user-agent'] || '';
    const ref = req.headers['referer'] || req.headers['referrer'] || '';
    const userId = req.user?.id || null;

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1e6;
      const row = {
        ts: Date.now(),
        ip,
        path: req.path,
        method: req.method,
        status: res.statusCode,
        duration_ms: Math.round(durationMs),
        referrer: ref?.slice(0, 500) || null,
        user_agent: ua?.slice(0, 500) || null,
        user_id: userId
      };
      
      // Skip logging for static assets
      if (skipPaths.some(path => req.path.startsWith(path))) return;
      
      db.run(
        `INSERT INTO request_log (ts, ip, path, method, status, duration_ms, referrer, user_agent, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.ts, row.ip, row.path, row.method, row.status, row.duration_ms, row.referrer, row.user_agent, row.user_id]
      );
    });
    next();
  };
}

module.exports = { createRequestLogger };