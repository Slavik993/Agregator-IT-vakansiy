// HTTP-сервер: маршрутизация, ролевые ограничения, видимость контактов.
// Структура:
//   - /api/health, /api/testing/meta, /api/fsp/*              — публичные;
//   - /api/auth/*                                              — публичные регистрация/вход/подтверждение;
//   - /api/me, /api/me/candidate/profile, /api/me/employer/company, /api/me/privacy
//                                                                  — авторизованный пользователь;
//   - /api/candidates/search, /api/candidates/:id/category    — публичные для подборки;
//   - /api/vacancies, /api/vacancies/:id, /api/vacancies/:id/matches
//                                                                  — публичные для подборки;
//   - /api/candidates/:id/pdf                                  — публичный (редактируется privacy);
//   - /api/offers, /api/applications, /api/tasks               — авторизованные;
//   - /api/admin/*, /api/ats/*                                 — админ/интеграции.
//
// Видимость контактов кандидата для работодателя — см. server/visability.js.

const express = require('express');
const path = require('path');
const db = require('./db');
const fsp = require('./services/fspMock');
const auth = require('./auth');
const { categorizeCandidate, matchCandidates, filterCandidates, rankInCategory } = require('./matching');
const {
  generateTest,
  gradeAttempt,
  resolveGrade,
  canChangeGrade,
  GRADE_CHANGE_COOLDOWN_DAYS,
  GRADE_ORDER,
} = require('./testing');
const { redactCandidate, canViewContacts, CONTACT_FIELDS } = require('./visability');
const { buildCandidatePdf } = require('./services/pdf');
const moderation = require('./services/moderation');
const ats = require('./services/ats');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Утилиты ----

function nowIso() {
  return new Date().toISOString();
}

function findCandidateByUser(userId) {
  return db.prepare('SELECT * FROM candidates WHERE user_id = ?').get(userId);
}

function findCompanyByUser(userId) {
  return db.prepare('SELECT * FROM employer_companies WHERE user_id = ?').get(userId);
}

function attachAchievements(candidate) {
  if (!candidate) return candidate;
  const achievements = fsp.getAchievements(candidate.fsp_id);
  return { ...candidate, achievements };
}

function buildCategorizedCandidates() {
  return db
    .prepare('SELECT * FROM candidates WHERE privacy_show_in_search = 1')
    .all()
    .map((candidate) => {
      const achievements = fsp.getAchievements(candidate.fsp_id);
      const category = categorizeCandidate(candidate, achievements);
      return { candidate: attachAchievements(candidate), category };
    });
}

function attachEmployerOfferStatus(candidate) {
  return candidate;
}

function buildOfferRow(offerId) {
  return db
    .prepare(
      `SELECT o.*, v.title AS vacancy_title, v.company,
              c.full_name AS candidate_name,
              ec.id AS employer_company_id, ec.name AS employer_company_name
       FROM offers o
       JOIN vacancies v ON v.id = o.vacancy_id
       JOIN candidates c ON c.id = o.candidate_id
       LEFT JOIN employer_companies ec ON ec.id = o.employer_id
       WHERE o.id = ?`
    )
    .get(offerId);
}

function buildApplicationRow(applicationId) {
  return db
    .prepare(
      `SELECT a.*, v.title AS vacancy_title, v.company,
              c.full_name AS candidate_name
       FROM applications a
       JOIN vacancies v ON v.id = a.vacancy_id
       JOIN candidates c ON c.id = a.candidate_id
       WHERE a.id = ?`
    )
    .get(applicationId);
}

function publicVacancyRow(v) {
  return v;
}

// ---- Health & Meta ----

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: nowIso() });
});

app.get('/api/fsp/disciplines', (req, res) => {
  res.json(fsp.getDisciplines());
});

app.get('/api/fsp/achievements/:fspId', (req, res) => {
  res.json(fsp.getAchievements(req.params.fspId));
});

app.get('/api/meta', (req, res) => {
  res.json({
    grades: GRADE_ORDER,
    cooldown_days: GRADE_CHANGE_COOLDOWN_DAYS,
    moderation: {
      vacancy_limit_per_hour: moderation.VACANCY_LIMIT_PER_HOUR,
      report_threshold_for_review: moderation.REPORT_THRESHOLD_FOR_REVIEW,
    },
    fsp_disciplines: fsp.getDisciplines(),
  });
});

// ---- Auth ----

app.post('/api/auth/register', (req, res) => {
  try {
    const result = auth.register(req.body || {});
    res.status(201).json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/auth/verify-email', (req, res) => {
  try {
    res.json(auth.verifyEmail(req.body?.email, req.body?.code));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    res.json(auth.login(req.body?.email, req.body?.password));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/auth/logout', auth.requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  auth.logout(token);
  res.json({ ok: true });
});

app.get('/api/me', auth.requireAuth, (req, res) => {
  res.json(auth.me(req.user.id));
});

// ---- Профиль кандидата ----

app.get('/api/me/candidate/profile', auth.requireAuth, (req, res) => {
  const cand = findCandidateByUser(req.user.id);
  if (!cand) return res.status(404).json({ error: 'Candidate profile not found' });
  res.json(attachAchievements(cand));
});

app.put('/api/me/candidate/profile', auth.requireAuth, auth.requireRole('candidate'), (req, res) => {
  const cand = findCandidateByUser(req.user.id);
  if (!cand) return res.status(404).json({ error: 'Candidate profile not found' });
  const fields = [
    'full_name', 'stack', 'grade', 'role', 'experience_years',
    'work_format', 'city', 'bio', 'soft_skills', 'telegram', 'phone',
  ];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (req.body && f in req.body) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  values.push(cand.id);
  db.prepare(`UPDATE candidates SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = findCandidateByUser(req.user.id);
  auth.audit(req.user.id, 'update_profile', 'candidate', cand.id);
  res.json(attachAchievements(updated));
});

app.put('/api/me/privacy', auth.requireAuth, auth.requireRole('candidate'), (req, res) => {
  const cand = findCandidateByUser(req.user.id);
  if (!cand) return res.status(404).json({ error: 'Candidate profile not found' });
  const allowed = [
    'privacy_publish', 'privacy_show_contacts',
    'privacy_show_achievements', 'privacy_show_in_search',
  ];
  const updates = [];
  const values = [];
  for (const f of allowed) {
    if (req.body && f in req.body) {
      updates.push(`${f} = ?`);
      values.push(req.body[f] ? 1 : 0);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  values.push(cand.id);
  db.prepare(`UPDATE candidates SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  auth.audit(req.user.id, 'update_privacy', 'candidate', cand.id);
  res.json(findCandidateByUser(req.user.id));
});

// Привязка ФСП ID
app.post('/api/me/fsp-link', auth.requireAuth, auth.requireRole('candidate'), (req, res) => {
  const { fsp_id } = req.body || {};
  if (!fsp_id) return res.status(400).json({ error: 'fsp_id required' });
  const cand = findCandidateByUser(req.user.id);
  if (!cand) return res.status(404).json({ error: 'Candidate profile not found' });
  try {
    db.prepare(`UPDATE candidates SET fsp_id = ? WHERE id = ?`).run(fsp_id, cand.id);
  } catch (e) {
    return res.status(409).json({ error: 'FSP ID уже привязан к другому кандидату' });
  }
  auth.audit(req.user.id, 'link_fsp', 'candidate', cand.id, { fsp_id });
  res.json(attachAchievements(findCandidateByUser(req.user.id)));
});

// ---- Профиль компании работодателя ----

app.get('/api/me/employer/company', auth.requireAuth, (req, res) => {
  const company = findCompanyByUser(req.user.id);
  res.json(company || null);
});

app.put('/api/me/employer/company', auth.requireAuth, auth.requireRole('employer'), (req, res) => {
  let company = findCompanyByUser(req.user.id);
  if (!company) {
    db.prepare(
      `INSERT INTO employer_companies (user_id, name, contact_email) VALUES (?, ?, ?)`
    ).run(req.user.id, req.body?.name || 'Компания', req.user.email);
    company = findCompanyByUser(req.user.id);
  }
  const fields = ['name', 'description', 'contact_email', 'contact_phone', 'website', 'city', 'logo_url'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (req.body && f in req.body) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }
  if (updates.length) {
    values.push(company.id);
    db.prepare(`UPDATE employer_companies SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  auth.audit(req.user.id, 'update_company', 'employer_company', company.id);
  res.json(findCompanyByUser(req.user.id));
});

// ---- Публичные данные (подборка) ----

// Кандидаты — публичный список (с маскировкой контактов для работодателей).
app.get('/api/candidates', (req, res) => {
  const candidates = db.prepare('SELECT * FROM candidates').all().map(attachAchievements);
  // Если запрашивает работодатель, скрываем контакты.
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  let viewer = null;
  if (token) {
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'dev-secret-please-change-in-prod');
    viewer = db.prepare('SELECT id, role FROM users WHERE id = ?').get(payload.sub);
  }
  if (viewer && viewer.role === 'employer') {
    candidates.forEach((c) => {
      for (const f of CONTACT_FIELDS) {
        if (c[f]) c[f] = null;
      }
    });
  }
  res.json(candidates);
});

app.post('/api/candidates', (req, res) => {
  // legacy: только для обратной совместимости со старым фронтом. Реальные кандидаты
  // создаются через /api/auth/register. В новом фронте этот эндпоинт не используется.
  const {
    fsp_id, full_name, email, telegram, role, grade, stack,
    experience_years, work_format, city,
  } = req.body || {};
  if (!full_name || !stack || !grade || !role) {
    return res.status(400).json({ error: 'full_name, stack, grade, role are required' });
  }
  const info = db.prepare(
    `INSERT INTO candidates
       (full_name, email, telegram, stack, grade, role, experience_years, work_format, city, fsp_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(full_name, email || null, telegram || null, stack, grade, role,
        experience_years || 0, work_format || 'office', city || null, fsp_id || null);
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(attachAchievements(candidate));
});

app.get('/api/candidates/:id/category', (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  const category = categorizeCandidate(candidate, fsp.getAchievements(candidate.fsp_id));
  res.json({ candidate: attachAchievements(candidate), category });
});

app.get('/api/candidates/:id/pdf', async (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  if (!candidate.privacy_publish) return res.status(403).json({ error: 'Profile is private' });
  const achievements = fsp.getAchievements(candidate.fsp_id);
  try {
    const buf = await buildCandidatePdf(candidate, candidate.privacy_show_achievements ? achievements : []);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="profile-${candidate.id}.pdf"`
    );
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: 'PDF generation failed: ' + e.message });
  }
});

app.get('/api/candidates/search', (req, res) => {
  const filters = {
    role: req.query.role || null,
    grade: req.query.grade || null,
    stack: req.query.stack || null,
    work_format: req.query.work_format || null,
    city: req.query.city || null,
    fsp_only: req.query.fsp_only === 'true' || req.query.fsp_only === '1',
  };
  const items = buildCategorizedCandidates();
  const filtered = filterCandidates(items, filters);
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  let viewer = null;
  if (token) {
    try {
      const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'dev-secret-please-change-in-prod');
      viewer = db.prepare('SELECT id, role FROM users WHERE id = ?').get(payload.sub);
    } catch (e) { /* anonymous */ }
  }
  const employerCompanyId = viewer && viewer.role === 'employer'
    ? (findCompanyByUser(viewer.id) || {}).id
    : null;

  const result = filtered.map((item) => {
    const bestTest = db
      .prepare(
        `SELECT MAX(percent) AS p FROM test_attempts
         WHERE candidate_id = ? AND status = 'completed'`
      )
      .get(item.candidate.id);
    const rank = rankInCategory(item.category, bestTest ? bestTest.p : 0);
    let candidate = item.candidate;
    if (employerCompanyId) {
      const access = canViewContacts(employerCompanyId, candidate.id, db);
      redactCandidate(candidate, 'employer', viewer.id, access);
    }
    return { candidate, category: item.category, rank };
  });
  res.json({ total: result.length, results: result });
});

// ---- Вакансии ----

app.get('/api/vacancies', (req, res) => {
  const rows = db
    .prepare(`SELECT v.*, ec.name AS employer_company_name
              FROM vacancies v
              LEFT JOIN employer_companies ec ON ec.id = v.employer_id
              WHERE v.is_active = 1 AND v.moderation_status != 'hidden'
              ORDER BY v.created_at DESC`)
    .all();
  res.json(rows);
});

app.get('/api/vacancies/:id', (req, res) => {
  const row = db
    .prepare(`SELECT v.*, ec.name AS employer_company_name, ec.description AS company_description
              FROM vacancies v
              LEFT JOIN employer_companies ec ON ec.id = v.employer_id
              WHERE v.id = ?`)
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Vacancy not found' });
  res.json(row);
});

app.post('/api/vacancies', auth.requireAuth, auth.requireRole('employer'), (req, res) => {
  const company = findCompanyByUser(req.user.id);
  if (!company) return res.status(400).json({ error: 'Company profile required' });
  const limit = moderation.canPostVacancy(req.user.id);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Vacancy rate limit exceeded (${limit.used}/${limit.limit} per hour)`,
    });
  }
  const {
    title, description, stack, grade, role,
    salary_from, salary_to, work_format, city,
  } = req.body || {};
  if (!title || !stack || !grade || !role) {
    return res.status(400).json({ error: 'title, stack, grade, role are required' });
  }
  const info = db.prepare(
    `INSERT INTO vacancies
       (employer_id, title, company, description, stack, grade, role,
        salary_from, salary_to, work_format, city)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    company.id,
    title,
    company.name,
    description || '',
    stack,
    grade,
    role,
    salary_from || null,
    salary_to || null,
    work_format || 'office',
    city || null
  );
  auth.audit(req.user.id, 'create_vacancy', 'vacancy', info.lastInsertRowid, { title });
  const vacancy = db.prepare('SELECT * FROM vacancies WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(vacancy);
});

app.patch('/api/vacancies/:id', auth.requireAuth, auth.requireRole('employer'), (req, res) => {
  const vacancy = db.prepare('SELECT * FROM vacancies WHERE id = ?').get(req.params.id);
  if (!vacancy) return res.status(404).json({ error: 'Vacancy not found' });
  const company = findCompanyByUser(req.user.id);
  if (!company || vacancy.employer_id !== company.id) {
    return res.status(403).json({ error: 'Not your vacancy' });
  }
  const allowed = ['title', 'description', 'stack', 'grade', 'role',
    'salary_from', 'salary_to', 'work_format', 'city', 'is_active'];
  const updates = [];
  const values = [];
  for (const f of allowed) {
    if (req.body && f in req.body) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  values.push(vacancy.id);
  db.prepare(`UPDATE vacancies SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  auth.audit(req.user.id, 'update_vacancy', 'vacancy', vacancy.id);
  res.json(db.prepare('SELECT * FROM vacancies WHERE id = ?').get(vacancy.id));
});

app.post('/api/vacancies/:id/report', (req, res) => {
  const vacancy = db.prepare('SELECT id FROM vacancies WHERE id = ?').get(req.params.id);
  if (!vacancy) return res.status(404).json({ error: 'Vacancy not found' });
  const { reason, details, reporter_email } = req.body || {};
  if (!reason) return res.status(400).json({ error: 'reason required' });
  let reporterUserId = null;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'dev-secret-please-change-in-prod');
      reporterUserId = payload.sub;
    } catch (e) { /* anon */ }
  }
  const result = moderation.reportVacancy(vacancy.id, reason, details, reporterUserId, reporter_email);
  res.status(201).json(result);
});

app.get('/api/vacancies/:id/matches', (req, res) => {
  const vacancy = db.prepare('SELECT * FROM vacancies WHERE id = ?').get(req.params.id);
  if (!vacancy) return res.status(404).json({ error: 'Vacancy not found' });
  const items = buildCategorizedCandidates();
  const matches = matchCandidates(vacancy, items);
  res.json({ vacancy, matches });
});

// ---- Офферы (приглашения от работодателя) ----

app.get('/api/offers', auth.requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'candidate') {
    const cand = findCandidateByUser(req.user.id);
    rows = cand ? buildOfferRowsForCandidate(cand.id) : [];
  } else if (req.user.role === 'employer') {
    const company = findCompanyByUser(req.user.id);
    rows = company ? buildOfferRowsForEmployer(company.id) : [];
  } else {
    rows = [];
  }
  res.json(rows);
});

function buildOfferRowsForCandidate(candidateId) {
  return db
    .prepare(
      `SELECT o.*, v.title AS vacancy_title, v.company,
              ec.name AS employer_company_name
       FROM offers o
       JOIN vacancies v ON v.id = o.vacancy_id
       LEFT JOIN employer_companies ec ON ec.id = o.employer_id
       WHERE o.candidate_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(candidateId);
}

function buildOfferRowsForEmployer(employerCompanyId) {
  return db
    .prepare(
      `SELECT o.*, v.title AS vacancy_title,
              c.full_name AS candidate_name
       FROM offers o
       JOIN vacancies v ON v.id = o.vacancy_id
       JOIN candidates c ON c.id = o.candidate_id
       WHERE o.employer_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(employerCompanyId);
}

app.post('/api/offers', auth.requireAuth, auth.requireRole('employer'), (req, res) => {
  const { vacancy_id, candidate_id, salary_from, salary_to, message } = req.body || {};
  if (!vacancy_id || !candidate_id) {
    return res.status(400).json({ error: 'vacancy_id and candidate_id are required' });
  }
  if (salary_from == null && salary_to == null) {
    return res.status(400).json({ error: 'salary_from or salary_to required (§2.2.1 ТЗ)' });
  }
  const company = findCompanyByUser(req.user.id);
  if (!company) return res.status(400).json({ error: 'Company profile required' });
  const vacancy = db.prepare('SELECT * FROM vacancies WHERE id = ?').get(vacancy_id);
  if (!vacancy) return res.status(404).json({ error: 'Vacancy not found' });
  if (vacancy.employer_id !== company.id) {
    return res.status(403).json({ error: 'Not your vacancy' });
  }
  const candidate = db.prepare('SELECT id FROM candidates WHERE id = ?').get(candidate_id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  const exists = db
    .prepare('SELECT id FROM offers WHERE vacancy_id = ? AND candidate_id = ?')
    .get(vacancy_id, candidate_id);
  if (exists) return res.status(409).json({ error: 'Offer already exists' });

  const info = db.prepare(
    `INSERT INTO offers (vacancy_id, candidate_id, employer_id, salary_from, salary_to, message, status)
     VALUES (?, ?, ?, ?, ?, ?, 'sent')`
  ).run(vacancy_id, candidate_id, company.id, salary_from || null, salary_to || null, message || null);

  auth.audit(req.user.id, 'create_offer', 'offer', info.lastInsertRowid, { vacancy_id, candidate_id });
  res.status(201).json(buildOfferRow(info.lastInsertRowid));
});

app.patch('/api/offers/:id', auth.requireAuth, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['viewed', 'accepted', 'declined'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
  if (!offer) return res.status(404).json({ error: 'Offer not found' });

  const cand = findCandidateByUser(req.user.id);
  const company = findCompanyByUser(req.user.id);
  const isOwnerCand = cand && cand.id === offer.candidate_id;
  const isOwnerEmployer = company && offer.employer_id === company.id;
  if (!isOwnerCand && !isOwnerEmployer) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // Кандидат может перевести sent/viewed -> accepted/declined.
  // Работодатель может перевести sent/viewed -> viewed.
  if (status === 'accepted' || status === 'declined') {
    if (!isOwnerCand) return res.status(403).json({ error: 'Only candidate can accept/decline' });
  }
  if (status === 'viewed' && !isOwnerEmployer && !isOwnerCand) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const patch = { status };
  if (status === 'viewed' && !offer.viewed_at) patch.viewed_at = nowIso();
  if ((status === 'accepted' || status === 'declined') && !offer.responded_at) {
    patch.responded_at = nowIso();
  }

  const setCols = Object.keys(patch).map((k) => `${k} = ?`).join(', ');
  const setVals = Object.values(patch);
  setVals.push(offer.id);
  db.prepare(`UPDATE offers SET ${setCols} WHERE id = ?`).run(...setVals);
  auth.audit(req.user.id, `offer_${status}`, 'offer', offer.id);
  res.json(buildOfferRow(offer.id));
});

// Контакты в оффере — открываются кандидату всегда, работодателю — после accepted.
app.get('/api/offers/:id/contact', auth.requireAuth, (req, res) => {
  const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
  if (!offer) return res.status(404).json({ error: 'Offer not found' });
  const cand = findCandidateByUser(req.user.id);
  const company = findCompanyByUser(req.user.id);
  const candView = cand && cand.id === offer.candidate_id;
  const employerView = company && offer.employer_id === company.id;
  if (!candView && !employerView) return res.status(403).json({ error: 'Forbidden' });

  if (candView) {
    // Кандидат видит контакты работодателя.
    const comp = db.prepare('SELECT * FROM employer_companies WHERE id = ?').get(offer.employer_id);
    return res.json({
      side: 'employer',
      company: comp,
      vacancy: db.prepare('SELECT * FROM vacancies WHERE id = ?').get(offer.vacancy_id),
    });
  }
  // Работодатель видит контакты кандидата только после принятия.
  if (offer.status !== 'accepted') {
    return res.status(403).json({ error: 'Contacts hidden until candidate accepts the offer' });
  }
  const c = db.prepare('SELECT * FROM candidates WHERE id = ?').get(offer.candidate_id);
  return res.json({ side: 'candidate', candidate: c });
});

// ---- Отклики (кандидат сам пишет на вакансию) ----

app.get('/api/applications', auth.requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'candidate') {
    const cand = findCandidateByUser(req.user.id);
    rows = cand ? buildApplicationRowsForCandidate(cand.id) : [];
  } else if (req.user.role === 'employer') {
    const company = findCompanyByUser(req.user.id);
    rows = company ? buildApplicationRowsForEmployer(company.id) : [];
  } else {
    rows = [];
  }
  res.json(rows);
});

function buildApplicationRowsForCandidate(candidateId) {
  return db
    .prepare(
      `SELECT a.*, v.title AS vacancy_title, v.company,
              ec.name AS employer_company_name
       FROM applications a
       JOIN vacancies v ON v.id = a.vacancy_id
       LEFT JOIN employer_companies ec ON ec.id = v.employer_id
       WHERE a.candidate_id = ?
       ORDER BY a.created_at DESC`
    )
    .all(candidateId);
}

function buildApplicationRowsForEmployer(employerCompanyId) {
  return db
    .prepare(
      `SELECT a.*, v.title AS vacancy_title,
              c.full_name AS candidate_name
       FROM applications a
       JOIN vacancies v ON v.id = a.vacancy_id
       JOIN candidates c ON c.id = a.candidate_id
       WHERE v.employer_id = ?
       ORDER BY a.created_at DESC`
    )
    .all(employerCompanyId);
}

app.post('/api/applications', auth.requireAuth, auth.requireRole('candidate'), (req, res) => {
  const { vacancy_id, cover_letter } = req.body || {};
  if (!vacancy_id) return res.status(400).json({ error: 'vacancy_id required' });
  const cand = findCandidateByUser(req.user.id);
  if (!cand) return res.status(404).json({ error: 'Candidate profile not found' });
  const vacancy = db.prepare('SELECT * FROM vacancies WHERE id = ?').get(vacancy_id);
  if (!vacancy) return res.status(404).json({ error: 'Vacancy not found' });
  const exists = db
    .prepare('SELECT id FROM applications WHERE vacancy_id = ? AND candidate_id = ?')
    .get(vacancy_id, cand.id);
  if (exists) return res.status(409).json({ error: 'Application already exists' });
  const info = db.prepare(
    `INSERT INTO applications (vacancy_id, candidate_id, cover_letter, status)
     VALUES (?, ?, ?, 'sent')`
  ).run(vacancy_id, cand.id, cover_letter || null);
  auth.audit(req.user.id, 'create_application', 'application', info.lastInsertRowid, { vacancy_id });
  res.status(201).json(buildApplicationRow(info.lastInsertRowid));
});

app.patch('/api/applications/:id', auth.requireAuth, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['viewed', 'accepted', 'declined'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  const company = findCompanyByUser(req.user.id);
  const cand = findCandidateByUser(req.user.id);
  const isOwnerEmployer = company && db
    .prepare('SELECT employer_id FROM vacancies WHERE id = ?').get(app.vacancy_id).employer_id === company.id;
  const isOwnerCand = cand && cand.id === app.candidate_id;
  if (!isOwnerEmployer && !isOwnerCand) return res.status(403).json({ error: 'Forbidden' });

  const patch = { status };
  if (status === 'viewed' && !app.viewed_at) patch.viewed_at = nowIso();
  if ((status === 'accepted' || status === 'declined') && !app.responded_at) patch.responded_at = nowIso();

  const setCols = Object.keys(patch).map((k) => `${k} = ?`).join(', ');
  const setVals = Object.values(patch);
  setVals.push(app.id);
  db.prepare(`UPDATE applications SET ${setCols} WHERE id = ?`).run(...setVals);
  auth.audit(req.user.id, `application_${status}`, 'application', app.id);
  res.json(buildApplicationRow(app.id));
});

// ---- Регулярные короткие задания ----

app.get('/api/tasks', auth.requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'candidate') {
    const cand = findCandidateByUser(req.user.id);
    rows = cand ? buildTaskRowsForCandidate(cand.id) : [];
  } else {
    const company = findCompanyByUser(req.user.id);
    rows = company ? buildTaskRowsForEmployer(company.id) : [];
  }
  res.json(rows);
});

function buildTaskRowsForCandidate(candidateId) {
  return db
    .prepare(
      `SELECT t.*, v.title AS vacancy_title,
              ec.name AS employer_company_name
       FROM regular_tasks t
       LEFT JOIN vacancies v ON v.id = t.vacancy_id
       LEFT JOIN employer_companies ec ON ec.id = t.employer_id
       WHERE t.candidate_id = ?
       ORDER BY t.created_at DESC`
    )
    .all(candidateId);
}

function buildTaskRowsForEmployer(employerCompanyId) {
  return db
    .prepare(
      `SELECT t.*, v.title AS vacancy_title,
              c.full_name AS candidate_name
       FROM regular_tasks t
       LEFT JOIN vacancies v ON v.id = t.vacancy_id
       JOIN candidates c ON c.id = t.candidate_id
       WHERE t.employer_id = ?
       ORDER BY t.created_at DESC`
    )
    .all(employerCompanyId);
}

app.post('/api/tasks', auth.requireAuth, auth.requireRole('employer'), (req, res) => {
  const { candidate_id, vacancy_id, title, description, due_at } = req.body || {};
  if (!candidate_id || !title || !description) {
    return res.status(400).json({ error: 'candidate_id, title, description are required' });
  }
  const company = findCompanyByUser(req.user.id);
  if (!company) return res.status(400).json({ error: 'Company profile required' });
  const cand = db.prepare('SELECT id FROM candidates WHERE id = ?').get(candidate_id);
  if (!cand) return res.status(404).json({ error: 'Candidate not found' });

  const info = db.prepare(
    `INSERT INTO regular_tasks (employer_id, vacancy_id, candidate_id, title, description, due_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(company.id, vacancy_id || null, candidate_id, title, description, due_at || null);

  auth.audit(req.user.id, 'create_task', 'task', info.lastInsertRowid, { candidate_id });
  const task = db.prepare('SELECT * FROM regular_tasks WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(task);
});

app.post('/api/tasks/:id/submit', auth.requireAuth, auth.requireRole('candidate'), (req, res) => {
  const task = db.prepare('SELECT * FROM regular_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const cand = findCandidateByUser(req.user.id);
  if (!cand || cand.id !== task.candidate_id) return res.status(403).json({ error: 'Not your task' });
  if (task.status !== 'assigned') return res.status(409).json({ error: 'Task already submitted' });
  const { solution } = req.body || {};
  if (!solution) return res.status(400).json({ error: 'solution required' });
  db.prepare(
    `UPDATE regular_tasks SET status = 'submitted', solution = ?, completed_at = datetime('now') WHERE id = ?`
  ).run(solution, task.id);
  auth.audit(req.user.id, 'submit_task', 'task', task.id);
  res.json(db.prepare('SELECT * FROM regular_tasks WHERE id = ?').get(task.id));
});

app.post('/api/tasks/:id/review', auth.requireAuth, auth.requireRole('employer'), (req, res) => {
  const task = db.prepare('SELECT * FROM regular_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const company = findCompanyByUser(req.user.id);
  if (!company || task.employer_id !== company.id) return res.status(403).json({ error: 'Not your task' });
  if (task.status !== 'submitted') return res.status(409).json({ error: 'Task not submitted' });
  const { score, comment, status } = req.body || {};
  const allowed = ['reviewed_ok', 'reviewed_bad'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be: ${allowed.join(', ')}` });
  db.prepare(
    `UPDATE regular_tasks SET status = ?, score = ?, reviewer_comment = ? WHERE id = ?`
  ).run(status, score == null ? null : Number(score), comment || null, task.id);
  auth.audit(req.user.id, `task_${status}`, 'task', task.id);
  res.json(db.prepare('SELECT * FROM regular_tasks WHERE id = ?').get(task.id));
});

// ---- Тестирование ----

app.get('/api/testing/meta', (req, res) => {
  const { TEST_BANK } = require('./testing');
  const roles = [...new Set(TEST_BANK.map((q) => q.role))].sort();
  res.json({ roles, grades: GRADE_ORDER, cooldownDays: GRADE_CHANGE_COOLDOWN_DAYS });
});

app.post('/api/candidates/:id/tests', (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  const { role, claimed_grade } = req.body || {};
  if (!role || !claimed_grade) {
    return res.status(400).json({ error: 'role and claimed_grade are required' });
  }
  if (!GRADE_ORDER.includes(claimed_grade)) {
    return res.status(400).json({ error: `claimed_grade must be one of: ${GRADE_ORDER.join(', ')}` });
  }
  const questions = generateTest(role, claimed_grade);
  const info = db.prepare(
    `INSERT INTO test_attempts (candidate_id, role, claimed_grade, status, questions)
     VALUES (?, ?, ?, 'in_progress', ?)`
  ).run(candidate.id, role, claimed_grade, JSON.stringify(questions));

  const attempt = db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({
    attempt_id: attempt.id,
    candidate_id: attempt.candidate_id,
    role: attempt.role,
    claimed_grade: attempt.claimed_grade,
    status: attempt.status,
    questions: JSON.parse(attempt.questions),
  });
});

app.post('/api/test-attempts/:id/submit', (req, res) => {
  const attempt = db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(req.params.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (attempt.status !== 'in_progress') {
    return res.status(409).json({ error: 'Attempt already submitted' });
  }
  const questions = JSON.parse(attempt.questions);
  const answers = req.body?.answers || {};
  const graded = gradeAttempt({ questions }, answers);
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(attempt.candidate_id);
  const resolution = resolveGrade(attempt, graded, candidate);
  const nowIsoLocal = nowIso();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE test_attempts
       SET status = 'completed', answers = ?, score = ?, max_score = ?, percent = ?, result = ?, grade_after = ?, completed_at = ?
       WHERE id = ?`
    ).run(
      JSON.stringify(answers),
      graded.score,
      graded.maxScore,
      graded.percent,
      graded.result,
      resolution.gradeAfter,
      nowIsoLocal,
      attempt.id
    );
    if (resolution.changed) {
      db.prepare(
        `UPDATE candidates SET verified_grade = ?, last_grade_change = ? WHERE id = ?`
      ).run(resolution.gradeAfter, nowIsoLocal, candidate.id);
    }
  });
  tx();
  const updated = db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(attempt.id);
  res.json({
    attempt: updated,
    result: graded.result,
    percent: graded.percent,
    score: graded.score,
    max_score: graded.maxScore,
    grade_after: resolution.gradeAfter,
    grade_changed: resolution.changed,
    cooldown_blocked: resolution.cooldownBlocked,
    cooldown_days: GRADE_CHANGE_COOLDOWN_DAYS,
    details: graded.details,
  });
});

app.get('/api/candidates/:id/tests', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, role, claimed_grade, status, percent, result, grade_after, created_at, completed_at
       FROM test_attempts WHERE candidate_id = ? ORDER BY created_at DESC`
    )
    .all(req.params.id);
  res.json(rows);
});

app.get('/api/candidates/:id/grade-change-status', (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  const allowed = canChangeGrade(candidate);
  const last = candidate.last_grade_change ? new Date(candidate.last_grade_change) : null;
  let nextAllowed = null;
  if (!allowed && last) {
    nextAllowed = new Date(last.getTime() + GRADE_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }
  res.json({ allowed, cooldown_days: GRADE_CHANGE_COOLDOWN_DAYS, last_grade_change: candidate.last_grade_change, next_allowed: nextAllowed });
});

// ---- Админ / модерация ----
// (Для MVP — простой admin endpoint: пользователь с email admin@local считается админом.)

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Auth required' });
  if (!req.user.email.endsWith('@admin.local') && req.user.email !== 'admin@local') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

app.get('/api/admin/reports', auth.requireAuth, requireAdmin, (req, res) => {
  res.json(moderation.listReports());
});

app.post('/api/admin/moderate/:vacancyId', auth.requireAuth, requireAdmin, (req, res) => {
  const { decision, note } = req.body || {};
  try {
    res.json(moderation.moderateVacancy(req.params.vacancyId, decision, note));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get('/api/admin/audit', auth.requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT 200`)
    .all();
  res.json(rows);
});

// ---- ATS ----

app.get('/api/ats/events', auth.requireAuth, requireAdmin, (req, res) => {
  res.json(ats.listEvents());
});

app.post('/api/ats/push-candidate', auth.requireAuth, requireAdmin, async (req, res) => {
  const { system = 'mock', candidate_id } = req.body || {};
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidate_id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  const result = await ats.pushCandidate(system, candidate);
  res.json(result);
});

// ---- Запуск ----

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Agregator IT vakansiy listening on port ${PORT}`);
});