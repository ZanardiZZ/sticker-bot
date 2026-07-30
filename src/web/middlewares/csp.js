/** Content Security Policy middleware */
function createCSPMiddleware(options = {}) {
  const { umamiOrigin = process.env.UMAMI_ORIGIN || 'https://analytics.zanardizz.uk', allowCfInsights = process.env.ALLOW_CF_INSIGHTS === '1' } = options;
  return (req, res, next) => {
    const scriptSrc = ["'self'", umamiOrigin, 'https://sdk.mercadopago.com'];
    const connectSrc = ["'self'", umamiOrigin, 'https://api.mercadopago.com'];
    const frameSrc = ['https://*.mercadopago.com', 'https://*.mercadolibre.com'];
    if (allowCfInsights) {
      scriptSrc.push('https://static.cloudflareinsights.com');
      connectSrc.push('https://cloudflareinsights.com', 'https://*.cloudflareinsights.com');
    }
    const csp = [
      `default-src 'self'`,
      `img-src 'self' data: https://*.mercadopago.com https://*.mercadolibre.com`,
      `style-src 'self' 'unsafe-inline'`,
      `script-src ${scriptSrc.join(' ')}`,
      `connect-src ${connectSrc.join(' ')}`,
      `frame-src ${frameSrc.join(' ')}`
    ].join('; ');
    res.setHeader('Content-Security-Policy', csp);
    next();
  };
}
module.exports = createCSPMiddleware;
