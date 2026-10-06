// Экран логина/регистрации. Управляет видимостью auth-секции,
// верификацией email, переходом в ролевой кабинет.

const authUi = (() => {
  const $ = (s) => document.querySelector(s);

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function toast(msg, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast toast--${type}`;
    setTimeout(() => t.classList.add('hidden'), 3500);
  }

  function attach() {
    document.querySelectorAll('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const name = tab.dataset.tab;
        $('#login-form').classList.toggle('hidden', name !== 'login');
        $('#register-form').classList.toggle('hidden', name !== 'register');
        $('#verify-form').classList.add('hidden');
      });
    });

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        const resp = await api.login(data);
        api.setToken(resp.token);
        await afterLogin(resp.user);
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    $('#register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        const resp = await api.register(data);
        // в MVP сразу показываем форму верификации
        $('#verify-email').value = resp.email;
        $('#verify-form').classList.remove('hidden');
        $('#register-hint').textContent =
          `Код подтверждения: ${resp.dev_verification_code || '(см. консоль сервера)'} ` +
          `(отправлен на ${resp.email}). Введите его ниже для активации.`;
        toast('Регистрация успешна. Введите код подтверждения.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    $('#btn-verify').addEventListener('click', async () => {
      try {
        await api.verifyEmail($('#verify-email').value, $('#verify-code').value);
        toast('Email подтверждён. Теперь войдите.', 'success');
        document.querySelector('.auth-tab[data-tab="login"]').click();
        $('#login-form input[name="email"]').value = $('#verify-email').value;
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  async function afterLogin(user) {
    if (user.role === 'candidate') {
      show('candidate-screen');
      candidateUi.init();
    } else if (user.role === 'employer') {
      show('employer-screen');
      await employerUi.init();
    }
    $('#topbar-user').innerHTML = `
      <span class="user-chip">${user.email} · ${user.role}</span>
      <button class="btn btn--ghost btn--small" id="btn-logout">Выйти</button>
    `;
    document.getElementById('btn-logout').addEventListener('click', async () => {
      try { await api.logout(); } catch (e) {}
      api.setToken(null);
      show('auth-screen');
      $('#topbar-user').innerHTML = '';
    });
  }

  async function boot() {
    attach();
    if (api.getToken()) {
      try {
        const user = await api.me();
        await afterLogin(user);
      } catch (err) {
        api.setToken(null);
        show('auth-screen');
      }
    } else {
      show('auth-screen');
    }
  }

  return { boot, afterLogin, show, toast };
})();