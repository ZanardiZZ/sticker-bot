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
  const range = document.getElementById('range').value;
  const { from, to } = rangeToFromTo(range);
  const q = new URLSearchParams({ from, to }).toString();
  const data = await fetchJSON('/api/admin/metrics/summary?' + q);

  document.getElementById('k_total').textContent = data.totals?.total ?? 0;
  document.getElementById('k_ips').textContent = data.totals?.unique_ips ?? 0;

  fillTable(document.querySelector('#tblStatus tbody'), data.status || [], ['status','c']);
  fillTable(document.querySelector('#tblPaths tbody'), data.top_paths || [], ['path','c']);
  fillTable(document.querySelector('#tblRef tbody'), data.top_referrers || [], ['referrer','c']);

  const recent = (data.recent || []).map(r => ({
    quando: new Date(r.ts).toLocaleString(),
    ip: r.ip, method: r.method, path: r.path, status: r.status, ms: r.duration_ms
  }));
  fillTable(document.querySelector('#tblRecent tbody'), recent, ['quando','ip','method','path','status','ms']);

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

document.getElementById('range').addEventListener('change', load);
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
(async function boot(){
  await loadAccount();
  await load();
  await loadRules();
})();