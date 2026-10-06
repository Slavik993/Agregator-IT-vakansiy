# Интеграция с реестром ФСП

## 1. Контракт

В ТЗ (§2) указано: *«Ни API, ни описание структуры данных ФСП не предоставляются
намеренно: команда сама решает, какие сведения о достижениях участника имеет
смысл получать и как показывать их работодателю»*. Поэтому мы проектируем
контракт так, чтобы его можно было наполнить реальными данными без изменений в
остальном коде.

## 2. Текущая заглушка

`server/services/fspMock.js`:

```js
{
  getDisciplines(): [{code, name}],
  getAchievements(fspId): [{
    discipline, competition, result, role, rank, year
  }],
}
```

Дисциплины:

| code | name |
| --- | --- |
| algorithm | Алгоритмическое программирование |
| sports | Спортивное программирование |
| product | Продуктовая разработка |
| info-security | Информационная безопасность |
| robotics | Робототехника |

Достижения `MOCK_ACHIEVEMENTS` хранятся для `FSP-0001`…`FSP-0005`.

## 3. Схема реальной интеграции

```
┌──────────────────┐         ┌────────────────────────┐
│ Agregator        │  HTTP   │ ФСП / Keycloak (OIDC)  │
│  Backend          │ ──────▶ │  api.fsp.example/...   │
│  server/services │         │                        │
│  /fspClient.js   │ ◀────── │  (достижения, роли,    │
│                  │  JSON   │   разряды, год)        │
└──────────────────┘         └────────────────────────┘
```

### 3.1 Авторизация (Keycloak OIDC)

- Confidential client (client_id/client_secret).
- `client_credentials` grant для server-to-server.
- Access token кладётся в Authorization заголовок `Bearer <token>`.

### 3.2 Эндпоинты (предполагаемые)

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/realms/fsp/protocol/openid-connect/userinfo` | профиль участника |
| GET | `/api/fsp/v1/participants/{fspId}/achievements` | список достижений |
| GET | `/api/fsp/v1/participants/{fspId}/rank` | текущий разряд |
| POST | `/api/fsp/v1/participants/{fspId}/verification` | инициация верификации |

### 3.3 Кэширование

- Добавить таблицу `fsp_cache(fsp_id, payload, fetched_at)`.
- TTL 6 часов; при недоступности API отдаём кэш с признаком `stale`.
- Событие `fsp.updated` подписано на webhook от ФСП (после MVP).

### 3.4 Показ работодателю

Достижения показываются в карточке кандидата и в подборке, если:

- кандидат привязал `fsp_id` через `POST /api/me/fsp-link`;
- `privacy_show_achievements = 1`.

Достижения имеют визуальный бейдж «✓ ФСП» в подборке.

## 4. Замена мока на реальный клиент

План:

1. Добавить `axios` (или `node-fetch`) + `@keycloak/keycloak-admin-client`.
2. Создать `server/services/fspClient.js` с тем же контрактом, что у мока.
3. Через env-переменные `FSP_API_URL`, `FSP_CLIENT_ID`, `FSP_CLIENT_SECRET`
   переключать между моком и реальным API.
4. Перенести `getAchievements` на реальный API + кэш.
5. Добавить миграцию для сохранения `keycloak_sub` в `users`.

## 5. Обработка отсутствующей истории ФСП

ТЗ требует **обязательной корректной обработки** случая, когда у кандидата нет
истории ФСП. В коде это реализовано так:

- `getAchievements(undefined)` → `[]`;
- `categorizeCandidate(candidate, [])` → `gradeBoosted = false`;
- В UI бейдж «✓ ФСП» не показывается, раздел «Достижения» скрывается.

## 6. Что мы НЕ делаем на MVP

- Не подключаемся к реальному API ФСП (отсутствует в хакатоне).
- Не храним PII участников ФСП в БД агрегатора (только `fsp_id` и
  спроецированные достижения).
- Не реализуем push-обновления из ФСП — добавляется после MVP через webhook.