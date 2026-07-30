process.env.PUBLIC_DM_ACCESS_ENABLED = '1';
process.env.PUBLIC_DM_ALLOW_ALL = '0';
process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR_TEST_ONLY';
process.env.MERCADOPAGO_PUBLIC_KEY = 'TEST_PUBLIC_KEY';
process.env.MERCADOPAGO_ACCESS_AMOUNT_CENTS = '500';
process.env.WEB_SERVER_URL = 'https://figurinhas.zanardizz.uk';
process.env.MERCADOPAGO_ENVIRONMENT = 'sandbox';

require('../../src/database');
const { dbHandler } = require('../../src/database/connection');
const payment = require('../../src/services/mercadoPagoPayment');
const publicDm = require('../../src/services/publicDmStickerAccess');

function assert(condition, message) { if (!condition) throw new Error(`Assertion failed: ${message}`); }
async function run(sql, params = []) { return dbHandler.run(sql, params); }
const userId = 'unit-mp-phase3@c.us';
const providerOrderId = 'ord_unit_mp_phase3';
const providerOrder = { id: providerOrderId, status: 'processed', total_amount: '5.00', transactions: { payments: [{ id: 'pay_unit_mp_phase3', status: 'processed', status_detail: 'accredited', paid_amount: '5.00', payment_method: { id: 'pix', type: 'bank_transfer', qr_code: 'PIX-TEST' } }] } };

async function cleanup() {
  await run('DELETE FROM dm_entitlements WHERE user_id = ?', [userId]);
  await run('DELETE FROM payment_orders WHERE user_id = ?', [userId]);
  await run('DELETE FROM payment_access_tokens WHERE user_id = ?', [userId]);
  await run('DELETE FROM payment_webhook_events WHERE provider_order_id = ?', [providerOrderId]);
}

const tests = [
  { name: 'creates an Orders checkout and links it to an opaque WhatsApp token', fn: async () => {
    await cleanup(); await payment.ensureTables();
    global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(providerOrder) });
    const link = await payment.createAccessLink(userId);
    const rawToken = new URL(link).searchParams.get('token');
    const order = await payment.createOrder({ rawToken, method: 'pix', payer: { email: 'test@example.com' } });
    assert(order.orderId === providerOrderId, 'provider order id should be returned');
    assert(link.includes('/acesso.html?token='), 'link should contain an opaque token');
  } },
  { name: 'confirms entitlement only through server webhook and is idempotent', fn: async () => {
    await cleanup(); await payment.ensureTables();
    global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(providerOrder) });
    const link = await payment.createAccessLink(userId);
    const rawToken = new URL(link).searchParams.get('token');
    await payment.createOrder({ rawToken, method: 'pix', payer: { email: 'test@example.com' } });
    const first = await payment.processWebhook({ eventKey: 'unit:mp:1', orderId: providerOrderId });
    const duplicate = await payment.processWebhook({ eventKey: 'unit:mp:1', orderId: providerOrderId });
    const access = await publicDm.evaluateAccess(userId);
    assert(first.status === 'processed' && duplicate.duplicate, 'webhook retry must be idempotent');
    assert(access.eligible && access.entitlement.status === 'approved', 'approved entitlement should gate public DM');
  } },
  { name: 'rejects an approved provider order with a mismatched amount', fn: async () => {
    await cleanup(); await payment.ensureTables();
    const wrong = { ...providerOrder, total_amount: '9.00', transactions: { payments: [{ ...providerOrder.transactions.payments[0], paid_amount: '9.00' }] } };
    global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(wrong) });
    const link = await payment.createAccessLink(userId);
    const rawToken = new URL(link).searchParams.get('token');
    await payment.createOrder({ rawToken, method: 'pix', payer: { email: 'test@example.com' } });
    let rejected = false;
    try { await payment.processWebhook({ eventKey: 'unit:mp:wrong-amount', orderId: providerOrderId }); } catch (error) { rejected = error.message === 'payment_amount_mismatch'; }
    assert(rejected, 'amount mismatch must fail closed');
    const access = await publicDm.evaluateAccess(userId);
    assert(access.entitlement === null && access.eligible === false, 'mismatched payment must not grant access');
  } }
];

module.exports = { tests, cleanup };
