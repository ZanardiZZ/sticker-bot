/**
 * GitHub Webhook Route
 * Handles auto-deployment when code is pushed to main branch
 */
const express = require('express');
const crypto = require('crypto');

const router = express.Router();

// Webhook secret from GitHub (set in .env)
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

// Services to restart after deployment (order matters)
const SERVICES_TO_RESTART = [
  'WS-Socket-Server-Baileys', // WebSocket bridge Baileys primeiro
  'Bot-Client',        // Bot principal
  'WebServer'          // Web interface por último
];

/**
 * Verifies GitHub webhook signature
 * @param {string} signature - X-Hub-Signature-256 header
 * @param {string} body - Raw request body
 * @returns {boolean}
 */
function verifyGitHubSignature(signature, body) {
  if (!WEBHOOK_SECRET) {
    console.warn('[Webhook] GITHUB_WEBHOOK_SECRET not configured, skipping verification');
    return true; // Allow if not configured (development mode)
  }

  if (!signature) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(body).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

/**
 * POST /webhook/github
 * Receives GitHub webhook events
 */
router.post('/github', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('[Webhook] Recebido webhook do GitHub');

  try {
    // Verify signature
    const signature = req.headers['x-hub-signature-256'];
    const body = req.body.toString('utf8');

    if (!verifyGitHubSignature(signature, body)) {
      console.warn('[Webhook] ❌ Assinatura inválida');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse payload
    const payload = JSON.parse(body);
    const event = req.headers['x-github-event'];

    console.log(`[Webhook] Evento: ${event}, Ref: ${payload.ref}`);

    // Only process push events to main branch
    if (event !== 'push') {
      console.log('[Webhook] Ignorando evento não-push');
      return res.json({ message: 'Event ignored (not a push)' });
    }

    if (payload.ref !== 'refs/heads/main') {
      console.log('[Webhook] Ignorando push em branch diferente de main');
      return res.json({ message: 'Branch ignored (not main)' });
    }

    // Extract commit info
    const commits = payload.commits || [];
    const lastCommit = commits[commits.length - 1];

    console.log(`[Webhook] Push de ${payload.pusher?.name}: ${commits.length} commit(s)`);
    if (lastCommit) {
      console.log(`[Webhook] Último commit: ${lastCommit.message}`);
    }

    console.log('[Webhook] Deploy é controlado pelo GitHub Actions após o CI; webhook apenas confirmou o evento');
    return res.json({
      message: 'Push acknowledged; deployment waits for successful CI',
      commits: commits.length,
      branch: 'main'
    });

  } catch (err) {
    console.error('[Webhook] Erro ao processar webhook:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /webhook/status
 * Check webhook endpoint status
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'active',
    webhook_secret_configured: !!WEBHOOK_SECRET,
    services: SERVICES_TO_RESTART
  });
});

module.exports = router;
