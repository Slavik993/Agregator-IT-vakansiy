// Экран логина/регистрации. Управляет видимостью auth-секции,
// верификацией email, переходом в ролевой кабинет.

const authUi = (() => {
  const $ = (s) => document.querySelector(s);

  const PENDING_EMAIL_KEY = 'agregator_pending_verification';

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

  function setHint(text) {
    const h = $('#verify-hint');
    if (h) h.innerHTML = text;
  }

  function rememberPending(email, code) {
    if (email) localStorage.setItem(PENDING_EMAIL_KEY, email);
    if (code) localStorage.setItem(PENDING_EMAIL_KEY + ':code', code);
  }

  function forgetPending() {
    localStorage.removeItem(PENDING_EMAIL_KEY);
    localStorage.removeItem(PENDING_EMAIL_KEY + ':code');
  }

  function showVerifyForm(email, code) {
    $('#login-form').classList.add('hidden');
    $('#register-form').classList.add('hidden');
    $('#verify-form').classList.remove('hidden');
    if (email) $('#verify-email').value = email;
    if (code) $('#verify-code').value = '';
    updateHint(email, code);
  }

  function updateHint(email, code) {
    if (!email) {
      setHint('Введите email, на который был отправлен код, и сам код.');
      return;
    }
    const safeCode = code ? String(code).replace(/./g, '<span class="code-digit">$&</span>') : '—';
    setHint(
      `Email: <strong>${email}</strong><br>` +
      `Код подтверждения: <code class="dev-code">${code || '—'}</code><br>` +
      `<small>В MVP код возвращается прямо в UI. На Render и других хостингах консоль сервера недоступна, поэтому код виден здесь. В продакшене код отправляется на e-mail.</small>`
    );
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
        rememberPending(resp.email, resp.dev_verification_code);
        showVerifyForm(resp.email, resp.dev_verification_code);
        toast('Регистрация успешна. Код показан ниже — введите его.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    $('#btn-verify').addEventListener('click', async () => {
      try {
        await api.verifyEmail($('#verify-email').value, $('#verify-code').value);
        forgetPending();
        toast('Email подтверждён. Теперь войдите.', 'success');
        document.querySelector('.auth-tab[data-tab="login"]').click();
        $('#login-form input[name="email"]').value = $('#verify-email').value;
        $('#verify-form').classList.add('hidden');
        $('#verify-code').value = '';
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    $('#btn-resend').addEventListener('click', async () => {
      const email = $('#verify-email').value || localStorage.getItem(PENDING_EMAIL_KEY);
      if (!email) {
        toast('Сначала зарегистрируйтесь или укажите email.', 'error');
        return;
      }
      try {
        const r = await api.resendCode(email);
        if (r.already_verified) {
          toast('Email уже подтверждён — войдите.', 'success');
          document.querySelector('.auth-tab[data-tab="login"]').click();
          $('#login-form input[name="email"]').value = email;
          return;
        }
        rememberPending(email, r.dev_verification_code);
        updateHint(email, r.dev_verification_code);
        toast('Новый код сгенерирован и показан ниже.', 'success');
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
      <span class="user-chip">${user.email} · ${user.role}${user.email_verified ? '' : ' · ✉️ не подтверждён'}</span>
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
        return;
      } catch (err) {
        api.setToken(null);
      }
    }
    // Если есть незавершённая верификация — сразу покажем форму кода.
    const pendingEmail = localStorage.getItem(PENDING_EMAIL_KEY);
    const pendingCode = localStorage.getItem(PENDING_EMAIL_KEY + ':code');
    if (pendingEmail) {
      showVerifyForm(pendingEmail, pendingCode);
    } else {
      show('auth-screen');
    }
  }

  return { boot, afterLogin, show, toast };
})();