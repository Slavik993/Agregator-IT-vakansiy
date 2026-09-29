// Логика интерфейса
const state = {
  candidates: [],
  vacancies: [],
  offers: [],
  matches: [],
};

const $ = (sel) => document.querySelector(sel);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function formatSalary(v) {
  if (!v) return null;
  return new Intl.NumberFormat('ru-RU').format(v);
}

// ---- Навигация ----

document.querySelectorAll('.nav a').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = link.dataset.tab;
    document.querySelectorAll('.tab-section').forEach((s) => s.classList.add('hidden'));
    document.getElementById(tab).classList.remove('hidden');
    document.querySelectorAll('.nav a').forEach((a) => a.classList.remove('active'));
    link.classList.add('active');
    if (tab === 'matches') loadMatchSelector();
    if (tab === 'offers') loadOffers();
  });
});

// ---- Рендер кандидатов ----

function renderCandidates() {
  const list = $('#candidates-list');
  if (!state.candidates.length) {
    list.innerHTML = '<div class="empty">Пока нет соискателей. Добавьте первого кандидата.</div>';
    return;
  }
  list.innerHTML = state.candidates.map((c) => {
    const stack = c.stack.split(',').map((s) => `<span class="tag">${esc(s.trim())}</span>`).join('');
    const achievements = (c.achievements || []).map((a) =>
      `<li>${esc(a.competition)} — ${esc(a.result)} <small>(${esc(a.discipline)}, ${a.year || '—'})</small></li>`
    ).join('');
    return `
      <div class="card">
        <div class="card__title">${esc(c.full_name)}</div>
        <div class="card__sub">${esc(c.grade)} · ${esc(c.role)} · ${c.experience_years} г. · ${esc(c.work_format)}</div>
        <div>${stack}</div>
        <div class="card__sub">${c.fsp_id ? 'ФСП: ' + esc(c.fsp_id) : 'Без ФСП'} · ${esc(c.city || '—')}</div>
        ${achievements ? `<details class="achievements"><summary>Достижения ФСП (${c.achievements.length})</summary><ul>${achievements}</ul></details>` : ''}
        <div class="card__footer">
          <button class="btn btn--small" data-cat="${c.id}">Категория</button>
        </div>
      </div>`;
  }).join('');
}

// ---- Рендер вакансий ----

function renderVacancies() {
  const list = $('#vacancies-list');
  if (!state.vacancies.length) {
    list.innerHTML = '<div class="empty">Пока нет вакансий. Добавьте первую вакансию.</div>';
    return;
  }
  list.innerHTML = state.vacancies.map((v) => {
    const stack = v.stack.split(',').map((s) => `<span class="tag">${esc(s.trim())}</span>`).join('');
    const salary = [v.salary_from, v.salary_to].filter(Boolean).map(formatSalary).join(' – ');
    return `
      <div class="card">
        <div class="card__title">${esc(v.title)}</div>
        <div class="card__sub">${esc(v.company)} · ${esc(v.grade)} · ${esc(v.role)}</div>
        <div>${stack}</div>
        <div class="card__sub">${salary ? '💰 ' + salary + ' ₽' : ''} · ${esc(v.work_format)} · ${esc(v.city || '—')}</div>
        <div class="card__footer">
          <button class="btn btn--small" data-match="${v.id}">Подобрать кандидатов</button>
        </div>
      </div>`;
  }).join('');
}

// ---- Рендер матчинга ----

async function loadMatchSelector() {
  const select = $('#match-vacancy');
  select.innerHTML = state.vacancies.map((v) => `<option value="${v.id}">${esc(v.title)} — ${esc(v.company)}</option>`).join('');
  if (state.vacancies.length) {
    await loadMatches(state.vacancies[0].id);
  } else {
    $('#matches-list').innerHTML = '<div class="empty">Сначала добавьте вакансию.</div>';
  }
}

async function loadMatches(vacancyId) {
  if (!vacancyId) return;
  try {
    const data = await api.getMatches(vacancyId);
    state.matches = data.matches;
    renderMatches(data.vacancy);
  } catch (err) {
    $('#matches-list').innerHTML = `<div class="empty">Ошибка: ${esc(err.message)}</div>`;
  }
}

function renderMatches(vacancy) {
  const list = $('#matches-list');
  if (!state.matches.length) {
    list.innerHTML = '<div class="empty">Подходящих кандидатов не найдено.</div>';
    return;
  }
  list.innerHTML = state.matches.map((m) => {
    const c = m.candidate;
    const stack = c.stack.split(',').map((s) => `<span class="tag">${esc(s.trim())}</span>`).join('');
    const verified = m.category.verified ? '<span class="badge">✓ ФСП подтверждён</span>' : '';
    return `
      <div class="card">
        <div class="card__title">${esc(c.full_name)} <span class="score">${m.score}</span></div>
        <div class="card__sub">${esc(m.category.category.grade)} · ${esc(m.category.category.role)} · ${c.experience_years} г.</div>
        <div>${stack}</div>
        <div class="card__sub">${verified} ${m.category.gradeBoosted ? '<span class="badge">грейд повышен за достижения</span>' : ''}</div>
        <div class="card__footer">
          <button class="btn btn--small" data-offer-candidate="${c.id}">Отправить оффер</button>
        </div>
      </div>`;
  }).join('');
}

// ---- Офферы ----

async function loadOffers() {
  state.offers = await api.getOffers();
  const list = $('#offers-list');
  if (!state.offers.length) {
    list.innerHTML = '<div class="empty">Офферов пока нет.</div>';
    return;
  }
  list.innerHTML = state.offers.map((o) => `
    <div class="card">
      <div class="card__title">${esc(o.vacancy_title)} — ${esc(o.company)}</div>
      <div class="card__sub">Кандидат: ${esc(o.candidate_name)} ${o.candidate_telegram ? '(' + esc(o.candidate_telegram) + ')' : ''}</div>
      <div class="card__sub">💰 ${o.salary_offer ? formatSalary(o.salary_offer) + ' ₽' : 'не указана'} · <span class="offer-status ${o.status}">${esc(o.status)}</span></div>
      ${o.message ? `<div class="card__sub">${esc(o.message)}</div>` : ''}
      <div class="card__footer">
        <button class="btn btn--small" data-offer-status="${o.id}" data-status="accepted">Принять</button>
        <button class="btn btn--small" data-offer-status="${o.id}" data-status="declined">Отклонить</button>
      </div>
    </div>`).join('');
}

async function createOffer(candidateId) {
  const vacancyId = $('#match-vacancy').value;
  const salary = prompt('Зарплата в оффере (₽):');
  if (salary === null) return;
  const message = prompt('Сопроводительное сообщение:') || '';
  try {
    await api.createOffer({
      vacancy_id: Number(vacancyId),
      candidate_id: Number(candidateId),
      salary_offer: Number(salary) || null,
      message,
    });
    alert('Оффер отправлен кандидату.');
  } catch (err) {
    alert(err.message);
  }
}

// ---- События ----

$('#btn-add-candidate').addEventListener('click', () => $('#candidate-form').classList.toggle('hidden'));
$('#cancel-candidate').addEventListener('click', () => $('#candidate-form').classList.add('hidden'));
$('#candidate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api.createCandidate(data);
    e.target.reset();
    $('#candidate-form').classList.add('hidden');
    state.candidates = await api.getCandidates();
    renderCandidates();
  } catch (err) {
    alert(err.message);
  }
});

$('#btn-add-vacancy').addEventListener('click', () => $('#vacancy-form').classList.toggle('hidden'));
$('#cancel-vacancy').addEventListener('click', () => $('#vacancy-form').classList.add('hidden'));
$('#vacancy-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api.createVacancy(data);
    e.target.reset();
    $('#vacancy-form').classList.add('hidden');
    state.vacancies = await api.getVacancies();
    renderVacancies();
  } catch (err) {
    alert(err.message);
  }
});

$('#candidates-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cat]');
  if (!btn) return;
  try {
    const data = await api.getCandidateCategory(btn.dataset.cat);
    const cat = data.category.category;
    alert(
      `Категория:\nСтек: ${cat.stack.join(', ')}\nГрейд: ${cat.grade}${data.category.gradeBoosted ? ' (повышен за достижения ФСП)' : ''}\nРоль: ${cat.role}\nФормат: ${cat.work_format}\nПодтверждён ФСП: ${data.category.verified ? 'да' : 'нет'}`
    );
  } catch (err) {
    alert(err.message);
  }
});

$('#vacancies-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-match]');
  if (!btn) return;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.remove('active'));
  document.querySelector('.nav a[data-tab="matches"]').classList.add('active');
  document.querySelectorAll('.tab-section').forEach((s) => s.classList.add('hidden'));
  $('#matches').classList.remove('hidden');
  $('#match-vacancy').value = btn.dataset.match;
  await loadMatches(btn.dataset.match);
});

$('#match-vacancy').addEventListener('change', (e) => loadMatches(e.target.value));

$('#matches-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-offer-candidate]');
  if (btn) createOffer(btn.dataset.offerCandidate);
});

$('#offers-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-offer-status]');
  if (!btn) return;
  try {
    await api.updateOffer(btn.dataset.offerStatus, { status: btn.dataset.status });
    await loadOffers();
  } catch (err) {
    alert(err.message);
  }
});

// ---- Инициализация ----

(async function init() {
  try {
    const [candidates, vacancies] = await Promise.all([api.getCandidates(), api.getVacancies()]);
    state.candidates = candidates;
    state.vacancies = vacancies;
    renderCandidates();
    renderVacancies();
  } catch (err) {
    alert('Не удалось загрузить данные: ' + err.message);
  }
})();