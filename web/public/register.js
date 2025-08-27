document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('registerForm');
  const message = document.getElementById('message');
  const submitBtn = document.getElementById('submitBtn');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const usernameInput = document.getElementById('username');
  const phoneNumberInput = document.getElementById('phoneNumber');
  const emailInput = document.getElementById('email');
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

  // Show message function
  function showMessage(text, isError = false) {
    message.textContent = text;
    message.className = isError ? 'error' : 'success';
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Hide message function
  function hideMessage() {
    message.className = 'hidden';
    message.textContent = '';
  }

  // Username validation
  usernameInput.addEventListener('input', function() {
    const value = this.value;
    if (value && !/^[a-zA-Z0-9_]+$/.test(value)) {
      this.setCustomValidity('Nome de usuário deve conter apenas letras, números e underscore');
    } else {
      this.setCustomValidity('');
    }
  });

  // Email validation
  emailInput.addEventListener('input', function() {
    const value = this.value;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value && !emailRegex.test(value)) {
      this.setCustomValidity('Digite um email válido');
    } else {
      this.setCustomValidity('');
    }
  });

  // Phone number validation
  phoneNumberInput.addEventListener('input', function() {
    const value = this.value;
    // Do not modify this.value here to avoid interfering with user typing
    if (value && (!/^\d+$/.test(value) || value.length < 10 || value.length > 15)) {
      this.setCustomValidity('Número deve ter entre 10 e 15 dígitos e conter apenas números');
    } else {
      this.setCustomValidity('');
    }
  });

  // Optionally, clean up the value on blur to enforce digit-only input
  phoneNumberInput.addEventListener('blur', function() {
    this.value = this.value.replace(/\D/g, '');
  });
  // Password confirmation validation
  function checkPasswordConfirmation() {
    if (confirmPasswordInput.value && passwordInput.value !== confirmPasswordInput.value) {
      confirmPasswordInput.setCustomValidity('Senhas não conferem');
    } else {
      confirmPasswordInput.setCustomValidity('');
    }
  }

  passwordInput.addEventListener('input', checkPasswordConfirmation);
  confirmPasswordInput.addEventListener('input', checkPasswordConfirmation);

  // Form submission
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    hideMessage();

    // Additional client-side validation
    if (passwordInput.value !== confirmPasswordInput.value) {
      showMessage('As senhas não conferem', true);
      return;
    }

    if (passwordInput.value.length < 8) {
      showMessage('A senha deve ter pelo menos 8 caracteres', true);
      return;
    }

    if (usernameInput.value.length < 3) {
      showMessage('O nome de usuário deve ter pelo menos 3 caracteres', true);
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(usernameInput.value)) {
      showMessage('Nome de usuário deve conter apenas letras, números e underscore', true);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput.value)) {
      showMessage('Digite um email válido', true);
      return;
    }

    const phoneNumber = phoneNumberInput.value.replace(/\D/g, '');
    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
      showMessage('Número de telefone inválido', true);
      return;
    }

    if (!captchaInput.value) {
      showMessage('Resolva a operação matemática', true);
      return;
    }

    if (!currentCaptchaSession) {
      showMessage('CAPTCHA inválido, recarregue a página', true);
      return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Cadastrando...';

    try {
      const formData = new FormData(form);
      const payload = {
        username: formData.get('username').trim(),
        password: formData.get('password'),
        email: emailInput.value.trim(),
        phoneNumber: phoneNumber,
        captchaAnswer: captchaInput.value,
        captchaSession: currentCaptchaSession
      };

      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        showMessage(data.message || 'Cadastro realizado com sucesso! Verifique seu email para confirmar sua conta.');
        form.reset();
        loadCaptcha(); // Reload CAPTCHA for security
        
        // Redirect to login after 5 seconds
        setTimeout(() => {
          window.location.href = '/login';
        }, 5000);
      } else {
        // Handle specific error messages
        const errorMessage = getErrorMessage(data.error);
        showMessage(errorMessage, true);
        
        // Reload CAPTCHA on error for security
        loadCaptcha();
      }
    } catch (error) {
      console.error('Registration error:', error);
      showMessage('Erro ao realizar cadastro. Tente novamente.', true);
      loadCaptcha(); // Reload CAPTCHA on error
    } finally {
      // Re-enable submit button
      submitBtn.disabled = false;
      submitBtn.textContent = 'Cadastrar';
    }
  });

  // Error message mapping
  function getErrorMessage(errorCode) {
    const errorMessages = {
      'missing_fields': 'Preencha todos os campos obrigatórios',
      'invalid_username': 'Nome de usuário inválido (mín. 3 caracteres, apenas letras, números e underscore)',
      'username_taken': 'Este nome de usuário já está em uso',
      'invalid_password': 'Senha inválida (mínimo 8 caracteres)',
      'invalid_phone': 'Número de telefone inválido',
      'phone_taken': 'Este número de telefone já está cadastrado',
      'invalid_email': 'Email inválido',
      'email_taken': 'Este email já está cadastrado',
      'invalid_captcha': 'Resposta do CAPTCHA incorreta',
      'invalid_captcha_session': 'Sessão do CAPTCHA expirada, recarregue a página',
      'too_many_registration_attempts': 'Muitas tentativas de cadastro. Tente novamente em 15 minutos.',
      'db_error': 'Erro interno do servidor. Tente novamente mais tarde.',
      'registration_disabled': 'Cadastro não está disponível no momento'
    };
    
    return errorMessages[errorCode] || 'Erro desconhecido. Tente novamente.';
  }
});