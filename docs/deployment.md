# Развёртывание

## 1. Локальный запуск

```bash
npm install
npm run seed          # идемпотентно: создаёт demo-аккаунты и вакансии
npm start             # http://localhost:3000
npm run smoke         # 24-проверочный e2e smoke
npm run validate      # синтетическая валидация
```

Демо-аккаунты:

| Email | Пароль | Роль |
|---|---|---|
| `candidate@demo.local` | `demo1234` | candidate |
| `employer@demo.local` | `demo1234` | employer |
| `admin@local` | `admin1234` | admin (модерика) |

## 2. Docker

```bash
docker compose up --build
```

`docker-compose.yml`:

```yaml
services:
  web:
    build: .
    ports: ["3000:3000"]
    environment:
      - PORT=3000
      - NODE_ENV=production
    volumes:
      - app-data:/app/data

volumes:
  app-data:
```

## 3. Render (Blueprint)

`render.yaml` поднимает веб-сервис:

- build: `npm install`
- start: `npm run seed && npm start`
- healthcheck: `/api/health`

Шаги:

1. Подключите репозиторий в Render (New → Blueprint).
2. Render создаст веб-сервис и Postgres-volume для `/app/data` (через диск).
4. Установите `JWT_SECRET` в environment (Render Dashboard → Environment).

## 4. Переменные окружения

| Переменная | Назначение | По умолчанию |
| --- | --- | --- |
| `PORT` | Порт HTTP-сервера | `3000` |
| `JWT_SECRET` | Секрет подписи JWT | dev-secret ⚠️ |
| `JWT_TTL` | Время жизни JWT | `7d` |
| `FSP_API_URL` | URL реального API ФСП (после MVP) | — |
| `FSP_CLIENT_ID` | Keycloak client id | — |
| `FSP_CLIENT_SECRET` | Keycloak client secret | — |

## 5. Подключение Telegram-бота

`src/` содержит шаблон Yandex Cloud Function на Telegraf. CI/CD в
`.sourcecraft/ci.yaml` деплоит функцию в Yandex Cloud; см. README → секция
«Развёртывание Telegram-бота».

## 6. Health-check

```
GET /api/health → 200 { status: "ok", time: "<ISO>" }
```

## 7. Резервное копирование

В MVP данные хранятся в SQLite (`data/app.db`). Для прода — заменить на
Postgres (через Prisma/TypeORM или вручную) или подключить Litestream для
непрерывной репликации SQLite.