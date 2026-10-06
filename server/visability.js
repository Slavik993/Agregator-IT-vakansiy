// Правила видимости данных (§2.4 ТЗ):
//   - работодатель НЕ видит контактные данные кандидата до тех пор,
//     пока кандидат не принял приглашение или не откликнулся сам;
//   - кандидат сам управляет тем, какие поля публикуются;
//   - достижения ФСП публикуются только если кандидат явно их привязал.

const CONTACT_FIELDS = ['email', 'telegram', 'phone'];

function redactCandidate(candidate, viewerRole, viewerId, contactAccess = false) {
  if (!candidate) return candidate;
  if (viewerRole === 'employer' && !contactAccess) {
    for (const f of CONTACT_FIELDS) {
      if (f in candidate) candidate[f] = null;
    }
  }
  return candidate;
}

function canViewContacts(employerId, candidateId, db) {
  // Контакты открываются, если:
  //  1) кандидат сам откликнулся на вакансию этого работодателя;
  //  2) кандидат принял оффер от этого работодателя;
  //  3) кандидат выставил privacy_show_contacts = 1 (явное согласие).
  const cand = db.prepare('SELECT id, privacy_show_contacts FROM candidates WHERE id = ?').get(candidateId);
  if (!cand) return false;
  if (cand.privacy_show_contacts) return true;

  const company = db.prepare('SELECT id FROM employer_companies WHERE id = ?').get(employerId);
  if (!company) return false;

  const acceptedOffer = db.prepare(
    `SELECT 1 FROM offers o
     JOIN vacancies v ON v.id = o.vacancy_id
     WHERE o.candidate_id = $candidateId
       AND v.employer_id = $employerId
       AND o.status = 'accepted'
     LIMIT 1`
  ).get({ candidateId, employerId });
  if (acceptedOffer) return true;

  const application = db.prepare(
    `SELECT 1 FROM applications a
     JOIN vacancies v ON v.id = a.vacancy_id
     WHERE a.candidate_id = $candidateId
       AND v.employer_id = $employerId
     LIMIT 1`
  ).get({ candidateId, employerId });
  if (application) return true;

  return false;
}

module.exports = {
  CONTACT_FIELDS,
  redactCandidate,
  canViewContacts,
};