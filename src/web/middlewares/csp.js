/**
 * Content Security Policy middleware
 */

function createCSPMiddleware(options = {}) {
  const {
    umamiOrigin = process.env.UMAMI_ORIGIN || 'https://analytics.zanardizz.uk',
    allowCfInsights = process.env.ALLOW_CF_INSIGHTS === '1'
  } = options;

  return (req, res, next) => {
    const scriptSrc = ["'self'", umamiOrigin];
    const connectSrc = ["'self'", umamiOrigin];

    if (allowCfInsights) {
      scriptSrc.push('https://static.cloudflareinsights.com');
      // o beacon do CF usa cloudflareinsights.com (sem "static.")
      connectSrc.push('https://cloudflareinsights.com', 'https://*.cloudflareinsights.com');
    }

    // Estilos inline já usados na UI
    const csp = [
      `default-src 'self'`,
      `img-src 'self' data:`,
      `style-src 'self' 'unsafe-inline'`,
      `script-src ${scriptSrc.join(' ')}`,
      `connect-src ${connectSrc.join(' ')}`
    ].join('; ');

    res.setHeader('Content-Security-Policy', csp);
    next();
  };
}

module.exports = createCSPMiddleware;