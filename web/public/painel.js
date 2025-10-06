// Carrega o histórico de figurinhas enviadas pelo usuário
async function fetchMyStickers() {
  const el = document.getElementById('myStickers');
  el.textContent = 'Carregando...';
  try {
    const r = await fetch('/api/my-stickers?page=1&perPage=12');
    const d = await r.json();
    if (!Array.isArray(d.results) || d.results.length === 0) {
      el.innerHTML = '<em>Nenhuma figurinha enviada ainda.</em>';
      return;
    }
    el.innerHTML = `<div style="display:flex; flex-wrap:wrap; gap:12px;">` +
      d.results.map(s =>
        `<div style='text-align:center;'>
          <a href="/media/${s.id}" target="_blank">
            ${s.mimetype === 'video/mp4' ?
              `<video src="${s.url}" style="max-width:64px;max-height:64px;border-radius:6px;" muted playsinline></video>` :
              `<img src="${s.url}" style="max-width:64px;max-height:64px;border-radius:6px;" loading="lazy">`
            }
          </a>
          <div style="font-size:.8rem; color:#64748b;">#${s.id}</div>
        </div>`
      ).join('') + '</div>';
  } catch (e) {
    el.textContent = 'Erro ao carregar histórico.';
  }
}
fetchMyStickers();
// CSRF token management
let csrfToken = null;

async function getCSRFToken() {
  if (!csrfToken) {
    try {
      const response = await fetch('/api/csrf-token', { credentials: 'same-origin' });
      const data = await response.json();
      csrfToken = data.csrfToken;
    } catch (e) {
      console.warn('Failed to fetch CSRF token:', e);
    }
  }
  return csrfToken;
}

async function fetchWithCSRF(url, options = {}) {
  // Add CSRF token for POST/PUT/DELETE/PATCH requests
  if (options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method.toUpperCase())) {
    const token = await getCSRFToken();
    if (token) {
      options.headers = options.headers || {};
      options.headers['X-CSRF-Token'] = token;
    }
  }
  options.credentials = options.credentials || 'same-origin';
  return fetch(url, options);
}

// painel.js - Lógica do painel do usuário comum

async function fetchAccountInfo() {
  try {
    const r = await fetch('/api/me');
    const d = await r.json();
    const info = d.user;
    const el = document.getElementById('accountInfo');
    if (!info) {
      el.innerHTML = '<span style="color:#dc2626">Você não está logado. <a href="/login">Entrar</a></span>';
      return;
    }
    el.innerHTML = `
      <strong>Usuário:</strong> ${info.username}<br>
      <strong>Email:</strong> ${info.email || '<em>não cadastrado</em>'}<br>
      <strong>Status:</strong> ${info.status || 'aprovado'}<br>
      <strong>Telefone:</strong> ${info.phone_number || '<em>não cadastrado</em>'}
    `;
  } catch (e) {
    document.getElementById('accountInfo').textContent = 'Erro ao carregar dados.';
  }
}

fetchAccountInfo();

// Troca de senha (reaproveita lógica do admin.js)
document.getElementById('btnChangePass').onclick = async function() {
  const cur = document.getElementById('cp_current').value;
  const n1 = document.getElementById('cp_new').value;
  const n2 = document.getElementById('cp_new2').value;
  const msg = document.getElementById('cp_msg');
  msg.textContent = '';
  if (!cur || !n1 || !n2) { msg.textContent = 'Preencha todos os campos.'; return; }
  if (n1 !== n2) { msg.textContent = 'Nova senha e confirmação não conferem.'; return; }
  if (n1.length < 8) { msg.textContent = 'A senha deve ter pelo menos 8 caracteres.'; return; }
  try {
    const r = await fetchWithCSRF('/api/account/change-password', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ current_password: cur, new_password: n1 })
    });
    if (!r.ok) throw new Error('Falha ao alterar senha');
    msg.textContent = 'Senha alterada com sucesso.';
    document.getElementById('cp_current').value = '';
    document.getElementById('cp_new').value = '';
    document.getElementById('cp_new2').value = '';
  } catch (e) {
    msg.textContent = 'Erro: ' + e.message;
  }
};
