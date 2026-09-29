const express = require('express');
const path = require('path');
const db = require('./db');
const fsp = require('./services/fspMock');
const { categorizeCandidate, matchCandidates } = require('./matching');

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