function rangeToFromTo(value){
  const to = Date.now();
  const map = { '24h': 24*60*60*1000, '7d': 7*24*60*60*1000, '30d': 30*24*60*60*1000 };
  const win = map[value] || map['24h'];
  return { from: to - win, to };
}

async function fetchJSON(url){
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
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
  const r = await fetch('/api/admin/ip-rules', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ ip, action, ttl_minutes: ttl, reason })
  });
  if (!r.ok) return alert('Falha ao adicionar regra');
  document.getElementById('ip').value = ''; document.getElementById('ttl').value = ''; document.getElementById('reason').value = '';
  await loadRules();
});

document.addEventListener('click', async (e) => {
  const id = e.target?.dataset?.del;
  if (!id) return;
  if (!confirm('Remover a regra #' + id + '?')) return;
  const r = await fetch('/api/admin/ip-rules/' + id, { method:'DELETE' });
  if (!r.ok) return alert('Falha ao remover');
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
      alert('Erro ao aprovar usuário: ' + (data.error || 'Erro desconhecido'));
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
      alert('Erro ao rejeitar usuário: ' + (data.error || 'Erro desconhecido'));
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
      alert('Erro ao alterar permissões: ' + (data.error || 'Erro desconhecido'));
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

(async function boot(){
  await loadAccount();
  await load();
  await loadRules();
  await loadUsers(); // Load users on page init
})();