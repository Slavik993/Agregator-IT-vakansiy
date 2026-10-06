# API

Базовый URL: `/api`. Все запросы/ответы — JSON. Аутентификация — заголовок
`Authorization: Bearer <JWT>` (кроме публичных маршрутов, помеченных как таковые).

## Публичные маршруты

### Health & meta

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/health` | проверка доступности |
| GET | `/api/meta` | справочники грейдов, дисциплин ФСП, лимиты модерации |
| GET | `/api/testing/meta` | специализации + грейды + cooldown тестов |
| GET | `/api/fsp/disciplines` | дисциплины ФСП (мок) |
| GET | `/api/fsp/achievements/:fspId` | достижения участника (мок) |

### Auth

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{email, password, role, displayName}` | `{user_id, email, role, email_verified, dev_verification_code}` |
| POST | `/api/auth/verify-email` | `{email, code}` | `{ok: true}` |
| POST | `/api/auth/resend-code` | `{email}` | `{ok: true, dev_verification_code}` |
| POST | `/api/auth/login` | `{email, password}` | `{token, user}` |
| POST | `/api/auth/logout` | — | `{ok: true}` |

> **MVP-режим.** В этой сборке код подтверждения возвращается в JSON-ответе
> (`dev_verification_code`) и показывается прямо в UI — на Render (и любых
> хостингах без SSH) пользователь не видит серверную консоль, поэтому код виден
> только в ответе API. В продакшене поле `dev_verification_code` убирается, а
> код отправляется реальным письмом через `server/email.js` (контракт уже
> поддерживает SMTP-провайдер).

### Кандидаты (публичные)

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/candidates` | список; работодателям контакты скрыты |
| GET | `/api/candidates/:id/category` | категория кандидата |
| GET | `/api/candidates/:id/pdf` | PDF-профиль (если `privacy_publish = 1`) |
| GET | `/api/candidates/search` | поиск по банку: `role`, `grade`, `stack`, `work_format`, `city`, `fsp_only` |

### Вакансии (публичные)

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/vacancies` | активные вакансии (`moderation_status != 'hidden'`) |
| GET | `/api/vacancies/:id` | вакансия + данные компании |
| GET | `/api/vacancies/:id/matches` | подборка кандидатов (rule-based скоринг) |
| POST | `/api/vacancies/:id/report` | `{reason, details, reporter_email}` |

### Тестирование (публичное, не требует auth)

| Метод | Путь | Описание |
| --- | --- | --- |
| POST | `/api/candidates/:id/tests` | `{role, claimed_grade}` → 5 уникальных вопросов |
| POST | `/api/test-attempts/:id/submit` | `{answers}` → `{result, percent, score, max_score, grade_after, grade_changed, cooldown_blocked, details}` |
| GET | `/api/candidates/:id/tests` | история попыток |
| GET | `/api/candidates/:id/grade-change-status` | `{allowed, cooldown_days, last_grade_change, next_allowed}` |

## Авторизованные маршруты

### `auth.requireAuth` — общий

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/me` | текущий пользователь + его профиль (кандидат) или компания (работодатель) |

### `requireRole('candidate')`

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/me/candidate/profile` | профиль кандидата |
| PUT | `/api/me/candidate/profile` | редактирование полей |
| PUT | `/api/me/privacy` | `{privacy_publish, privacy_show_contacts, privacy_show_achievements, privacy_show_in_search}` |
| POST | `/api/me/fsp-link` | `{fsp_id}` — привязка ФСП |
| GET | `/api/offers` | входящие офферы (со стороны кандидата) |
| PATCH | `/api/offers/:id` | `{status: 'accepted'|'declined'|'viewed'}` |
| GET | `/api/offers/:id/contact` | контакты работодателя по офферу |
| GET | `/api/applications` | отклики кандидата |
| POST | `/api/applications` | `{vacancy_id, cover_letter}` |
| PATCH | `/api/applications/:id` | `{status}` |
| GET | `/api/tasks` | задания, где кандидат — исполнитель |
| POST | `/api/tasks/:id/submit` | `{solution}` |

### `requireRole('employer')`

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/me/employer/company` | профиль компании |
| PUT | `/api/me/employer/company` | `{name, description, contact_email, contact_phone, website, city, logo_url}` |
| POST | `/api/vacancies` | создать вакансию (rate-limit 5/час) |
| PATCH | `/api/vacancies/:id` | редактировать (только свою) |
| GET | `/api/offers` | отправленные офферы |
| POST | `/api/offers` | `{vacancy_id, candidate_id, salary_from, salary_to, message}` (`salary_from`/`salary_to` обязательны) |
| PATCH | `/api/offers/:id` | `{status: 'viewed'}` |
| GET | `/api/offers/:id/contact` | контакты кандидата (только после `accepted`) |
| GET | `/api/applications` | входящие отклики |
| PATCH | `/api/applications/:id` | `{status: 'accepted'|'declined'|'viewed'}` |
| POST | `/api/tasks` | `{candidate_id, vacancy_id?, title, description, due_at?}` |
| POST | `/api/tasks/:id/review` | `{score, comment, status: 'reviewed_ok'|'reviewed_bad'}` |

### `requireAdmin` (email `admin@local` или `*@admin.local`)

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/admin/reports` | все жалобы |
| POST | `/api/admin/moderate/:vacancyId` | `{decision: 'ok'\|'review'\|'hidden', note?}` |
| GET | `/api/admin/audit` | журнал действий |
| GET | `/api/ats/events` | список событий интеграции |
| POST | `/api/ats/push-candidate` | `{system, candidate_id}` — выгрузка карточки в ATS |

## Коды ошибок

| Код | Примеры |
|------|---------|
| 400 | не заполнены обязательные поля, неверный формат |
| 401 | отсутствует/невалиден токен |
| 403 | нет роли, контакты закрыты |
| 404 | не найдено |
| 409 | дубликат, состояние не позволяет |
| 429 | rate-limit |

Все ошибки возвращают `{error: "<человеческое сообщение>"}`.