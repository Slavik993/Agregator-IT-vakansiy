# Архитектура решения

## 1. Общий обзор

Платформа-агрегатор ИТ-вакансий с **обратной механикой подбора** реализована как
монолит с явным разделением слоёв (frontend ↔ REST API ↔ СУБД) — это допустимо
по ТЗ §3.5 и упрощает воспроизведение на одной машине.

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend: статический SPA (HTML/CSS/JS)                          │
│ public/index.html, public/js/{api,auth,candidate,employer,app}.js│
└─────────────────────────────────────────────────────────────────┘
                                │ REST /api (JSON, Bearer JWT)
┌─────────────────────────────────────────────────────────────────┐
│ Backend: Node.js + Express                                       │
│ server/index.js        — маршруты и ролевые guards               │
│ server/auth.js         — JWT + регистрация/вход/подтверждение   │
│ server/email.js        — email-сервис (MVP: console + outbox)    │
│ server/visability.js   — правила видимости контактов              │
│ server/matching.js     — категоризация + rule-based матчинг      │
│ server/testing.js      — движок тестирования кандидатов           │
│ server/db.js           — схема SQLite + миграции                 │
│ server/services/pdf.js     — генерация PDF-профиля               │
│ server/services/ats.js     — каркас интеграции с ATS             │
│ server/services/moderation.js — антифрод и модерация             │
│ server/services/fspMock.js  — заглушка интеграции с ФСП          │
│ server/seed.js, validate.js, smoke.js                            │
└─────────────────────────────────────────────────────────────────┘
                                │ better-sqlite3 (WAL)
┌─────────────────────────────────────────────────────────────────┐
│ Хранилище: SQLite (data/app.db)                                  │
│ users, auth_tokens, employer_companies, candidates, vacancies,    │
│ offers, applications, regular_tasks, test_attempts, achievements,│
│ vacancy_reports, fsp_links, audit_log, rate_limit_log            │
└─────────────────────────────────────────────────────────────────┘

Дополнительно в репозитории:
- `src/` — Telegram-бот (Yandex Cloud Function, шаблон SourceCraft);
- `.sourcecraft/ci.yaml` — CI/CD для деплоя бота;
- `render.yaml` — Render Blueprint для деплоя веб-сервиса;
- `Dockerfile`, `docker-compose.yml` — контейнеризация веб-сервиса.
```

## 2. Компонентная архитектура

### 2.1 Backend-слой

| Модуль | Ответственность |
| --- | --- |
| `server/index.js` | HTTP-сервер, маршрутизация, ролевая авторизация (JWT) |
| `server/auth.js` | Регистрация по email, подтверждение кода, JWT, роли `candidate` / `employer`, аудит |
| `server/email.js` | Email-сервис: в MVP код подтверждения пишется в консоль и `data/email-outbox.log` |
| `server/db.js` | Схема таблиц и лёгкие миграции |
| `server/matching.js` | Категоризация + rule-based скоринг (стек/грейд/роль/ФСП) с breakdown |
| `server/testing.js` | Банк заданий, генерация тестов, оценка, cooldown смены грейда (90 дней) |
| `server/visability.js` | Правила §2.2 ТЗ: контакты скрыты до принятия/отклика |
| `server/services/pdf.js` | Генерация PDF-профиля кандидата через pdfkit |
| `server/services/ats.js` | Каркас выгрузки кандидатов во внешние ATS (Greenhouse/Lever/Workday/hh ATS) |
| `server/services/moderation.js` | Жалобы, rate-limit на вакансии, перевод вакансии в `review`/`hidden` |
| `server/services/fspMock.js` | Заглушка реестра ФСП (дисциплины + достижения) |
| `server/seed.js` | Демо-данные и три demo-аккаунта (`candidate@demo.local`, `employer@demo.local`, `admin@local`) |
| `server/validate.js` | Синтетическая валидация: Precision@5, MRR, Coverage, монотонность |
| `server/smoke.js` | E2E smoke-тест сквозных сценариев |

### 2.2 Хранилище (SQLite)

Таблицы:
- `users` — email + bcrypt + роль + код подтверждения;
- `auth_tokens` — выданные JWT (для отзыва на logout);
- `candidates` — расширенный профиль соискателя: стек, грейд, роль, контакты,
  подтверждённый грейд, флаги приватности, согласие на обработку ПДн;
- `employer_companies` — профиль компании работодателя;
- `vacancies` — вакансии работодателей со ссылкой на компанию, зарплата от–до,
  статус модерации, rate-limit учитывается в `created_at`;
- `offers` — приглашения работодателя: статус `sent / viewed / accepted / declined`,
  `salary_from`/`salary_to`, `viewed_at`, `responded_at`;
- `applications` — самостоятельные отклики кандидатов: статус `sent/viewed/accepted/declined`;
- `regular_tasks` — регулярные короткие задания работодателя выбранному кандидату;
- `vacancy_reports` — жалобы пользователей на вакансии;
- `fsp_links` — заявки на привязку ФСП ID;
- `achievements` — проекция достижений ФСП для быстрых выборок;
- `test_attempts` — попытки тестирования (вопросы, ответы, проценты, грейд);
- `audit_log` — журнал действий пользователей (для 152-ФЗ);
- `rate_limit_log` — журнал ограничения скорости.

### 2.3 Frontend-слой

SPA на чистом JavaScript без сборки:

| Файл | Назначение |
| --- | --- |
| `public/index.html` | Каркас UI, ролевые секции (`auth-screen`, `candidate-screen`, `employer-screen`) |
| `public/css/styles.css` | Все стили + адаптивные media queries (≤ 720px) |
| `public/js/api.js` | REST-клиент: единая точка запросов, хранение токена |
| `public/js/auth.js` | Экран входа/регистрации/подтверждения, переключение ролей |
| `public/js/candidate.js` | Кабинет соискателя: профиль, тест, приглашения, отклики, задания, публичные вакансии, приватность |
| `public/js/employer.js` | Кабинет работодателя: компания, вакансии, поиск, подбор, офферы, отклики, задания |
| `public/js/app.js` | Bootstrap: запуск `authUi.boot()` |

### 2.4 Демо-аккаунты

После `npm run seed` доступны:

| Email | Пароль | Роль | Что доступно |
|---|---|---|---|
| `candidate@demo.local` | `demo1234` | candidate | весь кабинет соискателя |
| `employer@demo.local` | `demo1234` | employer | кабинет работодателя + 5 вакансий |
| `admin@local` | `admin1234` | employer* | модерика вакансий + ATS-события |

## 3. Сквозные сценарии

### 3.1 Регистрация соискателя
1. POST `/api/auth/register` (email, password, role=candidate, displayName).
2. Сервер создаёт `users`, шлёт код (логирует в консоль + `email-outbox.log`).
3. POST `/api/auth/verify-email` с кодом → `users.email_verified = 1`.
4. POST `/api/auth/login` → JWT.
5. Кандидат заполняет профиль, проходит тест, привязывает `fsp_id`.

### 3.2 Регистрация работодателя и обратная механика
1. POST `/api/auth/register` (role=employer) + verify-email.
2. Заполняет `/api/me/employer/company`.
3. Создаёт вакансию через `POST /api/vacancies` (rate-limit 5/час).
4. Получает подборку `GET /api/vacancies/:id/matches`.
5. Отправляет оффер `POST /api/offers` (`salary_from`/`salary_to` обязательны).
6. После `accepted` кандидатом работодатель получает доступ к контактам
   через `GET /api/offers/:id/contact`.

### 3.3 Кандидат сам откликается
1. Кандидат видит вакансию через `GET /api/vacancies` (публичный).
2. POST `/api/applications` → отклик.
3. Это автоматически открывает контакты кандидата этому работодателю.

### 3.4 Регулярные задания
1. Работодатель POST `/api/tasks` → назначает задачу выбранному кандидату.
2. Кандидат POST `/api/tasks/:id/submit` с решением.
3. Работодатель POST `/api/tasks/:id/review` (score/comment/ok|bad).
4. Решение влияет на «свежесть» профиля.

### 3.5 Жалобы и модерация
1. POST `/api/vacancies/:id/report`.
2. При ≥3 жалоб вакансия уходит в `moderation_status = 'review'` и перестаёт
   показываться в публичной выдаче.
3. `admin@local` решает через POST `/api/admin/moderate/:vacancyId`.

## 4. Безопасность

- bcryptjs для паролей;
- JWT (HS256) с TTL 7 дней, отзыв через `auth_tokens.revoked`;
- ролевые guards `requireRole('candidate'|'employer')`;
- видимость контактов через `server/visability.js`;
- rate-limit на создание вакансий (5/час на пользователя);
- аудит-лог `audit_log`;
- все ответы строго JSON;
- CORS не открывается в MVP (same-origin).

## 5. Локальный запуск

```bash
npm install
npm run seed          # идемпотентно: создаёт demo-аккаунты и вакансии
npm start             # сервер на http://localhost:3000
npm run smoke         # 24-проверочный e2e smoke
npm run validate      # синтетическая валидация и отчёт
```

Через Docker:

```bash
docker compose up --build
```

Через Render: см. `docs/deployment.md`.

## 6. Расширение

- ML вместо rule-based: контракт `scoreCandidate(vacancy, candidateCategory) → {score, breakdown}` сохранён.
- Интеграция с реальным ФСП: `server/services/fspMock.js` заменяется на HTTP-клиент (Keycloak + API ФСП).
- Переход на Keycloak/OIDC: модуль `auth.js` уже изолирован, требуется только замена `issueJwt`/`requireAuth`.