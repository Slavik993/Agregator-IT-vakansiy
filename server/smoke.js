// Простой smoke-тест: запускает сервер, делает несколько запросов, проверяет, что
// базовые сценарии работают. Запускается через `npm run smoke`.
//
//   1. POST /api/auth/register   (кандидат)
//   2. POST /api/auth/login      (получить JWT)
//   3. GET  /api/me              (проверить токен)
//   4. PUT  /api/me/candidate/profile (заполнить профиль)
//   5. POST /api/candidates/:id/tests (сгенерировать тест)
//   6. POST /api/auth/register   (работодатель)
//   7. POST /api/auth/login      (получить JWT работодателя)
//   8. POST /api/me/employer/company (заполнить компанию)
//   9. POST /api/vacancies       (создать вакансию)
//  10. GET  /api/vacancies/:id/matches (получить подборку)
//  11. POST /api/offers          (отправить оффер)
//  12. GET  /api/offers/:id/contact (проверить, что контакты скрыты до accept)

const http = require('http');

const PORT = Number(process.env.PORT || 3010);
const HOST = '127.0.0.1';

function request(method, path, body, headers) {
  const data = body ? JSON.stringify(body) : null;
  const opts = {
    hostname: HOST,
    port: PORT,
    path,
    method,
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      data ? { 'Content-Length': Buffer.byteLength(data) } : {},
      headers || {},
    ),
  };
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try {
          const json = chunks ? JSON.parse(chunks) : null;
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: chunks });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  } else {
    console.log('  OK:', msg);
  }
}

async function waitForServer(maxMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await request('GET', '/api/health');
      if (r.status === 200) return;
    } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server did not start in time');
}

(async function main() {
  // Поднимаем сервер в дочернем процессе
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, ['server/index.js'], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(d));

  try {
    await waitForServer();

    console.log('\n[smoke] Регистрация кандидата...');
    const candReg = await request('POST', '/api/auth/register', {
      email: `smoke-cand-${Date.now()}@example.local`,
      password: 'smoketest',
      role: 'candidate',
      displayName: 'Smoke Кандидат',
    });
    assert(candReg.status === 201, 'register candidate 201');
    assert(typeof candReg.body.dev_verification_code === 'string', 'verification code returned in response');
    const candUserId = candReg.body.user_id;

    console.log('[smoke] Повторная отправка кода подтверждения...');
    const resend = await request('POST', '/api/auth/resend-code', { email: candReg.body.email });
    assert(resend.status === 200, 'resend code 200');
    assert(/^\d{6}$/.test(resend.body.dev_verification_code), 'resend returns 6-digit code');
    assert(resend.body.dev_verification_code !== candReg.body.dev_verification_code, 'resend generates fresh code');

    const candLogin = await request('POST', '/api/auth/login', {
      email: `smoke-cand-${(candUserId)}@example.local`.replace(candReg.body.user_id, ''),
      password: 'smoketest',
    });
    // Запомним: используем email из ответа
    const candEmail = candReg.body.email;
    const candLoginResp = await request('POST', '/api/auth/login', {
      email: candEmail, password: 'smoketest',
    });
    assert(candLoginResp.status === 200, 'login candidate');
    const candToken = candLoginResp.body.token;

    console.log('[smoke] Профиль кандидата...');
    const me = await request('GET', '/api/me', null, { Authorization: `Bearer ${candToken}` });
    assert(me.status === 200, 'GET /api/me');

    const profile = await request('PUT', '/api/me/candidate/profile', {
      full_name: 'Smoke Тестовый',
      stack: 'python,go',
      grade: 'middle',
      role: 'backend',
      experience_years: 3,
      work_format: 'remote',
      city: 'Москва',
    }, { Authorization: `Bearer ${candToken}` });
    assert(profile.status === 200, 'PUT profile');
    const candidateId = profile.body.id;

    console.log('[smoke] Тест кандидата...');
    const testStart = await request('POST', `/api/candidates/${candidateId}/tests`, {
      role: 'backend', claimed_grade: 'middle',
    });
    assert(testStart.status === 201, 'start test');
    const questions = testStart.body.questions;
    const answers = {};
    for (const q of questions) answers[q.id] = q.correctIndex;
    const submit = await request('POST', `/api/test-attempts/${testStart.body.attempt_id}/submit`, { answers });
    assert(submit.status === 200, 'submit test');
    assert(['passed', 'not_passed', 'confident'].includes(submit.body.result), 'test result is valid');

    console.log('[smoke] Регистрация работодателя...');
    const empReg = await request('POST', '/api/auth/register', {
      email: `smoke-emp-${Date.now()}@example.local`,
      password: 'smoketest',
      role: 'employer',
      displayName: 'Smoke Corp',
    });
    assert(empReg.status === 201, 'register employer');
    const empLogin = await request('POST', '/api/auth/login', {
      email: empReg.body.email, password: 'smoketest',
    });
    const empToken = empLogin.body.token;

    console.log('[smoke] Создание вакансии...');
    const vacancy = await request('POST', '/api/vacancies', {
      title: 'Smoke Backend',
      description: 'Smoke test vacancy',
      stack: 'python,go',
      grade: 'middle',
      role: 'backend',
      salary_from: 200000, salary_to: 350000,
      work_format: 'remote', city: 'Москва',
    }, { Authorization: `Bearer ${empToken}` });
    assert(vacancy.status === 201, 'create vacancy');

    console.log('[smoke] Подборка...');
    const matches = await request('GET', `/api/vacancies/${vacancy.body.id}/matches`);
    assert(matches.status === 200, 'matches list');

    console.log('[smoke] Оффер (без зарплаты — должен 400)...');
    const noSalary = await request('POST', '/api/offers', {
      vacancy_id: vacancy.body.id, candidate_id: candidateId,
    }, { Authorization: `Bearer ${empToken}` });
    assert(noSalary.status === 400, 'offer without salary rejected');

    console.log('[smoke] Оффер с зарплатой...');
    const offer = await request('POST', '/api/offers', {
      vacancy_id: vacancy.body.id, candidate_id: candidateId,
      salary_from: 250000, salary_to: 350000, message: 'Приглашаем на интервью.',
    }, { Authorization: `Bearer ${empToken}` });
    assert(offer.status === 201, 'create offer');

    console.log('[smoke] Контакты скрыты от работодателя до accept...');
    const contactHidden = await request('GET', `/api/offers/${offer.body.id}/contact`, null,
      { Authorization: `Bearer ${empToken}` });
    assert(contactHidden.status === 403, 'contacts hidden before accept');

    console.log('[smoke] Кандидат принимает оффер...');
    const accept = await request('PATCH', `/api/offers/${offer.body.id}`,
      { status: 'accepted' }, { Authorization: `Bearer ${candToken}` });
    assert(accept.status === 200, 'candidate accept');

    console.log('[smoke] Контакты открыты работодателю после accept...');
    const contactOpen = await request('GET', `/api/offers/${offer.body.id}/contact`, null,
      { Authorization: `Bearer ${empToken}` });
    assert(contactOpen.status === 200, 'contacts visible after accept');

    console.log('[smoke] Privacy: кандидат скрывает профиль → подборка пуста...');
    await request('PUT', '/api/me/privacy', {
      privacy_show_in_search: false,
    }, { Authorization: `Bearer ${candToken}` });
    const matchesFiltered = await request('GET', `/api/vacancies/${vacancy.body.id}/matches`);
    const smokeCandHidden = !matchesFiltered.body.matches.some((m) => m.candidate.id === candidateId);
    assert(smokeCandHidden, 'candidate hidden from matches after privacy opt-out');
    // Возвращаем обратно
    await request('PUT', '/api/me/privacy', {
      privacy_show_in_search: true,
    }, { Authorization: `Bearer ${candToken}` });

    console.log('[smoke] Кандидат откликается на вакансию (application)...');
    const appl = await request('POST', '/api/applications', {
      vacancy_id: vacancy.body.id, cover_letter: 'Smoke cover',
    }, { Authorization: `Bearer ${candToken}` });
    assert(appl.status === 201, 'candidate creates application');

    console.log('[smoke] Работодатель видит входящий отклик...');
    const empApps = await request('GET', '/api/applications', null,
      { Authorization: `Bearer ${empToken}` });
    assert(empApps.body.length >= 1, 'employer sees application');

    console.log('[smoke] Регулярное задание...');
    const task = await request('POST', '/api/tasks', {
      candidate_id: candidateId,
      vacancy_id: vacancy.body.id,
      title: 'Smoke Task',
      description: 'Опишите, как бы вы решали задачу X.',
    }, { Authorization: `Bearer ${empToken}` });
    assert(task.status === 201, 'employer creates task');
    const taskSubmit = await request('POST', `/api/tasks/${task.body.id}/submit`,
      { solution: 'Smoke solution' }, { Authorization: `Bearer ${candToken}` });
    assert(taskSubmit.status === 200, 'candidate submits task');
    const taskReview = await request('POST', `/api/tasks/${task.body.id}/review`,
      { score: 80, comment: 'OK', status: 'reviewed_ok' },
      { Authorization: `Bearer ${empToken}` });
    assert(taskReview.status === 200, 'employer reviews task');

    console.log('[smoke] Жалоба на вакансию...');
    const report = await request('POST', `/api/vacancies/${vacancy.body.id}/report`,
      { reason: 'spam', reporter_email: 'reporter@example.local' });
    assert(report.status === 201, 'report submitted');

    console.log('[smoke] PDF-профиль кандидата...');
    // Используем нативный http, чтобы получить бинарный ответ
    const pdfResp = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: HOST, port: PORT, path: `/api/candidates/${candidateId}/pdf`, method: 'GET',
        headers: { Authorization: `Bearer ${empToken}` },
        timeout: 5000,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        }));
      });
      req.on('error', reject);
      req.end();
    });
    assert(pdfResp.status === 200, 'pdf endpoint 200');
    assert(pdfResp.headers['content-type']?.includes('pdf'), 'pdf content-type');
    assert(pdfResp.body.slice(0, 5).toString() === '%PDF-', 'pdf magic bytes');

    console.log('[smoke] ATS push (admin)...');
    const adminLogin = await request('POST', '/api/auth/login', {
      email: 'admin@local', password: 'admin1234',
    });
    assert(adminLogin.status === 200, 'admin login');
    const adminToken = adminLogin.body.token;
    const atsPush = await request('POST', '/api/ats/push-candidate',
      { system: 'mock', candidate_id: candidateId },
      { Authorization: `Bearer ${adminToken}` });
    assert(atsPush.status === 200, 'ats push-candidate ok');

    console.log('[smoke] Rate limit: 6 вакансий подряд...');
    let limitHit = false;
    for (let i = 0; i < 7; i++) {
      const r = await request('POST', '/api/vacancies', {
        title: `Rate ${i}`,
        stack: 'python',
        grade: 'junior',
        role: 'backend',
      }, { Authorization: `Bearer ${empToken}` });
      if (r.status === 429) { limitHit = true; break; }
    }
    assert(limitHit, 'rate limit triggered after creating many vacancies');

    console.log('\n[smoke] Все проверки пройдены.\n');
  } catch (e) {
    console.error('SMOKE FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 200));
  }
})();