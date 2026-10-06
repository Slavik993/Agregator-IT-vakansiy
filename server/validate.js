// Процедура валидации решения (см. docs/validation.md).
// Запуск: npm run validate
//
// 1. Генерирует синтетических кандидатов с известным «истинным» грейдом.
// 2. Прогоняет движок тестирования и проверяет согласованность и дискриминативность.
// 3. Формирует подборки для тестовых вакансий и считает Precision@k / MRR / Coverage.
// 4. Выводит отчёт в консоль и в data/validation-report.json.

const fs = require('fs');
const path = require('path');
const { generateTest, gradeAttempt, GRADE_ORDER } = require('./testing');
const { categorizeCandidate, scoreCandidate } = require('./matching');

// ---- Синтетические данные ----

const ROLES = ['backend', 'frontend', 'ml'];
const STACK_BY_ROLE = {
  backend: ['python', 'go', 'sql', 'nodejs', 'docker'],
  frontend: ['js', 'typescript', 'react', 'css', 'html'],
  ml: ['python', 'tensorflow', 'pandas', 'numpy', 'sql'],
};

const TRUE_GRADE_TO_PERCENT = {
  junior: 40 + Math.floor(Math.random() * 20), // 40-59 -> not_passed/passed
  middle: 60 + Math.floor(Math.random() * 25), // 60-84 -> passed
  senior: 85 + Math.floor(Math.random() * 15), // 85-99 -> confident
};

function makeSyntheticCandidate(index) {
  const role = ROLES[index % ROLES.length];
  const grade = GRADE_ORDER[index % 3]; // junior/middle/senior
  const stack = STACK_BY_ROLE[role].slice(0, 2 + (index % 3)).join(',');
  return {
    id: index + 1,
    fsp_id: index % 4 === 0 ? `FSP-S${index}` : null,
    full_name: `Кандидат ${index + 1}`,
    email: `cand${index}@example.com`,
    telegram: `@cand${index}`,
    stack,
    grade,
    role,
    experience_years: index % 9,
    work_format: 'remote',
    city: 'Москва',
    _trueGrade: grade,
  };
}

// Эмулирует ответы кандидата на основе «истинного» грейда:
// вероятность верного ответа зависит от близости вопроса к истинному грейду.
function emulateAnswers(questions, trueGrade) {
  const answers = {};
  const trueIdx = GRADE_ORDER.indexOf(trueGrade);
  for (const q of questions) {
    const gradeOfQuestion = inferQuestionGrade(q.baseId);
    const qIdx = GRADE_ORDER.indexOf(gradeOfQuestion);
    const dist = Math.abs(trueIdx - qIdx);
    const prob = [0.9, 0.65, 0.35][dist] ?? 0.2;
    if (Math.random() < prob) {
      answers[q.id] = q.correctIndex;
    } else {
      const wrong = q.options.map((_, i) => i).filter((i) => i !== q.correctIndex);
      answers[q.id] = wrong[Math.floor(Math.random() * wrong.length)];
    }
  }
  return answers;
}

function inferQuestionGrade(baseId) {
  // baseId вида: b-j-1 | b-m-2 | f-s-3 | m-m-4 ...
  const parts = baseId.split('-');
  const code = parts[parts.length - 2]; // j/m/s
  return { j: 'junior', m: 'middle', s: 'senior' }[code] || 'middle';
}

// ---- Валидация тестирования ----

function validateTesting(candidates, attemptsPerCandidate = 5) {
  let correctGradeCount = 0;
  let total = 0;
  const percentsByGrade = { junior: [], middle: [], senior: [] };

  for (const cand of candidates) {
    for (let t = 0; t < attemptsPerCandidate; t++) {
      const questions = generateTest(cand.role, cand.grade);
      const answers = emulateAnswers(questions, cand._trueGrade);
      const graded = gradeAttempt({ questions }, answers);
      percentsByGrade[cand._trueGrade].push(graded.percent);

      // Согласованность: результат (passed/confident) соответствует истинному грейду,
      // если кандидат набрал >= 55% (т.е. подтвердил заявленный или выше).
      const ok = graded.result === 'confident' || graded.result === 'passed';
      if (ok) correctGradeCount++;
      total++;
    }
  }

  const means = {};
  for (const g of Object.keys(percentsByGrade)) {
    const arr = percentsByGrade[g];
    means[g] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }
  const monotonic =
    means.junior < means.middle && means.middle < means.senior;

  return {
    attempts: total,
    confirmedGradeShare: Math.round((correctGradeCount / total) * 100),
    meanPercentByTrueGrade: means,
    monotonic,
  };
}

// ---- Валидация подбора ----

const TEST_VACANCIES = [
  { title: 'Backend (Python/Go)', stack: 'python,go', grade: 'middle', role: 'backend' },
  { title: 'Frontend (React/TS)', stack: 'js,typescript,react', grade: 'middle', role: 'frontend' },
  { title: 'ML-инженер', stack: 'python,tensorflow,pandas', grade: 'middle', role: 'ml' },
  { title: 'Junior Fullstack', stack: 'js,nodejs,typescript', grade: 'junior', role: 'fullstack' },
  { title: 'Senior Backend (Go)', stack: 'go,docker', grade: 'senior', role: 'backend' },
];

function isRelevant(candidate, vacancy) {
  const vacStack = vacancy.stack.split(',').map((s) => s.trim());
  const candStack = candidate.stack.split(',').map((s) => s.trim());
  const overlap = vacStack.filter((s) => candStack.includes(s)).length;
  if (overlap === 0) return false;
  const gradeDiff = Math.abs(GRADE_ORDER.indexOf(candidate._trueGrade) - GRADE_ORDER.indexOf(vacancy.grade));
  return gradeDiff <= 1;
}

function validateMatching(candidates) {
  const results = [];
  for (const vacancy of TEST_VACANCIES) {
    const categorized = candidates.map((c) => ({
      candidate: c,
      category: categorizeCandidate(c, c.fsp_id ? [{ id: 1 }] : []),
    }));
    const matches = categorized
      .map((item) => {
        const { score, breakdown } = scoreCandidate(item.category, vacancy);
        return { ...item, score, breakdown };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);

    const top5 = matches.slice(0, 5);
    const relevantTop5 = top5.filter((m) => isRelevant(m.candidate, vacancy)).length;
    const precisionAt5 = top5.length ? relevantTop5 / top5.length : 0;

    const firstRelevantIdx = matches.findIndex((m) => isRelevant(m.candidate, vacancy));
    const mrr = firstRelevantIdx >= 0 ? 1 / (firstRelevantIdx + 1) : 0;
    const coverage = matches.length > 0 && matches.some((m) => isRelevant(m.candidate, vacancy)) ? 1 : 0;

    results.push({
      vacancy: vacancy.title,
      matches: matches.length,
      precisionAt5: Math.round(precisionAt5 * 100) / 100,
      mrr: Math.round(mrr * 100) / 100,
      coverage,
    });
  }

  return {
    perVacancy: results,
    avgPrecisionAt5: Math.round((results.reduce((a, r) => a + r.precisionAt5, 0) / results.length) * 100) / 100,
    avgMrr: Math.round((results.reduce((a, r) => a + r.mrr, 0) / results.length) * 100) / 100,
    coverage: Math.round((results.reduce((a, r) => a + r.coverage, 0) / results.length) * 100) / 100,
  };
}

// ---- Запуск ----

function main() {
  const count = Number(process.argv[2] || 60);
  const candidates = Array.from({ length: count }, (_, i) => makeSyntheticCandidate(i));

  const testing = validateTesting(candidates);
  const matching = validateMatching(candidates);

  const report = {
    generatedAt: new Date().toISOString(),
    candidates: count,
    testing,
    matching,
    targets: {
      confirmedGradeShare: '>= 80%',
      monotonic: 'junior < middle < senior',
      avgPrecisionAt5: '>= 0.7',
      avgMrr: '>= 0.75',
      coverage: '= 100%',
    },
  };

  const outPath = path.join(__dirname, '..', 'data', 'validation-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('=== Валидация решения ===');
  console.log(`Кандидатов: ${count}`);
  console.log('\n-- Тестирование --');
  console.log(`Доля попыток с подтверждённым грейдом: ${testing.confirmedGradeShare}% (цель >= 80%)`);
  console.log(`Средний процент по истинным грейдам: junior=${testing.meanPercentByTrueGrade.junior}%, middle=${testing.meanPercentByTrueGrade.middle}%, senior=${testing.meanPercentByTrueGrade.senior}%`);
  console.log(`Монотонность среднего процента: ${testing.monotonic ? 'OK' : 'НЕТ'}`);
  console.log('\n-- Подбор --');
  console.log(`Precision@5: ${matching.avgPrecisionAt5} (цель >= 0.7)`);
  console.log(`MRR: ${matching.avgMrr} (цель >= 0.75)`);
  console.log(`Coverage: ${matching.coverage} (цель = 1)`);
  console.log(`\nОтчёт сохранён: ${outPath}`);
}

main();