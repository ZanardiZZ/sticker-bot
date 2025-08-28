/**
 * Middleware index - exports all middleware modules
 */

const createCSPMiddleware = require('./csp');
const rateLimitMiddleware = require('./rateLimit');
const { createRequestLogger } = require('./requestLogger');
const { createIPRulesMiddleware } = require('./ipRules');

module.exports = {
  createCSPMiddleware,
  ...rateLimitMiddleware,
  createRequestLogger,
  createIPRulesMiddleware
};