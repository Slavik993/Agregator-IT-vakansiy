// Подключение к SQLite, схема таблиц и лёгкие миграции.
// На этапе MVP схема проектируется «с запасом» под расширение:
//   users, candidates, employer_companies, vacancies, offers, applications,
//   regular_tasks, vacancy_reports, fsp_links, test_attempts, achievements,
//   audit_log, auth_tokens, rate_limit_log.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('candidate', 'employer')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  verification_code TEXT,
  verification_expires_at TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  fsp_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  telegram TEXT,
  phone TEXT,
  stack TEXT NOT NULL,
  grade TEXT NOT NULL,
  role TEXT NOT NULL,
  experience_years INTEGER NOT NULL DEFAULT 0,
  work_format TEXT NOT NULL DEFAULT 'office',
  city TEXT,
  bio TEXT,
  soft_skills TEXT,
  verified_grade TEXT,
  last_grade_change TEXT,
  privacy_publish INTEGER NOT NULL DEFAULT 1,
  privacy_show_contacts INTEGER NOT NULL DEFAULT 0,
  privacy_show_achievements INTEGER NOT NULL DEFAULT 1,
  privacy_show_in_search INTEGER NOT NULL DEFAULT 1,
  consent_given INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employer_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  city TEXT,
  logo_url TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vacancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employer_id INTEGER REFERENCES employer_companies(id),
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  description TEXT NOT NULL,
  stack TEXT NOT NULL,
  grade TEXT NOT NULL,
  role TEXT NOT NULL,
  salary_from INTEGER,
  salary_to INTEGER,
  work_format TEXT NOT NULL DEFAULT 'office',
  city TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  moderation_status TEXT NOT NULL DEFAULT 'ok',
  moderation_note TEXT,
  views_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vacancy_id INTEGER NOT NULL REFERENCES vacancies(id),
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  employer_id INTEGER REFERENCES employer_companies(id),
  salary_from INTEGER,
  salary_to INTEGER,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  viewed_at TEXT,
  responded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (vacancy_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vacancy_id INTEGER NOT NULL REFERENCES vacancies(id),
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  cover_letter TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  viewed_at TEXT,
  responded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (vacancy_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS regular_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employer_id INTEGER NOT NULL REFERENCES employer_companies(id),
  vacancy_id INTEGER REFERENCES vacancies(id),
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned',
  solution TEXT,
  score INTEGER,
  reviewer_comment TEXT,
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS vacancy_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vacancy_id INTEGER NOT NULL REFERENCES vacancies(id),
  reporter_user_id INTEGER REFERENCES users(id),
  reporter_email TEXT,
  reason TEXT NOT NULL,
  details TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  moderation_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS fsp_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  fsp_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (candidate_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fsp_id TEXT NOT NULL,
  discipline TEXT NOT NULL,
  competition TEXT NOT NULL,
  result TEXT,
  role TEXT,
  rank TEXT,
  year INTEGER,
  source TEXT NOT NULL DEFAULT 'fsp'
);

CREATE TABLE IF NOT EXISTS test_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  role TEXT NOT NULL,
  claimed_grade TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  questions TEXT NOT NULL,
  answers TEXT,
  score INTEGER,
  max_score INTEGER,
  percent INTEGER,
  result TEXT,
  grade_after TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  ip TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_offers_candidate ON offers(candidate_id);
CREATE INDEX IF NOT EXISTS idx_offers_employer ON offers(employer_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_vacancy ON applications(vacancy_id);
CREATE INDEX IF NOT EXISTS idx_tasks_candidate ON regular_tasks(candidate_id);
CREATE INDEX IF NOT EXISTS idx_tasks_employer ON regular_tasks(employer_id);
CREATE INDEX IF NOT EXISTS idx_achievements_fsp ON achievements(fsp_id);
`);

// ---- Лёгкие миграции для старых баз (без удаления существующих данных) ----

const candidateCols = db.prepare('PRAGMA table_info(candidates)').all().map((c) => c.name);
const addCandidateCol = (key, ddl) => {
  if (!candidateCols.includes(key)) db.exec(`ALTER TABLE candidates ADD COLUMN ${ddl}`);
};
addCandidateCol('user_id', 'user_id INTEGER REFERENCES users(id)');
addCandidateCol('phone', 'phone TEXT');
addCandidateCol('bio', 'bio TEXT');
addCandidateCol('soft_skills', 'soft_skills TEXT');
addCandidateCol('privacy_publish', 'privacy_publish INTEGER NOT NULL DEFAULT 1');
addCandidateCol('privacy_show_contacts', 'privacy_show_contacts INTEGER NOT NULL DEFAULT 0');
addCandidateCol('privacy_show_achievements', 'privacy_show_achievements INTEGER NOT NULL DEFAULT 1');
addCandidateCol('privacy_show_in_search', 'privacy_show_in_search INTEGER NOT NULL DEFAULT 1');
addCandidateCol('consent_given', 'consent_given INTEGER NOT NULL DEFAULT 0');
addCandidateCol('consent_at', 'consent_at TEXT');

const offerCols = db.prepare('PRAGMA table_info(offers)').all().map((c) => c.name);
if (!offerCols.includes('salary_from')) {
  // Переносим старое salary_offer в salary_from (для совместимости).
  db.exec(`ALTER TABLE offers ADD COLUMN salary_from INTEGER`);
  db.exec(`ALTER TABLE offers ADD COLUMN salary_to INTEGER`);
  db.exec(`ALTER TABLE offers ADD COLUMN employer_id INTEGER REFERENCES employer_companies(id)`);
  db.exec(`ALTER TABLE offers ADD COLUMN viewed_at TEXT`);
  db.exec(`ALTER TABLE offers ADD COLUMN responded_at TEXT`);
  const rows = db.prepare("SELECT id, salary_offer FROM offers WHERE salary_offer IS NOT NULL").all();
  const upd = db.prepare('UPDATE offers SET salary_from = ? WHERE id = ?');
  for (const r of rows) upd.run(r.salary_offer, r.id);
}
if (!offerCols.includes('message')) {
  // safety
}

const vacancyCols = db.prepare('PRAGMA table_info(vacancies)').all().map((c) => c.name);
const addVacancyCol = (key, ddl) => {
  if (!vacancyCols.includes(key)) db.exec(`ALTER TABLE vacancies ADD COLUMN ${ddl}`);
};
addVacancyCol('employer_id', 'employer_id INTEGER REFERENCES employer_companies(id)');
addVacancyCol('moderation_status', "moderation_status TEXT NOT NULL DEFAULT 'ok'");
addVacancyCol('moderation_note', 'moderation_note TEXT');
addVacancyCol('views_count', 'views_count INTEGER NOT NULL DEFAULT 0');

module.exports = db;