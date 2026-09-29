// Заполнение БД демонстрационными данными для MVP.
// Повторный запуск не дублирует записи: кандидаты/вакансии вставляются только если таблица пуста.

const db = require('./db');
const fsp = require('./services/fspMock');

function seedIfEmpty() {
  const candidateCount = db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n;
  const vacancyCount = db.prepare('SELECT COUNT(*) AS n FROM vacancies').get().n;
  if (candidateCount > 0 || vacancyCount > 0) {
    console.log('DB already seeded, skip.');
    return;
  }

  const insertCandidate = db.prepare(
    `INSERT INTO candidates (fsp_id, full_name, email, telegram, stack, grade, role, experience_years, work_format, city)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const candidates = [
    ['FSP-0001', 'Иван Петров', 'ivan@example.com', '@ivan_p', 'python,go,algorithms', 'middle', 'backend', 3, 'hybrid', 'Москва'],
    ['FSP-0002', 'Анна Смирнова', 'anna@example.com', '@anna_s', 'python,fastapi,sql', 'middle', 'backend', 2, 'remote', 'Санкт-Петербург'],
    ['FSP-0003', 'Дмитрий Волков', 'dmitry@example.com', '@dima_v', 'js,nodejs,typescript', 'junior', 'fullstack', 1, 'office', 'Казань'],
    ['FSP-0004', 'Мария Соколова', 'maria@example.com', '@maria_s', 'python,ml,tensorflow', 'middle', 'ml', 3, 'hybrid', 'Москва'],
    ['FSP-0005', 'Алексей Орлов', 'alexey@example.com', '@alex_o', 'cpp,ros,python', 'senior', 'robotics', 5, 'office', 'Новосибирск'],
  ];

  for (const c of candidates) {
    insertCandidate.run(...c);
  }

  // Достижения из заглушки ФСП проецируются в локальную таблицу для быстрых выборок
  const insertAchievement = db.prepare(
    `INSERT INTO achievements (fsp_id, discipline, competition, result, role, rank, year)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const row of db.prepare('SELECT fsp_id FROM candidates').all()) {
    for (const a of fsp.getAchievements(row.fsp_id)) {
      insertAchievement.run(
        row.fsp_id,
        a.discipline,
        a.competition,
        a.result,
        a.role,
        a.rank,
        a.year
      );
    }
  }

  const insertVacancy = db.prepare(
    `INSERT INTO vacancies (title, company, description, stack, grade, role, salary_from, salary_to, work_format, city)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const vacancies = [
    ['Backend-разработчик (Python)', 'TechCorp', 'Разработка высоконагруженных сервисов на Python и Go.', 'python,go', 'middle', 'backend', 250000, 350000, 'hybrid', 'Москва'],
    ['ML-инженер', 'DataLab', 'Обучение и внедрение ML-моделей, работа с большими данными.', 'python,ml,tensorflow', 'middle', 'ml', 300000, 450000, 'remote', 'Москва'],
    ['Fullstack-разработчик', 'WebSoft', 'Разработка веб-приложений на Node.js и TypeScript.', 'js,nodejs,typescript', 'junior', 'fullstack', 120000, 180000, 'office', 'Казань'],
    ['Старший разработчик C++', 'RoboSystems', 'Разработка ПО для робототехнических систем на C++/ROS.', 'cpp,ros,python', 'senior', 'robotics', 400000, 550000, 'office', 'Новосибирск'],
    ['Go-разработчик', 'FinTechPro', 'Серверная разработка на Go, высокая нагрузка.', 'go', 'senior', 'backend', 350000, 500000, 'remote', 'Москва'],
  ];

  for (const v of vacancies) {
    insertVacancy.run(...v);
  }

  console.log('Seed completed.');
}

seedIfEmpty();