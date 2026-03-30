/**
 * IP rules middleware for blocklist/allowlist functionality
 */

const { clientIp } = require('./rateLimit');

/**
 * Helper function to check if a rule is still active
 * @param {object} rule - IP rule object
 * @returns {boolean} True if rule is active
 */
function isRuleActive(rule) {
  return !rule.expires_at || rule.expires_at > Date.now();
}

/**
 * Creates IP rules middleware for blocklist/allowlist functionality
 * @param {object} db - Database instance
 * @param {object} options - Options
 * @returns {function} Express middleware function
 */
function createIPRulesMiddleware(db, options = {}) {
  const {
    enableAnalytics = process.env.ENABLE_INTERNAL_ANALYTICS === '1'
  } = options;

  if (!enableAnalytics) {
    return (req, res, next) => next(); // No-op middleware
  }

  return async function ipRulesMiddleware(req, res, next) {
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
  };
}

module.exports = { createIPRulesMiddleware };