// Категоризация соискателей и rule-based матчинг с вакансиями.
// В будущем rule-based логика может быть заменена ML-моделью, контракт сохранён.

const GRADE_ORDER = ['junior', 'middle', 'senior', 'lead'];

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return String(value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Автоматическая категоризация кандидата по стеку, грейду и роли.
// Достижения ФСП учитываются как подтверждающий фактор и могут повысить грейд.
// Подтверждённый тестом грейд (verified_grade) имеет приоритет над заявленным.
function categorizeCandidate(candidate, achievements) {
  const stack = normalizeList(candidate.stack);
  const grade = candidate.verified_grade || candidate.grade;
  const role = candidate.role;
  const achievementsCount = Array.isArray(achievements) ? achievements.length : 0;

  let effectiveGrade = grade;
  if (achievementsCount >= 2 && grade === 'middle') {
    effectiveGrade = 'senior';
  } else if (achievementsCount >= 1 && grade === 'junior') {
    effectiveGrade = 'middle';
  }

  return {
    category: {
      stack: stack.sort(),
      grade: effectiveGrade,
      role,
      work_format: candidate.work_format,
      city: candidate.city || null,
    },
    verified: achievementsCount > 0,
    achievementsCount,
    gradeBoosted: effectiveGrade !== grade,
  };
}

// Скоринг кандидата под конкретную вакансию: 0..100.
// Возвращает итоговый балл и разбивку по компонентам для объяснимости выдачи.
function scoreCandidate(candidateCategory, vacancy) {
  const stack = candidateCategory.category.stack;
  const vacStack = normalizeList(vacancy.stack);
  const breakdown = { stack: 0, grade: 0, role: 0, fsp: 0 };
  let score = 0;

  // Стек: пересечение множеств
  if (vacStack.length > 0 && stack.length > 0) {
    const overlap = vacStack.filter((s) => stack.includes(s)).length;
    const pts = Math.round((overlap / vacStack.length) * 60);
    breakdown.stack = pts;
    score += pts;
  }

  // Грейд: полное совпадение — максимум, разница в 1 уровень — половина
  if (candidateCategory.category.grade === vacancy.grade) {
    breakdown.grade = 25;
    score += 25;
  } else {
    const diff = Math.abs(
      GRADE_ORDER.indexOf(candidateCategory.category.grade) -
        GRADE_ORDER.indexOf(vacancy.grade)
    );
    if (diff === 1) {
      breakdown.grade = 12;
      score += 12;
    }
  }

  // Роль
  if (candidateCategory.category.role === vacancy.role) {
    breakdown.role = 10;
    score += 10;
  }

  // Подтверждённые достижения ФСП
  if (candidateCategory.verified) {
    breakdown.fsp = 5;
    score += 5;
  }

  return { score: Math.min(100, score), breakdown };
}

// Возвращает отсортированный список кандидатов с оценкой релевантности для вакансии.
// При равном скоринге выше оказывается кандидат с большим числом достижений ФСП.
function matchCandidates(vacancy, categorizedCandidates) {
  return categorizedCandidates
    .map((item) => {
      const { score, breakdown } = scoreCandidate(item.category, vacancy);
      return {
        candidate: item.candidate,
        category: item.category,
        score,
        breakdown,
      };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.category.achievementsCount || 0) - (a.category.achievementsCount || 0)
    );
}

// Фильтрация банка кандидатов по параметрам потребности работодателя.
// Фильтры применяются поверх уже категоризированного списка: уточнение запроса
// не пересчитывает категории и не теряет ранее полученную подборку.
function filterCandidates(categorized, filters = {}) {
  const needStack = filters.stack ? normalizeList(filters.stack) : [];
  return categorized.filter((item) => {
    const cat = item.category.category;
    if (filters.role && cat.role !== filters.role) return false;
    if (filters.grade && cat.grade !== filters.grade) return false;
    if (filters.work_format && cat.work_format !== filters.work_format) return false;
    if (filters.city && (!cat.city || cat.city.toLowerCase() !== filters.city.toLowerCase())) {
      return false;
    }
    if (filters.fsp_only && !item.category.verified) return false;
    if (needStack.length > 0) {
      const overlap = needStack.filter((s) => cat.stack.includes(s)).length;
      if (overlap === 0) return false;
    }
    return true;
  });
}

// Ранжирование кандидата внутри категории (0..100).
// Сигнал силы профиля: лучший результат теста + подтверждённые достижения ФСП.
function rankInCategory(category, bestTestPercent = 0) {
  const testSignal = Math.min(Number(bestTestPercent) || 0, 70);
  const fspSignal = Math.min((category.achievementsCount || 0) * 10, 30);
  const rank = Math.round(testSignal + fspSignal);
  return {
    rank,
    testSignal: Math.round(testSignal),
    fspSignal,
  };
}

module.exports = {
  categorizeCandidate,
  matchCandidates,
  scoreCandidate,
  filterCandidates,
  rankInCategory,
};