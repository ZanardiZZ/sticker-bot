function rangeToFromTo(value){
  const to = Date.now();
  const map = { '24h': 24*60*60*1000, '7d': 7*24*60*60*1000, '30d': 30*24*60*60*1000 };
  const win = map[value] || map['24h'];
  return { from: to - win, to };
}

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

// Expose a function to force-refresh the CSRF token (for use after login)
async function refreshCSRFToken() {
  csrfToken = null;
  await getCSRFToken();
}
window.refreshCSRFToken = refreshCSRFToken;

async function fetchWithCSRF(url, options = {}) {
  // Add CSRF token for POST/PUT/DELETE requests
  if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method.toUpperCase())) {
    const token = await getCSRFToken();
    if (token) {
      options.headers = options.headers || {};
      options.headers['X-CSRF-Token'] = token;
    }
  }
  options.credentials = options.credentials || 'same-origin';
  return fetch(url, options);
}

async function fetchJSON(url, options = {}){
  // Add CSRF token for POST/PUT/DELETE requests
  if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method.toUpperCase())) {
    const token = await getCSRFToken();
    if (token) {
      // Add token to headers
      options.headers = options.headers || {};
      options.headers['X-CSRF-Token'] = token;
      
      // If there's a body, also add to body for form data
      if (options.body && options.headers['Content-Type'] === 'application/json') {
        try {
          const bodyData = JSON.parse(options.body);
          bodyData._csrf = token;
          options.body = JSON.stringify(bodyData);
        } catch (e) {
          // If parsing fails, just use header
        }
      }
    }
  }
  
  options.credentials = options.credentials || 'same-origin';
  const r = await fetch(url, options);
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

function getAdminErrorMessage(errorData, defaultMessage) {
  if (errorData.error === 'forbidden') {
    return 'Você não tem permissão de administrador para realizar esta ação.';
  }
  return defaultMessage + ': ' + (errorData.error || 'Erro desconhecido');
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHashSegment(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch (error) {
    return '—';
  }
}

function fillTable(tbody, rows, cols) {
  tbody.innerHTML = rows.map(r => `<tr>${cols.map(c => `<td>${(r[c] ?? '').toString().slice(0,200)}</td>`).join('')}</tr>`).join('');
}
async function loadAccount() {
  try {
    const acc = await fetchJSON('/api/account');
    const banner = document.getElementById('mustChangeBanner');
    if (acc?.must_change_password) banner.style.display = '';
    else banner.style.display = 'none';
  } catch (e) {
    console.warn('account load fail:', e.message);
  }
}
async function changePassword() {
  const cur = document.getElementById('cp_current').value;
  const n1 = document.getElementById('cp_new').value;
  const n2 = document.getElementById('cp_new2').value;
  const msg = document.getElementById('cp_msg');
  msg.textContent = '';

  if (!cur || !n1 || !n2) { msg.textContent = 'Preencha todos os campos.'; return; }
  if (n1 !== n2) { msg.textContent = 'Nova senha e confirmação não conferem.'; return; }
  if (n1.length < 8) { msg.textContent = 'A senha deve ter pelo menos 8 caracteres.'; return; }

  try {
    await fetchJSON('/api/account/change-password', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ current_password: cur, new_password: n1 })
    });
    msg.textContent = 'Senha alterada com sucesso.';
    document.getElementById('cp_current').value = '';
    document.getElementById('cp_new').value = '';
    document.getElementById('cp_new2').value = '';
    await loadAccount();
  } catch (e) {
    msg.textContent = 'Erro: ' + e.message;
  }
}

async function load() {
  // Analytics functionality removed - only load rules
  await loadRules();
}

// ===== Bot Restart Control =====
document.getElementById('restartClientBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('restartClientBtn');
  const status = document.getElementById('restartStatus');
  if (!btn || !status) return;

  if (!confirm('Deseja realmente reiniciar o sticker-client agora?')) return;

  btn.disabled = true;
  status.textContent = 'Solicitando reinício...';

  try {
    const resp = await fetchWithCSRF('/api/admin/restart-client', { method: 'POST' });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      status.textContent = getAdminErrorMessage(data, 'Falha ao reiniciar o bot');
      btn.disabled = false;
      return;
    }
    const body = await resp.json();
    status.textContent = body.message || 'Reinício solicitado com sucesso.';
  } catch (error) {
    console.error('Erro ao reiniciar bot:', error);
    status.textContent = 'Erro de rede: ' + (error.message || error);
  }

  // Re-enable button after a short delay to avoid accidental double-click
  setTimeout(() => { btn.disabled = false; }, 5000);
});

async function loadRules(){
  const rules = await fetchJSON('/api/admin/ip-rules');
  const rows = rules.map(r => ({
    id: r.id, ip: r.ip, action: r.action,
    expira: r.expires_at ? new Date(r.expires_at).toLocaleString() : '—',
    by: r.created_by
  }));
  const tbody = document.querySelector('#tblRules tbody');
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.id}</td><td>${r.ip}</td><td>${r.action}</td><td>${r.expira}</td><td>${r.by}</td>
      <td><button data-del="${r.id}">remover</button></td>
    </tr>`).join('');
}

// Event listeners - removed range listener as element doesn't exist
document.getElementById('addRule').addEventListener('click', async () => {
  const ip = document.getElementById('ip').value.trim();
  const action = document.getElementById('action').value;
  const ttl = document.getElementById('ttl').value ? Number(document.getElementById('ttl').value) : undefined;
  const reason = document.getElementById('reason').value.trim() || undefined;
  if (!ip) return alert('Informe um IP');
  const r = await fetchWithCSRF('/api/admin/ip-rules', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ ip, action, ttl_minutes: ttl, reason })
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    return alert(getAdminErrorMessage(data, 'Falha ao adicionar regra'));
  }
  document.getElementById('ip').value = ''; document.getElementById('ttl').value = ''; document.getElementById('reason').value = '';
  await loadRules();
});

document.addEventListener('click', async (e) => {
  const id = e.target?.dataset?.del;
  if (!id) return;
  if (!confirm('Remover a regra #' + id + '?')) return;
  const r = await fetchWithCSRF('/api/admin/ip-rules/' + id, { method:'DELETE' });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    return alert(getAdminErrorMessage(data, 'Falha ao remover'));
  }
  await loadRules();
});
document.getElementById('btnChangePass').addEventListener('click', changePassword);

// ========= User Management Functions =========
let currentUsersPage = 0;
const usersPerPage = 20;

async function loadUsers() {
  const statusFilter = document.getElementById('userStatusFilter').value;
  const offset = currentUsersPage * usersPerPage;
  
  try {
    const params = new URLSearchParams({
      limit: usersPerPage,
      offset: offset
    });
    
    if (statusFilter) {
      params.set('status', statusFilter);
    }
    
    const data = await fetchJSON('/api/admin/users?' + params.toString());
    renderUsersTable(data.users);
    updateUsersPagination(data.total, data.offset, data.limit);
  } catch (error) {
    console.error('Error loading users:', error);
    document.querySelector('#tblUsers tbody').innerHTML = 
      '<tr><td colspan="8">Erro ao carregar usuários</td></tr>';
  }
}

function renderUsersTable(users) {
  const tbody = document.querySelector('#tblUsers tbody');
  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: #999;">Nenhum usuário encontrado</td></tr>';
    return;
  }
  
  tbody.innerHTML = users.map(user => {
    const createdAt = new Date(user.created_at).toLocaleString('pt-BR');
    const statusBadge = getStatusBadge(user.status);
  const actions = getActionButtons(user) + ` <button class="btn-user-delete" data-id="${user.id}" style="background:#6c757d;color:white;border:0;padding:0.2rem 0.4rem;border-radius:3px;font-size:0.8rem;cursor:pointer;margin-left:0.2rem;">Deletar</button>`;
    const phone = user.phone_number ? maskPhone(user.phone_number) : '—';
    const contactName = user.contact_display_name || '—';
    const canEdit = user.can_edit ? '✓' : '✗';
    const email = user.email || '—';
    const emailStatus = getEmailStatusBadge(user.email_confirmed);
    
    // WhatsApp linkage indicator
    let whatsappStatus = '—';
    if (user.has_whatsapp_account) {
      if (user.whatsapp_allowed && !user.whatsapp_blocked) {
        whatsappStatus = '<span style="color:#4a9;" title="Conectado e permitido">●</span>';
      } else if (user.whatsapp_blocked) {
        whatsappStatus = '<span style="color:#f88;" title="Bloqueado">●</span>';
      } else {
        whatsappStatus = '<span style="color:#ffa500;" title="Conectado mas pendente">●</span>';
      }
    }
    
    return `
      <tr data-user-id="${user.id}">
        <td>${user.id}</td>
        <td>${user.username}</td>
        <td>${email}</td>
        <td>${emailStatus}</td>
        <td>${phone}</td>
        <td>${contactName}</td>
        <td style="text-align:center;">${whatsappStatus}</td>
        <td>${statusBadge}</td>
        <td>${canEdit}</td>
        <td>${createdAt}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
}

function getStatusBadge(status) {
  const styles = {
    pending: 'background: #5a3a00; color: #ffd700; padding: 2px 6px; border-radius: 3px; font-size: 0.8rem;',
    approved: 'background: #003a1a; color: #4a9; padding: 2px 6px; border-radius: 3px; font-size: 0.8rem;',
    rejected: 'background: #3a1a1a; color: #f88; padding: 2px 6px; border-radius: 3px; font-size: 0.8rem;'
  };
  
  const labels = {
    pending: 'Pendente',
    approved: 'Aprovado', 
    rejected: 'Rejeitado'
  };
  
  return `<span style="${styles[status] || ''}">${labels[status] || status}</span>`;
}

function getEmailStatusBadge(emailConfirmed) {
  if (emailConfirmed) {
    return '<span style="background: #003a1a; color: #4a9; padding: 2px 6px; border-radius: 3px; font-size: 0.8rem;">✓ Confirmado</span>';
  } else {
    return '<span style="background: #5a3a00; color: #ffd700; padding: 2px 6px; border-radius: 3px; font-size: 0.8rem;">⚠ Pendente</span>';
  }
}

function getActionButtons(user) {
  let buttons = [];
  
  if (user.status === 'pending') {
    buttons.push(`<button class="btn-user-approve" data-id="${user.id}" style="background: #28a745; color: white; border: 0; padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.8rem; margin-right: 0.2rem; cursor: pointer;">Aprovar</button>`);
    buttons.push(`<button class="btn-user-reject" data-id="${user.id}" style="background: #dc3545; color: white; border: 0; padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.8rem; margin-right: 0.2rem; cursor: pointer;">Rejeitar</button>`);
  }
  
  if (user.status === 'approved' && user.role !== 'admin') {
    const editText = user.can_edit ? 'Remover Edição' : 'Dar Edição';
    const editClass = user.can_edit ? 'btn-user-remove-edit' : 'btn-user-give-edit';
    const editColor = user.can_edit ? '#ffc107' : '#17a2b8';
    buttons.push(`<button class="${editClass}" data-id="${user.id}" style="background: ${editColor}; color: white; border: 0; padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.8rem; cursor: pointer;">${editText}</button>`);
  }
  
  return buttons.join('');
}

function maskPhone(phone) {
  if (phone.length >= 13) {
    return phone.slice(0, 2) + '••••••' + phone.slice(-4);
  }
  return phone.slice(0, 2) + '••••' + phone.slice(-2);
}

function updateUsersPagination(total, offset, limit) {
  const pagination = document.getElementById('usersPagination');
  const info = document.getElementById('usersInfo');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  
  if (total > limit) {
    pagination.style.display = 'flex';
    const start = offset + 1;
    const end = Math.min(offset + limit, total);
    info.textContent = `Exibindo ${start}-${end} de ${total} usuários`;
    
    prevBtn.disabled = offset === 0;
    nextBtn.disabled = end >= total;
  } else {
    pagination.style.display = 'none';
  }
}

async function approveUser(userId) {
  try {
    const response = await fetch(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' })
    });
    
    if (response.ok) {
      await loadUsers();
    } else {
      const data = await response.json();
      alert(getAdminErrorMessage(data, 'Erro ao aprovar usuário'));
    }
  } catch (error) {
    console.error('Error approving user:', error);
    alert('Erro ao aprovar usuário');
  }
}

async function rejectUser(userId) {
  if (!confirm('Tem certeza que deseja rejeitar este usuário?')) return;
  
  try {
    const response = await fetch(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' })
    });
    
    if (response.ok) {
      await loadUsers();
    } else {
      const data = await response.json();
      alert(getAdminErrorMessage(data, 'Erro ao rejeitar usuário'));
    }
  } catch (error) {
    console.error('Error rejecting user:', error);
    alert('Erro ao rejeitar usuário');
  }
}

async function toggleEditPermission(userId, canEdit) {
  const action = canEdit ? 'remover' : 'dar';
  if (!confirm(`Tem certeza que deseja ${action} permissão de edição para este usuário?`)) return;
  
  try {
    const response = await fetch(`/api/admin/users/${userId}/permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ can_edit: !canEdit })
    });
    
    if (response.ok) {
      await loadUsers();
    } else {
      const data = await response.json();
      alert(getAdminErrorMessage(data, 'Erro ao alterar permissões'));
    }
  } catch (error) {
    console.error('Error updating permissions:', error);
    alert('Erro ao alterar permissões');
  }
}

// Event listeners for user management
document.getElementById('userStatusFilter').addEventListener('change', () => {
  currentUsersPage = 0;
  loadUsers();
});

document.getElementById('refreshUsers').addEventListener('click', loadUsers);

document.getElementById('prevPage').addEventListener('click', () => {
  if (currentUsersPage > 0) {
    currentUsersPage--;
    loadUsers();
  }
});

document.getElementById('nextPage').addEventListener('click', () => {
  currentUsersPage++;
  loadUsers();
});

// Handle user action buttons
document.addEventListener('click', async (e) => {
  const userId = e.target.dataset.id;
  if (!userId) return;
  
  if (e.target.classList.contains('btn-user-approve')) {
    await approveUser(userId);
  } else if (e.target.classList.contains('btn-user-reject')) {
    await rejectUser(userId);
  } else if (e.target.classList.contains('btn-user-give-edit')) {
    await toggleEditPermission(userId, false);
  } else if (e.target.classList.contains('btn-user-remove-edit')) {
    await toggleEditPermission(userId, true);
  } else if (e.target.classList.contains('btn-user-delete')) {
    if (!confirm('Deseja realmente deletar este usuário? Esta ação não pode ser desfeita.')) return;
    try {
      const resp = await fetchWithCSRF('/api/admin/users/' + encodeURIComponent(userId), { method: 'DELETE' });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        return alert(getAdminErrorMessage(data, 'Falha ao deletar usuário'));
      }
      await loadUsers();
    } catch (err) {
      console.error('Erro ao deletar usuário:', err);
      alert('Erro ao deletar usuário');
    }
  }
});

// ---- Tab Management Functions ----

let duplicatesLoaded = false;
let currentUserRole = null;

let mainTabButtons = [];
let mainTabContents = [];
let tabButtons = [];
let tabContents = [];

let currentMainTab = 'settings';
let currentSubTab = 'account';
let hashUpdateInProgress = false;
let lastLoadedGroupUsersId = '';
let lastLoadedGroupCommandsId = '';

const mainTabIds = new Set(['settings', 'logs', 'network', 'users', 'duplicates']);
const subTabLoaders = {
  'group-users': initializeGroupUsersTab,
  'bot-frequency': loadBotSchedule,
  'group-config': initializeGroupCommandsTab
};
const initializedSubTabs = new Set();
const tabPayload = {};

function initializeMainTabs() {
  mainTabButtons = Array.from(document.querySelectorAll('.main-tab-button'));
  mainTabContents = Array.from(document.querySelectorAll('.main-tab-content'));

  mainTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      setActiveMainTab(tabId, { updateHash: true });
    });
  });
}

function initializeTabs() {
  tabButtons = Array.from(document.querySelectorAll('.tab-button'));
  tabContents = Array.from(document.querySelectorAll('.tab-content'));

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveSubTab(button.dataset.tab, { updateHash: true });
    });
  });
}

function setActiveMainTab(tabId, options = {}) {
  const { updateHash = false } = options;
  if (!mainTabIds.has(tabId)) {
    tabId = 'settings';
  }

  currentMainTab = tabId;

  mainTabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  mainTabContents.forEach((content) => {
    content.classList.toggle('active', content.id === `main-tab-${tabId}`);
  });

  if (tabId === 'duplicates' && !duplicatesLoaded) {
    loadDuplicatesTab();
  }

  if (tabId === 'logs') {
    loadLogs({ offset: 0 });
    logsCurrentOffset = 0;
    if (document.getElementById('autoRefreshLogs')?.checked) {
      startLogsSSE();
    }
  } else {
    stopLogsSSE();
  }

  if (tabId === 'settings') {
    setActiveSubTab(currentSubTab, { updateHash: false });
  }

  if (updateHash) {
    updateLocationHash();
  }
}

function setActiveSubTab(tabId, options = {}) {
  const { updateHash = false } = options;
  const availableIds = tabButtons.map((btn) => btn.dataset.tab);
  if (!availableIds.includes(tabId)) {
    tabId = 'account';
  }

  currentSubTab = tabId;

  tabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  tabContents.forEach((content) => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });

  if (!initializedSubTabs.has(tabId) && typeof subTabLoaders[tabId] === 'function') {
    initializedSubTabs.add(tabId);
    Promise.resolve(subTabLoaders[tabId]()).catch((error) => {
      console.warn(`Failed to initialize sub-tab "${tabId}":`, error);
    });
  }

  if (updateHash) {
    updateLocationHash();
  }
}

function updateLocationHash() {
  if (hashUpdateInProgress) {
    return;
  }

  const parts = [currentMainTab];
  if (currentMainTab === 'settings' && currentSubTab) {
    parts.push(currentSubTab);
    if (currentSubTab === 'group-users' && lastLoadedGroupUsersId) {
      parts.push(encodeURIComponent(lastLoadedGroupUsersId));
    }
    if (currentSubTab === 'group-config' && lastLoadedGroupCommandsId) {
      parts.push(encodeURIComponent(lastLoadedGroupCommandsId));
    }
  }
  const hashValue = parts.filter(Boolean).join('/');
  const targetHash = hashValue ? `#${hashValue}` : '';

  if (window.location.hash === targetHash) {
    return;
  }

  hashUpdateInProgress = true;
  if (hashValue) {
    window.location.hash = hashValue;
  } else {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  setTimeout(() => {
    hashUpdateInProgress = false;
  }, 0);
}

function applyHashNavigation() {
  if (hashUpdateInProgress) {
    return;
  }

  const rawHash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(window.location.search);

  let mainTab = 'settings';
  let subTab = 'account';
  let payload = '';

  if (rawHash) {
    const parts = rawHash.split('/');
    if (parts.length === 1) {
      const single = parts[0];
      if (mainTabIds.has(single)) {
        mainTab = single;
      } else {
        subTab = single;
      }
    } else {
      if (mainTabIds.has(parts[0])) {
        mainTab = parts[0];
      }
      if (parts[1]) {
        subTab = parts[1];
      }
      if (parts.length > 2) {
        payload = decodeHashSegment(parts.slice(2).join('/'));
      }
    }
  } else if (params.has('tab')) {
    const tabParam = params.get('tab');
    if (tabParam && mainTabIds.has(tabParam)) {
      mainTab = tabParam;
    } else if (tabParam) {
      subTab = tabParam;
    }
  }

  if (!payload) {
    if (subTab === 'group-users' && (params.get('group') || params.get('groupId'))) {
      payload = params.get('group') || params.get('groupId') || '';
    }
    if (subTab === 'group-config' && (params.get('group') || params.get('groupId'))) {
      payload = params.get('group') || params.get('groupId') || '';
    }
  }

  if (payload) {
    tabPayload[subTab] = payload;
  }

  setActiveMainTab(mainTab, { updateHash: false });
  if (mainTab === 'settings') {
    setActiveSubTab(subTab, { updateHash: false });
  }
}

function consumeTabPayload(tabId) {
  if (!tabId) return '';
  const value = tabPayload[tabId];
  if (value === undefined || value === null) {
    return '';
  }
  delete tabPayload[tabId];
  return String(value).trim();
}

// ---- Connected Groups + Group Tabs ----

let connectedGroupsCache = null;

async function fetchConnectedGroups(force = false) {
  if (!force && Array.isArray(connectedGroupsCache)) {
    return connectedGroupsCache;
  }

  function setGroupDebug(obj) {
    try {
      const el = document.getElementById('groupFetchDebug');
      if (!el) return;
      el.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    } catch (e) { /* ignore */ }
  }

  try {
    const resp = await fetch('/api/admin/connected-groups', { credentials: 'same-origin' });
    const text = await resp.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { parsed = text; }

    setGroupDebug({ status: resp.status, ok: resp.ok, body: parsed });

    // If unauthenticated or forbidden, show a friendly notice with login link
    if (resp.status === 401 || resp.status === 403) {
      try {
        const notice = document.getElementById('groupAuthNotice');
        if (notice) {
          const msg = resp.status === 401 ? 'Sessão não autenticada. Faça login para acessar.' : 'Acesso negado. Sua conta não tem permissões de administrador.';
          const extra = (parsed && parsed.message) ? (' — ' + parsed.message) : '';
          notice.innerHTML = `<div style="color:#fff;background:#dc2626;padding:8px;border-radius:4px;display:inline-block;">${escapeHtml(msg)}${escapeHtml(extra)} <a href="/login" style="color:#fff;text-decoration:underline;margin-left:8px;">Ir para login</a></div>`;
        }
      } catch (e) { /* ignore */ }
      connectedGroupsCache = [];
      return connectedGroupsCache;
    }

    const groups = Array.isArray(parsed?.groups) ? parsed.groups : [];
    connectedGroupsCache = groups.sort((a, b) => {
      const nameA = (a.name || a.subject || a.id || '').toLocaleLowerCase('pt-BR');
      const nameB = (b.name || b.subject || b.id || '').toLocaleLowerCase('pt-BR');
      return nameA.localeCompare(nameB);
    });
  } catch (error) {
    console.warn('Falha ao carregar grupos conectados:', error);
    setGroupDebug({ error: String(error) });
    connectedGroupsCache = [];
  }
  return connectedGroupsCache;
}

function populateGroupSelect(selectEl, groups, placeholder) {
  if (!selectEl) return;
  const currentValue = selectEl.value;
  const options = [
    `<option value="">${placeholder}</option>`,
    ...groups.map((group) => {
      const id = group?.id || group?.jid || '';
      const labelName = group?.name || group?.subject || '';
      const label = labelName ? `${escapeHtml(labelName)} (${escapeHtml(id)})` : escapeHtml(id);
      const selected = currentValue && currentValue === id ? ' selected' : '';
      return `<option value="${escapeHtml(id)}"${selected}>${label}</option>`;
    })
  ];
  selectEl.innerHTML = options.join('');
}

function bindGroupInputs(selectEl, inputEl) {
  if (!selectEl || !inputEl) return;
  if (!selectEl.dataset.bound) {
    selectEl.dataset.bound = 'true';
    selectEl.addEventListener('change', () => {
      if (selectEl.value) {
        inputEl.value = selectEl.value;
      }
    });
  }
  if (!inputEl.dataset.bound) {
    inputEl.dataset.bound = 'true';
    inputEl.addEventListener('input', () => {
      if (inputEl.value !== selectEl.value) {
        selectEl.value = '';
      }
    });
  }
}

async function ensureGroupSelectPopulated(selectEl, placeholder, force = false) {
  if (!selectEl) return;
  if (!force && selectEl.dataset.populated === 'true') return;
  const groups = await fetchConnectedGroups(force);
  populateGroupSelect(selectEl, groups, placeholder);
  selectEl.dataset.populated = 'true';
}

async function initializeGroupUsersTab() {
  const selectEl = document.getElementById('groupUsersSelect');
  const inputEl = document.getElementById('groupUsersId');
  const loadBtn = document.getElementById('loadGroupUsersBtn');
  if (!selectEl || !inputEl || !loadBtn) return;

  // insert debug UI (only once)
  if (!document.getElementById('groupFetchDebug')) {
    try {
      const wrapper = document.createElement('div');
      wrapper.style.marginTop = '6px';
      wrapper.innerHTML = `
  <button id="refreshGroupsBtn" style="margin-right:8px;padding:6px 10px;font-size:0.85rem;">Atualizar grupos</button>
  <button id="adminAutoLoginBtn" style="margin-right:8px;padding:6px 10px;font-size:0.85rem;background:#2563eb;color:#fff;border:0;border-radius:4px;">Auto-login (debug)</button>
  <span id="groupAuthNotice" style="margin-right:8px;vertical-align:middle;"></span>
  <pre id="groupFetchDebug" style="display:inline-block;background:#0f172a;color:#c7d2fe;padding:6px;border-radius:4px;max-width:720px;max-height:120px;overflow:auto;font-size:0.75rem;">Debug de grupos</pre>
      `;
      selectEl.parentElement?.insertBefore(wrapper, selectEl.nextSibling);
    } catch (e) { /* ignore */ }
  }

  await ensureGroupSelectPopulated(selectEl, 'Selecione um grupo...');
  bindGroupInputs(selectEl, inputEl);

  // bind refresh control
  const refreshBtn = document.getElementById('refreshGroupsBtn');
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = 'true';
    refreshBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const dbg = document.getElementById('groupFetchDebug');
      if (dbg) dbg.textContent = 'Recarregando grupos...';
      await ensureGroupSelectPopulated(selectEl, 'Selecione um grupo...', true);
    });
  }
  const autoBtn = document.getElementById('adminAutoLoginBtn');
  if (autoBtn && !autoBtn.dataset.bound) {
    autoBtn.dataset.bound = 'true';
    autoBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const dbg = document.getElementById('groupFetchDebug');
      if (dbg) dbg.textContent = 'Tentando auto-login...';
      try {
  const resp = await fetch('/api/admin/_debug/auto-login', { method: 'GET', credentials: 'same-origin' });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const notice = document.getElementById('groupAuthNotice');
          if (notice) notice.innerHTML = `<div style="color:#fff;background:#f97316;padding:8px;border-radius:4px;display:inline-block;">Auto-login falhou: ${escapeHtml(data.error || 'erro')}. Verifique ADMIN_AUTOLOGIN_DEBUG.</div>`;
          if (dbg) dbg.textContent = JSON.stringify({ status: resp.status, body: data }, null, 2);
          return;
        }
        if (dbg) dbg.textContent = JSON.stringify({ status: resp.status, body: data }, null, 2);
        // After auto-login, force reload groups
        await ensureGroupSelectPopulated(selectEl, 'Selecione um grupo...', true);
      } catch (err) {
        if (dbg) dbg.textContent = String(err);
      }
    });
  }

  if (!loadBtn.dataset.bound) {
    loadBtn.dataset.bound = 'true';
    loadBtn.addEventListener('click', (event) => {
      event.preventDefault();
      loadGroupUsersFromInputs();
    });
  }

  if (!selectEl.dataset.loadOnChange) {
    selectEl.dataset.loadOnChange = 'true';
    selectEl.addEventListener('change', () => {
      if (selectEl.value) {
        loadGroupUsers(selectEl.value);
      }
    });
  }

  if (!inputEl.dataset.loadOnEnter) {
    inputEl.dataset.loadOnEnter = 'true';
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loadGroupUsersFromInputs();
      }
    });
  }

  const payload = consumeTabPayload('group-users');
  if (payload) {
    inputEl.value = payload;
    selectEl.value = payload;
    await loadGroupUsers(payload);
  } else if (lastLoadedGroupUsersId) {
    inputEl.value = lastLoadedGroupUsersId;
    selectEl.value = lastLoadedGroupUsersId;
  }
}

async function loadGroupUsersFromInputs() {
  const selectEl = document.getElementById('groupUsersSelect');
  const inputEl = document.getElementById('groupUsersId');
  const statusEl = document.getElementById('groupUsersStatus');
  if (!selectEl || !inputEl) return;
  const groupId = (inputEl.value || selectEl.value || '').trim();
  if (!groupId) {
    if (statusEl) {
      statusEl.textContent = 'Selecione ou informe um ID de grupo válido.';
    }
    return;
  }
  await loadGroupUsers(groupId);
}

async function loadGroupUsers(groupId) {
  if (!groupId) return;
  const statusEl = document.getElementById('groupUsersStatus');
  const tableBody = document.querySelector('#groupUsersTable tbody');
  if (!tableBody) return;

  lastLoadedGroupUsersId = groupId;

  if (statusEl) statusEl.textContent = 'Carregando usuários do grupo...';
  tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8;">Carregando usuários...</td></tr>`;

  try {
    const data = await fetchJSON(`/api/admin/group-users/${encodeURIComponent(groupId)}`);
    const users = Array.isArray(data?.users) ? data.users : [];
    renderGroupUsersTable(users);
    if (statusEl) {
      statusEl.textContent = users.length
        ? `Exibindo ${users.length} usuário(s) para ${groupId}`
        : `Nenhum usuário encontrado para ${groupId}.`;
    }
    if (currentMainTab === 'settings' && currentSubTab === 'group-users') {
      updateLocationHash();
    }
  } catch (error) {
    console.error('Erro ao carregar usuários do grupo:', error);
    if (statusEl) {
      statusEl.textContent = 'Erro ao carregar usuários do grupo.';
    }
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">Erro ao carregar usuários.</td></tr>`;
  }
}

function renderGroupUsersTable(users) {
  const tableBody = document.querySelector('#groupUsersTable tbody');
  if (!tableBody) return;

  if (!Array.isArray(users) || users.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8;">Nenhum usuário para o grupo selecionado.</td></tr>`;
    return;
  }

  const rows = users.map((user) => {
    const userRawId = user.user_id || user.id || '';
    const userId = escapeHtml(userRawId);
    const role = escapeHtml(user.role || '—');
    const blocked = user.blocked ? '<span style="color:#dc2626; font-weight:600;">Sim</span>' : 'Não';
    const lastActivity = user.last_activity ? formatDateTime(user.last_activity) : '—';
    const interactions = user.interaction_count === null || user.interaction_count === undefined
      ? '—'
      : escapeHtml(user.interaction_count);
    const encodedUser = encodeURIComponent(userRawId);
    const actionButton = userId
      ? `<button class="btn-primary" style="padding:0.25rem 0.6rem; font-size:0.8rem;" data-open-users="${encodedUser}">Gerenciar</button>`
      : '';

    return `
      <tr>
        <td>${userId || '—'}</td>
        <td>${role}</td>
        <td>${blocked}</td>
        <td>${lastActivity}</td>
        <td>${interactions}</td>
        <td>${actionButton}</td>
      </tr>
    `;
  }).join('');

  tableBody.innerHTML = rows;
}

// ====== DM Users (Direct Message Authorization) UI helpers ======
async function loadDmUsers() {
  const tableBody = document.querySelector('#dmUsersTable tbody');
  const statusEl = document.getElementById('dmUsersStatus');
  if (statusEl) statusEl.textContent = 'Carregando...';
  try {
    const data = await fetchJSON('/api/admin/dm-users');
    const users = Array.isArray(data?.users) ? data.users : [];
    renderDmUsersTable(users);
    if (statusEl) statusEl.textContent = '';
  } catch (err) {
    console.error('Erro ao carregar DM users:', err);
    if (statusEl) statusEl.textContent = 'Erro ao carregar DM users.';
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ef4444;">Erro ao carregar usuários.</td></tr>`;
  }
}

function renderDmUsersTable(users) {
  const tableBody = document.querySelector('#dmUsersTable tbody');
  if (!tableBody) return;
  if (!Array.isArray(users) || users.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Nenhum usuário DM autorizado.</td></tr>`;
    return;
  }
  const rows = users.map(u => {
    const id = escapeHtml(u.user_id || '');
    const allowed = u.allowed ? '<span style="color:#16a34a; font-weight:600;">Sim</span>' : 'Não';
    const blocked = u.blocked ? '<span style="color:#dc2626; font-weight:600;">Sim</span>' : 'Não';
    const last = u.last_activity ? formatDateTime(u.last_activity) : '—';
    const note = escapeHtml(u.note || '');
    return `
      <tr>
        <td>${id}</td>
        <td>${allowed}</td>
        <td>${blocked}</td>
        <td>${last}</td>
        <td>${note}</td>
        <td><button class="btn-primary" style="padding:0.25rem 0.6rem; font-size:0.8rem;" data-dm-remove="${encodeURIComponent(u.user_id)}">Remover</button></td>
      </tr>`;
  }).join('');
  tableBody.innerHTML = rows;
}

async function addDmUser(userId, allowed = false, blocked = false, note = '') {
  const payload = { user_id: userId, allowed: allowed ? 1 : 0, blocked: blocked ? 1 : 0, note };
  const resp = await fetchWithCSRF('/api/admin/dm-users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error('Falha ao adicionar usuário');
  await loadDmUsers();
}

async function removeDmUser(userId) {
  const resp = await fetchWithCSRF(`/api/admin/dm-users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  if (!resp.ok) throw new Error('Falha ao remover usuário');
  await loadDmUsers();
}

async function loadBotSchedule() {
  const statusEl = document.getElementById('botScheduleStatus');
  const cronEl = document.getElementById('botScheduleCron');
  const startEl = document.getElementById('botScheduleStart');
  const endEl = document.getElementById('botScheduleEnd');
  const intervalEl = document.getElementById('botScheduleInterval');
  if (!startEl || !endEl || !intervalEl) return;

  if (statusEl) statusEl.textContent = 'Carregando configuração...';

  try {
    const data = await fetchJSON('/api/admin/bot-config/schedule');
    if (data.start) startEl.value = data.start;
    if (data.end) endEl.value = data.end;
    if (data.interval) intervalEl.value = String(data.interval);
    if (cronEl) cronEl.textContent = data.cron || 'não disponível';
    if (statusEl) statusEl.textContent = '';
  } catch (error) {
    console.error('Erro ao carregar configuração do bot:', error);
    if (statusEl) {
      statusEl.textContent = 'Erro ao carregar configuração. Verifique suas permissões.';
    }
    if (cronEl) cronEl.textContent = 'não disponível';
  }
}

async function saveBotSchedule() {
  const startEl = document.getElementById('botScheduleStart');
  const endEl = document.getElementById('botScheduleEnd');
  const intervalEl = document.getElementById('botScheduleInterval');
  const statusEl = document.getElementById('botScheduleStatus');
  if (!startEl || !endEl || !intervalEl) return;

  const payload = {
    start: startEl.value,
    end: endEl.value,
    interval: Number(intervalEl.value)
  };

  if (statusEl) statusEl.textContent = 'Salvando configuração...';

  try {
    const response = await fetchWithCSRF('/api/admin/bot-config/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(getAdminErrorMessage(errorData, 'Erro ao salvar configuração'));
    }

    if (statusEl) statusEl.textContent = 'Configuração salva com sucesso!';
    await loadBotSchedule();
  } catch (error) {
    console.error('Erro ao salvar configuração do bot:', error);
    if (statusEl) statusEl.textContent = error.message || 'Falha ao salvar configuração.';
  }
}

async function initializeGroupCommandsTab() {
  const selectEl = document.getElementById('groupCommandsSelect');
  const inputEl = document.getElementById('groupCommandsGroupId');
  const loadBtn = document.getElementById('loadGroupCommandsBtn');
  const saveBtn = document.getElementById('saveGroupCommandBtn');
  if (!selectEl || !inputEl || !loadBtn || !saveBtn) return;

  await ensureGroupSelectPopulated(selectEl, 'Selecione um grupo...');
  bindGroupInputs(selectEl, inputEl);

  if (!loadBtn.dataset.bound) {
    loadBtn.dataset.bound = 'true';
    loadBtn.addEventListener('click', (event) => {
      event.preventDefault();
      loadGroupCommandsFromInputs();
    });
  }

  if (!selectEl.dataset.loadOnChange) {
    selectEl.dataset.loadOnChange = 'true';
    selectEl.addEventListener('change', () => {
      if (selectEl.value) {
        loadGroupCommands(selectEl.value);
      }
    });
  }

  if (!inputEl.dataset.loadOnEnter) {
    inputEl.dataset.loadOnEnter = 'true';
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loadGroupCommandsFromInputs();
      }
    });
  }

  if (!saveBtn.dataset.bound) {
    saveBtn.dataset.bound = 'true';
    saveBtn.addEventListener('click', (event) => {
      event.preventDefault();
      saveGroupCommand();
    });
  }

  const payload = consumeTabPayload('group-config');
  if (payload) {
    inputEl.value = payload;
    selectEl.value = payload;
    await loadGroupCommands(payload);
  } else if (lastLoadedGroupCommandsId) {
    inputEl.value = lastLoadedGroupCommandsId;
    selectEl.value = lastLoadedGroupCommandsId;
  }
}

async function loadGroupCommandsFromInputs() {
  const selectEl = document.getElementById('groupCommandsSelect');
  const inputEl = document.getElementById('groupCommandsGroupId');
  const statusEl = document.getElementById('groupCommandsStatus');
  if (!selectEl || !inputEl) return;
  const groupId = (inputEl.value || selectEl.value || '').trim();
  if (!groupId) {
    if (statusEl) {
      statusEl.textContent = 'Selecione ou informe um ID de grupo válido.';
    }
    return;
  }
  await loadGroupCommands(groupId);
}

async function loadGroupCommands(groupId) {
  if (!groupId) return;
  const statusEl = document.getElementById('groupCommandsStatus');
  const tableBody = document.querySelector('#groupCommandsTable tbody');
  if (!tableBody) return;

  lastLoadedGroupCommandsId = groupId;

  if (statusEl) statusEl.textContent = 'Carregando permissões...';
  tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Carregando permissões...</td></tr>`;

  try {
    const data = await fetchJSON(`/api/admin/group-commands/${encodeURIComponent(groupId)}`);
    const permissions = Array.isArray(data?.permissions) ? data.permissions : [];
    renderGroupCommandsTable(permissions, groupId);
    if (statusEl) {
      statusEl.textContent = permissions.length
        ? `Exibindo ${permissions.length} comando(s) configurado(s) para ${groupId}`
        : `Nenhuma permissão configurada para ${groupId}.`;
    }
    if (currentMainTab === 'settings' && currentSubTab === 'group-config') {
      updateLocationHash();
    }
  } catch (error) {
    console.error('Erro ao carregar permissões de grupo:', error);
    if (statusEl) statusEl.textContent = 'Erro ao carregar permissões do grupo.';
    tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#ef4444;">Erro ao carregar permissões.</td></tr>`;
  }
}

function renderGroupCommandsTable(permissions, groupId) {
  const tableBody = document.querySelector('#groupCommandsTable tbody');
  if (!tableBody) return;

  if (!Array.isArray(permissions) || permissions.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Nenhuma permissão configurada.</td></tr>`;
    return;
  }

  const rows = permissions.map((perm) => {
    const commandRaw = perm.command || '';
    const command = escapeHtml(commandRaw);
    const allowed = perm.allowed
      ? '<span style="color:#059669; font-weight:600;">Permitido</span>'
      : '<span style="color:#dc2626; font-weight:600;">Bloqueado</span>';
    const encodedCommand = encodeURIComponent(commandRaw);
    const encodedGroup = encodeURIComponent(groupId);
    return `
      <tr>
        <td>${command || '—'}</td>
        <td>${allowed}</td>
        <td>
          <button class="btn-danger" style="padding:0.25rem 0.6rem; font-size:0.8rem;" data-delete-group-command="${encodedCommand}" data-group-id="${encodedGroup}">Remover</button>
        </td>
      </tr>
    `;
  }).join('');

  tableBody.innerHTML = rows;
}

async function saveGroupCommand() {
  const inputEl = document.getElementById('groupCommandsGroupId');
  const selectEl = document.getElementById('groupCommandsSelect');
  const commandEl = document.getElementById('groupCommandsCommandName');
  const allowedEl = document.getElementById('groupCommandsAllowed');
  const statusEl = document.getElementById('groupCommandsStatus');
  if (!inputEl || !selectEl || !commandEl || !allowedEl) return;

  const groupId = (inputEl.value || selectEl.value || '').trim();
  const command = commandEl.value.trim();
  const allowed = allowedEl.value === 'allow';

  if (!groupId || !command) {
    if (statusEl) {
      statusEl.textContent = 'Informe o ID do grupo e o comando antes de salvar.';
    }
    return;
  }

  if (statusEl) statusEl.textContent = 'Salvando permissão...';

  try {
    const response = await fetchWithCSRF(`/api/admin/group-commands/${encodeURIComponent(groupId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, allowed })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(getAdminErrorMessage(errorData, 'Erro ao salvar permissão'));
    }

    commandEl.value = '';
    if (statusEl) statusEl.textContent = 'Permissão salva com sucesso!';
    await loadGroupCommands(groupId);
  } catch (error) {
    console.error('Erro ao salvar permissão de comando:', error);
    if (statusEl) statusEl.textContent = error.message || 'Falha ao salvar permissão.';
  }
}

async function deleteGroupCommand(groupId, command) {
  if (!groupId || !command) return;
  if (!confirm(`Remover permissão do comando "${command}" para o grupo ${groupId}?`)) {
    return;
  }

  const statusEl = document.getElementById('groupCommandsStatus');
  if (statusEl) statusEl.textContent = 'Removendo permissão...';

  try {
    const response = await fetchWithCSRF(`/api/admin/group-commands/${encodeURIComponent(groupId)}/${encodeURIComponent(command)}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(getAdminErrorMessage(errorData, 'Erro ao remover permissão'));
    }
    if (statusEl) statusEl.textContent = 'Permissão removida.';
    await loadGroupCommands(groupId);
  } catch (error) {
    console.error('Erro ao remover permissão de comando:', error);
    if (statusEl) statusEl.textContent = error.message || 'Falha ao remover permissão.';
  }
}

const botScheduleSaveBtn = document.getElementById('botScheduleSave');
if (botScheduleSaveBtn && !botScheduleSaveBtn.dataset.bound) {
  botScheduleSaveBtn.dataset.bound = 'true';
  botScheduleSaveBtn.addEventListener('click', (event) => {
    event.preventDefault();
    saveBotSchedule();
  });
}

document.addEventListener('click', async (event) => {
  const openUsersBtn = event.target instanceof Element ? event.target.closest('[data-open-users]') : null;
  if (openUsersBtn) {
    setActiveMainTab('users', { updateHash: true });
  }

  const deleteCommandBtn = event.target instanceof Element ? event.target.closest('[data-delete-group-command]') : null;
  if (deleteCommandBtn) {
    const commandAttr = deleteCommandBtn.getAttribute('data-delete-group-command');
    const groupAttr = deleteCommandBtn.getAttribute('data-group-id');
    const command = commandAttr ? decodeURIComponent(commandAttr) : '';
    const groupId = groupAttr ? decodeURIComponent(groupAttr) : lastLoadedGroupCommandsId;
    deleteGroupCommand(groupId, command);
  }
  const dmRemoveBtn = event.target instanceof Element ? event.target.closest('[data-dm-remove]') : null;
  if (dmRemoveBtn) {
    const uid = dmRemoveBtn.getAttribute('data-dm-remove');
    if (!uid) return;
    if (!confirm('Remover usuário DM ' + uid + '?')) return;
    try {
      await removeDmUser(decodeURIComponent(uid));
    } catch (err) {
      alert('Falha ao remover: ' + (err.message || err));
    }
  }
});

// Add DM user button
document.getElementById('addDmUserBtn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const id = document.getElementById('dmUserIdInput')?.value?.trim();
  const allowed = !!document.getElementById('dmAllowedInput')?.checked;
  const blocked = !!document.getElementById('dmBlockedInput')?.checked;
  const statusEl = document.getElementById('dmUsersStatus');
  if (!id) return alert('Informe o User ID');
  if (statusEl) statusEl.textContent = 'Salvando...';
  try {
    await addDmUser(id, allowed, blocked, '');
    if (statusEl) statusEl.textContent = 'Salvo.';
  } catch (err) {
    console.error('Erro ao adicionar DM user:', err);
    if (statusEl) statusEl.textContent = 'Erro ao salvar.';
  }
});

function renderAdminUserInfo(user) {
  const infoEl = document.getElementById('adminUserInfo');
  if (!infoEl) return;

  if (user && user.username) {
    const username = escapeHtml(user.username);
    infoEl.innerHTML = `Logado como ${username} <button id="adminLogoutBtn" style="font-size:.75rem;">Logout</button>`;
    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = 'true';
      logoutBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        try {
          await fetchWithCSRF('/api/logout', { method: 'POST' });
        } catch (error) {
          console.warn('Falha ao realizar logout:', error);
        }
        window.location.reload();
      });
    }
  } else {
    infoEl.innerHTML = '<a href="/login">Login</a>';
  }
}

// Check and update UI based on user role
async function checkUserRole() {
  try {
    const response = await fetch('/api/me');
    if (response.ok) {
      const data = await response.json();
      currentUserRole = data.user?.role;
      renderAdminUserInfo(data.user);
      
      if (currentUserRole === 'admin') {
        // Show admin-only elements
        document.querySelectorAll('.admin-only').forEach(el => {
          el.classList.add('visible');
        });
      }
    } else {
      renderAdminUserInfo(null);
    }
  } catch (error) {
    console.warn('Failed to check user role:', error);
    renderAdminUserInfo(null);
  }
}

async function loadDuplicatesTab() {
  try {
    duplicatesLoaded = true;
    if (document.getElementById('duplicateStats')) {
      await loadDuplicateStats();
    }
  } catch (error) {
    console.error('Error loading duplicates tab:', error);
    const duplicateStatsElem = document.getElementById('duplicateStats');
    if (duplicateStatsElem) {
      duplicateStatsElem.textContent = 'Erro ao carregar estatísticas';
    }
  }
}

(async function boot(){
  try {
    await checkUserRole();
  } catch (error) {
    console.warn('Failed to check user role:', error.message);
  }
  
  try {
    await loadAccount();
  } catch (error) {
    console.warn('Failed to load account:', error.message);
  }
  
  try {
    await load();
  } catch (error) {
    console.warn('Failed to load basic data:', error.message);
  }
  
  try {
    await loadRules();
  } catch (error) {
    console.warn('Failed to load rules:', error.message);
  }
  
  try {
    await loadUsers();
  } catch (error) {
    console.warn('Failed to load users:', error.message);
  }
  
  // Initialize main tab functionality
  initializeMainTabs();
  
  // Initialize legacy tab functionality - always call this regardless of API errors
  initializeTabs();
  
  applyHashNavigation();
  
  // Do NOT load duplicates automatically anymore
  // They will be loaded only when the duplicates tab is clicked
})();

window.addEventListener('hashchange', () => {
  applyHashNavigation();
});

// ---- Duplicate Media Management Functions ----

let currentDuplicates = [];
let selectedDuplicateGroups = new Set();

async function loadDuplicateStats() {
  try {
    const stats = await fetchJSON('/api/admin/duplicates/stats');
    const statsElement = document.getElementById('duplicateStats');
    
    if (stats.duplicate_groups > 0) {
      statsElement.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.duplicate_groups}</div>
            <div class="stat-label">Grupos Duplicados</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.total_duplicates}</div>
            <div class="stat-label">Total de Duplicatas</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.potential_savings}</div>
            <div class="stat-label">Arquivos Excluíveis</div>
          </div>
        </div>
      `;
      document.getElementById('duplicatesContainer').style.display = 'block';
      await loadDuplicates();
    } else {
      statsElement.textContent = 'Nenhuma mídia duplicada encontrada 🎉';
      document.getElementById('duplicatesContainer').style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading duplicate stats:', error);
    document.getElementById('duplicateStats').textContent = 'Erro ao carregar estatísticas';
  }
}

async function loadDuplicates() {
  try {
    const duplicates = await fetchJSON('/api/admin/duplicates?limit=50');
    currentDuplicates = duplicates;
    renderDuplicates(duplicates);
  } catch (error) {
    console.error('Error loading duplicates:', error);
    document.getElementById('duplicatesList').innerHTML = '<p class="muted">Erro ao carregar duplicatas</p>';
  }
}

function renderDuplicates(duplicates) {
  const container = document.getElementById('duplicatesList');
  
  if (!duplicates || duplicates.length === 0) {
    container.innerHTML = '<p class="muted">Nenhuma duplicata encontrada</p>';
    return;
  }
  
  container.innerHTML = duplicates.map(group => {
    const firstCreated = new Date(group.first_created).toLocaleDateString('pt-BR');
    const lastCreated = new Date(group.last_created).toLocaleDateString('pt-BR');
    
    return `
      <div class="duplicate-group">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem;">
          <h4>Grupo com ${group.duplicate_count} duplicatas</h4>
          <label>
            <input type="checkbox" class="group-checkbox" data-hash="${group.hash_visual}">
            Selecionar grupo
          </label>
        </div>
        <div class="muted" style="margin-bottom: .5rem;">
          Hash: ${group.hash_visual.substring(0, 16)}... | 
          Primeiro: ${firstCreated} | Último: ${lastCreated}
        </div>
        <div id="details-${group.hash_visual}" style="display: none;">
          <div class="muted">Carregando detalhes...</div>
        </div>
        <button class="btn-primary btn-small" onclick="toggleGroupDetails('${group.hash_visual}')">
          Ver Detalhes
        </button>
      </div>
    `;
  }).join('');
  
  updateSelectionButtons();
}

async function toggleGroupDetails(hashVisual) {
  const detailsDiv = document.getElementById(`details-${hashVisual}`);
  
  if (detailsDiv.style.display === 'none') {
    // Load and show details
    try {
      const details = await fetchJSON(`/api/admin/duplicates/${encodeURIComponent(hashVisual)}`);
      
      detailsDiv.innerHTML = details.map((media, index) => {
        const date = new Date(media.timestamp).toLocaleDateString('pt-BR');
        const isOldest = index === 0; // Details are returned sorted by timestamp ASC
        
        return `
          <div class="duplicate-item ${isOldest ? 'oldest' : ''}">
            <div class="media-info">
              <strong>ID: ${media.id}</strong> ${isOldest ? '(Mais antiga - será mantida)' : ''}<br>
              <span class="muted">
                ${date} | ${media.mimetype} | 
                ${media.display_name || 'Usuário desconhecido'}
                ${media.description ? ` | ${media.description.substring(0, 50)}...` : ''}
              </span>
            </div>
            <div class="media-actions">
              <img class="media-preview" src="${media.url || '/media/' + media.file_path.split('/').pop()}" 
                   onerror="this.style.display='none'" alt="Preview">
            </div>
          </div>
        `;
      }).join('');
      
      detailsDiv.style.display = 'block';
    } catch (error) {
      console.error('Error loading group details:', error);
      detailsDiv.innerHTML = '<div class="muted">Erro ao carregar detalhes</div>';
      detailsDiv.style.display = 'block';
    }
  } else {
    // Hide details
    detailsDiv.style.display = 'none';
  }
}

function updateSelectionButtons() {
  const checkboxes = document.querySelectorAll('.group-checkbox');
  const selectAllCheckbox = document.getElementById('selectAllDuplicates');
  const deleteButton = document.getElementById('deleteSelectedDuplicates');
  
  // Update select all checkbox
  const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
  selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  selectAllCheckbox.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
  
  // Update delete button
  deleteButton.disabled = checkedCount === 0;
  deleteButton.textContent = checkedCount > 0 
    ? `Deletar ${checkedCount} Grupo(s) Selecionado(s)` 
    : 'Deletar Selecionados';
}

async function deleteSelectedDuplicates() {
  const checkboxes = document.querySelectorAll('.group-checkbox:checked');
  const selectedHashes = Array.from(checkboxes).map(cb => cb.dataset.hash);
  
  if (selectedHashes.length === 0) {
    alert('Selecione pelo menos um grupo de duplicatas para deletar.');
    return;
  }
  
  const confirmMsg = `Tem certeza que deseja deletar ${selectedHashes.length} grupo(s) de duplicatas?\n\n` +
                     `Isso irá manter apenas a mídia mais antiga de cada grupo e deletar as demais.\n` +
                     `Esta ação é IRREVERSÍVEL.`;
  
  if (!confirm(confirmMsg)) {
    return;
  }
  
  const deleteButton = document.getElementById('deleteSelectedDuplicates');
  const originalText = deleteButton.textContent;
  deleteButton.disabled = true;
  deleteButton.textContent = 'Deletando...';
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const hashVisual of selectedHashes) {
    try {
      const result = await fetchWithCSRF(`/api/admin/duplicates/${encodeURIComponent(hashVisual)}`, {
        method: 'DELETE'
      });
      
      if (result.ok) {
        successCount++;
      } else {
        const data = await result.json().catch(() => ({}));
        if (data.error === 'forbidden') {
          alert('Você não tem permissão de administrador para deletar duplicatas.');
          break; // Stop processing if user lacks permissions
        }
        errorCount++;
      }
    } catch (error) {
      console.error('Error deleting duplicate group:', error);
      errorCount++;
    }
  }
  
  alert(`Exclusão concluída!\n\nGrupos deletados: ${successCount}\nErros: ${errorCount}`);
  
  // Reload the duplicates list
  await loadDuplicateStats();
  
  deleteButton.disabled = false;
  deleteButton.textContent = originalText;
}

// Event listeners for duplicate management
const refreshDuplicatesBtn = document.getElementById('refreshDuplicates');
const selectAllCheckbox = document.getElementById('selectAllDuplicates');
const deleteSelectedBtn = document.getElementById('deleteSelectedDuplicates');

if (refreshDuplicatesBtn) {
  refreshDuplicatesBtn.addEventListener('click', async () => {
    const btn = document.getElementById('refreshDuplicates');
    btn.disabled = true;
    btn.textContent = 'Processando...';
    try {
      const res = await fetch('/api/admin/duplicates/dhash-scan');
      const data = await res.json();
      const container = document.getElementById('duplicatesList');
      container.innerHTML = '';
      if (data.groups && data.groups.length > 0) {
        data.groups.forEach(group => {
          const div = document.createElement('div');
          div.className = 'duplicate-group';
          div.innerHTML = `<h4>Grupo (${group.length} duplicatas)</h4>` +
            group.map(item => `<div class='duplicate-item' data-id='${item.id}'><span class='media-info'>ID: ${item.id} | Caminho: ${item.file_path}</span> <button class='btn-danger btn-delete-dup' data-id='${item.id}'>Deletar</button></div>`).join('');
          container.appendChild(div);
        });
        // Adiciona handler de exclusão
        container.querySelectorAll('.btn-delete-dup').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const id = btn.getAttribute('data-id');
            btn.disabled = true;
            btn.textContent = 'Deletando...';
            try {
              const res = await fetch(`/api/admin/duplicates/${id}`, { method: 'DELETE' });
              if (res.ok) {
                // Remove item da interface
                const itemDiv = btn.closest('.duplicate-item');
                const groupDiv = btn.closest('.duplicate-group');
                itemDiv.remove();
                // Se só sobrou 1 no grupo, remove grupo
                if (groupDiv.querySelectorAll('.duplicate-item').length <= 1) {
                  groupDiv.remove();
                }
              } else {
                alert('Erro ao deletar mídia.');
                btn.disabled = false;
                btn.textContent = 'Deletar';
              }
            } catch (err) {
              alert('Erro ao deletar mídia: ' + (err.message || err));
              btn.disabled = false;
              btn.textContent = 'Deletar';
            }
          });
        });
        document.getElementById('duplicatesContainer').style.display = '';
      } else {
        container.innerHTML = '<div class="muted">Nenhuma duplicata encontrada.</div>';
        document.getElementById('duplicatesContainer').style.display = '';
      }
    } catch (e) {
      alert('Erro ao buscar duplicatas: ' + (e.message || e));
    }
    btn.disabled = false;
    btn.textContent = 'Atualizar';
  });
}

if (selectAllCheckbox) {
  selectAllCheckbox.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.group-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
    updateSelectionButtons();
  });
}

if (deleteSelectedBtn) {
  deleteSelectedBtn.addEventListener('click', deleteSelectedDuplicates);
}

// Handle group checkbox changes
document.addEventListener('change', (e) => {
  if (e.target instanceof Element && e.target.classList.contains('group-checkbox')) {
    updateSelectionButtons();
  }
});

// ===== LOGS FUNCTIONALITY =====
let currentLogsData = { logs: [], total: 0 };
let logsEventSource = null;
let logsCurrentOffset = 0;
const logsPerPage = 50;

// Formatação de logs para exibição
function formatLogLevel(level) {
  const levelColors = {
    'info': '#00ff00',
    'warn': '#ffff00',
    'error': '#ff0000'
  };
  return `<span style="color: ${levelColors[level] || '#00ff00'};">[${level.toUpperCase()}]</span>`;
}

function formatLogTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

function formatLogMessage(message) {
  // Escape HTML and preserve line breaks
  return message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function renderLogs(logs) {
  const logsContent = document.getElementById('logsContent');
  if (!logs || logs.length === 0) {
    logsContent.innerHTML = '<div style="color: #666;">Nenhum log encontrado.</div>';
    return;
  }

  const logLines = logs.map(log => {
    const timestamp = formatLogTimestamp(log.timestamp);
    const level = formatLogLevel(log.level);
    const message = formatLogMessage(log.message);
    const source = log.source ? `<span style="color: #888;">(${log.source})</span>` : '';
    
    return `<div style="margin-bottom: 0.5rem;">
      <span style="color: #888;">[${timestamp}]</span> ${level} ${message} ${source}
    </div>`;
  }).join('');

  logsContent.innerHTML = logLines;
  
  // Auto-scroll para baixo se estiver na primeira página
  if (logsCurrentOffset === 0) {
    const container = document.getElementById('logsContainer');
    container.scrollTop = container.scrollHeight;
  }
}

function updateLogsStats(stats) {
  if (!stats) return;
  
  document.getElementById('totalLogs').textContent = stats.total || 0;
  document.getElementById('infoLogs').textContent = stats.byLevel?.info || 0;
  document.getElementById('warnLogs').textContent = stats.byLevel?.warn || 0;
  document.getElementById('errorLogs').textContent = stats.byLevel?.error || 0;
}

function updateLogsPagination(data) {
  const info = document.getElementById('logsInfo');
  const prevBtn = document.getElementById('prevLogs');
  const nextBtn = document.getElementById('nextLogs');
  
  const start = data.offset + 1;
  const end = Math.min(data.offset + data.logs.length, data.total);
  
  info.textContent = data.total > 0 
    ? `Mostrando ${start}-${end} de ${data.total} logs`
    : 'Nenhum log encontrado';
  
  prevBtn.disabled = data.offset === 0;
  nextBtn.disabled = data.offset + data.logs.length >= data.total;
}

async function loadLogs(options = {}) {
  try {
    const params = new URLSearchParams({
      level: options.level || document.getElementById('logLevelFilter').value,
      search: options.search || document.getElementById('logSearchFilter').value,
      limit: logsPerPage,
      offset: options.offset || logsCurrentOffset
    });

    const response = await fetchJSON(`/api/admin/logs?${params}`);
    currentLogsData = response;
    
    renderLogs(response.logs);
    updateLogsStats(response.stats);
    updateLogsPagination(response);
    
    logsCurrentOffset = options.offset || logsCurrentOffset;
  } catch (error) {
    console.error('Erro ao carregar logs:', error);
    document.getElementById('logsContent').innerHTML = 
      '<div style="color: #ff0000;">Erro ao carregar logs. Verifique se você tem permissão de admin.</div>';
  }
}

async function clearLogs() {
  if (!confirm('Tem certeza que deseja limpar todos os logs? Esta ação não pode ser desfeita.')) {
    return;
  }

  try {
    const response = await fetchWithCSRF('/api/admin/logs', { method: 'DELETE' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    
    alert('Logs limpos com sucesso!');
    await loadLogs({ offset: 0 });
    logsCurrentOffset = 0;
  } catch (error) {
    console.error('Erro ao limpar logs:', error);
    alert('Erro ao limpar logs: ' + error.message);
  }
}

function startLogsSSE() {
  // Parar conexão anterior se existir
  if (logsEventSource) {
    logsEventSource.close();
  }

  try {
    logsEventSource = new EventSource('/api/admin/logs/stream');
    
    logsEventSource.onmessage = function(event) {
      const data = JSON.parse(event.data);
      
      if (data.type === 'initial') {
        currentLogsData = data;
        renderLogs(data.logs);
        updateLogsStats(data.stats);
      } else if (data.type === 'update') {
        // Atualizar apenas se estamos na primeira página e sem filtros
        const levelFilter = document.getElementById('logLevelFilter').value;
        const searchFilter = document.getElementById('logSearchFilter').value;
        
        if (logsCurrentOffset === 0 && levelFilter === 'all' && !searchFilter) {
          currentLogsData = data;
          renderLogs(data.logs);
          updateLogsStats(data.stats);
        }
      }
    };
    
    logsEventSource.onerror = function(error) {
      console.warn('[SSE] Erro na conexão de logs:', error);
    };
  } catch (error) {
    console.error('Erro ao iniciar SSE de logs:', error);
  }
}

function stopLogsSSE() {
  if (logsEventSource) {
    logsEventSource.close();
    logsEventSource = null;
  }
}

// Event listeners para logs
document.getElementById('refreshLogs')?.addEventListener('click', () => {
  loadLogs({ offset: 0 });
  logsCurrentOffset = 0;
});

document.getElementById('clearLogs')?.addEventListener('click', clearLogs);

document.getElementById('logLevelFilter')?.addEventListener('change', () => {
  loadLogs({ offset: 0 });
  logsCurrentOffset = 0;
});

document.getElementById('logSearchFilter')?.addEventListener('input', () => {
  // Debounce search
  clearTimeout(window.searchTimeout);
  window.searchTimeout = setTimeout(() => {
    loadLogs({ offset: 0 });
    logsCurrentOffset = 0;
  }, 500);
});

document.getElementById('autoRefreshLogs')?.addEventListener('change', (e) => {
  if (e.target.checked) {
    startLogsSSE();
  } else {
    stopLogsSSE();
  }
});

document.getElementById('prevLogs')?.addEventListener('click', () => {
  if (logsCurrentOffset > 0) {
    logsCurrentOffset = Math.max(0, logsCurrentOffset - logsPerPage);
    loadLogs({ offset: logsCurrentOffset });
  }
});

document.getElementById('nextLogs')?.addEventListener('click', () => {
  if (logsCurrentOffset + logsPerPage < currentLogsData.total) {
    logsCurrentOffset += logsPerPage;
    loadLogs({ offset: logsCurrentOffset });
  }
});
