/**
 * Middleware index - exports all middleware modules
 */

const createCSPMiddleware = require('./csp');
const rateLimitMiddleware = require('./rateLimit');
const { createRequestLogger } = require('./requestLogger');
const { createIPRulesMiddleware } = require('./ipRules');
const { createCSRFMiddleware, getCSRFToken, shouldSkipCSRF } = require('./csrf');

module.exports = {
  createCSPMiddleware,
  ...rateLimitMiddleware,
  createRequestLogger,
  createIPRulesMiddleware,
  createCSRFMiddleware,
  getCSRFToken,
  shouldSkipCSRF
};
