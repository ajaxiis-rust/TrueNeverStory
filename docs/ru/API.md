# Справочник по API TrueNeverStory

REST API для платформы миростроительства и ролевой игры TrueNeverStory. Все эндпоинты возвращают JSON, если не указано иное.

**Базовый URL:** `http://localhost:8000`

---

## Содержание

- [Здоровье](#здоровье)
- [Чат и ролевая игра](#чат-и-ролевая-игра)
- [Миры](#миры)
- [Сущности и граф](#сущности-и-граф)
- [Сессии](#сессии)
- [Ветки](#ветки)
- [Вероятность](#вероятность)
- [Романтика](#романтика)
- [Квесты](#квесты)
- [Обратная связь](#обратная-связь)
- [Движок правил](#движок-правил)
- [Флаги функций](#флаги-функций)
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
- [Межмировое взаимодействие](#межмировое-взаимодействие)
- [Плагины](#плагины)
- [Мониторинг](#мониторинг)
- [I18n](#i18n)
- [Хранилище мира](#хранилище-мира)
- [Wiki-исследования](#wiki-исследования)

---

## Здоровье

### `GET /health`
Проверка состояния.

**Ответ:** `{ status: "ok", engine_ready: boolean, uptime: number, version: string }`

### `GET /system-check`
Состояние системы с информацией о версии Node и платформе.

**Ответ:** `{ ok: boolean, message: string, node_version: string, platform: string }`

---

## Чат и ролевая игра

### `POST /chat/setup`
Инициализация или обновление активной ролевой сессии.

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
Отправить сообщение игрока и получить нарративный ответ.

**Запрос:** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**Ответ:** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
SSE-эндпоинт для потоковой доставки нарратива. Тело запроса аналогично `/chat/message`.

**Ответ:** Поток Server-Sent Events:
- `event: start` — состояние сессии
- `event: chunk` — фрагмент нарративного текста
- `event: agent` — ответ агента (для упоминаний `@agent`)
- `event: heartbeat` — keepalive-комментарий (`: keepalive`)
- `event: done` — финальное состояние
- `event: error` — сообщение об ошибке
- `data: [DONE]` — маркер конца потока

### `POST /chat/agent`
Отправить личное сообщение конкретному агенту.

**Запрос:** `{ agentId: string, message: string }`

**Ответ:** `{ narrative, agent_id, agent_name, location, story_time, active_character, success, error? }`

### `GET /chat/session`
Получить текущее состояние сессии.

**Ответ:** `{ active_character, current_location, current_time, session_id }`

### `GET /chat/history?limit=20`
Получить недавнюю историю разговора.

**Ответ:** Массив `{ user: string, assistant: string, timestamp: string }`

---

## Миры

### `GET /worlds`
Список всех доступных миров.

**Ответ:** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
Получить имя активного мира (облегчённый запрос).

**Ответ:** `{ active: string }`

### `POST /worlds`
Создать новый мир.

**Запрос:** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

**Ответ:** `{ status: "created", world }`

### `GET /worlds/:name`
Получить данные мира и фрейма.

### `PUT /worlds/:name`
Обновить поля фрейма мира.

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
Получить содержимое главы.

### `GET /worlds/:name/detail`
Полная статистика мира для модального окна статистики.

**Ответ:**
```json
{
  "name": "default",
  "title": "My World",
  "description": "...",
  "genre": "fantasy",
  "language": "en",
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
Получить данные сущности по UID.

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
Получить соседей сущности с обходом графа. Направление: `out`, `in` или `both`.

### `GET /path?source=Character:Kaelen&target=Location:Village`
Найти кратчайший путь между двумя сущностями.

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
Поиск сущностей по имени или семантическому сходству.

**Ответ:** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
Статистика графа (количество узлов/рёбер, информация о ветках).

### `GET /graph/d3?mode=relationships`
Данные графа, отформатированные для визуализации d3-force. Режим: `relationships` или `crafting`.

**Ответ:** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## Сессии

### `GET /sessions`
Список всех историй сессий.

### `GET /sessions/list`
Список доступных игровых сессий.

**Ответ:** `{ sessions: array, count: number }`

### `GET /sessions/:sessionId/history`
Получить историю разговора для сессии.

### `GET /sessions/:sessionId/summarize`
Суммаризация сессии.

### `POST /sessions/export`
Экспорт сессии в markdown.

**Запрос:** `{ session_id?: string, messages: [{role, content, timestamp?}] }`

### `GET /sessions/exports`
Список экспортированных файлов markdown.

### `GET /sessions/exports/:filename`
Загрузить экспортированный файл.

---

## Ветки

### `POST /branch/create?name=my-branch&from_branch=main`
Создать новую ветку мира (снимки в стиле git).

### `POST /branch/switch?name=my-branch`
Переключить активную ветку.

### `POST /branch/merge?name=my-branch`
Слить ветку в main.

### `GET /branch/list`
Список всех веток.

---

## Вероятность

### `GET /probability/:character/:profile?target=optional`
Получить вероятность успеха действия персонажа.

Профили: `combat`, `persuasion`, `stealth`, `intimidation`, `deception`, `athletics`, `investigation`, `romance`, `generic`.

**Ответ:** `{ character, profile, probability: number }`

### `POST /probability/modifier`
Применить временный модификатор вероятности.

**Запрос:** `{ entity: string, parameter: string, value: number, duration_seconds?: number }`

### `GET /probability/modifiers/:entity`
Список активных модификаторов для сущности.

---

## Романтика

### `GET /romance/:character1/:character2`
Получить статус романтических отношений.

**Ответ:** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
Попытка романтического действия. Действия: `attraction`, `confess`, `date`, `kiss`, `propose`, `breakup`.

**Запрос:** `{ character, target, location?, message? }`

**Ответ:** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
Получить все романтические отношения персонажа.

---

## Квесты

### `GET /quests`
Список всех квестов с прогрессом.

### `GET /quest/:questId`
Получить детали одного квеста.

---

## Обратная связь

### `POST /feedback`
Записать реакцию (лайк/дизлайк/нейтрально) на последний нарративный ход.

**Запрос:** `{ turnId: number, reaction: 'like'|'dislike'|'neutral', techniques: string[] }`

При `dislike` движок регенерирует последний ход и возвращает `{ ok, regenerated }`. Иначе возвращает `{ ok: true }`.

---

## Движок правил

### `GET /rules`
Список социальных/экономических правил мира.

### `GET /rules/:id`
Получить детали правила по ID.

### `POST /rules/preview`
Предпросмотр объединённых правил с модификаторами. Тело: `RulesConfig`.

### `POST /rules/check`
Проверить, разрешено ли действие. Тело: `{ config, action, superiorClass?, subordinateClass? }`.

---

## Флаги функций

### `GET /feature-flags`
Список всех флагов функций и их exposures.

### `GET /feature-flags/:id`
Получить один флаг.

### `POST /feature-flags`
Создать новый флаг.

### `PUT /feature-flags/:id`
Обновить флаг.

### `DELETE /feature-flags/:id`
Удалить флаг.

### `POST /feature-flags/:id/check`
Проверить, включён ли флаг для контекста (пользователя и т.д.).

---

## Версионирование API

TrueNeverStory поддерживает две версии API:

- **v1** — устаревшая обёртка для обратной совместимости
- **v2** — улучшенная версия с интеграцией реестра агентов

Устаревшие маршруты (всё под `/api/*`) содержат заголовки deprecation:

- `X-API-Version: legacy`
- `Deprecation: true`
- `Sunset: 2026-12-31`

---

## Память

### `POST /memory/forget?older_than=30&min_importance=0.2`
Забыть старые воспоминания с низкой важностью.

### `POST /memory/summarise?tag=keyword`
Суммаризовать воспоминания по тегу или UID узла.

### `GET /memory/export?fmt=json`
Экспортировать все воспоминания.

### `POST /memory/import`
Импортировать воспоминания из тела запроса.

**Запрос:** `{ data: MemoryEntry[] }`

### `POST /memory/update/:entryId`
Обновить запись воспоминания.

**Запрос:** `{ content: string }`

### `GET /memory/stats`
Статистика системы памяти.

### `POST /memory/rebuild`
Перестроить векторный индекс FAISS.

### `GET /memory/retrieve?q=keyword&top_k=10`
Семантический поиск по воспоминаниям.

---

## Обслуживание

### `POST /maintenance/run?full=true`
Запустить обслуживание памяти (обрезка, кластеризация, архивирование).

### `GET /maintenance/status`
Статистика памяти и обслуживания.

### `POST /maintenance/rebuild-index`
Перестроить векторный индекс.

### `POST /maintenance/clean-orphans`
Очистить осиротевшие эмбеддинги.

---

## Система

### `POST /system/pause`
Приостановить ролевой движок. Не принимает параметров.

### `POST /system/resume`
Возобновить ролевой движок. Не принимает параметров.

### `GET /system/status`
Получить статус запуска/паузы движка.

---

## Агенты

### `GET /agents`
Список всех настроенных агентов.

**Параметры запроса:** `world` — необязательно, фильтр по конкретному миру

### `GET /agents/:id`
Получить конфигурацию одного агента.

**Параметры запроса:** `world` — необязательно, загрузка из конкретного мира

### `PUT /agents/:id`
Обновить конфигурацию агента (модель, температура, промпты и т.д.). Лимит: 30/мин/IP.

**Параметры запроса:** `world` — необязательно, сохранение в конкретный мир

### `PUT /agents/:id/prompts`
Обновить только промпты агента.

**Параметры запроса:** `world` — необязательно, сохранение в конкретный мир

### `POST /agents/:id/reset`
Сбросить агента к значениям по умолчанию.

### `GET /agents/providers/options`
Получить доступные варианты провайдеров/моделей для назначения агентам.

### `GET /agents/:id/prompts/:lang`
Получить промпты агента для конкретного языка.

### `PUT /agents/:id/prompts/:lang`
Обновить промпты агента для конкретного языка.

### `GET /agents/registry`
Список всех зарегистрированных агентов (AgentRegistry).

### `GET /agents/registry/stats`
Получить статистику реестра.

### `GET /agents/registry/:id`
Получить одного зарегистрированного агента.

### `PUT /agents/registry/:id`
Обновить зарегистрированного агента.

### `POST /agents/registry/:id/enable`
Включить агента.

### `POST /agents/registry/:id/disable`
Отключить агента.

### `DELETE /agents/registry/:id`
Удалить агента из реестра.

---

## Провайдеры и модели

### `GET /providers`
Список всех LLM-провайдеров.

### `POST /providers`
Добавить нового провайдера.

### `GET /providers/models`
Список всех моделей у провайдеров.

### `POST /providers/health`
Запустить проверку здоровья всех провайдеров.

### `POST /providers/assign`
Назначить провайдер+модель агенту.

**Запрос:** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `GET /providers/assignments`
Список всех назначений провайдер-агент.

### `GET /providers/agents`
Список агентов из менеджера провайдеров.

### `POST /providers/sync-from-agents`
Синхронизировать назначения из конфигурации агентов.

### `GET /providers/reset`
Сбросить менеджер провайдеров.

### `DELETE /providers/assign/:agentId`
Удалить назначение провайдера агенту.

### `GET /providers/:id`
Получить данные провайдера и доступные модели.

### `PUT /providers/:id`
Обновить конфигурацию провайдера.

### `DELETE /providers/:id`
Удалить провайдера.

### `POST /providers/:id/default`
Установить провайдера по умолчанию.

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
Обзор файловой системы в поисках файлов моделей.

---

## Настройки

### `GET /settings`
Получить текущие настройки (API-ключи замаскированы).

### `PUT /settings`
Обновить настройки. Пароли хешируются автоматически, замаскированные ключи игнорируются.

### `POST /settings/reset`
Сбросить к значениям по умолчанию.

### `GET /languages`
Список доступных языков интерфейса (EN, RU, DE, FR, ES, JA, ZH).

### `GET /llm-config`
Получить конфигурацию LLM-сервера.

### `PUT /llm-config`
Обновить конфигурацию LLM-сервера.

### `POST /server/restart`
Перезапустить LLM-серверы.

### `GET /server/status`
Проверить статус LLM-сервера.

---

## Запуск

### `POST /launch`
Создать новую игровую сессию с генерацией персонажа.

**Запрос:** `{ hints?: string, isekai?: boolean, starting_age?: number, name?: string }`

- `name` — явное имя персонажа (необязательно). Если указано, генерация имени LLM пропускается. Поддерживает нелатинские символы.

**Ответ:** `{ status: "success", session_id, character_name, opening_narrative, race, social_class, birthplace, initial_location }`

### `POST /continue`
Продолжить существующую сессию.

**Запрос:** `{ session_id: string }`

**Ответ:** `{ status: "success", session_id, character_name, restored: boolean }`

### `POST /snapshot`
Сохранить текущее состояние игры.

**Запрос:** `{ session_id?: string }`

---

## WebSocket

### `GET /ws/*`
WebSocket-эндпоинт для ролевой игры в реальном времени. Сервер принимает WebSocket-апгрейды на любом пути `/ws/*`. Контекст сессии определяется типом сообщения, а не URL.

**Клиент → Сервер:** `{ type: "message", content: string }` или `{ type: "setup", ... }`
**Сервер → Клиент:** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## Аутентификация

При включённой парольной аутентификации сессии используют HttpOnly-куки. Включайте `credentials: "include"` в вызовах fetch.

---

## Межмировое взаимодействие

### `GET /api/cross-world/status`
Получить статус межмировой коммуникации.

**Ответ:** `{ enabled: boolean, portals: number, eventLog: number }`

### `POST /api/cross-world/enable`
Включить межмировую коммуникацию.

**Ответ:** `{ enabled: true }`

### `POST /api/cross-world/disable`
Отключить межмировую коммуникацию.

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
Получить журнал межмировых событий.

**Ответ:** Массив `{ type, data, source, timestamp }`

---

## Плагины

### `GET /api/plugins`
Список всех зарегистрированных плагинов.

**Ответ:** Массив `{ id, name, version, description, agents, routes, hooks }`

### `GET /api/plugins/:id`
Получить детали плагина.

**Ответ:** Объект плагина с полными данными.

### `GET /api/plugins/:id/capabilities`
Получить возможности плагина (количество агентов, маршрутов, хуков).

**Ответ:** `{ agents: number, routes: number, hooks: number }`

### `GET /api/plugins/agents/all`
Получить всех агентов, зарегистрированных плагинами.

**Ответ:** Массив `{ id, name, description, config }`

### `GET /api/plugins/routes/all`
Получить все маршруты, зарегистрированные плагинами.

**Ответ:** Массив `{ path, method, handler }`

---

## Мониторинг

### `GET /monitoring/dashboard`
Агрегированные данные панели мониторинга.

### `GET /monitoring/stats`
Лёгкая статистика для опроса.

---

## I18n

### `GET /i18n/translations/:lang/:page`
Получить переводы для конкретного языка и страницы.

### `GET /i18n/translations/:lang`
Получить все переводы для языка.

### `PUT /i18n/translations`
Пакетное обновление/вставка переводов.

### `DELETE /i18n/translations/:lang/:page/:key`
Удалить ключ перевода.

---

## Хранилище мира

### `POST /world-store/migrate`
Миграция данных из JSON в SQLite.

### `GET /world-store/stats`
Статистика миграции.

### `GET /world-store/quests`
Получить квесты из SQLite.

### `GET /world-store/npc-memories/:uid`
Получить воспоминания NPC по UID сущности.

### `GET /world-store/frame`
Получить фрейм мира из SQLite.

---

## Wiki-исследования

### `POST /api/wiki/research/:worldId`
Запустить Wikipedia-исследование для мира.

### `GET /api/wiki/research/:worldId/progress`
SSE-поток прогресса текущего исследования.

### `POST /api/wiki/research/:worldId/pause`
Приостановить текущее исследование.

### `POST /api/wiki/research/:worldId/resume`
Возобновить приостановленное исследование.

### `GET /api/wiki/research/:worldId/status`
Получить статус исследования.

---

*Сгенерировано: 2026-07-31 | TrueNeverStory v0.33.0*
