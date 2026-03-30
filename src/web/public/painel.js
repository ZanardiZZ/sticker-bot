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
      d.results.map((s) => {
        const url = s.url || '';
        const mime = (s.mimetype || '').toLowerCase();
        const isVideo = mime.startsWith('video/') || url.endsWith('.mp4');
        const previewUrl = mime.startsWith('audio/') ? '/media/audio.png' : url;
        const altText = mime.startsWith('audio/') ? 'Pré-visualização de áudio' : 'sticker';

        return `
          <div style='text-align:center;'>
            <a href="/media/${s.id}" target="_blank">
              ${isVideo
                ? `<video src="${url}" style="max-width:64px;max-height:64px;border-radius:6px;" muted playsinline></video>`
                : `<img src="${previewUrl}" data-original-src="${url}" style="max-width:64px;max-height:64px;border-radius:6px;" loading="lazy" alt="${altText}">`
              }
            </a>
            <div style="font-size:.8rem; color:#64748b;">#${s.id}</div>
          </div>`;
      }).join('') + '</div>';
  } catch (e) {
    el.textContent = 'Erro ao carregar histórico.';
  }
}
fetchMyStickers();

// Use CSRF functions from app.js (already loaded)
// Remove duplicate CSRF token management

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

// WhatsApp Verification
async function checkWhatsAppVerificationStatus() {
  try {
    const r = await fetch('/api/verify-whatsapp/status');
    const d = await r.json();
    const statusEl = document.getElementById('verificationStatus');
    const formEl = document.getElementById('verificationForm');
    
    if (d.whatsapp_verified) {
      statusEl.innerHTML = `<span style="color:#059669">✅ <strong>WhatsApp verificado!</strong></span><br>
        <small>Você pode editar figurinhas no site.</small>`;
      formEl.style.display = 'none';
    } else {
      statusEl.innerHTML = `<span style="color:#dc2626">❌ WhatsApp não verificado</span><br>
        <small>Verifique sua conta para poder editar figurinhas.</small>`;
      formEl.style.display = 'block';
    }
  } catch (e) {
    document.getElementById('verificationStatus').innerHTML = '<span style="color:#dc2626">Erro ao verificar status</span>';
  }
}

async function verifyWhatsAppCode() {
  const code = document.getElementById('verificationCode').value.trim().toUpperCase();
  const btn = document.getElementById('btnVerifyWhatsApp');
  const msg = document.getElementById('verification_msg');
  
  msg.textContent = '';
  
  if (!code || code.length !== 8) {
    msg.textContent = 'Digite um código de 8 caracteres.';
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Verificando...';
  
  try {
    const r = await fetchWithCSRF('/api/verify-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    
    const result = await r.json();
    
    if (r.ok && result.success) {
      msg.innerHTML = '<span style="color:#059669">✅ ' + result.message + '</span>';
      document.getElementById('verificationCode').value = '';
      // Refresh verification status
      setTimeout(checkWhatsAppVerificationStatus, 1000);
    } else {
      msg.innerHTML = '<span style="color:#dc2626">❌ ' + (result.message || 'Erro ao verificar código') + '</span>';
    }
  } catch (e) {
    msg.innerHTML = '<span style="color:#dc2626">❌ Erro de conexão</span>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verificar';
  }
}

// Event listeners for WhatsApp verification
document.getElementById('btnVerifyWhatsApp').onclick = verifyWhatsAppCode;
document.getElementById('verificationCode').onkeypress = function(e) {
  if (e.key === 'Enter') verifyWhatsAppCode();
};

// Auto uppercase verification code input
document.getElementById('verificationCode').oninput = function(e) {
  e.target.value = e.target.value.toUpperCase();
};

// Check verification status on page load
checkWhatsAppVerificationStatus();

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
