#!/usr/bin/env node

const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..', '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const LOG_DIR = path.join(ROOT, 'storage', 'logs');
const WATCHDOG_LOG = path.join(LOG_DIR, 'health-watchdog.log');
const PM2_ERROR_LOG = '/home/dev/.pm2/logs/WS-Socket-Server-error.log';
const STATE_FILE = path.join(ROOT, 'storage', 'logs', 'health-watchdog.state.json');

const REQUIRED_APPS = ['WS-Socket-Server', 'Bot-Client', 'WebServer'];
const PM2_BIN = process.env.PM2_BIN || 'pm2';
const WEB_PORT = Number(process.env.HEALTH_WEB_PORT || 3001);
const WEBHOOK_PATH = process.env.HEALTH_WEBHOOK_PATH || '/webhook/status';
const ERROR_SCAN_LINES = Number(process.env.HEALTH_ERROR_SCAN_LINES || 300);
const DETACHED_FRAME_THRESHOLD = Number(process.env.HEALTH_DETACHED_FRAME_THRESHOLD || 3);

const ALERT_ENABLED = process.env.HEALTH_ALERT_ENABLED !== 'false';
const ALERT_CHAT_CANDIDATES = [
  process.env.HEALTH_ALERT_WHATSAPP_JID,
  process.env.ADMIN_NUMBER
].map((v) => (v || '').trim()).filter(Boolean);
const ALERT_WS_URL = process.env.HEALTH_ALERT_WS_URL || 'ws://127.0.0.1:8765';
const ALERT_WS_TOKEN = process.env.HEALTH_ALERT_WS_TOKEN || process.env.BAILEYS_WS_TOKEN || 'dev';
const ALERT_COOLDOWN_SEC = Number(process.env.HEALTH_ALERT_COOLDOWN_SEC || 300);

function ts() {
  return new Date().toISOString();
}

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(level, message, extra = {}) {
  const payload = {
    ts: ts(),
    level,
    message,
    ...extra
  };
  const line = `${JSON.stringify(payload)}\n`;
  fs.appendFileSync(WATCHDOG_LOG, line);
  if (level === 'error' || level === 'warn') {
    console.error(`[watchdog:${level}] ${message}`);
  } else {
    console.log(`[watchdog:${level}] ${message}`);
  }
}

function runPm2(args) {
  const output = execFileSync(PM2_BIN, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return output;
}

function getPm2List() {
  const raw = runPm2(['jlist']);
  return JSON.parse(raw);
}

function tailLines(filePath, lines) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const arr = content.split(/\r?\n/).filter(Boolean);
  return arr.slice(-Math.max(1, lines));
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function readNewErrorLogLines(filePath, state, fallbackTailLines = 120) {
  if (!fs.existsSync(filePath)) return { lines: [], nextState: state };

  const stats = fs.statSync(filePath);
  const lastOffset = Number(state.log?.lastOffset || 0);
  const sameInode = state.log?.ino && Number(state.log.ino) === Number(stats.ino);
  const canDeltaRead = sameInode && stats.size >= lastOffset;

  let content = '';
  if (canDeltaRead) {
    const fd = fs.openSync(filePath, 'r');
    try {
      const len = stats.size - lastOffset;
      const buffer = Buffer.alloc(Math.max(0, len));
      if (len > 0) {
        fs.readSync(fd, buffer, 0, len, lastOffset);
        content = buffer.toString('utf8');
      }
    } finally {
      fs.closeSync(fd);
    }
  } else {
    content = tailLines(filePath, fallbackTailLines).join('\n');
  }

  const lines = content.split(/\r?\n/).filter(Boolean);
  return {
    lines,
    nextState: {
      ...state,
      log: {
        ino: Number(stats.ino),
        lastOffset: Number(stats.size),
        updatedAt: Date.now()
      }
    }
  };
}

function countDetachedFrameErrors(lines) {
  let count = 0;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes('attempted to use detached frame') ||
      lower.includes('execution context was destroyed') ||
      lower.includes('target closed')
    ) {
      count += 1;
    }
  }
  return count;
}

function checkWebhookStatus() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: WEB_PORT,
        path: WEBHOOK_PATH,
        timeout: 6000
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve({ ok: false, reason: `status_${res.statusCode}`, body });
            return;
          }
          try {
            const parsed = JSON.parse(body || '{}');
            const active = parsed?.status === 'active';
            resolve({ ok: active, reason: active ? 'active' : 'inactive', body: parsed });
          } catch {
            resolve({ ok: false, reason: 'invalid_json', body });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });

    req.on('error', (err) => {
      resolve({ ok: false, reason: `request_error:${err.message}` });
    });
  });
}

async function sendWhatsAppAlertToChat(chatId, text) {
  if (!ALERT_ENABLED) return { sent: false, reason: 'alert_disabled' };
  if (!chatId) return { sent: false, reason: 'missing_alert_chat_id' };

  return new Promise((resolve) => {
    const ws = new WebSocket(ALERT_WS_URL);
    const requestId = `health-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ sent: false, reason: 'ws_timeout' });
    }, 10000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'register', token: ALERT_WS_TOKEN, chats: ['*'] }));
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.type === 'registered') {
        ws.send(JSON.stringify({
          type: 'sendText',
          requestId,
          chatId,
          text
        }));
        return;
      }

      if (msg.requestId !== requestId) return;

      if (msg.type === 'messageSent' || msg.type === 'ack') {
        clearTimeout(timer);
        finish({ sent: true, reason: 'ok' });
        return;
      }

      if (msg.type === 'error') {
        clearTimeout(timer);
        finish({ sent: false, reason: msg.error || msg.message || 'send_error' });
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      finish({ sent: false, reason: `ws_error:${err.message}` });
    });

    ws.on('close', () => {
      clearTimeout(timer);
      if (!settled) {
        finish({ sent: false, reason: 'ws_closed' });
      }
    });
  });
}

async function sendWhatsAppAlert(text) {
  if (!ALERT_CHAT_CANDIDATES.length) {
    return { sent: false, reason: 'missing_alert_chat_id' };
  }

  let lastFailure = { sent: false, reason: 'unknown' };
  for (const chatId of ALERT_CHAT_CANDIDATES) {
    const result = await sendWhatsAppAlertToChat(chatId, text);
    if (result.sent) {
      return { ...result, chatId };
    }
    lastFailure = { ...result, chatId };
  }
  return lastFailure;
}

function canNotify(state, key) {
  const now = Date.now();
  const alerts = state.alerts || {};
  const lastAt = Number(alerts[key] || 0);
  return (now - lastAt) >= (ALERT_COOLDOWN_SEC * 1000);
}

function markNotified(state, key) {
  return {
    ...state,
    alerts: {
      ...(state.alerts || {}),
      [key]: Date.now()
    }
  };
}

async function notifyIfNeeded(state, key, text) {
  if (!canNotify(state, key)) {
    return { state, sent: false, reason: 'cooldown' };
  }

  const result = await sendWhatsAppAlert(text);
  if (!result.sent) {
    log('warn', 'failed to send WhatsApp health alert', { key, reason: result.reason });
    return { state, sent: false, reason: result.reason };
  }

  log('info', 'WhatsApp health alert sent', { key });
  return { state: markNotified(state, key), sent: true, reason: 'ok' };
}

function formatAlert(title, details) {
  return [
    '🚨 *Sticker Bot Health Alert*',
    `• ${title}`,
    `• host: ${require('os').hostname()}`,
    `• when: ${new Date().toLocaleString('pt-BR')}`,
    details ? `• details: ${details}` : ''
  ].filter(Boolean).join('\n');
}

async function restartApp(appName, reason, state) {
  runPm2(['restart', appName, '--update-env']);
  log('warn', `pm2 restart executed for ${appName}`, { reason });

  const key = `restart:${appName}:${reason.split(':')[0]}`;
  const alertText = formatAlert(`restart automático em ${appName}`, reason);
  const out = await notifyIfNeeded(state, key, alertText);
  return out.state;
}

async function main() {
  ensureLogDir();
  let state = loadState();

  if (process.env.HEALTH_ALERT_TEST === 'true') {
    const out = await notifyIfNeeded(
      state,
      'test:manual',
      formatAlert('teste manual do watchdog', 'canal de alerta WhatsApp operacional')
    );
    state = out.state;
    saveState(state);
    return;
  }

  let pm2List;
  try {
    pm2List = getPm2List();
  } catch (err) {
    log('error', 'failed to load pm2 list', { error: err.message });
    const out = await notifyIfNeeded(
      state,
      'error:pm2_list',
      formatAlert('falha ao consultar PM2', err.message)
    );
    saveState(out.state);
    process.exitCode = 1;
    return;
  }

  const appMap = new Map(pm2List.map((app) => [app.name, app]));

  for (const appName of REQUIRED_APPS) {
    const app = appMap.get(appName);
    if (!app) {
      log('warn', 'required app missing in pm2 list', { appName });
      const out = await notifyIfNeeded(
        state,
        `missing:${appName}`,
        formatAlert(`serviço ausente no PM2: ${appName}`, 'não encontrado na lista do PM2')
      );
      state = out.state;
      continue;
    }

    const status = app?.pm2_env?.status;
    if (status !== 'online') {
      state = await restartApp(appName, `status=${status || 'unknown'}`, state);
    }
  }

  const webhook = await checkWebhookStatus();
  if (!webhook.ok) {
    state = await restartApp('WebServer', `webhook:${webhook.reason}`, state);
    log('warn', 'webhook healthcheck failed; restarted WebServer', { reason: webhook.reason });

    const out = await notifyIfNeeded(
      state,
      `webhook:${webhook.reason}`,
      formatAlert('falha no healthcheck /webhook/status', webhook.reason)
    );
    state = out.state;
  } else {
    log('info', 'webhook healthcheck ok', { status: webhook.reason });
  }

  const errorDelta = readNewErrorLogLines(PM2_ERROR_LOG, state, ERROR_SCAN_LINES);
  state = errorDelta.nextState;
  const detachedCount = countDetachedFrameErrors(errorDelta.lines);

  if (detachedCount >= DETACHED_FRAME_THRESHOLD) {
    state = await restartApp('WS-Socket-Server', `detached_frame_count=${detachedCount}`, state);
    log('warn', 'detached frame threshold reached; restarted WS-Socket-Server', {
      detachedCount,
      scanLines: ERROR_SCAN_LINES
    });

    const out = await notifyIfNeeded(
      state,
      'error:detached-frame',
      formatAlert('erros detached frame acima do limiar', `count=${detachedCount}, threshold=${DETACHED_FRAME_THRESHOLD}`)
    );
    state = out.state;
  } else {
    log('info', 'detached frame check ok', { detachedCount, scanLines: ERROR_SCAN_LINES });
  }

  saveState(state);
}

main().catch(async (err) => {
  ensureLogDir();
  let state = loadState();
  log('error', 'watchdog crashed', { error: err.message });
  const out = await notifyIfNeeded(
    state,
    'error:watchdog-crashed',
    formatAlert('watchdog falhou', err.message)
  );
  state = out.state;
  saveState(state);
  process.exitCode = 1;
});
