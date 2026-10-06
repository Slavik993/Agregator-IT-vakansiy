// Сервис антифрод-модерации вакансий.
//
// Правила MVP:
//   - rate-limit на создание вакансий (по user_id): не более 5 в час;
//   - жалобы пользователей попадают в vacancy_reports;
//   - если на вакансию > N жалоб — moderation_status = 'review'.
//   - работодатель с > M скрытых вакансий получает company.flagged = true.
//
// В проде подключается внешняя модерация (ручная/ML).

const db = require('../db');

const VACANCY_LIMIT_PER_HOUR = 5;
const REPORT_THRESHOLD_FOR_REVIEW = 3;

function canPostVacancy(userId) {
  if (!userId) return null;
  // SQLite хранит datetime('now') как 'YYYY-MM-DD HH:MM:SS'.
  // Сравниваем в этом формате.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '');
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM vacancies v
       JOIN employer_companies c ON c.id = v.employer_id
       WHERE c.user_id = ? AND v.created_at >= ?`
    )
    .get(userId, oneHourAgo);
  return { allowed: row.n < VACANCY_LIMIT_PER_HOUR, used: row.n, limit: VACANCY_LIMIT_PER_HOUR };
}

function reportVacancy(vacancyId, reason, details, reporterUserId, reporterEmail) {
  db.prepare(
    `INSERT INTO vacancy_reports (vacancy_id, reporter_user_id, reporter_email, reason, details)
     VALUES (?, ?, ?, ?, ?)`
  ).run(vacancyId, reporterUserId || null, reporterEmail || null, reason, details || null);

  const count = db
    .prepare(`SELECT COUNT(*) AS n FROM vacancy_reports WHERE vacancy_id = ?`)
    .get(vacancyId).n;
  if (count >= REPORT_THRESHOLD_FOR_REVIEW) {
    db.prepare(
      `UPDATE vacancies SET moderation_status = 'review' WHERE id = ? AND moderation_status = 'ok'`
    ).run(vacancyId);
  }
  return { reports_count: count };
}

function listReports() {
  return db
    .prepare(
      `SELECT r.*, v.title AS vacancy_title, v.company
       FROM vacancy_reports r
       JOIN vacancies v ON v.id = r.vacancy_id
       ORDER BY r.created_at DESC`
    )
    .all();
}

function moderateVacancy(vacancyId, decision, note) {
  const allowed = ['ok', 'review', 'hidden'];
  if (!allowed.includes(decision)) {
    const err = new Error('decision must be ok|review|hidden');
    err.status = 400;
    throw err;
  }
  const info = db
    .prepare(
      `UPDATE vacancies SET moderation_status = ?, moderation_note = ? WHERE id = ?`
    )
    .run(decision, note || null, vacancyId);
  if (info.changes === 0) {
    const err = new Error('Vacancy not found');
    err.status = 404;
    throw err;
  }
  db.prepare(
    `UPDATE vacancy_reports SET moderation_status = ?, moderation_note = ?, resolved_at = datetime('now')
     WHERE vacancy_id = ? AND moderation_status = 'pending'`
  ).run(decision === 'ok' ? 'dismissed' : 'upheld', note || null, vacancyId);
  return { ok: true };
}

module.exports = {
  canPostVacancy,
  reportVacancy,
  listReports,
  moderateVacancy,
  VACANCY_LIMIT_PER_HOUR,
  REPORT_THRESHOLD_FOR_REVIEW,
};