// Заполнение БД демонстрационными данными для MVP.
// Идемпотентно: если в БД уже есть кандидаты/вакансии, повторно не вставляются.
// При первом запуске создаёт также демо-аккаунты:
//   - candidate@demo.local / demo1234 (роль candidate)
//   - employer@demo.local / demo1234  (роль employer, компания "TechCorp Demo")
//   - admin@local / admin1234         (роль employer с правами модератора)

const db = require('./db');
const fsp = require('./services/fspMock');
const { hashPassword } = require('./auth');

function ensureUser({ email, password, role, displayName }) {
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user) return user;
  const info = db.prepare(
    `INSERT INTO users (email, password_hash, role, email_verified, verified_at)
     VALUES (?, ?, ?, 1, datetime('now'))`
  ).run(email, hashPassword(password), role);
  user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  if (role === 'candidate') {
    db.prepare(
      `INSERT INTO candidates (user_id, full_name, email, stack, grade, role,
         experience_years, work_format, city, bio, soft_skills,
         privacy_publish, privacy_show_contacts, privacy_show_achievements,
         privacy_show_in_search, consent_given, consent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1, 1, 1, datetime('now'))`
    ).run(
      info.lastInsertRowid,
      displayName,
      email,
      'python,go,algorithms',
      'middle',
      'backend',
      3,
      'hybrid',
      'Москва',
      'Backend-разработчик, опыт в высоконагруженных сервисах.',
      'командная работа, ответственность',
    );
  } else {
    db.prepare(
      `INSERT INTO employer_companies (user_id, name, description, contact_email, city)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      info.lastInsertRowid,
      displayName,
      'Демонстрационная компания-работодатель.',
      email,
      'Москва',
    );
  }
  return user;
}

function seedIfEmpty() {
  const candidateCount = db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n;
  const vacancyCount = db.prepare('SELECT COUNT(*) AS n FROM vacancies').get().n;

  // Создаём демо-аккаунты даже если база уже заполнена (для удобства логина).
  ensureUser({
    email: 'candidate@demo.local', password: 'demo1234',
    role: 'candidate', displayName: 'Демо Кандидат',
  });
  const employerUser = ensureUser({
    email: 'employer@demo.local', password: 'demo1234',
    role: 'employer', displayName: 'TechCorp Demo',
  });
  ensureUser({
    email: 'admin@local', password: 'admin1234',
    role: 'employer', displayName: 'Admin',
  });

  if (candidateCount > 0 && vacancyCount > 0) {
    console.log('DB already seeded, skip.');
    return;
  }

  // ---- Кандидаты ----
  const candidates = [
    { fsp_id: 'FSP-0001', full_name: 'Иван Петров',    email: 'ivan@example.com',   telegram: '@ivan_p',  stack: 'python,go,algorithms',    grade: 'middle', role: 'backend',   experience_years: 3, work_format: 'hybrid', city: 'Москва' },
    { fsp_id: 'FSP-0002', full_name: 'Анна Смирнова',  email: 'anna@example.com',   telegram: '@anna_s',  stack: 'python,fastapi,sql',      grade: 'middle', role: 'backend',   experience_years: 2, work_format: 'remote', city: 'Санкт-Петербург' },
    { fsp_id: 'FSP-0003', full_name: 'Дмитрий Волков', email: 'dmitry@example.com', telegram: '@dima_v',  stack: 'js,nodejs,typescript',    grade: 'junior', role: 'fullstack', experience_years: 1, work_format: 'office', city: 'Казань' },
    { fsp_id: 'FSP-0004', full_name: 'Мария Соколова', email: 'maria@example.com',  telegram: '@maria_s', stack: 'python,ml,tensorflow',    grade: 'middle', role: 'ml',        experience_years: 3, work_format: 'hybrid', city: 'Москва' },
    { fsp_id: 'FSP-0005', full_name: 'Алексей Орлов',  email: 'alexey@example.com', telegram: '@alex_o',  stack: 'cpp,ros,python',          grade: 'senior', role: 'robotics',  experience_years: 5, work_format: 'office', city: 'Новосибирск' },
  ];
  const insertCandidate = db.prepare(
    `INSERT INTO candidates
       (fsp_id, full_name, email, telegram, stack, grade, role,
        experience_years, work_format, city, privacy_publish,
        privacy_show_achievements, privacy_show_in_search, consent_given, consent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, datetime('now'))`
  );
  for (const c of candidates) {
    try {
      insertCandidate.run(
        c.fsp_id, c.full_name, c.email, c.telegram, c.stack, c.grade, c.role,
        c.experience_years, c.work_format, c.city,
      );
    } catch (e) {
      // уже есть — игнорируем
    }
  }

  // Достижения из заглушки ФСП
  const insertAchievement = db.prepare(
    `INSERT INTO achievements (fsp_id, discipline, competition, result, role, rank, year)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const row of db.prepare('SELECT fsp_id FROM candidates').all()) {
    if (!row.fsp_id) continue;
    for (const a of fsp.getAchievements(row.fsp_id)) {
      insertAchievement.run(
        row.fsp_id, a.discipline, a.competition, a.result, a.role, a.rank, a.year,
      );
    }
  }

  // ---- Вакансии для demo employer ----
  const company = db.prepare('SELECT * FROM employer_companies WHERE user_id = ?').get(employerUser.id);
  const insertVacancy = db.prepare(
    `INSERT INTO vacancies (employer_id, title, company, description, stack, grade, role,
       salary_from, salary_to, work_format, city)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const vacancies = [
    { title: 'Backend-разработчик (Python)',  description: 'Разработка высоконагруженных сервисов на Python и Go.', stack: 'python,go',          grade: 'middle', role: 'backend',   salary_from: 250000, salary_to: 350000, work_format: 'hybrid', city: 'Москва' },
    { title: 'ML-инженер',                    description: 'Обучение и внедрение ML-моделей, работа с большими данными.', stack: 'python,ml,tensorflow', grade: 'middle', role: 'ml',        salary_from: 300000, salary_to: 450000, work_format: 'remote', city: 'Москва' },
    { title: 'Fullstack-разработчик',        description: 'Разработка веб-приложений на Node.js и TypeScript.', stack: 'js,nodejs,typescript', grade: 'junior', role: 'fullstack', salary_from: 120000, salary_to: 180000, work_format: 'office', city: 'Казань' },
    { title: 'Старший разработчик C++',       description: 'Разработка ПО для робототехнических систем на C++/ROS.', stack: 'cpp,ros,python',     grade: 'senior', role: 'robotics',  salary_from: 400000, salary_to: 550000, work_format: 'office', city: 'Новосибирск' },
    { title: 'Go-разработчик',                description: 'Серверная разработка на Go, высокая нагрузка.', stack: 'go',                  grade: 'senior', role: 'backend',   salary_from: 350000, salary_to: 500000, work_format: 'remote', city: 'Москва' },
  ];
  for (const v of vacancies) {
    insertVacancy.run(
      company.id, v.title, company.name, v.description, v.stack, v.grade, v.role,
      v.salary_from, v.salary_to, v.work_format, v.city,
    );
  }

  console.log('Seed completed.');
}

seedIfEmpty();