# Сборка, развёртывание и локальный запуск

## 1. Требования

- Node.js ≥ 18 (рекомендуется 22)
- npm
- (опционально) Docker / Docker Compose

## 2. Локальный запуск

```bash
npm install
npm run seed   # наполнение БД демо-данными (идемпотентно)
npm start      # сервер на http://localhost:3000
```

Проверка:

```bash
curl http://localhost:3000/api/health
```

Фронтенд доступен на `http://localhost:3000`.

## 3. Валидация решения

```bash
npm run validate
```

Скрипт генерирует синтетических кандидатов, прогоняет движок тестирования,
формирует подборки и сохраняет отчёт в `data/validation-report.json`.
Подробнее: `docs/validation.md`.

## 4. Docker

```bash
docker compose up --build
```

Сервис будет доступен на `http://localhost:3000`. Данные SQLite сохраняются
в Docker volume `app-data`.

Альтернативно:

```bash
docker build -t agregator-it-vakansiy .
docker run -p 3000:3000 -v agregator-data:/app/data agregator-it-vakansiy
```

## 5. Развёртывание на Render

Репозиторий содержит `render.yaml` (Render Blueprint):

1. Подключите репозиторий в Render (New → Blueprint).
2. Render создаст веб-сервис:
   - build: `npm install`;
   - start: `npm run seed && npm start`;
   - health check: `/api/health`.
3. Сервис будет доступен по публичному URL `https://<service>.onrender.com`.

Переменные окружения:

| Переменная | Назначение |
| --- | --- |
| `PORT` | Порт (Render задаёт 10000) |
| `NODE_ENV` | `production` |
| `WEB_API_URL` | URL веб-сервиса для Telegram-бота |

## 6. Развёртывание Telegram-бота (SourceCraft CI/CD + Yandex Cloud)

1. Создайте сервисное подключение в SourceCraft с именем `default-service-connection`.
2. Зарегистрируйте бота через BotFather (username вида `agregator_it_bot`).
3. В CI/CD запустите workflow `deploy-tg-bot-workflow` с параметрами
   `bot-username` (без `_bot`) и `bot-token`.
4. После завершения откройте кубик `get-outputs`, перейдите по `deployment_location`
   и включите «Публичная функция».

## 7. Переменные окружения

| Переменная | По умолчанию | Описание |
| --- | --- | --- |
| `PORT` | `3000` | Порт HTTP-сервера |
| `NODE_ENV` | — | Режим работы |
| `WEB_API_URL` | `http://localhost:3000` | Базовый URL API для Telegram-бота |
| `BOT_TOKEN` | — | Токен Telegram-бота (используется в Yandex Cloud Function) |