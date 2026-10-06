// Личный кабинет работодателя: компания, вакансии, подбор, поиск, офферы, отклики, задания.

const employerUi = (() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function fmtSalary(v) {
    if (!v) return null;
    return new Intl.NumberFormat('ru-RU').format(v);
  }

  function salaryText(v) {
    if (!v.salary_from && !v.salary_to) return '';
    return '💰 ' + (v.salary_from ? fmtSalary(v.salary_from) + ' ₽' : '') +
      (v.salary_from && v.salary_to ? ' – ' : '') +
      (v.salary_to ? fmtSalary(v.salary_to) + ' ₽' : '');
  }

  function showTab(tab) {
    $$('#employer-screen .tab-section').forEach((s) =>
      s.classList.toggle('hidden', s.dataset.tab !== tab)
    );
    $$('#employer-screen .nav a').forEach((a) =>
      a.classList.toggle('active', a.dataset.tab === tab)
    );
    if (tab === 'company') loadCompany();
    if (tab === 'vacancies') loadVacancies();
    if (tab === 'search') loadSearch();
    if (tab === 'matches') loadMatches();
    if (tab === 'offers') loadOffers();
    if (tab === 'applications') loadApplications();
    if (tab === 'tasks') loadTasks();
  }

  async function loadCompany() {
    const c = await api.getCompany();
    const f = $('#company-form');
    f.innerHTML = `
      <label>Название <input name="name" value="${esc(c?.name || '')}" required /></label>
      <label>Город <input name="city" value="${esc(c?.city || '')}" /></label>
      <label>Email для связи <input name="contact_email" value="${esc(c?.contact_email || '')}" /></label>
      <label>Телефон <input name="contact_phone" value="${esc(c?.contact_phone || '')}" /></label>
      <label>Сайт <input name="website" value="${esc(c?.website || '')}" /></label>
      <label class="full">Описание <textarea name="description" rows="3">${esc(c?.description || '')}</textarea></label>
      <div class="form__actions full"><button class="btn btn--primary" type="submit">Сохранить</button></div>
    `;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        await api.updateCompany(data);
        authUi.toast('Компания сохранена', 'success');
      } catch (err) { authUi.toast(err.message, 'error'); }
    };
  }

  async function loadVacancies() {
    const list = $('#employer-vacancies-list');
    try {
      const vacancies = await api.getVacancies();
      list.innerHTML = vacancies.map((v) => `
        <div class="card">
          <div class="card__title">${esc(v.title)}</div>
          <div class="card__sub">${esc(v.grade)} · ${esc(v.role)}</div>
          <div>${v.stack.split(',').map((s) => `<span class="tag">${esc(s.trim())}</span>`).join('')}</div>
          <div class="card__sub">${salaryText(v)} · ${esc(v.work_format)} · ${esc(v.city || '—')}</div>
          <div class="card__sub">Статус модерации: <strong>${esc(v.moderation_status)}</strong></div>
          <div class="card__footer">
            <button class="btn btn--small" data-pick="${v.id}">Подобрать кандидатов</button>
          </div>
        </div>`).join('');
      list.onclick = (e) => {
        const pick = e.target.closest('[data-pick]');
        if (!pick) return;
        showTab('matches');
        setTimeout(() => {
          $('#match-vacancy').value = pick.dataset.pick;
          $('#match-vacancy').dispatchEvent(new Event('change'));
        }, 50);
      };
    } catch (err) { list.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  }

  function buildVacancyForm() {
    const form = $('#vacancy-form');
    form.innerHTML = `
      <label>Название <input name="title" required /></label>
      <label>Стек <input name="stack" placeholder="python,go" required /></label>
      <label>Грейд
        <select name="grade">
          <option value="junior">junior</option><option value="middle" selected>middle</option>
          <option value="senior">senior</option><option value="lead">lead</option>
        </select>
      </label>
      <label>Специализация
        <select name="role">
          ${['backend', 'frontend', 'fullstack', 'ml', 'devops', 'robotics', 'qa']
            .map((r) => `<option value="${r}">${r}</option>`).join('')}
        </select>
      </label>
      <label>Зарплата от <input name="salary_from" type="number" min="0" /></label>
      <label>Зарплата до <input name="salary_to" type="number" min="0" /></label>
      <label>Формат
        <select name="work_format">
          <option value="office">office</option>
          <option value="hybrid">hybrid</option>
          <option value="remote" selected>remote</option>
        </select>
      </label>
      <label>Город <input name="city" /></label>
      <label class="full">Описание <textarea name="description" rows="3"></textarea></label>
      <div class="form__actions full">
        <button class="btn btn--primary" type="submit">Создать</button>
        <button class="btn btn--ghost" type="button" id="cancel-vacancy">Отмена</button>
      </div>
    `;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        await api.createVacancy(data);
        form.classList.add('hidden');
        authUi.toast('Вакансия создана', 'success');
        await loadVacancies();
      } catch (err) { authUi.toast(err.message, 'error'); }
    };
    form.querySelector('#cancel-vacancy').onclick = () => form.classList.add('hidden');
  }

  // ---- Подбор ----
  async function loadMatches() {
    const vacancies = await api.getVacancies();
    const sel = $('#match-vacancy');
    sel.innerHTML = vacancies.map((v) =>
      `<option value="${v.id}">${esc(v.title)} (${esc(v.grade)})</option>`).join('');
    if (!sel.value && vacancies.length) sel.value = vacancies[0].id;
    if (sel.value) await renderMatches(sel.value);
    sel.onchange = () => renderMatches(sel.value);
  }

  async function renderMatches(vacancyId) {
    const list = $('#matches-list');
    list.innerHTML = '<div class="empty">Подбор...</div>';
    try {
      const data = await api.getVacancyMatches(vacancyId);
      const matches = data.matches;
      if (!matches.length) {
        list.innerHTML = '<div class="empty">Подходящих кандидатов не найдено.</div>';
        return;
      }
      list.innerHTML = matches.map((m) => {
        const c = m.candidate;
        const stack = c.stack.split(',').map((s) => `<span class="tag">${esc(s.trim())}</span>`).join('');
        const fsp = m.category.verified ? '<span class="badge">✓ ФСП подтверждён</span>' : '';
        const boosted = m.category.gradeBoosted ? '<span class="badge">грейд повышен</span>' : '';
        return `
        <div class="card">
          <div class="card__title">${esc(c.full_name)} <span class="score">${m.score}</span></div>
          <div class="card__sub">${esc(m.category.category.grade)} · ${esc(m.category.category.role)} · ${c.experience_years} г.</div>
          <div>${stack}</div>
          <div class="card__sub">${fsp} ${boosted}</div>
          <div class="card__sub small">
            Стек: <strong>${m.breakdown.stack}</strong>/60 · Грейд: <strong>${m.breakdown.grade}</strong>/25 ·
            Роль: <strong>${m.breakdown.role}</strong>/10 · ФСП: <strong>${m.breakdown.fsp}</strong>/5
          </div>
          <div class="card__footer">
            <button class="btn btn--small btn--primary" data-offer-candidate="${c.id}" data-vacancy="${vacancyId}">Отправить оффер</button>
            <button class="btn btn--small" data-task-candidate="${c.id}">Назначить задание</button>
            <a class="btn btn--small" href="${api.getCandidatePdfUrl(c.id)}" target="_blank">PDF</a>
          </div>
        </div>`;
      }).join('');
      list.onclick = async (e) => {
        const btn = e.target.closest('[data-offer-candidate]');
        if (btn) {
          const salaryFrom = prompt('Зарплата от (₽):', '250000');
          if (salaryFrom === null) return;
          const salaryTo = prompt('Зарплата до (₽):', '350000');
          if (salaryTo === null) return;
          const message = prompt('Сопроводительное сообщение:') || '';
          try {
            await api.createOffer({
              vacancy_id: Number(btn.dataset.vacancy),
              candidate_id: Number(btn.dataset.offerCandidate),
              salary_from: Number(salaryFrom) || null,
              salary_to: Number(salaryTo) || null,
              message,
            });
            authUi.toast('Оффер отправлен', 'success');
            await loadOffers();
          } catch (err) { authUi.toast(err.message, 'error'); }
          return;
        }
        const taskBtn = e.target.closest('[data-task-candidate]');
        if (taskBtn) {
          showTab('tasks');
          $('#task-candidate').value = taskBtn.dataset.taskCandidate;
          $('#task-form').classList.remove('hidden');
        }
      };
    } catch (err) { list.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  }

  // ---- Поиск по банку ----
  async function loadSearch() {
    $('#search-form').onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      if (data.fsp_only) data.fsp_only = 'true';
      const list = $('#search-results');
      list.innerHTML = '<div class="empty">Поиск...</div>';
      try {
        const result = await api.searchCandidates(data);
        if (!result.results.length) {
          list.innerHTML = '<div class="empty">Ничего не найдено.</div>';
          return;
        }
        list.innerHTML = result.results.map((r) => {
          const c = r.candidate;
          const stack = c.stack.split(',').map((s) => `<span class="tag">${esc(s.trim())}</span>`).join('');
          return `
          <div class="card">
            <div class="card__title">${esc(c.full_name)} <span class="score">${r.rank.rank}</span></div>
            <div class="card__sub">${esc(r.category.category.grade)} · ${esc(r.category.category.role)} · ${c.experience_years} г.</div>
            <div>${stack}</div>
            <div class="card__sub small">
              Тестовый сигнал: <strong>${r.rank.testSignal}</strong>/70 · ФСП: <strong>${r.rank.fspSignal}</strong>/30
            </div>
            <div class="card__sub small">${r.category.verified ? '<span class="badge">✓ ФСП</span>' : ''}</div>
          </div>`;
        }).join('');
      } catch (err) { list.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
    };
  }

  // ---- Офферы ----
  async function loadOffers() {
    const list = $('#employer-offers-list');
    try {
      const offers = await api.getOffers();
      if (!offers.length) {
        list.innerHTML = '<div class="empty">Офферов пока нет. Откройте «Подбор» и нажмите «Отправить оффер».</div>';
        return;
      }
      list.innerHTML = offers.map((o) => `
        <div class="card">
          <div class="card__title">${esc(o.vacancy_title)}</div>
          <div class="card__sub">Кандидат: ${esc(o.candidate_name)}</div>
          <div class="card__sub">
            ${salaryText(o)} · Статус: <span class="offer-status ${esc(o.status)}">${esc(o.status)}</span>
          </div>
          ${o.message ? `<div class="card__sub">${esc(o.message)}</div>` : ''}
          <div class="card__footer">
            <button class="btn btn--small" data-contact="${o.id}">Контакты</button>
            ${o.status !== 'accepted' ? `<button class="btn btn--small btn--ghost" data-viewed="${o.id}">Просмотрено</button>` : ''}
          </div>
        </div>
      `).join('');
      list.onclick = async (e) => {
        const contact = e.target.closest('[data-contact]');
        const viewed = e.target.closest('[data-viewed]');
        if (contact) {
          try {
            const c = await api.getOfferContact(contact.dataset.contact);
            if (c.side === 'candidate') {
              const cand = c.candidate;
              const txt = `Контакты кандидата (открыты после принятия):\nФИО: ${cand.full_name}\nEmail: ${cand.email || '—'}\nTelegram: ${cand.telegram || '—'}\nТелефон: ${cand.phone || '—'}`;
              alert(txt);
            }
          } catch (err) { authUi.toast(err.message, 'error'); }
        }
        if (viewed) {
          try {
            await api.updateOffer(viewed.dataset.viewed, { status: 'viewed' });
            await loadOffers();
          } catch (err) { authUi.toast(err.message, 'error'); }
        }
      };
    } catch (err) { list.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  }

  // ---- Отклики ----
  async function loadApplications() {
    const list = $('#employer-applications-list');
    try {
      const apps = await api.getApplications();
      if (!apps.length) {
        list.innerHTML = '<div class="empty">Входящих откликов нет.</div>';
        return;
      }
      list.innerHTML = apps.map((a) => `
        <div class="card">
          <div class="card__title">${esc(a.vacancy_title)}</div>
          <div class="card__sub">Кандидат: ${esc(a.candidate_name)}</div>
          ${a.cover_letter ? `<div class="card__sub">${esc(a.cover_letter)}</div>` : ''}
          <div class="card__sub">Статус: <span class="offer-status ${esc(a.status)}">${esc(a.status)}</span></div>
          <div class="card__footer">
            <button class="btn btn--small" data-accept-app="${a.id}">Принять</button>
            <button class="btn btn--small btn--ghost" data-decline-app="${a.id}">Отклонить</button>
          </div>
        </div>
      `).join('');
      list.onclick = async (e) => {
        const accept = e.target.closest('[data-accept-app]');
        const decline = e.target.closest('[data-decline-app]');
        if (accept || decline) {
          const id = (accept || decline).dataset.acceptApp || decline.dataset.declineApp;
          const status = accept ? 'accepted' : 'declined';
          try {
            await api.updateApplication(id, { status });
            authUi.toast('Статус обновлён', 'success');
            await loadApplications();
          } catch (err) { authUi.toast(err.message, 'error'); }
        }
      };
    } catch (err) { list.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  }

  // ---- Задания ----
  async function loadTasks() {
    const list = $('#employer-tasks-list');
    // Заполняем селекты
    const candSel = $('#task-candidate');
    const vacSel = $('#task-vacancy');
    try {
      const vacancies = await api.getVacancies();
      vacSel.innerHTML = `<option value="">— не привязано —</option>` +
        vacancies.map((v) => `<option value="${v.id}">${esc(v.title)}</option>`).join('');
    } catch (e) {}
    try {
      const search = await api.searchCandidates({});
      candSel.innerHTML = search.results.map((r) =>
        `<option value="${r.candidate.id}">${esc(r.candidate.full_name)} (${esc(r.candidate.role)})</option>`
      ).join('');
    } catch (e) {}

    try {
      const tasks = await api.getTasks();
      if (!tasks.length) {
        list.innerHTML = '<div class="empty">Заданий пока нет. Назначьте короткое задание выбранному кандидату.</div>';
        return;
      }
      list.innerHTML = tasks.map((t) => `
        <div class="card">
          <div class="card__title">${esc(t.title)}</div>
          <div class="card__sub">${esc(t.candidate_name)} · ${esc(t.vacancy_title || '')}</div>
          <div>${esc(t.description)}</div>
          ${t.solution ? `<div class="card__sub"><strong>Решение:</strong> ${esc(t.solution)}</div>` : ''}
          <div class="card__sub">Статус: <span class="offer-status ${esc(t.status)}">${esc(t.status)}</span></div>
          ${t.score != null ? `<div class="card__sub">Оценка: <strong>${t.score}</strong></div>` : ''}
          ${t.reviewer_comment ? `<div class="card__sub">Комментарий: ${esc(t.reviewer_comment)}</div>` : ''}
          ${t.status === 'submitted' ? `
            <div class="card__footer">
              <input class="score-input" id="score-${t.id}" placeholder="0–100" type="number" min="0" max="100" />
              <input id="comment-${t.id}" placeholder="Комментарий" />
              <button class="btn btn--small btn--primary" data-review-ok="${t.id}">Одобрить</button>
              <button class="btn btn--small btn--ghost" data-review-bad="${t.id}">Отклонить</button>
            </div>` : ''}
        </div>
      `).join('');
      list.onclick = async (e) => {
        const ok = e.target.closest('[data-review-ok]');
        const bad = e.target.closest('[data-review-bad]');
        if (!ok && !bad) return;
        const id = (ok || bad).dataset.reviewOk || bad.dataset.reviewBad;
        const score = Number(document.getElementById(`score-${id}`)?.value || 0);
        const comment = document.getElementById(`comment-${id}`)?.value || '';
        try {
          await api.reviewTask(id, { score, comment, status: ok ? 'reviewed_ok' : 'reviewed_bad' });
          authUi.toast('Оценка сохранена', 'success');
          await loadTasks();
        } catch (err) { authUi.toast(err.message, 'error'); }
      };
    } catch (err) { list.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  }

  function attachTaskForm() {
    $('#btn-toggle-task-form').onclick = () => $('#task-form').classList.toggle('hidden');
    $('#cancel-task').onclick = () => $('#task-form').classList.add('hidden');
    $('#task-form').onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        await api.createTask({
          candidate_id: Number(data.candidate_id),
          vacancy_id: data.vacancy_id ? Number(data.vacancy_id) : null,
          title: data.title,
          description: data.description,
        });
        e.target.reset();
        $('#task-form').classList.add('hidden');
        authUi.toast('Задание отправлено', 'success');
        await loadTasks();
      } catch (err) { authUi.toast(err.message, 'error'); }
    };
  }

  async function init() {
    $$('#employer-screen .nav a').forEach((a) =>
      a.addEventListener('click', (e) => { e.preventDefault(); showTab(a.dataset.tab); })
    );
    $('#btn-toggle-vacancy-form').onclick = () => $('#vacancy-form').classList.toggle('hidden');
    buildVacancyForm();
    attachTaskForm();
    showTab('company');
  }

  return { init, showTab };
})();