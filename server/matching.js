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
function categorizeCandidate(candidate, achievements) {
  const stack = normalizeList(candidate.stack);
  const grade = candidate.grade;
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

// Скоринг кандидата под конкретную вакансию: 0..100
function scoreCandidate(candidateCategory, vacancy) {
  const stack = candidateCategory.category.stack;
  const vacStack = normalizeList(vacancy.stack);

  let score = 0;

  // Стек: пересечение множеств
  if (vacStack.length > 0 && stack.length > 0) {
    const overlap = vacStack.filter((s) => stack.includes(s)).length;
    score += Math.round((overlap / vacStack.length) * 60);
  }

  // Грейд: полное совпадение — максимум, разница в 1 уровень — половина
  if (candidateCategory.category.grade === vacancy.grade) {
    score += 25;
  } else {
    const diff = Math.abs(
      GRADE_ORDER.indexOf(candidateCategory.category.grade) -
        GRADE_ORDER.indexOf(vacancy.grade)
    );
    if (diff === 1) {
      score += 12;
    }
  }

  // Роль
  if (candidateCategory.category.role === vacancy.role) {
    score += 10;
  }

  // Подтверждённые достижения ФСП
  if (candidateCategory.verified) {
    score += 5;
  }

  return Math.min(100, score);
}

// Возвращает отсортированный список кандидатов с оценкой релевантности для вакансии
function matchCandidates(vacancy, categorizedCandidates) {
  return categorizedCandidates
    .map((item) => ({
      candidate: item.candidate,
      category: item.category,
      score: scoreCandidate(item.category, vacancy),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

module.exports = { categorizeCandidate, matchCandidates, scoreCandidate };