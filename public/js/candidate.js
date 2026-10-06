// Личный кабинет соискателя: профиль, тест, приглашения, отклики, задания,
// публичные вакансии, приватность.

const candidateUi = (() => {
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

  function showTab(tab) {
    $$('#candidate-screen .tab-section').forEach((s) =>
      s.classList.toggle('hidden', s.dataset.tab !== tab)
    );
    $$('#candidate-screen .nav a').forEach((a) =>
      a.classList.toggle('active', a.dataset.tab === tab)
    );
    if (tab === 'profile') loadProfile();
    if (tab === 'testing') loadTesting();
    if (tab === 'offers') loadOffers();
    if (tab === 'applications') loadApplications();
    if (tab === 'tasks') loadTasks();
    if (tab === 'vacancies') loadPublicVacancies();
    if (tab === 'privacy') loadPrivacy();
  }

  async function loadProfile() {
    const me = await api.getMyProfile();
    const form = $('#candidate-profile');
    form.innerHTML = `
      <label>ФИО <input name="full_name" value="${esc(me.full_name || '')}" /></label>
      <label>Email <input name="email" value="${esc(me.email || '')}" disabled /></label>
      <label>Телефон <input name="phone" value="${esc(me.phone || '')}" /></label>
      <label>Telegram <input name="telegram" value="${esc(me.telegram || '')}" /></label>
      <label>Стек (через запятую) <input name="stack" value="${esc(me.stack || '')}" required /></label>
      <label>Заявленный грейд
        <select name="grade">
          ${['junior', 'middle', 'senior', 'lead']
            .map((g) => `<option value="${g}" ${me.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
      </label>
      <label>Специализация
        <select name="role">
          ${['backend', 'frontend', 'fullstack', 'ml', 'devops', 'robotics', 'qa']
            .map((r) => `<option value="${r}" ${me.role === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
      </label>
      <label>Опыт (лет) <input name="experience_years" type="number" min="0" value="${esc(me.experience_years || 0)}" /></label>
      <label>Формат
        <select name="work_format">
          ${['office', 'hybrid', 'remote']
            .map((w) => `<option value="${w}" ${me.work_format === w ? 'selected' : ''}>${w}</option>`).join('')}
        </select>
      </label>
      <label>Город <input name="city" value="${esc(me.city || '')}" /></label>
      <label class="full">О себе <textarea name="bio" rows="3">${esc(me.bio || '')}</textarea></label>
      <label class="full">Soft skills <input name="soft_skills" value="${esc(me.soft_skills || '')}" /></label>
      <div class="form__actions full">
        <button class="btn btn--primary" type="submit">Сохранить</button>
        <button class="btn btn--ghost" type="button" id="btn-pdf-profile">Скачать PDF-профиль</button>
      </div>
    `;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        await api.updateMyProfile(data);
        authUi.toast('Профиль сохранён', 'success');
      } catch (err) { authUi.toast(err.message, 'error'); }
    };
    document.getElementById('btn-pdf-profile').onclick = () => {
      window.open(api.getCandidatePdfUrl(me.id), '_blank');
    };

    const ldata = $('#candidate-profile-ldata');
    const achList = (me.achievements || []).map((a) =>
      `<li>${esc(a.competition)} — ${esc(a.result)} <small>(${esc(a.discipline)}, ${a.year || '—'})</small></li>`
    ).join('');
    ldata.innerHTML = `
      <div class="card">
        <div class="card__title">Подтверждённый грейд</div>
        <div class="card__sub">${esc(me.verified_grade || 'не подтверждён тестом')}</div>
      </div>
      <div class="card">
        <div class="card__title">Достижения ФСП</div>
        <div class="card__sub">${me.fsp_id ? 'ID: ' + esc(me.fsp_id) : 'не привязан'}</div>
        ${achList ? `<ul>${achList}</ul>` : '<div class="hint">Нет достижений</div>'}
        <div class="form__actions">
          <input id="fsp-link-input" placeholder="FSP-0001" />
          <button class="btn btn--small" id="btn-link-fsp">Привязать</button>
        </div>
      </div>
    `;
    document.getElementById('btn-link-fsp').onclick = async () => {
      const fsp_id = document.getElementById('fsp-link-input').value.trim();
      if (!fsp_id) return;
      try {
        await api.linkFsp(fsp_id);
        authUi.toast('ID ФСП привязан', 'success');
        await loadProfile();
      } catch (err) { authUi.toast(err.message, 'error'); }
    };
  }

  // ---- Тест ----
  let meta = null;

  async function loadTesting() {
    if (!meta) meta = await api.getTestingMeta();
    $('#test-role').innerHTML = meta.roles.map((r) => `<option value="${r}">${r}</option>`).join('');
    $('#test-grade').innerHTML = meta.grades.map((g) => `<option value="${g}">${g}</option>`).join('');
  }

  $('#btn-start-test')?.addEventListener('click', startTest);

  async function startTest() {
    const me = await api.getMyProfile();
    const role = $('#test-role').value;
    const grade = $('#test-grade').value;
    const container = $('#test-container');
    container.innerHTML = '<div class="empty">Генерация...</div>';
    try {
      const test = await api.startTest(me.id, { role, claimed_grade: grade });
      container.innerHTML = `
        <div class="card test-form">
          <div class="card__title">Тест: ${esc(test.role)} · ${esc(test.claimed_grade)}</div>
          ${test.questions.map((q, i) => `
            <div class="test-question">
              <div class="test-question__text">${i + 1}. ${esc(q.text)}</div>
              ${q.options.map((opt, oi) => `
                <label class="test-option">
                  <input type="radio" name="q_${q.id}" value="${oi}" />
                  <span>${esc(opt)}</span>
                </label>`).join('')}
            </div>`).join('')}
          <div class="form__actions">
            <button class="btn btn--primary" id="btn-submit-test">Отправить ответы</button>
            <button class="btn btn--ghost" id="btn-cancel-test">Отмена</button>
          </div>
        </div>`;
      container.querySelector('#btn-cancel-test').onclick = () => { container.innerHTML = ''; };
      container.querySelector('#btn-submit-test').onclick = async () => {
        const answers = {};
        container.querySelectorAll('input[type="radio"]:checked').forEach((input) => {
          answers[input.name.slice(2)] = Number(input.value);
        });
        try {
          const data = await api.submitTest(test.attempt_id, answers);
          renderTestResult(data);
        } catch (err) { authUi.toast(err.message, 'error'); }
      };
    } catch (err) {
      container.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  }

  function renderTestResult(data) {
    const statusText = {
      confident: 'Уверенное прохождение — грейд может быть повышен',
      passed: 'Грейд подтверждён',
      not_passed: 'Грейд не подтверждён (можно попробовать уровень ниже)',
    }[data.result] || data.result;
    const details = (data.details || []).map((d) => `
      <li class="${d.correct ? 'ok' : 'bad'}">
        <strong>${d.correct ? '✓' : '✗'}</strong> Вопрос ${esc(d.id.split('#')[1])} —
        ${d.correct ? 'верно' : 'неверно'}${!d.correct && d.explanation ? `: ${esc(d.explanation)}` : ''}
      </li>`).join('');
    $('#test-container').innerHTML = `
      <div class="card test-result">
        <div class="card__title">${esc(statusText)}</div>
        <div class="card__sub">Баллы: ${data.score} / ${data.max_score} · ${data.percent}%</div>
        <div class="card__sub">Грейд после теста: <strong>${esc(data.grade_after)}</strong></div>
        ${data.grade_changed ? '<div class="badge">Грейд изменён</div>' : ''}
        ${data.cooldown_blocked ? `<div class="badge">Смена грейда доступна не чаще раза в ${data.cooldown_days} дней</div>` : ''}
        <details class="achievements"><summary>Разбор ответов</summary><ul>${details}</ul></details>
      </div>`;
  }

  // ---- Офферы ----
  async function loadOffers() {
    const list = $('#offers-list');
    try {
      const offers = await api.getOffers();
      if (!offers.length) {
        list.innerHTML = '<div class="empty">Приглашений пока нет. Пройдите тест и поддерживайте профиль в актуальном состоянии — работодатели видят вас по категориям.</div>';
        return;
      }
      list.innerHTML = offers.map((o) => `
        <div class="card">
          <div class="card__title">${esc(o.vacancy_title)} — ${esc(o.company || o.employer_company_name || '')}</div>
          <div class="card__sub">
            ${(o.salary_from || o.salary_to)
              ? '💰 ' + (o.salary_from ? fmtSalary(o.salary_from) + ' ₽' : '') +
                  (o.salary_from && o.salary_to ? ' – ' : '') +
                  (o.salary_to ? fmtSalary(o.salary_to) + ' ₽' : '')
              : '—'}
          </div>
          ${o.message ? `<div class="card__sub">${esc(o.message)}</div>` : ''}
          <div class="card__sub">Статус: <span class="offer-status ${esc(o.status)}">${esc(o.status)}</span></div>
          <div class="card__footer">
            <button class="btn btn--small" data-contact="${o.id}">Контакты</button>
            ${o.status !== 'accepted' && o.status !== 'declined' ? `
              <button class="btn btn--primary btn--small" data-accept="${o.id}">Принять</button>
              <button class="btn btn--ghost btn--small" data-decline="${o.id}">Отклонить</button>` : ''}
          </div>
        </div>
      `).join('');
      list.onclick = async (e) => {
        const contact = e.target.closest('[data-contact]');
        const accept = e.target.closest('[data-accept]');
        const decline = e.target.closest('[data-decline]');
        if (contact) {
          try {
            const c = await api.getOfferContact(contact.dataset.contact);
            if (c.side === 'employer') {
              const comp = c.company || {};
              alert(`Компания: ${comp.name || ''}\nEmail: ${comp.contact_email || '—'}\nТелефон: ${comp.contact_phone || '—'}\nСайт: ${comp.website || '—'}`);
            }
          } catch (err) { authUi.toast(err.message, 'error'); }
        }
        if (accept || decline) {
          const id = (accept || decline).dataset.accept || decline.dataset.decline;
          const status = accept ? 'accepted' : 'declined';
          try {
            await api.updateOffer(id, { status });
            authUi.toast('Статус обновлён', 'success');
            await loadOffers();
          } catch (err) { authUi.toast(err.message, 'error'); }
        }
      };
    } catch (err) { list.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  }

  // ---- Отклики ----
  async function loadApplications() {
    const list = $('#applications-list');
    try {
      const apps = await api.getApplications();
      if (!apps.length) {
        list.innerHTML = '<div class="empty">Вы пока не откликались на вакансии. Зайдите во вкладку «Вакансии» и откликнитесь.</div>';
        return;
      }
      list.innerHTML = apps.map((a) => `
        <div class="card">
          <div class="card__title">${esc(a.vacancy_title)} — ${esc(a.company || a.employer_company_name || '')}</div>
          ${a.cover_letter ? `<div class="card__sub">${esc(a.cover_letter)}</div>` : ''}
          <div class="card__sub">Статус: <span class="offer-status ${esc(a.status)}">${esc(a.status)}</span></div>
        </div>
      `).join('');
    } catch (err) { list.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  }

  // ---- Задания ----
  async function loadTasks() {
    const list = $('#tasks-list');
    try {
      const tasks = await api.getTasks();
      if (!tasks.length) {
        list.innerHTML = '<div class="empty">Заданий пока нет. Работодатель может назначить вам задачу, если ваш профиль интересен.</div>';
        return;
      }
      list.innerHTML = tasks.map(renderTaskCard).join('');
      list.onclick = async (e) => {
        const submit = e.target.closest('[data-submit-task]');
        if (!submit) return;
        const id = submit.dataset.submitTask;
        const solution = prompt('Опишите решение или приложите ссылку на код:');
        if (!solution) return;
        try {
          await api.submitTask(id, { solution });
          authUi.toast('Решение отправлено', 'success');
          await loadTasks();
        } catch (err) { authUi.toast(err.message, 'error'); }
      };
    } catch (err) { list.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  }

  function renderTaskCard(t) {
    return `
      <div class="card">
        <div class="card__title">${esc(t.title)}</div>
        <div class="card__sub">${esc(t.vacancy_title || '')} · ${esc(t.employer_company_name || '')}</div>
        <div>${esc(t.description)}</div>
        <div class="card__sub">Статус: <span class="offer-status ${esc(t.status)}">${esc(t.status)}</span></div>
        ${t.solution ? `<div class="card__sub"><strong>Решение:</strong> ${esc(t.solution)}</div>` : ''}
        ${t.score != null ? `<div class="card__sub"><strong>Оценка:</strong> ${t.score}</div>` : ''}
        ${t.reviewer_comment ? `<div class="card__sub"><strong>Комментарий:</strong> ${esc(t.reviewer_comment)}</div>` : ''}
        ${t.status === 'assigned' ? `<div class="card__footer"><button class="btn btn--primary btn--small" data-submit-task="${t.id}">Отправить решение</button></div>` : ''}
      </div>
    `;
  }

  // ---- Публичные вакансии ----
  async function loadPublicVacancies() {
    const list = $('#vacancies-public-list');
    try {
      const vacancies = await api.getVacancies();
      if (!vacancies.length) {
        list.innerHTML = '<div class="empty">Открытых вакансий нет.</div>';
        return;
      }
      list.innerHTML = vacancies.map((v) => `
        <div class="card">
          <div class="card__title">${esc(v.title)}</div>
          <div class="card__sub">${esc(v.company || v.employer_company_name || '')} · ${esc(v.grade)} · ${esc(v.role)}</div>
          <div>${v.stack.split(',').map((s) => `<span class="tag">${esc(s.trim())}</span>`).join('')}</div>
          <div class="card__sub">
            ${(v.salary_from || v.salary_to)
              ? '💰 ' + (v.salary_from ? fmtSalary(v.salary_from) + ' ₽' : '') +
                  (v.salary_from && v.salary_to ? ' – ' : '') +
                  (v.salary_to ? fmtSalary(v.salary_to) + ' ₽' : '')
              : ''}
            · ${esc(v.work_format)} · ${esc(v.city || '—')}
          </div>
          <div class="card__footer">
            <button class="btn btn--small btn--primary" data-apply="${v.id}">Откликнуться</button>
            <button class="btn btn--small" data-report="${v.id}">Пожаловаться</button>
          </div>
        </div>
      `).join('');
      list.onclick = async (e) => {
        const apply = e.target.closest('[data-apply]');
        if (apply) {
          const cover = prompt('Сопроводительное сообщение (опционально):') || '';
          try {
            await api.createApplication({ vacancy_id: Number(apply.dataset.apply), cover_letter: cover });
            authUi.toast('Отклик отправлен', 'success');
          } catch (err) { authUi.toast(err.message, 'error'); }
          return;
        }
        const report = e.target.closest('[data-report]');
        if (report) {
          const reason = prompt('Причина жалобы (например: «нерелевантная вакансия»):');
          if (!reason) return;
          try {
            await api.reportVacancy(report.dataset.report, { reason, reporter_email: '' });
            authUi.toast('Жалоба отправлена', 'success');
          } catch (err) { authUi.toast(err.message, 'error'); }
        }
      };
    } catch (err) { list.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  }

  // ---- Приватность ----
  async function loadPrivacy() {
    const me = await api.getMyProfile();
    const form = $('#privacy-form');
    form.innerHTML = `
      <label class="checkbox">
        <input type="checkbox" name="privacy_publish" ${me.privacy_publish ? 'checked' : ''} />
        <span>Публиковать профиль для работодателей</span>
      </label>
      <label class="checkbox">
        <input type="checkbox" name="privacy_show_contacts" ${me.privacy_show_contacts ? 'checked' : ''} />
        <span>Показывать контакты всем работодателям (по умолчанию — только после принятия оффера/отклика)</span>
      </label>
      <label class="checkbox">
        <input type="checkbox" name="privacy_show_achievements" ${me.privacy_show_achievements ? 'checked' : ''} />
        <span>Показывать достижения ФСП в публичном профиле</span>
      </label>
      <label class="checkbox">
        <input type="checkbox" name="privacy_show_in_search" ${me.privacy_show_in_search ? 'checked' : ''} />
        <span>Показывать в подборках</span>
      </label>
      <div class="form__actions">
        <button class="btn btn--primary" type="submit">Сохранить</button>
      </div>
    `;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      Object.keys(data).forEach((k) => { data[k] = data[k] === 'on'; });
      try {
        await api.updatePrivacy(data);
        authUi.toast('Настройки сохранены', 'success');
      } catch (err) { authUi.toast(err.message, 'error'); }
    };
  }

  function init() {
    $$('#candidate-screen .nav a').forEach((a) =>
      a.addEventListener('click', (e) => { e.preventDefault(); showTab(a.dataset.tab); })
    );
    showTab('profile');
  }

  return { init, showTab };
})();