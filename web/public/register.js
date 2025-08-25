document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('registerForm');
  const message = document.getElementById('message');
  const submitBtn = document.getElementById('submitBtn');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const usernameInput = document.getElementById('username');
  const phoneNumberInput = document.getElementById('phoneNumber');

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

  // Phone number validation
  phoneNumberInput.addEventListener('input', function() {
    const value = this.value.replace(/\D/g, ''); // Remove non-digits
    this.value = value;
    if (value && (value.length < 10 || value.length > 15)) {
      this.setCustomValidity('Número deve ter entre 10 e 15 dígitos');
    } else {
      this.setCustomValidity('');
    }
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

    const phoneNumber = phoneNumberInput.value.replace(/\D/g, '');
    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
      showMessage('Número de telefone inválido', true);
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
        phoneNumber: phoneNumber
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
        showMessage('Cadastro realizado com sucesso! Aguarde a aprovação de um administrador para acessar o sistema.');
        form.reset();
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      } else {
        // Handle specific error messages
        const errorMessage = getErrorMessage(data.error);
        showMessage(errorMessage, true);
      }
    } catch (error) {
      console.error('Registration error:', error);
      showMessage('Erro ao realizar cadastro. Tente novamente.', true);
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
      'db_error': 'Erro interno do servidor. Tente novamente mais tarde.',
      'registration_disabled': 'Cadastro não está disponível no momento'
    };
    
    return errorMessages[errorCode] || 'Erro desconhecido. Tente novamente.';
  }
});