/**
 * Routes index - registers all route modules
 */

const createAccountRoutes = require('./account');
const createCaptchaRoutes = require('./captcha');

/**
 * Registers all API routes with the Express app
 * @param {object} app - Express app instance
 * @param {object} db - Database instance
 */
function registerRoutes(app, db) {
  // Register route modules
  app.use('/api', createAccountRoutes(db));
  app.use('/api', createCaptchaRoutes());
  
  // TODO: Add other route modules:
  // - Registration routes
  // - Admin routes  
  // - Media/sticker routes
  // - Analytics routes
}

module.exports = { registerRoutes };