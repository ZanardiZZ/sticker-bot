const params = new URLSearchParams(window.location.search);
const accessToken = params.get('token') || '';
let csrfToken = null;
let config = null;
let cardController = null;
let currentOrder = null;

const $ = (id) => document.getElementById(id);
function message(text, kind = '') { const el = $('payment-message'); el.textContent = text; el.className = `message ${kind}`.trim(); }
function showError(text) { $('payment-config-error').hidden = false; $('payment-config-error').textContent = text; message('Checkout indisponível', 'error'); }
function validEmail() { const value = String($('payer-email').value || '').trim(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : null; }
function payerData(extra = {}) {
  const identification = String($('payer-identification-number')?.value || '').replace(/\D/g, '');
  return { first_name: String($('payer-first-name')?.value || '').trim(), last_name: String($('payer-last-name')?.value || '').trim(), identification: identification ? { type: String($('payer-identification-type')?.value || 'CPF'), number: identification } : undefined, ...extra };
}
function deviceId() { return String(window.MP_DEVICE_SESSION_ID || '').trim().slice(0, 128); }

async function getCsrf() {
  if (csrfToken) return csrfToken;
  const response = await fetch('/api/csrf-token', { credentials: 'same-origin' });
  const data = await response.json();
  csrfToken = data.csrfToken;
  return csrfToken;
}

async function apiPost(url, body) {
  const token = await getCsrf();
  const response = await fetch(url, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || 'payment_request_failed');
  return data;
}

async function loadConfig() {
  if (!accessToken) throw new Error('missing_access_token');
  const response = await fetch(`/api/payments/mercadopago/config?token=${encodeURIComponent(accessToken)}`, { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.valid || !data.configured) throw new Error(data.error || 'checkout_not_configured');
  config = data;
  $('plan-days').textContent = `${data.planDays} dias`;
  $('payment-form-area').hidden = false;
  message(`Acesso de ${data.planDays} dias · R$ ${(data.amountCents / 100).toFixed(2).replace('.', ',')}`);
  await renderCardBrick();
}

async function renderCardBrick() {
  const MercadoPagoClient = window.MercadoPago;
  if (!MercadoPagoClient) throw new Error('mercadopago_sdk_unavailable');
  const mp = new MercadoPagoClient(config.publicKey, { locale: 'pt-BR' });
  const bricksBuilder = mp.bricks();
  cardController = await bricksBuilder.create('cardPayment', 'cardPaymentBrick_container', {
    initialization: { amount: config.amountCents / 100 },
    customization: { visual: { style: { theme: 'default' } }, paymentMethods: { maxInstallments: 1 } },
    callbacks: {
      onReady: () => {},
      onSubmit: async (cardFormData) => {
        $('card-submit').disabled = true;
        try {
          const email = validEmail();
          if (!email) throw new Error('Informe um e-mail válido.');
          currentOrder = await apiPost('/api/payments/mercadopago/order', {
            access_token: accessToken, method: 'card', device_id: deviceId(), ...cardFormData,
            payer: { ...payerData(cardFormData.payer || {}), email }
          });
          showOrderResult(currentOrder);
        } finally { $('card-submit').disabled = false; }
      },
      onError: () => message('Revise os dados do cartão e tente novamente.', 'error')
    }
  });
  $('card-submit').addEventListener('click', () => {
    if (cardController && typeof cardController.submit === 'function') cardController.submit();
  });
}

function showOrderResult(order) {
  if (order.status === 'approved') {
    showStatus('Pagamento aprovado', 'Seu acesso foi liberado. Você já pode voltar ao WhatsApp e enviar #ID número.', false);
    return;
  }
  if (order.qrCode || order.qrCodeBase64 || order.ticketUrl) {
    $('pix-result').hidden = false;
    if (order.qrCodeBase64) { $('pix-qr').src = `data:image/png;base64,${order.qrCodeBase64}`; $('pix-qr').hidden = false; }
    if (order.qrCode) $('pix-copy').value = order.qrCode;
  }
  showStatus('Pagamento em processamento', 'A confirmação será recebida do Mercado Pago. Esta página pode ser mantida aberta.', false);
  pollStatus();
}

function showStatus(title, detail, isError) {
  $('status-area').hidden = false; $('status-title').textContent = title; $('status-detail').textContent = detail; $('status-area').className = `status-area ${isError ? 'error' : ''}`;
}

async function generatePix() {
  const email = validEmail();
  if (!email) { message('Informe um e-mail válido antes de gerar o PIX.', 'error'); return; }
  $('pix-submit').disabled = true;
  try {
    currentOrder = await apiPost('/api/payments/mercadopago/order', { access_token: accessToken, method: 'pix', device_id: deviceId(), payer: payerData({ email }) });
    showOrderResult(currentOrder);
  } catch (error) { message(error.message, 'error'); } finally { $('pix-submit').disabled = false; }
}

async function pollStatus() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const response = await fetch(`/api/payments/mercadopago/status?token=${encodeURIComponent(accessToken)}`);
    const data = await response.json().catch(() => ({}));
    const status = data.entitlement?.status || data.order?.status;
    if (status === 'approved') { showStatus('Pagamento aprovado', 'Seu acesso foi liberado. Você já pode voltar ao WhatsApp e enviar #ID número.', false); return; }
    if (['rejected', 'refunded', 'chargeback'].includes(status)) { showStatus('Pagamento não aprovado', 'O Mercado Pago informou que o pagamento não foi aprovado.', true); return; }
  }
}

function selectMethod(method) {
  const card = method === 'card';
  $('card-panel').hidden = !card; $('pix-panel').hidden = card;
  $('card-tab').classList.toggle('active', card); $('pix-tab').classList.toggle('active', !card);
  $('card-tab').setAttribute('aria-selected', String(card)); $('pix-tab').setAttribute('aria-selected', String(!card));
}

$('card-tab').addEventListener('click', () => selectMethod('card'));
$('pix-tab').addEventListener('click', () => selectMethod('pix'));
$('pix-submit').addEventListener('click', generatePix);
$('pix-copy-button').addEventListener('click', async () => { await navigator.clipboard.writeText($('pix-copy').value); $('pix-copy-button').textContent = 'Código copiado'; });

loadConfig().catch(error => {
  const messages = { missing_access_token: 'Link de acesso ausente ou inválido.', checkout_not_configured: 'O checkout de testes ainda não foi habilitado pelo administrador.', mercadopago_sdk_unavailable: 'Não foi possível carregar o formulário seguro do Mercado Pago.' };
  showError(messages[error.message] || 'Não foi possível carregar o checkout.');
});
