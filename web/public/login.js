const f = document.getElementById('form');
const err = document.getElementById('err');
f.addEventListener('submit', async (e) => {
  e.preventDefault(); err.textContent = '';
  const fd = new FormData(f);
  const payload = { username: fd.get('username'), password: fd.get('password') };
  const r = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  if (r.ok) location.href = '/';
  else { const d = await r.json().catch(() => ({})); err.textContent = d.error || 'Erro'; }
});