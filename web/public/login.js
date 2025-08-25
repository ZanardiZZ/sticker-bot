const f = document.getElementById('form');
const err = document.getElementById('err');
f.addEventListener('submit', async (e) => {
  e.preventDefault(); err.textContent = '';
  const fd = new FormData(f);
  const payload = { username: fd.get('username'), password: fd.get('password') };
  const r = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  if (r.ok) location.href = '/';
  else { 
    const d = await r.json().catch(() => ({})); 
    const errorMsg = d.error === 'account_not_approved' ? d.message : 
                     d.error === 'email_not_confirmed' ? d.message :
                     d.error === 'invalid_credentials' ? 'Usuário ou senha inválidos' :
                     d.error || 'Erro';
    err.textContent = errorMsg; 
  }
});