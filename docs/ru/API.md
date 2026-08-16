# TrueNeverStory — Справочник API

REST API платформы TrueNeverStory для создания миров и ролевой игры. Все эндпоинты возвращают JSON, если не указано иное.

**Базовый URL:** `http://localhost:3000`

---

## Содержание

- [Здоровье](#здоровье)
- [Чат и ролевая игра](#чат-и-ролевая-игра)
- [Миры](#миры)
- [Сущности и граф](#сущности-и-граф)
- [Сессии](#сессии)
- [Ветки](#ветки)
- [Вероятности](#вероятности)
- [Романс](#романс)
- [Квесты](#квесты)
- [Обратная связь](#обратная-связь)
- [Движок правил](#движок-правил)
- [Функциональные флаги](#функциональные-флаги)
- [Версионирование API](#версионирование-api)
- [Память](#память)
- [Обслуживание](#обслуживание)
- [Система](#система)
- [Агенты](#агенты)
- [Провайдеры и модели](#провайдеры-и-модели)
- [Настройки](#настройки)
- [Запуск](#запуск)
- [WebSocket](#websocket)
- [Аутентификация](#аутентификация)
- [Межмировой](#межмировой)
- [Плагины](#плагины)

---

## Здоровье

### `GET /health`
Проверка работоспособности.

**Ответ:** `{ status: "ok", engine_ready: boolean, uptime: number }`

### `GET /system-check`
Проверка системы с информацией о версии Node и платформе.

**Ответ:** `{ ok: boolean, message: string, node_version: string, platform: string }`

---

## Чат и ролевая игра

### `POST /chat/setup`
Инициализация или обновление активной сессии ролевой игры.

**Запрос:**
```json
{
  "character": "Kaelen",
  "location": "Silverwood",
  "story_time": "2025-06-01T12:00:00Z",
  "role": "protagonist",
  "session_id": "default"
}
```

**Ответ:** `{ active_character, current_location, current_time, session_id }`

### `POST /chat/message`
Отправить сообщение игрока, получить нарративный ответ.

**Запрос:** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**Ответ:** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
SSE-стриминг для прогрессивной доставки нарратива. Тело запроса аналогично `/chat/message`.

**Ответ:** Поток Server-Sent Events:
- `event: start` — состояние сессии
- `event: chunk` — фрагмент нарратива
- `event: agent` — ответ агента (при упоминании `@agent`)
- `event: done` — финальное состояние
- `event: error` — сообщение об ошибке
- `data: [DONE]` — маркер конца потока

### `POST /chat/agent`
Отправить приватное сообщение конкретному агенту.

**Запрос:** `{ agentId: string, message: string }`

### `GET /chat/session`
Получить текущее состояние сессии.

### `GET /chat/history?limit=20`
Получить историю диалога.

**Ответ:** Массив `{ user: string, assistant: string, timestamp: string }`

---

## Миры

### `GET /worlds`
Список всех доступных миров.

**Ответ:** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
Имя активного мира (лёгкий запрос).

### `POST /worlds`
Создать новый мир.

**Запрос:** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

### `GET /worlds/:name`
Детали мира и данные world frame.

### `PUT /worlds/:name`
Обновить поля world frame.

### `DELETE /worlds/:name`
Удалить мир.

### `POST /worlds/:name/switch`
Переключить активный мир.

### `POST /worlds/:name/chapters/generate`
Сгенерировать литературную главу из данных сессии.

**Запрос:** `{ sessionId?: string, prompt?: string }`

### `GET /worlds/:name/chapters`
Список сгенерированных глав.

### `GET /worlds/:name/chapters/:filename`
Содержимое главы.

### `GET /worlds/:name/detail`
Полная статистика мира для модального окна.

**Ответ:**
```json
{
  "name": "default",
  "title": "Мой мир",
  "description": "...",
  "genre": "fantasy",
  "language": "ru",
  "worldRules": [{ "name": "...", "description": "..." }],
  "magicSystem": "...",
  "entityCounts": { "Character": 5, "Location": 3, "Faction": 2, "Item": 8 },
  "totalEntities": 18,
  "characters": [{ "name": "...", "summary": "...", "tags": [], "relationships": [] }],
  "locations": [{ "name": "...", "summary": "..." }],
  "factions": [{ "name": "...", "summary": "..." }],
  "items": [{ "name": "...", "summary": "..." }],
  "sessionCount": 4,
  "eventCount": 42,
  "chapterCount": 3,
  "villainCount": 1,
  "hasFrame": true
}
```

---

## Сущности и граф

### `GET /entity/:uid?layers=l1,l2,l3`
Получить сущность по UID.

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
Соседи сущности с обходом графа. Направление: `out`, `in` или `both`.

### `GET /path?source=Character:Kaelen&target=Location:Village`
Найти кратчайший путь между двумя сущностями.

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
Поиск сущностей по имени или семантическому сходству.

**Ответ:** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
Статистика графа (количество узлов/рёбер, информация о ветке).

### `GET /graph/d3?mode=relationships`
Данные графа для визуализации d3-force. Режим: `relationships` или `crafting`.

**Ответ:** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## Сессии

### `GET /sessions`
Список всех сессий.

### `GET /sessions/list`
Список доступных игровых сессий.

### `GET /sessions/:sessionId/history`
История диалога сессии.

### `GET /sessions/:sessionId/summarize`
Резюме сессии.

### `POST /sessions/export`
Экспорт сессии в markdown.

**Запрос:** `{ session_id?: string, messages: [{role, content, timestamp?}] }`

### `GET /sessions/exports`
Список экспортированных файлов.

### `GET /sessions/exports/:filename`
Загрузить экспортированный файл.

---

## Ветки

### `POST /branch/create?name=my-branch&from_branch=main`
Создать ветку мира (git-like снапшоты).

### `POST /branch/switch?name=my-branch`
Переключить активную ветку.

### `POST /branch/merge?name=my-branch`
Слить ветку в main.

### `GET /branch/list`
Список всех веток.

---

## Вероятности

### `GET /probability/:character/:profile?target=optional`
Вероятность успеха действия персонажа.

Профили: `combat`, `persuasion`, `stealth`, `intimidation`, `deception`, `athletics`, `investigation`, `romance`, `generic`.

**Ответ:** `{ character, profile, probability: number }`

### `POST /probability/modifier`
Применить временный модификатор вероятности.

**Запрос:** `{ entity: string, parameter: string, value: number, duration_seconds?: number }`

### `GET /probability/modifiers/:entity`
Список активных модификаторов сущности.

---

## Романс

### `GET /romance/:character1/:character2`
Статус романтических отношений.

**Ответ:** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
Попытка романтического действия. Действия: `attraction`, `confess`, `date`, `kiss`, `propose`, `breakup`.

**Запрос:** `{ character, target, location?, message? }`

**Ответ:** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
Все романтические связи персонажа.

---

## Квесты

### `GET /quests`
Список всех квестов с прогрессом.

### `GET /quest/:questId`
Детали конкретного квеста.

---

## Обратная связь

### `POST /feedback`
Записать реакцию like/dislike/neutral на последний нарративный ход.

**Запрос:** `{ turnId: number, reaction: 'like'|'dislike'|'neutral', techniques: string[] }`

При `dislike` движок перегенерирует последний ход и возвращает `{ ok, regenerated }`. В противном случае возвращает `{ ok: true }`.

---

## Движок правил

### `GET /rules`
Список социальных/экономических правил мира.

### `GET /rules/:id`
Детали правила по ID.

### `POST /rules/preview`
Предпросмотр объединённых правил с модификаторами. Тело: `RulesConfig`.

### `POST /rules/check`
Проверить, разрешено ли действие. Тело: `{ config, action, superiorClass?, subordinateClass? }`.

---

## Функциональные флаги

### `GET /feature-flags`
Список всех функциональных флагов и экспозиций.

### `GET /feature-flags/:id`
Получить конкретный флаг.

### `POST /feature-flags`
Создать новый флаг.

### `PUT /feature-flags/:id`
Обновить флаг.

### `DELETE /feature-flags/:id`
Удалить флаг.

### `POST /feature-flags/:id/check`
Проверить, включён ли флаг для контекста (пользователь и т.д.).

---

## Версионирование API

TrueNeverStory поддерживает две версии API:

- **v1** — Легаси-обёртка для обратной совместимости
- **v2** — Расширенная версия с интеграцией реестра агентов

Все ответы v2 включают заголовки устаревания, когда используется легаси-поведение:

- `X-API-Version: v2`
- `X-Deprecated: true` (при возврате легаси-формата)
- `Sunset: <date>` (когда эндпоинт v1 запланирован к удалению)

## Память

### `POST /memory/forget?older_than=30&min_importance=0.2`
Забыть старые маловажные воспоминания.

### `POST /memory/summarise?tag=keyword`
Объединить воспоминания по тегу или UID узла.

### `GET /memory/export?fmt=json`
Экспорт всех воспоминаний.

### `POST /memory/import`
Импорт воспоминаний.

**Запрос:** `{ data: MemoryEntry[] }`

### `POST /memory/update/:entryId`
Обновить содержимое воспоминания.

**Запрос:** `{ content: string }`

### `GET /memory/stats`
Статистика системы памяти.

### `POST /memory/rebuild`
Пересобрать индекс FAISS.

### `GET /memory/retrieve?q=keyword&top_k=10`
Семантический поиск по воспоминаниям.

---

## Обслуживание

### `POST /maintenance/run?full=true`
Запустить обслуживание памяти (очистка, кластеризация, архивация).

### `GET /maintenance/status`
Статистика памяти и обслуживания.

### `POST /maintenance/rebuild-index`
Пересобрать векторный индекс.

### `POST /maintenance/clean-orphans`
Очистить осиротевшие эмбеддинги.

---

## Система

### `POST /system/pause`
Приостановить движок ролевой игры. Не принимает параметров.

### `POST /system/resume`
Возобновить движок ролевой игры. Не принимает параметров.

---

## Агенты

### `GET /agents`
Список всех настроенных агентов.

Параметры запроса: `world` — необязательный, фильтрация по конкретному миру

### `GET /agents/:id`
Конфигурация агента.

Параметры запроса: `world` — необязательный, загрузка из конкретного мира

### `PUT /agents/:id`
Обновить конфигурацию агента (модель, температура, промпты и т.д.). Ограничение: 30 запросов/мин/IP.

Параметры запроса: `world` — необязательный, сохранение в конкретный мир

### `PUT /agents/:id/prompts`
Обновить только промпты агента.

Параметры запроса: `world` — необязательный, сохранение в конкретный мир

### `POST /agents/:id/reset`
Сбросить агента к настройкам по умолчанию.

### `GET /agents/providers/options`
Доступные варианты провайдеров/моделей для назначения агентам.

---

## Провайдеры и модели

### `GET /providers`
Список всех LLM-провайдеров.

### `POST /providers`
Добавить провайдер.

### `GET /providers/models`
Список моделей всех провайдеров.

### `POST /providers/health`
Запустить проверку здоровья всех провайдеров.

### `POST /providers/assign`
Назначить провайдер+модель агенту.

**Запрос:** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `DELETE /providers/assign/:agentId`
Удалить назначение провайдера.

### `GET /providers/:id`
Детали провайдера и доступные модели.

### `PUT /providers/:id`
Обновить конфигурацию провайдера.

### `DELETE /providers/:id`
Удалить провайдер.

### `POST /providers/:id/default`
Сделать провайдер основным.

### `POST /providers/:id/keys`
Добавить API-ключ.

### `DELETE /providers/:id/keys/:keyId`
Удалить API-ключ.

### `GET /models`
Список всех установленных и доступных моделей.

### `POST /models/install`
Установить модель.

**Запрос:** `{ source: "ollama"|"gguf_url", name: string, backend: "ollama"|"llamacpp" }`

### `DELETE /models/:id`
Удалить модель.

### `POST /models/import`
Импортировать локальный файл модели.

### `POST /models/apply`
Применить модель к настройкам.

### `GET /models/browse?path=/`
Просмотр файловой системы для поиска моделей.

---

## Настройки

### `GET /settings`
Текущие настройки (API-ключи маскированы).

### `PUT /settings`
Обновить настройки. Пароли хешируются автоматически, замаскированные ключи игнорируются.

### `POST /settings/reset`
Сбросить к настройкам по умолчанию.

### `GET /languages`
Список доступных языков интерфейса (EN, RU, DE, FR, ES, JA, ZH).

---

## Запуск

### `POST /launch`
Создать новую игровую сессию с генерацией персонажа.

**Запрос:** `{ name?: string, hints?: string, isekai?: boolean, starting_age?: number }`

`name` — явное имя персонажа (необязательный). Если указано, пропускает генерацию имени LLM. Поддерживает символы не-латиницы.

**Ответ:** `{ status: "success", session_id, character_name, opening_narrative, url }`

### `POST /continue`
Продолжить существующую сессию.

**Запрос:** `{ session_id: string }`

**Ответ:** `{ status: "success", session_id, character_name, url }`

---

## WebSocket

### `GET /ws/roleplay/:sessionId`
WebSocket-эндпоинт для ролевой игры в реальном времени. Сообщения в JSON:

**Клиент → Сервер:** `{ type: "message", content: string }`
**Сервер → Клиент:** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## Аутентификация

При включённой парольной аутентификации сессии используют HttpOnly cookies. Включайте `credentials: "include"` в запросах fetch.

---

## Межмировой

### `GET /api/cross-world/status`
Статус межмирового взаимодействия.

**Ответ:** `{ enabled: boolean, portals: number, eventLog: number }`

### `POST /api/cross-world/enable`
Включить межмировое взаимодействие.

**Ответ:** `{ enabled: true }`

### `POST /api/cross-world/disable`
Отключить межмировое взаимодействие.

**Ответ:** `{ enabled: false }`

### `GET /api/cross-world/portals`
Список активных порталов между мирами.

**Ответ:** Массив `{ id, world1, world2, createdAt, active }`

### `POST /api/cross-world/portals`
Создать портал между двумя мирами.

**Запрос:** `{ world1: string, world2: string }`

**Ответ:** `{ id, world1, world2, createdAt, active }`

### `DELETE /api/cross-world/portals/:id`
Уничтожить портал.

**Ответ:** `{ deleted: true }`

### `GET /api/cross-world/events?limit=50`
Журнал межмировых событий.

**Ответ:** Массив `{ type, data, source, timestamp }`

---

## Плагины

### `GET /api/plugins`
Список всех зарегистрированных плагинов.

**Ответ:** Массив `{ id, name, version, description, agents, routes, hooks }`

### `GET /api/plugins/:id`
Детали плагина.

**Ответ:** Объект плагина с полными деталями.

### `GET /api/plugins/:id/capabilities`
Возможности плагина (количество агентов, маршрутов, хуков).

**Ответ:** `{ agents: number, routes: number, hooks: number }`

### `GET /api/plugins/agents/all`
Все агенты, зарегистрированные плагинами.

**Ответ:** Массив `{ id, name, description, config }`

### `GET /api/plugins/routes/all`
Все маршруты, зарегистрированные плагинами.

**Ответ:** Массив `{ path, method, handler }`

---

*Сгенерировано: 2026-06-27 | TrueNeverStory v0.32.5*
