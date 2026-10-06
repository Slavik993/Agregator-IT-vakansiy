# API описание

Базовый URL: `/api`. Формат: JSON. Коды ошибок: 400 (неверный запрос), 401
(не авторизован, в будущих версиях), 404 (не найдено), 409 (конфликт состояния),
500 (внутренняя ошибка).

Полная машинная спецификация: `docs/openapi.yaml` (OpenAPI 3.0).

## Health

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/health` | Проверка доступности сервиса |

## Справочники ФСП

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/fsp/disciplines` | Список дисциплин ФСП |
| GET | `/api/fsp/achievements/:fspId` | Достижения участника ФСП |

## Кандидаты

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/candidates` | Список кандидатов с достижениями |
| POST | `/api/candidates` | Создание кандидата |
| GET | `/api/candidates/:id/category` | Категоризация кандидата |
| GET | `/api/candidates/search` | Поиск по банку с фильтрами и ранжированием |
| GET | `/api/candidates/:id/tests` | История тестов кандидата |
| GET | `/api/candidates/:id/grade-change-status` | Доступность смены грейда (cooldown) |

### POST /api/candidates — создание кандидата

Тело:

```json
{
  "fsp_id": "FSP-0001",
  "full_name": "Иван Петров",
  "email": "ivan@example.com",
  "telegram": "@ivan_p",
  "stack": "python,go",
  "grade": "middle",
  "role": "backend",
  "experience_years": 3,
  "work_format": "hybrid",
  "city": "Москва"
}
```

Обязательные поля: `full_name`, `stack`, `grade`, `role`.

## Вакансии и подбор

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/vacancies` | Список активных вакансий |
| POST | `/api/vacancies` | Создание вакансии |
| GET | `/api/vacancies/:id/matches` | Подбор кандидатов под вакансию |

### POST /api/vacancies — создание вакансии

Тело:

```json
{
  "title": "Backend-разработчик (Python)",
  "company": "TechCorp",
  "description": "...",
  "stack": "python,go",
  "grade": "middle",
  "role": "backend",
  "salary_from": 250000,
  "salary_to": 350000,
  "work_format": "hybrid",
  "city": "Москва"
}
```

Обязательные поля: `title`, `company`, `stack`, `grade`, `role`.
Зарплата `salary_from`/`salary_to` обязательна в финальной версии (ТЗ п.2.2.1).

### GET /api/vacancies/:id/matches — подбор

Ответ:

```json
{
  "vacancy": { "...": "..." },
  "matches": [
    {
      "candidate": { "...": "..." },
      "category": {
        "category": { "stack": [], "grade": "middle", "role": "backend" },
        "verified": true,
        "achievementsCount": 2,
        "gradeBoosted": false
      },
      "score": 95,
      "breakdown": { "stack": 60, "grade": 25, "role": 10, "fsp": 0 }
    }
  ]
}
```

`breakdown` объясняет состав баллов: стек, грейд, роль, достижения ФСП.

### GET /api/candidates/search — поиск по банку

Query-параметры (все опциональны):

| Параметр | Описание |
| --- | --- |
| `role` | Специализация |
| `grade` | Грейд |
| `stack` | Стек через запятую |
| `work_format` | Формат работы |
| `city` | Город |
| `fsp_only` | `true`/`1` — только с достижениями ФСП |

Ответ:

```json
{
  "total": 3,
  "results": [
    {
      "candidate": { "...": "..." },
      "category": { "...": "..." },
      "rank": { "rank": 80, "testSignal": 50, "fspSignal": 30 }
    }
  ]
}
```

## Тестирование

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/testing/meta` | Справочники ролей, грейдов, cooldown |
| POST | `/api/candidates/:id/tests` | Создать тест для кандидата |
| POST | `/api/test-attempts/:id/submit` | Отправить ответы и получить результат |

### POST /api/candidates/:id/tests

Тело: `{ "role": "backend", "claimed_grade": "middle" }`

Ответ: `attempt_id`, `candidate_id`, `role`, `claimed_grade`, `status`,
`questions[]` (id, text, options, weight; корректный индекс не отдаётся клиенту —
хранится на сервере в попытке).

### POST /api/test-attempts/:id/submit

Тело: `{ "answers": { "<questionId>": 2 } }`

Ответ:

```json
{
  "attempt": { "...": "..." },
  "result": "passed",
  "percent": 80,
  "score": 8,
  "max_score": 10,
  "grade_after": "middle",
  "grade_changed": false,
  "cooldown_blocked": false,
  "cooldown_days": 90,
  "details": [ { "id": "...", "correct": true, "given": 2, "correctIndex": 2 } ]
}
```

### GET /api/candidates/:id/grade-change-status

Ответ:

```json
{
  "allowed": true,
  "cooldown_days": 90,
  "last_grade_change": null,
  "next_allowed": null
}
```

## Офферы

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/offers` | Список офферов |
| POST | `/api/offers` | Создание оффера (работодатель → кандидат) |
| PATCH | `/api/offers/:id` | Смена статуса оффера |

### POST /api/offers

Тело:

```json
{
  "vacancy_id": 1,
  "candidate_id": 2,
  "salary_offer": 300000,
  "message": "Приглашаем на собеседование"
}
```

Статусы оффера: `pending` / `accepted` / `declined`.

## Примечания по безопасности

- Правильный индекс ответа не возвращается клиенту в `questions`; он хранится в
  `test_attempts.questions` на сервере и используется только при оценке.
- Контактные данные кандидата (telegram) в офферах должны скрываться до статуса
  `accepted` — реализуется на следующем этапе вместе с ролевой моделью.