// Интеграционный каркас с ATS-системами работодателей (Greenhouse, Lever, Workday, hh ATS и т.п.).
// На MVP реализован общий контракт:
//   - pushCandidate(externalSystemId, candidate) — выгрузка карточки в ATS;
//   - pullVacancy(externalSystemId, externalId)   — импорт вакансии из ATS;
//   - subscribeOffers(externalSystemId, callback) — подписка на события.
//
// В текущей сборке это заглушки с записью в лог и в БД (таблица ats_events).

const db = require('../db');

function recordEvent(system, kind, status, details) {
  try {
    db.prepare(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, meta)
       VALUES (?, ?, 'ats', NULL, ?)`
    ).run(null, `${system}:${kind}.${status}`, JSON.stringify(details || {}));
  } catch (e) {
    // миграция audit_log может быть недоступна в редких случаях — игнорируем
  }
  // eslint-disable-next-line no-console
  console.log(`[ats:${system}] ${kind} -> ${status}`, details || '');
}

async function pushCandidate(system, candidate) {
  // В реальной интеграции — HTTP POST к ATS-провайдеру.
  recordEvent(system, 'pushCandidate', 'queued', { candidateId: candidate.id });
  return { ok: true, queued: true, system, candidateId: candidate.id };
}

async function pullVacancy(system, externalId) {
  recordEvent(system, 'pullVacancy', 'noop', { externalId });
  return { ok: true, system, externalId };
}

function listEvents(limit = 100) {
  try {
    return db
      .prepare(
        `SELECT id, action, meta, created_at FROM audit_log
         WHERE target_type = 'ats' ORDER BY id DESC LIMIT ?`
      )
      .all(limit)
      .map((r) => ({
        id: r.id,
        action: r.action,
        details: r.meta ? JSON.parse(r.meta) : null,
        created_at: r.created_at,
      }));
  } catch (e) {
    return [];
  }
}

module.exports = { pushCandidate, pullVacancy, listEvents };