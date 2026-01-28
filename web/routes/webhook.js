/**
 * GitHub Webhook Route
 * Handles auto-deployment when code is pushed to main branch
 */
const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const router = express.Router();

// Webhook secret from GitHub (set in .env)
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

// Services to restart after deployment (order matters)
const SERVICES_TO_RESTART = [
  'baileys-bridge',  // WebSocket bridge primeiro
  'sticker-bot',     // Bot principal
  'web-interface'    // Web interface por último
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
 * Executes git pull and restarts services
 * @returns {Promise<Object>} - Deployment result
 */
async function executeDeploy() {
  const results = {
    timestamp: new Date().toISOString(),
    steps: []
  };

  try {
    // Step 1: Git pull
    console.log('[Webhook] Executando git pull...');
    const { stdout: pullOutput, stderr: pullError } = await execAsync('git pull origin main');
    results.steps.push({
      step: 'git_pull',
      success: true,
      output: pullOutput,
      error: pullError || null
    });

    // Check if there were actual changes
    if (pullOutput.includes('Already up to date')) {
      console.log('[Webhook] Nenhuma mudança detectada');
      results.upToDate = true;
      return results;
    }

    console.log('[Webhook] Código atualizado:', pullOutput);

    // Step 2: Install dependencies (if package.json changed)
    if (pullOutput.includes('package.json') || pullOutput.includes('package-lock.json')) {
      console.log('[Webhook] Instalando dependências...');
      const { stdout: npmOutput, stderr: npmError } = await execAsync('npm ci --production');
      results.steps.push({
        step: 'npm_install',
        success: true,
        output: npmOutput,
        error: npmError || null
      });
    }

    // Step 3: Restart services
    for (const service of SERVICES_TO_RESTART) {
      console.log(`[Webhook] Reiniciando ${service}...`);
      try {
        const { stdout } = await execAsync(`pm2 restart ${service}`);
        results.steps.push({
          step: `restart_${service}`,
          success: true,
          output: stdout
        });

        // Wait a bit between restarts
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.error(`[Webhook] Erro ao reiniciar ${service}:`, err.message);
        results.steps.push({
          step: `restart_${service}`,
          success: false,
          error: err.message
        });
      }
    }

    // Step 4: Verify services are running
    console.log('[Webhook] Verificando status dos serviços...');
    const { stdout: statusOutput } = await execAsync('pm2 jlist');
    const processes = JSON.parse(statusOutput);

    results.services = processes
      .filter(p => SERVICES_TO_RESTART.includes(p.name))
      .map(p => ({
        name: p.name,
        status: p.pm2_env.status,
        uptime: p.pm2_env.pm_uptime,
        restarts: p.pm2_env.restart_time
      }));

    results.success = true;
    console.log('[Webhook] ✅ Deploy concluído com sucesso');

  } catch (err) {
    console.error('[Webhook] ❌ Erro durante deploy:', err.message);
    results.success = false;
    results.error = err.message;
  }

  return results;
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

    // Execute deployment (async, don't wait)
    res.json({
      message: 'Deployment started',
      commits: commits.length,
      branch: 'main'
    });

    // Run deployment in background
    executeDeploy().then(result => {
      console.log('[Webhook] Resultado do deploy:', JSON.stringify(result, null, 2));
    }).catch(err => {
      console.error('[Webhook] Deploy falhou:', err);
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
