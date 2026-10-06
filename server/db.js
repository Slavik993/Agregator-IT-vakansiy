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
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fsp_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  telegram TEXT,
  stack TEXT NOT NULL,
  grade TEXT NOT NULL,
  role TEXT NOT NULL,
  experience_years INTEGER NOT NULL DEFAULT 0,
  work_format TEXT NOT NULL DEFAULT 'office',
  city TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vacancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vacancy_id INTEGER NOT NULL REFERENCES vacancies(id),
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  salary_offer INTEGER,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (vacancy_id, candidate_id)
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
`);

// Лёгкие миграции для колонок, которых нет в старых базах
const candidateCols = db.prepare('PRAGMA table_info(candidates)').all().map((c) => c.name);
if (!candidateCols.includes('verified_grade')) {
  db.exec('ALTER TABLE candidates ADD COLUMN verified_grade TEXT');
}
if (!candidateCols.includes('last_grade_change')) {
  db.exec('ALTER TABLE candidates ADD COLUMN last_grade_change TEXT');
}

module.exports = db;