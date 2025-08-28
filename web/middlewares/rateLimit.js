/**
 * Rate limiting middleware
 */

const rateLimit = require('express-rate-limit');

/**
 * Helper function to get client IP from request
 * @param {object} req - Express request object
 * @returns {string} Client IP address
 */
function clientIp(req) {
  return (req.ip || '').replace(/^::ffff:/, '');
}

/**
 * Creates main rate limiter for general API endpoints
 */
function createMainRateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    max = 120, // max requests per window
    skipPaths = ['/api/admin', '/admin']
  } = options;

  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => clientIp(req),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => skipPaths.some(path => req.path.startsWith(path))
  });
}

/**
 * Creates login rate limiter for authentication endpoints
 */
function createLoginRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 10, // 10 attempts per window
    message = { error: 'too_many_attempts' }
  } = options;

  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Creates registration rate limiter for signup endpoints
 */
function createRegistrationRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 3, // 3 registration attempts per window
    message = { error: 'too_many_registration_attempts' }
  } = options;

  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

module.exports = {
  createMainRateLimiter,
  createLoginRateLimiter,
  createRegistrationRateLimiter,
  clientIp
};