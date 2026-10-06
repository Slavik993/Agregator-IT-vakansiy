const express = require('express');
const path = require('path');
const db = require('./db');
const fsp = require('./services/fspMock');
const { categorizeCandidate, matchCandidates, filterCandidates, rankInCategory } = require('./matching');
const {
  generateTest,
  gradeAttempt,
  resolveGrade,
  canChangeGrade,
  GRADE_CHANGE_COOLDOWN_DAYS,
} = require('./testing');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Вспомогательные функции ----

function attachAchievements(candidate) {
  const achievements = fsp.getAchievements(candidate.fsp_id);
  return { ...candidate, achievements };
}

function buildCategorizedCandidates() {
  return db
    .prepare('SELECT * FROM candidates')
    .all()
    .map((candidate) => {
      const achievements = fsp.getAchievements(candidate.fsp_id);
      const category = categorizeCandidate(candidate, achievements);
      return { candidate: attachAchievements(candidate), category };
    });
}

// ---- Health ----

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ---- Справочники ФСП ----

app.get('/api/fsp/disciplines', (req, res) => {
  res.json(fsp.getDisciplines());
});

app.get('/api/fsp/achievements/:fspId', (req, res) => {
  const achievements = fsp.getAchievements(req.params.fspId);
  res.json(achievements);
});

// ---- Кандидаты ----

app.get('/api/candidates', (req, res) => {
  const rows = db.prepare('SELECT * FROM candidates').all();
  res.json(rows.map(attachAchievements));
});

app.post('/api/candidates', (req, res) => {
  const {
    fsp_id,
    full_name,
    email,
    telegram,
    stack,
    grade,
    role,
    experience_years,
    work_format,
    city,
  } = req.body || {};

  if (!full_name || !stack || !grade || !role) {
    return res.status(400).json({ error: 'full_name, stack, grade, role are required' });
  }

  const info = db
    .prepare(
      `INSERT INTO candidates
        (fsp_id, full_name, email, telegram, stack, grade, role, experience_years, work_format, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fsp_id || null,
      full_name,
      email || null,
      telegram || null,
      stack,
      grade,
      role,
      experience_years || 0,
      work_format || 'office',
      city || null
    );

  const candidate = db
    .prepare('SELECT * FROM candidates WHERE id = ?')
    .get(info.lastInsertRowid);

  res.status(201).json(attachAchievements(candidate));
});

// Категоризация конкретного кандидата
app.get('/api/candidates/:id/category', (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!candidate) {
    return res.status(404).json({ error: 'Candidate not found' });
  }
  const achievements = fsp.getAchievements(candidate.fsp_id);
  const category = categorizeCandidate(candidate, achievements);
  res.json({ candidate: attachAchievements(candidate), category });
});

// ---- Вакансии ----

app.get('/api/vacancies', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM vacancies WHERE is_active = 1 ORDER BY created_at DESC')
    .all();
  res.json(rows);
});

app.post('/api/vacancies', (req, res) => {
  const {
    title,
    company,
    description,
    stack,
    grade,
    role,
    salary_from,
    salary_to,
    work_format,
    city,
  } = req.body || {};

  if (!title || !company || !stack || !grade || !role) {
    return res
      .status(400)
      .json({ error: 'title, company, stack, grade, role are required' });
  }

  const info = db
    .prepare(
      `INSERT INTO vacancies
        (title, company, description, stack, grade, role, salary_from, salary_to, work_format, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      title,
      company,
      description || '',
      stack,
      grade,
      role,
      salary_from || null,
      salary_to || null,
      work_format || 'office',
      city || null
    );

  const vacancy = db.prepare('SELECT * FROM vacancies WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(vacancy);
});

// Обратная механика: работодатель выбирает категорию и получает кандидатов
app.get('/api/vacancies/:id/matches', (req, res) => {
  const vacancy = db.prepare('SELECT * FROM vacancies WHERE id = ?').get(req.params.id);
  if (!vacancy) {
    return res.status(404).json({ error: 'Vacancy not found' });
  }
  const items = buildCategorizedCandidates();
  const matches = matchCandidates(vacancy, items);
  res.json({ vacancy, matches });
});

// Поиск по банку кандидатов с фильтрацией (без потери подборки)
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
  // Поиск возвращает полный банк (без скоринга под конкретную вакансию),
  // с ранжированием внутри категории по силе подтверждённого профиля.
  const result = filtered.map((item) => {
    const bestTest = db
      .prepare(
        `SELECT MAX(percent) AS p FROM test_attempts
         WHERE candidate_id = ? AND status = 'completed'`
      )
      .get(item.candidate.id);
    const rank = rankInCategory(item.category, bestTest ? bestTest.p : 0);
    return { candidate: item.candidate, category: item.category, rank };
  });
  res.json({ total: result.length, results: result });
});

// ---- Тестирование кандидатов ----

// Справочники специализаций и грейдов для формы теста
app.get('/api/testing/meta', (req, res) => {
  const { GRADE_ORDER, TEST_BANK } = require('./testing');
  const roles = [...new Set(TEST_BANK.map((q) => q.role))].sort();
  res.json({ roles, grades: GRADE_ORDER, cooldownDays: GRADE_CHANGE_COOLDOWN_DAYS });
});

// Сгенерировать новый тест для кандидата
app.post('/api/candidates/:id/tests', (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!candidate) {
    return res.status(404).json({ error: 'Candidate not found' });
  }
  const { role, claimed_grade } = req.body || {};
  if (!role || !claimed_grade) {
    return res.status(400).json({ error: 'role and claimed_grade are required' });
  }
  const { GRADE_ORDER } = require('./testing');
  if (!GRADE_ORDER.includes(claimed_grade)) {
    return res.status(400).json({ error: `claimed_grade must be one of: ${GRADE_ORDER.join(', ')}` });
  }

  const questions = generateTest(role, claimed_grade);
  const info = db
    .prepare(
      `INSERT INTO test_attempts (candidate_id, role, claimed_grade, status, questions)
       VALUES (?, ?, ?, 'in_progress', ?)`
    )
    .run(candidate.id, role, claimed_grade, JSON.stringify(questions));

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

// Отправить ответы и получить результат
app.post('/api/test-attempts/:id/submit', (req, res) => {
  const attempt = db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(req.params.id);
  if (!attempt) {
    return res.status(404).json({ error: 'Attempt not found' });
  }
  if (attempt.status !== 'in_progress') {
    return res.status(409).json({ error: 'Attempt already submitted' });
  }

  const questions = JSON.parse(attempt.questions);
  const answers = req.body?.answers || {};
  const graded = gradeAttempt({ questions }, answers);
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(attempt.candidate_id);
  const resolution = resolveGrade(attempt, graded, candidate);

  const nowIso = new Date().toISOString();
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
      nowIso,
      attempt.id
    );
    if (resolution.changed) {
      db.prepare(
        `UPDATE candidates SET verified_grade = ?, last_grade_change = ? WHERE id = ?`
      ).run(resolution.gradeAfter, nowIso, candidate.id);
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

// История попыток кандидата
app.get('/api/candidates/:id/tests', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, role, claimed_grade, status, percent, result, grade_after, created_at, completed_at
       FROM test_attempts WHERE candidate_id = ? ORDER BY created_at DESC`
    )
    .all(req.params.id);
  res.json(rows);
});

// Проверка доступности смены грейда (cooldown)
app.get('/api/candidates/:id/grade-change-status', (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!candidate) {
    return res.status(404).json({ error: 'Candidate not found' });
  }
  const allowed = canChangeGrade(candidate);
  const last = candidate.last_grade_change ? new Date(candidate.last_grade_change) : null;
  let nextAllowed = null;
  if (!allowed && last) {
    nextAllowed = new Date(last.getTime() + GRADE_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }
  res.json({ allowed, cooldown_days: GRADE_CHANGE_COOLDOWN_DAYS, last_grade_change: candidate.last_grade_change, next_allowed: nextAllowed });
});

// ---- Офферы (работодатель выходит на кандидата) ----

app.post('/api/offers', (req, res) => {
  const { vacancy_id, candidate_id, salary_offer, message } = req.body || {};

  if (!vacancy_id || !candidate_id) {
    return res.status(400).json({ error: 'vacancy_id and candidate_id are required' });
  }

  const exists = db
    .prepare('SELECT id FROM offers WHERE vacancy_id = ? AND candidate_id = ?')
    .get(vacancy_id, candidate_id);
  if (exists) {
    return res.status(409).json({ error: 'Offer already exists for this candidate and vacancy' });
  }

  const info = db
    .prepare(
      `INSERT INTO offers (vacancy_id, candidate_id, salary_offer, message, status)
       VALUES (?, ?, ?, ?, 'pending')`
    )
    .run(vacancy_id, candidate_id, salary_offer || null, message || null);

  const offer = db
    .prepare(
      `SELECT o.*, v.title AS vacancy_title, v.company, c.full_name AS candidate_name, c.telegram
       FROM offers o
       JOIN vacancies v ON v.id = o.vacancy_id
       JOIN candidates c ON c.id = o.candidate_id
       WHERE o.id = ?`
    )
    .get(info.lastInsertRowid);

  res.status(201).json(offer);
});

app.get('/api/offers', (req, res) => {
  const rows = db
    .prepare(
      `SELECT o.*, v.title AS vacancy_title, v.company, c.full_name AS candidate_name, c.telegram
       FROM offers o
       JOIN vacancies v ON v.id = o.vacancy_id
       JOIN candidates c ON c.id = o.candidate_id
       ORDER BY o.created_at DESC`
    )
    .all();
  res.json(rows);
});

app.patch('/api/offers/:id', (req, res) => {
  const { status } = req.body || {};
  const allowed = ['pending', 'accepted', 'declined'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  const info = db
    .prepare('UPDATE offers SET status = ? WHERE id = ?')
    .run(status, req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Offer not found' });
  }
  const offer = db
    .prepare(
      `SELECT o.*, v.title AS vacancy_title, v.company, c.full_name AS candidate_name, c.telegram
       FROM offers o
       JOIN vacancies v ON v.id = o.vacancy_id
       JOIN candidates c ON c.id = o.candidate_id
       WHERE o.id = ?`
    )
    .get(req.params.id);
  res.json(offer);
});

// ---- Запуск ----

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Agregator IT vakansiy listening on port ${PORT}`);
});