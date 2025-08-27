document.addEventListener('DOMContentLoaded', function() {
  const f = document.getElementById('form');
  const err = document.getElementById('err');
  const submitBtn = document.getElementById('submitBtn');
  const captchaInput = document.getElementById('captcha');
  const captchaQuestion = document.getElementById('captchaQuestion');
  const refreshCaptchaBtn = document.getElementById('refreshCaptcha');
  
  let currentCaptchaSession = null;

  // Load CAPTCHA
  async function loadCaptcha() {
    try {
      const response = await fetch('/api/captcha');
      const data = await response.json();
      if (response.ok) {
        captchaQuestion.textContent = data.question + ' = ';
        currentCaptchaSession = data.session;
        captchaInput.value = '';
      } else {
        captchaQuestion.textContent = 'Erro ao carregar';
      }
    } catch (error) {
      console.error('Error loading CAPTCHA:', error);
      captchaQuestion.textContent = 'Erro ao carregar';
    }
  }

  // Load CAPTCHA on page load
  loadCaptcha();

  // Refresh CAPTCHA button
  refreshCaptchaBtn.addEventListener('click', loadCaptcha);

  // Show error message
  function showError(message) {
    err.textContent = message;
    err.style.display = 'block';
  }

  // Hide error message
  function hideError() {
    err.style.display = 'none';
    err.textContent = '';
  }

  f.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    hideError();

    const fd = new FormData(f);
    const captchaAnswer = captchaInput.value;

    // Validate captcha
    if (!captchaAnswer) {
      showError('Resolva a operação matemática');
      return;
    }

    if (!currentCaptchaSession) {
      showError('CAPTCHA inválido, recarregue a página');
      return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';

    try {
      const payload = { 
        username: fd.get('username'), 
        password: fd.get('password'),
        captchaAnswer: captchaAnswer,
        captchaSession: currentCaptchaSession
      };

      const r = await fetch('/api/login', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify(payload) 
      });

      if (r.ok) {
        location.href = '/';
      } else { 
        const d = await r.json().catch(() => ({})); 
        const errorMsg = d.error === 'account_not_approved' ? d.message : 
                         d.error === 'email_not_confirmed' ? d.message :
                         d.error === 'invalid_credentials' ? 'Usuário ou senha inválidos' :
                         d.error === 'invalid_captcha_session' ? 'CAPTCHA inválido, tente novamente' :
                         d.error === 'invalid_captcha' ? 'Resposta do CAPTCHA incorreta' :
                         d.error || 'Erro';
        showError(errorMsg);
        
        // Reload CAPTCHA on error for security
        loadCaptcha();
      }
    } catch (error) {
      console.error('Login error:', error);
      showError('Erro ao realizar login. Tente novamente.');
      loadCaptcha(); // Reload CAPTCHA on error
    } finally {
      // Re-enable submit button
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
    }
  });
});