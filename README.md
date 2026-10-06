# Агрегатор ИТ-вакансий (MVP+)

Отраслевой агрегатор ИТ-вакансий с **обратной механикой подбора**:

- соискатели автоматически категоризируются по объективно подтверждаемому профилю (стек, грейд, роль + достижения ФСП);
- работодатель сам находит нужную категорию, выбирает кандидата и выходит на него с вакансией и зарплатой (оффер).

Достижения участников соревнований ФСП (дисциплины, соревнования, результаты, роли, разряды) используются как **подтверждаемый** фактор квалификации: профиль кандидата автоматически обогащается данными ФСП.

## Что соответствует ТЗ

| Раздел ТЗ | Реализация |
|---|---|
| §2.1 ЛК «Кандидат» | `candidate-screen` в SPA: профиль, тест, приглашения, отклики, задания, вакансии, приватность, PDF |
| §2.1 ЛК «Работодатель» | `employer-screen`: компания, вакансии, поиск, подбор, офферы, отклики, задания |
| §2.2.1 Зарплата от–до в оффере | `offers.salary_from`/`salary_to` (обязательно), 400 если не указано |
| §2.2.2 Контакты скрыты до принятия/отклика | `server/visability.js`, `redactCandidate`, `canViewContacts` |
| §2.2.3 Статусы sent/viewed/accepted/declined | `offers.status` и `applications.status` |
| §2.2.4 Регистрация по email с подтверждением | `POST /api/auth/register` + `verify-email` (код в консоль + outbox.log) |
| §2.1 Механика тестирования | `server/testing.js` — выборка+шейк+параметры+cooldown 90 дней |
| §2.1 Категоризация + ранжирование | `server/matching.js` — `categorizeCandidate`, `scoreCandidate`, `rankInCategory` |
| §3.5 Безопасность (152-ФЗ) | bcrypt + JWT + роли + приватность + audit_log + видимость контактов |
| §3.5 Открытый исходный код | MIT, без обфускации |
| §3.5 Архитектура Front/Backend/Storage | Монолит с явным разделением слоёв |
| §3.5 Контейнеризация | Dockerfile + docker-compose.yml |
| §3.5 OpenAPI | `docs/openapi.yaml` |
| §3.5 Адаптивная вёрстка | Media queries в `public/css/styles.css` |
| §5 Прозрачная процедура валидации | `npm run validate` + `data/validation-report.json` |
| §3.4 Документация | 9 файлов в `docs/` |

## Состав репозитория

| Путь | Назначение |
| --- | --- |
| `server/` | Backend (Node.js + Express + SQLite + JWT) |
| `server/auth.js` | Регистрация по email, подтверждение, JWT, роли, аудит |
| `server/email.js` | Email-сервис (MVP: console + outbox.log) |
| `server/visability.js` | Правила видимости контактов |
| `server/services/pdf.js` | Генерация PDF-профиля |
| `server/services/ats.js` | Каркас интеграции с ATS |
| `server/services/moderation.js` | Жалобы, модерация, rate-limit |
| `server/services/fspMock.js` | Заглушка интеграции с API ФСП |
| `server/matching.js` | Категоризация + rule-based матчинг |
| `server/testing.js` | Движок тестирования кандидатов |
| `server/db.js` | Схема SQLite + лёгкие миграции |
| `server/seed.js` | Демо-данные и demo-аккаунты |
| `server/validate.js` | Синтетическая валидация |
| `server/smoke.js` | E2E smoke-тест (24 проверки) |
| `public/` | Frontend SPA (HTML/CSS/JS, без сборки) |
| `src/` | Telegram-бот (Yandex Cloud Function, шаблон SourceCraft) |
| `.sourcecraft/ci.yaml` | CI/CD для деплоя Telegram-бота |
| `render.yaml` | Render Blueprint для деплоя веб-сервиса |
| `Dockerfile`, `docker-compose.yml` | Контейнеризация |
| `docs/` | Сопроводительная документация |

## Технологический стек

- **Backend:** Node.js ≥ 18, Express 4, better-sqlite3 (SQLite), bcryptjs, jsonwebtoken, pdfkit
- **Frontend:** статический SPA (HTML/CSS/JS), отдаётся тем же Express
- **Telegram-бот:** Telegraf 4, разворачивается как Yandex Cloud Function через CI/CD SourceCraft
- **Деплой веб-сервиса:** Render (Blueprint) или Docker

## Локальный запуск

```bash
npm install
npm run seed   # наполнение БД демо-данными (идемпотентно)
npm start      # сервер на http://localhost:3000
```

Демо-аккаунты:

| Email | Пароль | Роль |
|---|---|---|
| `candidate@demo.local` | `demo1234` | candidate |
| `employer@demo.local` | `demo1234` | employer |
| `admin@local` | `admin1234` | admin (модерика) |

API доступно на `http://localhost:3000/api`, фронтенд — на `http://localhost:3000`.

## Smoke и валидация

```bash
npm run smoke      # 24-проверочный e2e smoke
npm run validate   # синтетическая валидация → data/validation-report.json
```

## Развёртывание

### Docker
```bash
docker compose up --build
```

### Render (Blueprint)
1. Подключите репозиторий в [Render](https://render.com) (New → Blueprint).
2. Render создаст веб-сервис из `render.yaml`:
   - build: `npm install`;
   - start: `npm run seed && npm start`;
   - healthcheck: `/api/health`.

### Telegram-бот (SourceCraft CI/CD + Yandex Cloud)
1. Создайте сервисное подключение `default-service-connection`.
2. Зарегистрируйте бота через [BotFather](https://t.me/BotFather) (`/newbot`).
3. Запустите workflow `deploy-tg-bot-workflow` с `bot-username` и `bot-token`.

## Матчинг (правила)

Категоризация: `стек ∪ verified_grade ∪ роль`, ФСП может повысить грейд:
`junior + ≥1 ФСП → middle`, `middle + ≥2 ФСП → senior`.

Скоринг кандидата под вакансию (0–100):

- пересечение стека — до 60;
- совпадение грейда — 25 (разница в 1 уровень — 12);
- совпадение роли — 10;
- подтверждённые достижения ФСП — 5.

`breakdown` возвращается в каждом результате для объяснимости выдачи.

## Тестирование

| Диапазон | Результат | Действие |
|---|---|---|
| ≥ 85% | confident | грейд повышается на 1 |
| 55–84% | passed | грейд подтверждается |
| < 55% | not_passed | грейд **не понижается**; можно пройти уровень ниже |

Cooldown смены грейда — 90 дней. Генерация теста — случайная выборка из банка +
перемешивание вариантов + параметрические задания с уникальными числами.

## Документация

| Документ | Содержание |
| --- | --- |
| `docs/architecture.md` | Функциональная и компонентная архитектура |
| `docs/api.md` | Описание API |
| `docs/openapi.yaml` | Спецификация OpenAPI 3.0 |
| `docs/testing.md` | Механика тестирования и устойчивость к распространению заданий |
| `docs/matching.md` | Механика подбора и категоризация кандидатов |
| `docs/validation.md` | Процедура валидации решения и метрики |
| `docs/privacy.md` | Приватность, согласия, 152-ФЗ |
| `docs/fsp-integration.md` | Схема интеграции с реестром ФСП (Keycloak) |
| `docs/deployment.md` | Сборка, развёртывание, локальный запуск |
| `docs/roadmap.md` | Дальнейшее развитие |

## Лицензия

MIT. Открытый исходный код, без обфускации.