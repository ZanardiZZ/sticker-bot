/**
 * Setup wizard routes
 * Only accessible when SETUP_MODE=true
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Middleware: só permite acesso se SETUP_MODE=true
function requireSetupMode(req, res, next) {
  if (process.env.SETUP_MODE !== 'true') {
    return res.redirect('/login');
  }
  next();
}

// Initialize session data if not exists
function initSetupSession(req) {
  if (!req.session.setupData) {
    req.session.setupData = {};
  }
  if (!req.session.setupStep) {
    req.session.setupStep = 1;
  }
}

// GET /setup - Main wizard page
router.get('/setup', requireSetupMode, (req, res) => {
  initSetupSession(req);
  res.sendFile(path.join(__dirname, '../public/setup.html'));
});

// GET /setup/status - Check setup status
router.get('/setup/status', requireSetupMode, (req, res) => {
  initSetupSession(req);

  res.json({
    setupMode: true,
    currentStep: req.session.setupStep || 1,
    hasData: Object.keys(req.session.setupData || {}).length > 0
  });
});

// POST /setup/whatsapp - Step 1: Configure WhatsApp
router.post('/setup/whatsapp', requireSetupMode, async (req, res) => {
  try {
    initSetupSession(req);

    const { groupId, adminNumber } = req.body;

    // Validations
    if (!groupId || !groupId.trim()) {
      return res.status(400).json({ error: 'Group ID is required' });
    }

    if (!groupId.endsWith('@g.us')) {
      return res.status(400).json({ error: 'Invalid group ID format. Must end with @g.us' });
    }

    if (!adminNumber || !adminNumber.trim()) {
      return res.status(400).json({ error: 'Admin number is required' });
    }

    if (!adminNumber.includes('@')) {
      return res.status(400).json({ error: 'Invalid admin number format. Must include @ (e.g., 5511999999999@c.us)' });
    }

    // Save to session
    req.session.setupData = {
      ...req.session.setupData,
      AUTO_SEND_GROUP_ID: groupId.trim(),
      ADMIN_NUMBER: adminNumber.trim(),
      BOT_WHATSAPP_NUMBER: adminNumber.replace('@c.us', '').replace('@s.whatsapp.net', '')
    };
    req.session.setupStep = 2;

    res.json({
      success: true,
      nextStep: 2,
      message: 'WhatsApp configuration saved'
    });

  } catch (error) {
    console.error('[Setup] WhatsApp error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /setup/admin - Step 2: Create admin account
router.post('/setup/admin', requireSetupMode, async (req, res) => {
  try {
    initSetupSession(req);

    const { username, password } = req.body;

    // Validations
    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, underscore and dash' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check password strength
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasUpper || !hasLower || !hasNumber) {
      return res.status(400).json({
        error: 'Password must contain uppercase, lowercase and numbers'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Save to session
    req.session.setupData = {
      ...req.session.setupData,
      ADMIN_INITIAL_USERNAME: username.trim(),
      ADMIN_INITIAL_PASSWORD: passwordHash
    };
    req.session.setupStep = 3;

    res.json({
      success: true,
      nextStep: 3,
      message: 'Admin account configured'
    });

  } catch (error) {
    console.error('[Setup] Admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /setup/features - Step 3: Optional features
router.post('/setup/features', requireSetupMode, async (req, res) => {
  try {
    initSetupSession(req);

    const {
      openaiKey,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpSecure,
      timezone
    } = req.body;

    // Validate OpenAI key if provided
    if (openaiKey && openaiKey.trim()) {
      if (!openaiKey.startsWith('sk-')) {
        return res.status(400).json({ error: 'Invalid OpenAI API key format' });
      }
    }

    // Save to session
    req.session.setupData = {
      ...req.session.setupData,
      ...(openaiKey && openaiKey.trim() && { OPENAI_API_KEY: openaiKey.trim() }),
      ...(smtpHost && smtpHost.trim() && { SMTP_HOST: smtpHost.trim() }),
      ...(smtpPort && { SMTP_PORT: smtpPort }),
      ...(smtpUser && smtpUser.trim() && { SMTP_USER: smtpUser.trim() }),
      ...(smtpPass && smtpPass.trim() && { SMTP_PASS: smtpPass.trim() }),
      ...(smtpSecure !== undefined && { SMTP_SECURE: smtpSecure }),
      TIMEZONE: timezone || 'America/Sao_Paulo'
    };
    req.session.setupStep = 4;

    res.json({
      success: true,
      nextStep: 4,
      message: 'Features configured'
    });

  } catch (error) {
    console.error('[Setup] Features error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /setup/summary - Get configuration summary
router.get('/setup/summary', requireSetupMode, (req, res) => {
  initSetupSession(req);

  const data = req.session.setupData || {};

  res.json({
    whatsapp: {
      groupId: data.AUTO_SEND_GROUP_ID || '',
      adminNumber: data.ADMIN_NUMBER || '',
      botNumber: data.BOT_WHATSAPP_NUMBER || ''
    },
    admin: {
      username: data.ADMIN_INITIAL_USERNAME || ''
    },
    features: {
      hasOpenAI: !!data.OPENAI_API_KEY,
      hasSMTP: !!data.SMTP_HOST,
      timezone: data.TIMEZONE || 'America/Sao_Paulo'
    }
  });
});

// POST /setup/finalize - Complete setup
router.post('/setup/finalize', requireSetupMode, async (req, res) => {
  try {
    initSetupSession(req);

    const setupData = req.session.setupData;

    // Validate we have minimum required data
    if (!setupData.AUTO_SEND_GROUP_ID || !setupData.ADMIN_NUMBER || !setupData.ADMIN_INITIAL_USERNAME) {
      return res.status(400).json({
        error: 'Missing required configuration. Please complete all steps.'
      });
    }

    console.log('[Setup] Finalizing setup...');

    // 1. Generate .env file
    const envContent = generateEnvFile(setupData);
    const envPath = path.join(__dirname, '../../.env');
    await fs.writeFile(envPath, envContent);
    console.log('[Setup] ✓ Created .env file');

    // 2. Run migrations
    try {
      const { runMigrations } = require('../../database/migrations/runner');
      if (typeof runMigrations === 'function') {
        await runMigrations();
        console.log('[Setup] ✓ Ran migrations');
      }
    } catch (migErr) {
      console.warn('[Setup] ⚠ Migration skipped:', migErr.message);
    }

    // 3. Create admin user in database
    try {
      await createAdminUser(
        setupData.ADMIN_INITIAL_USERNAME,
        setupData.ADMIN_INITIAL_PASSWORD
      );
      console.log('[Setup] ✓ Created admin user');
    } catch (userErr) {
      console.error('[Setup] ✗ Failed to create admin user:', userErr);
      return res.status(500).json({
        error: 'Failed to create admin user: ' + userErr.message
      });
    }

    // 4. Clear setup mode from environment
    delete process.env.SETUP_MODE;

    // 5. Clear session
    req.session.destroy();

    console.log('[Setup] ✓ Setup completed successfully!');

    // Return success
    res.json({
      success: true,
      message: 'Setup completed! Restarting services...',
      redirectTo: '/login'
    });

    // Schedule server restart (give time for response to send)
    setTimeout(() => {
      console.log('[Setup] Restarting server...');
      process.exit(0); // PM2 or systemd will restart automatically
    }, 2000);

  } catch (error) {
    console.error('[Setup] Finalize error:', error);
    res.status(500).json({
      error: 'Setup failed: ' + error.message
    });
  }
});

/**
 * Generate .env file content from setup data
 */
function generateEnvFile(data) {
  const secrets = {
    session: crypto.randomBytes(32).toString('hex'),
    jwt: crypto.randomBytes(32).toString('hex')
  };

  return `# Generated by Sticker Bot Setup Wizard
# ${new Date().toISOString()}

# ===== WHATSAPP CONFIGURATION =====
AUTO_SEND_GROUP_ID=${data.AUTO_SEND_GROUP_ID}
ADMIN_NUMBER=${data.ADMIN_NUMBER}
BOT_WHATSAPP_NUMBER=${data.BOT_WHATSAPP_NUMBER}

# ===== WEB INTERFACE =====
PORT=${data.PORT || 3000}
WEB_SERVER_URL=${data.WEB_SERVER_URL || 'http://localhost:3000'}

# ===== ADMIN ACCOUNT =====
ADMIN_INITIAL_USERNAME=${data.ADMIN_INITIAL_USERNAME}
ADMIN_INITIAL_PASSWORD=${data.ADMIN_INITIAL_PASSWORD}

# ===== SECURITY =====
SESSION_SECRET=${secrets.session}
JWT_SECRET=${secrets.jwt}
JWT_EXPIRES_IN=7d

# ===== BAILEYS WEBSOCKET =====
BAILEYS_WS_PORT=8765
BAILEYS_WS_URL=ws://localhost:8765
BAILEYS_ALLOWED_TOKENS=dev
BAILEYS_CLIENT_TOKEN=dev
BAILEYS_AUTH_DIR=auth_info_baileys

# ===== TIMEZONE =====
TIMEZONE=${data.TIMEZONE || 'America/Sao_Paulo'}

# ===== AI SERVICES (OPTIONAL) =====
${data.OPENAI_API_KEY ? `OPENAI_API_KEY=${data.OPENAI_API_KEY}` : '# OPENAI_API_KEY='}

# ===== EMAIL SERVICE (OPTIONAL) =====
${data.SMTP_HOST ? `SMTP_HOST=${data.SMTP_HOST}` : '# SMTP_HOST='}
${data.SMTP_PORT ? `SMTP_PORT=${data.SMTP_PORT}` : '# SMTP_PORT=587'}
${data.SMTP_USER ? `SMTP_USER=${data.SMTP_USER}` : '# SMTP_USER='}
${data.SMTP_PASS ? `SMTP_PASS=${data.SMTP_PASS}` : '# SMTP_PASS='}
${data.SMTP_SECURE !== undefined ? `SMTP_SECURE=${data.SMTP_SECURE}` : '# SMTP_SECURE=false'}

# ===== ANALYTICS =====
ENABLE_INTERNAL_ANALYTICS=true

# ===== HISTORY RECOVERY =====
HISTORY_RECOVERY_ENABLED=true
HISTORY_BATCH_SIZE=10
HISTORY_MAX_MESSAGES=50

# ===== ADVANCED =====
DISABLE_MULTIFRAME_WEBP_ANALYSIS=false
`;
}

/**
 * Create admin user in database
 */
async function createAdminUser(username, passwordHash) {
  return new Promise((resolve, reject) => {
    // Get database connection
    let db;
    try {
      const dbModule = require('../../database/connection');
      db = dbModule.db;
    } catch (err) {
      return reject(new Error('Database not available: ' + err.message));
    }

    if (!db) {
      return reject(new Error('Database connection not found'));
    }

    const timestamp = Math.floor(Date.now() / 1000);

    db.run(
      `INSERT OR REPLACE INTO users (username, password_hash, role, status, created_at)
       VALUES (?, ?, 'admin', 'approved', ?)`,
      [username, passwordHash, timestamp],
      (err) => {
        if (err) {
          reject(new Error('Failed to insert user: ' + err.message));
        } else {
          resolve();
        }
      }
    );
  });
}

module.exports = router;
