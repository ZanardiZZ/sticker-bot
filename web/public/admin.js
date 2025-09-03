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
      const response = await fetch('/api/csrf-token');
      const data = await response.json();
      csrfToken = data.csrfToken;
    } catch (e) {
      console.warn('Failed to fetch CSRF token:', e);
    }
  }
  return csrfToken;
}

async function fetchWithCSRF(url, options = {}) {
  // Add CSRF token for POST/PUT/DELETE requests
  if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method.toUpperCase())) {
    const token = await getCSRFToken();
    if (token) {
      options.headers = options.headers || {};
      options.headers['X-CSRF-Token'] = token;
    }
  }
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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #999;">Nenhum usuário encontrado</td></tr>';
    return;
  }
  
  tbody.innerHTML = users.map(user => {
    const createdAt = new Date(user.created_at).toLocaleString('pt-BR');
    const statusBadge = getStatusBadge(user.status);
    const actions = getActionButtons(user);
    const phone = user.phone_number ? maskPhone(user.phone_number) : '—';
    const contactName = user.contact_display_name || '—';
    const canEdit = user.can_edit ? '✓' : '✗';
    const email = user.email || '—';
    const emailStatus = getEmailStatusBadge(user.email_confirmed);
    
    return `
      <tr data-user-id="${user.id}">
        <td>${user.id}</td>
        <td>${user.username}</td>
        <td>${email}</td>
        <td>${emailStatus}</td>
        <td>${phone}</td>
        <td>${contactName}</td>
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
  }
});

// ---- Tab Management Functions ----

let duplicatesLoaded = false;
let currentUserRole = null;

// Initialize main tab navigation
function initializeMainTabs() {
  const mainTabButtons = document.querySelectorAll('.main-tab-button');
  const mainTabContents = document.querySelectorAll('.main-tab-content');
  
  mainTabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      
      // Remove active class from all buttons and contents
      mainTabButtons.forEach(btn => btn.classList.remove('active'));
      mainTabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      document.getElementById(`main-tab-${tabId}`).classList.add('active');
      
      // Load duplicates only when duplicates tab is clicked for the first time
      if (tabId === 'duplicates' && !duplicatesLoaded) {
        loadDuplicatesTab();
      }
      
      // Initialize logs when logs tab is clicked
      if (tabId === 'logs') {
        loadLogs({ offset: 0 });
        logsCurrentOffset = 0;
        
        // Start SSE if auto-refresh is enabled
        if (document.getElementById('autoRefreshLogs')?.checked) {
          startLogsSSE();
        }
      } else {
        // Stop SSE when leaving logs tab
        stopLogsSSE();
      }
    });
  });
}

// Legacy tab function for backwards compatibility
function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      
      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      document.getElementById(`tab-${tabId}`).classList.add('active');
      
      // Load duplicates only when duplicates tab is clicked for the first time
      if (tabId === 'duplicates' && !duplicatesLoaded) {
        loadDuplicatesTab();
      }
    });
  });
}

// Check and update UI based on user role
async function checkUserRole() {
  try {
    const response = await fetch('/api/me');
    if (response.ok) {
      const data = await response.json();
      currentUserRole = data.user?.role;
      
      if (currentUserRole === 'admin') {
        // Show admin-only elements
        document.querySelectorAll('.admin-only').forEach(el => {
          el.classList.add('visible');
        });
      }
    }
  } catch (error) {
    console.warn('Failed to check user role:', error);
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
  
  // Do NOT load duplicates automatically anymore
  // They will be loaded only when the duplicates tab is clicked
})();

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