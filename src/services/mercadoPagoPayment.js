const crypto = require('crypto');
const { dbHandler } = require('../database/connection');
const { normalizeJid } = require('../utils/jidUtils');

const MP_API_BASE = 'https://api.mercadopago.com';
const PLAN_DAYS = Math.max(Number(process.env.PUBLIC_DM_ENTITLEMENT_DAYS) || 30, 1);

function normalizeIdentity(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return normalizeJid(raw) || raw.toLowerCase(); } catch (_) { return raw.toLowerCase(); }
}

function variants(value) {
  const normalized = normalizeIdentity(value);
  const bare = normalized.replace(/@[^@]+$/, '');
  return [...new Set([normalized, bare].filter(Boolean))];
}

function getConfig() {
  const amountCents = Number(process.env.MERCADOPAGO_ACCESS_AMOUNT_CENTS || 0);
  const environment = String(process.env.MERCADOPAGO_ENVIRONMENT || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
  return {
    environment,
    apiBase: String(process.env.MERCADOPAGO_API_BASE || MP_API_BASE).replace(/\/$/, ''),
    accessToken: String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim(),
    publicKey: String(process.env.MERCADOPAGO_PUBLIC_KEY || '').trim(),
    webhookSecret: String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim(),
    amountCents: Number.isInteger(amountCents) && amountCents > 0 ? amountCents : 0,
    planDays: PLAN_DAYS,
    statementDescriptor: String(process.env.MERCADOPAGO_STATEMENT_DESCRIPTOR || 'ZZ BOT').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 22),
    itemTitle: String(process.env.MERCADOPAGO_ITEM_TITLE || 'Acesso Sticker Browser').trim().slice(0, 120),
    itemCategoryId: String(process.env.MERCADOPAGO_ITEM_CATEGORY_ID || 'digital_goods').trim().slice(0, 60),
    itemDescription: String(process.env.MERCADOPAGO_ITEM_DESCRIPTION || 'Acesso digital ao Sticker Browser por ' + PLAN_DAYS + ' dias').trim().slice(0, 256),
    shipping: {
      cityName: String(process.env.MERCADOPAGO_SHIPPING_CITY || '').trim(),
      zipCode: String(process.env.MERCADOPAGO_SHIPPING_ZIP_CODE || '').trim(),
      stateName: String(process.env.MERCADOPAGO_SHIPPING_STATE || '').trim()
    },
    baseUrl: String(process.env.WEB_SERVER_URL || process.env.BASE_URL || '').replace(/\/$/, '')
  };
}

function isConfigured() {
  const c = getConfig();
  return Boolean(c.accessToken && c.publicKey && c.amountCents > 0 && c.baseUrl);
}

function run(sql, params = []) { return dbHandler.run(sql, params); }
function all(sql, params = []) { return dbHandler.all(sql, params); }
function get(sql, params = []) { return dbHandler.get(sql, params); }
function rawRun(sql, params = []) {
  return new Promise((resolve, reject) => dbHandler.db.run(sql, params, function onRun(err) {
    if (err) return reject(err);
    resolve({ changes: this.changes, lastID: this.lastID });
  }));
}
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function nowSeconds() { return Math.floor(Date.now() / 1000); }
function money(cents) { return (Number(cents) / 100).toFixed(2); }
function safeJson(value) { try { return JSON.stringify(value).slice(0, 20000); } catch (_) { return null; } }

async function ensureTables() {
  await rawRun(`CREATE TABLE IF NOT EXISTS payment_access_tokens (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
    used_at INTEGER, created_at INTEGER NOT NULL
  )`);
  await rawRun(`CREATE TABLE IF NOT EXISTS payment_orders (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL,
    provider_order_id TEXT UNIQUE, idempotency_key TEXT NOT NULL UNIQUE,
    external_reference TEXT NOT NULL UNIQUE, amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL, provider_status TEXT, provider_status_detail TEXT,
    provider_response_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE(token_hash, status)
  )`);
  await rawRun(`CREATE TABLE IF NOT EXISTS payment_webhook_events (
    event_key TEXT PRIMARY KEY, provider TEXT NOT NULL, provider_order_id TEXT,
    status TEXT NOT NULL, error_code TEXT, received_at INTEGER NOT NULL,
    processed_at INTEGER
  )`);
  await rawRun(`CREATE TABLE IF NOT EXISTS dm_entitlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, provider TEXT NOT NULL,
    provider_order_id TEXT NOT NULL UNIQUE, provider_payment_id TEXT, status TEXT NOT NULL,
    amount_cents INTEGER NOT NULL, granted_at INTEGER, expires_at INTEGER,
    updated_at INTEGER NOT NULL, UNIQUE(provider, provider_payment_id)
  )`);
}

async function createAccessLink(userId) {
  if (!isConfigured()) return null;
  await ensureTables();
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(rawToken);
  const now = nowSeconds();
  await run('INSERT INTO payment_access_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', [tokenHash, normalizeIdentity(userId), now + 15 * 60, now]);
  const base = getConfig().baseUrl;
  return `${base}/acesso.html?token=${encodeURIComponent(rawToken)}`;
}

async function getTokenContext(rawToken) {
  const tokenHash = sha256(String(rawToken || ''));
  if (!rawToken || String(rawToken).length < 32) return null;
  const row = await get('SELECT * FROM payment_access_tokens WHERE token_hash = ? AND expires_at > ?', [tokenHash, nowSeconds()]);
  return row ? { ...row, tokenHash } : null;
}

function extractPayment(order) {
  const transactions = order?.transactions || {};
  const payments = Array.isArray(transactions.payments) ? transactions.payments : [];
  return payments[0] || null;
}

function mapStatus(order) {
  const payment = extractPayment(order);
  const status = String(payment?.status || order?.status || '').toLowerCase();
  const detail = String(payment?.status_detail || order?.status_detail || '').toLowerCase();
  if (['processed', 'approved', 'accredited', 'paid', 'completed'].includes(status) || ['accredited', 'approved'].includes(detail)) return 'approved';
  if (['refunded', 'partially_refunded', 'chargeback'].includes(status)) return status;
  if (['rejected', 'cancelled', 'canceled', 'failed', 'expired'].includes(status)) return 'rejected';
  return 'pending';
}

function publicOrder(order) {
  const payment = extractPayment(order);
  const pix = payment?.payment_method?.id === 'pix' || payment?.payment_method?.type === 'bank_transfer';
  return {
    orderId: order?.id || null,
    status: mapStatus(order),
    providerStatus: payment?.status || order?.status || null,
    statusDetail: payment?.status_detail || order?.status_detail || null,
    qrCode: payment?.payment_method?.qr_code || payment?.qr_code || null,
    qrCodeBase64: payment?.payment_method?.qr_code_base64 || payment?.qr_code_base64 || null,
    ticketUrl: payment?.payment_method?.ticket_url || payment?.ticket_url || null,
    pix
  };
}

async function mpRequest(method, path, body, idempotencyKey, options = {}) {
  const config = getConfig();
  if (!config.accessToken) throw new Error('mercadopago_not_configured');
  const headers = { Authorization: `Bearer ${config.accessToken}`, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  if (options.deviceId) headers['X-Meli-Session-Id'] = String(options.deviceId).slice(0, 128);
  const response = await fetch(`${config.apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
  if (!response.ok) {
    const error = new Error(`mercadopago_http_${response.status}`);
    error.providerStatus = response.status;
    error.providerCode = data?.error || data?.cause?.[0]?.code || null;
    throw error;
  }
  return data;
}

async function getProviderOrder(orderId) { return mpRequest('GET', `/v1/orders/${encodeURIComponent(orderId)}`); }

async function getPayerProfile(userId) {
  const ids = variants(userId);
  if (!ids.length) return null;
  const placeholders = ids.map(() => '?').join(',');
  return get(`SELECT email, created_at, whatsapp_jid, phone_number FROM users WHERE whatsapp_jid IN (${placeholders}) OR phone_number IN (${placeholders}) LIMIT 1`, [...ids, ...ids]);
}

function isoDateFromStoredSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const millis = number > 100000000000 ? number : number * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildPaymentPayload({ method, amount, token, paymentMethodId, paymentType, installments, payer, config, profile, deviceId }) {
  const paymentMethod = method === 'pix'
    ? { id: 'pix', type: 'bank_transfer' }
    : {
        id: String(paymentMethodId || '').trim(),
        type: String(paymentType || 'credit_card').trim(),
        token: String(token || '').trim()
      };
  if (method !== 'pix' && (!paymentMethod.id || !paymentMethod.token || !['credit_card', 'debit_card'].includes(paymentMethod.type))) throw new Error('invalid_card_payment');
  if (method !== 'pix') paymentMethod.statement_descriptor = config.statementDescriptor;
  const payment = { amount, payment_method: paymentMethod };
  if (method !== 'pix' && Number.isInteger(Number(installments))) payment.installments = Number(installments);
  const payerOutput = {
    email: String(payer?.email || profile?.email || '').trim(),
    first_name: String(payer?.first_name || '').trim().slice(0, 80),
    last_name: String(payer?.last_name || '').trim().slice(0, 80)
  };
  const identificationType = String(payer?.identification?.type || '').trim().toUpperCase();
  const identificationNumber = String(payer?.identification?.number || '').replace(/\D/g, '').trim();
  if (identificationType && identificationNumber) payerOutput.identification = { type: identificationType, number: identificationNumber };
  const registrationDate = isoDateFromStoredSeconds(profile?.created_at);
  const additionalInfo = {
    'payer.authentication_type': 'WEB',
    'payer.is_first_purchase_online': true
  };
  if (registrationDate) additionalInfo['payer.registration_date'] = registrationDate;
  return {
    type: 'online', processing_mode: 'automatic', total_amount: amount,
    description: config.itemDescription,
    items: [{
      external_code: 'sticker-browser-access',
      title: config.itemTitle + ' · ' + config.planDays + ' dias',
      description: config.itemDescription,
      category_id: config.itemCategoryId,
      quantity: 1,
      unit_price: amount
    }],
    additional_info: additionalInfo,
    transactions: { payments: [payment] },
    payer: payerOutput,
    _device_id_present: Boolean(deviceId)
  };
}

async function createOrder({ rawToken, method, token, paymentMethodId, paymentType, installments, payer, deviceId }) {
  const context = await getTokenContext(rawToken);
  if (!context) throw new Error('invalid_or_expired_access_token');
  const config = getConfig();
  if (!isConfigured()) throw new Error('mercadopago_not_configured');
  if (!['pix', 'card'].includes(method)) throw new Error('invalid_payment_method');
  if (!String(payer?.email || '').includes('@')) throw new Error('invalid_payer_email');
  await ensureTables();
  const existing = await get(`SELECT * FROM payment_orders WHERE token_hash = ? AND status IN ('pending','approved') ORDER BY created_at DESC LIMIT 1`, [context.tokenHash]);
  if (existing?.provider_order_id) {
    const providerOrder = await getProviderOrder(existing.provider_order_id);
    await syncOrder(providerOrder);
    return { ...publicOrder(providerOrder), internalOrderId: existing.id };
  }
  const now = nowSeconds();
  const internalId = crypto.randomUUID();
  const externalReference = `pdm_${internalId.replace(/-/g, '')}`;
  const idempotencyKey = crypto.randomUUID();
  const amount = money(config.amountCents);
  await run(`INSERT INTO payment_orders (id,user_id,token_hash,idempotency_key,external_reference,amount_cents,status,created_at,updated_at) VALUES (?,?,?,?,?,?, 'creating', ?,?)`, [internalId, context.user_id, context.tokenHash, idempotencyKey, externalReference, config.amountCents, now, now]);
  try {
    const profile = await getPayerProfile(context.user_id);
    const payload = buildPaymentPayload({ method, amount, token, paymentMethodId, paymentType, installments, payer, config, profile, deviceId });
    delete payload._device_id_present;
    payload.external_reference = externalReference;
    const providerOrder = await mpRequest('POST', '/v1/orders', payload, idempotencyKey, { deviceId });
    await run(`UPDATE payment_orders SET provider_order_id=?, status=?, provider_status=?, provider_status_detail=?, provider_response_json=?, updated_at=? WHERE id=?`, [providerOrder.id, mapStatus(providerOrder), extractPayment(providerOrder)?.status || providerOrder.status || null, extractPayment(providerOrder)?.status_detail || null, safeJson(publicOrder(providerOrder)), nowSeconds(), internalId]);
    return { ...publicOrder(providerOrder), internalOrderId: internalId };
  } catch (error) {
    await run(`UPDATE payment_orders SET status='failed', provider_status_detail=?, updated_at=? WHERE id=?`, [error.providerCode || error.message, nowSeconds(), internalId]);
    throw error;
  }
}

async function upsertEntitlement({ userId, order, status }) {
  const payment = extractPayment(order);
  const providerPaymentId = payment?.id || null;
  const now = nowSeconds();
  const amountCents = Math.round(Number(order?.total_amount || payment?.amount || 0) * 100);
  const existing = await get('SELECT id FROM dm_entitlements WHERE provider_order_id = ?', [String(order.id)]);
  if (existing) {
    await run(`UPDATE dm_entitlements SET status=?, provider_payment_id=COALESCE(?,provider_payment_id), amount_cents=?, updated_at=? WHERE id=?`, [status, providerPaymentId, amountCents, now, existing.id]);
  } else {
    const local = await get('SELECT user_id, amount_cents FROM payment_orders WHERE provider_order_id = ?', [String(order.id)]);
    if (!local) throw new Error('payment_order_not_linked');
    const expiresAt = status === 'approved' ? now + PLAN_DAYS * 86400 : null;
    await run(`INSERT INTO dm_entitlements (user_id,provider,provider_order_id,provider_payment_id,status,amount_cents,granted_at,expires_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, [local.user_id, 'mercadopago', String(order.id), providerPaymentId, status, amountCents || local.amount_cents, status === 'approved' ? now : null, expiresAt, now]);
  }
}

async function syncOrder(order) {
  if (!order?.id) throw new Error('provider_order_missing_id');
  const status = mapStatus(order);
  const payment = extractPayment(order);
  const local = await get('SELECT id, amount_cents FROM payment_orders WHERE provider_order_id = ?', [String(order.id)]);
  if (!local) throw new Error('payment_order_not_linked');
  if (status === 'approved') {
    const providerAmount = Number(payment?.paid_amount || payment?.amount || order?.total_amount || 0);
    if (!Number.isFinite(providerAmount) || Math.round(providerAmount * 100) !== Number(local.amount_cents)) throw new Error('payment_amount_mismatch');
  }
  await run(`UPDATE payment_orders SET status=?, provider_status=?, provider_status_detail=?, provider_response_json=?, updated_at=? WHERE id=?`, [status, payment?.status || order.status || null, payment?.status_detail || null, safeJson(publicOrder(order)), nowSeconds(), local.id]);
  if (['approved', 'refunded', 'partially_refunded', 'chargeback', 'rejected'].includes(status)) await upsertEntitlement({ order, status });
  return publicOrder(order);
}

function verifyWebhookSignature({ signature, requestId, dataId }) {
  const secret = getConfig().webhookSecret;
  if (!secret) return getConfig().environment !== 'production';
  if (!signature || !requestId || !dataId) return false;
  const parts = Object.fromEntries(String(signature).split(',').map(part => part.trim().split('=')));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const digest = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(parts.v1)); } catch (_) { return false; }
}

async function processWebhook({ eventKey, orderId }) {
  await ensureTables();
  const previous = await get('SELECT status FROM payment_webhook_events WHERE event_key = ?', [eventKey]);
  if (previous?.status === 'processed') return { duplicate: true, status: 'processed' };
  const now = nowSeconds();
  if (!previous) await run(`INSERT INTO payment_webhook_events (event_key,provider,provider_order_id,status,received_at) VALUES (?, 'mercadopago', ?, 'received', ?)`, [eventKey, orderId, now]);
  try {
    const order = await getProviderOrder(orderId);
    const synced = await syncOrder(order);
    await run(`UPDATE payment_webhook_events SET status='processed', processed_at=?, error_code=NULL WHERE event_key=?`, [nowSeconds(), eventKey]);
    return { duplicate: false, status: 'processed', order: synced };
  } catch (error) {
    await run(`UPDATE payment_webhook_events SET status='failed', error_code=? WHERE event_key=?`, [String(error.message).slice(0, 120), eventKey]);
    throw error;
  }
}

async function getStatus(rawToken) {
  const context = await getTokenContext(rawToken);
  if (!context) return { valid: false };
  const local = await get(`SELECT id, provider_order_id, status, provider_status, provider_status_detail FROM payment_orders WHERE token_hash=? ORDER BY created_at DESC LIMIT 1`, [context.tokenHash]);
  const entitlement = await get(`SELECT status, granted_at, expires_at FROM dm_entitlements WHERE user_id=? ORDER BY updated_at DESC LIMIT 1`, [context.user_id]);
  return { valid: true, order: local || null, entitlement: entitlement || null };
}

module.exports = { getConfig, isConfigured, ensureTables, createAccessLink, getTokenContext, createOrder, processWebhook, verifyWebhookSignature, getStatus, syncOrder, publicOrder };
