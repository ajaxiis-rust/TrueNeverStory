# TrueNeverStory — Руководство разработчика

Техническая документация для контрибьюторов и разработчиков.

---

## Обзор архитектуры

TrueNeverStory — мультиагентный ИИ-движок ролевой игры. Игрок отправляет сообщения, которые обрабатываются пайплайном из 14 специализированных ИИ-агентов, каждый из которых отвечает за свой аспект нарратива (повествование, диалоги NPC, переходы между сценами, планирование сюжета и т.д.).

```
Ввод игрока
    ↓
RoleplayEngine.processInput()
    ↓
┌─────────────────────────────────┐
│  Детекция намерения             │
│  - Движение → SceneAgent       │
│  - Разговор с NPC → NPCAgent   │
│  - Упоминание @agent → Агент   │
│  - По умолчанию → NarratorAgent│
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│  Пайплайн агентов              │
│  1. Сбор контекста (память,     │
│     отношения, состояние мира)  │
│  2. Генерация промпта          │
│  3. Вызов LLM через очередь    │
│  4. Парсинг ответа             │
│  5. Обновление состояния мира  │
└─────────────┬───────────────────┘
              ↓
         Ответ-нарратив
```

---

## Технологический стек

| Уровень | Технология |
|---------|-----------|
| Рантайм | Bun (не Node.js) |
| Веб-фреймворк | Hono |
| База данных | SQLite через `bun:sqlite` (режим WAL) |
| Валидация | Zod |
| Логирование | Pino |
| LLM | OpenAI-совместимый API (через HTTP) |
| WebSocket | `@hono/node-ws` |
| Вычислительные ядра | C FFI (компиляция через Zig) + TS fallback |

---

## Структура проекта

```
src/
├── index.ts                    # Точка входа сервера (Bun.serve)
├── app.ts                      # Hono приложение — цепочка middleware + роуты
│
├── config/
│   ├── env.ts                  # Zod-валидация env (.env + process.env)
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # HTTP клиент для LLM с LRU кэшем
│   ├── llm-queue.ts            # Очередь параллельных запросов с pause/resume
│   ├── llm-types.ts            # Типы LLM
│   ├── sqlite-store.ts         # SQLite (FTS5 + векторы + промпты агентов + переводы)
│   ├── vector-ops.ts           # Косинус, L2, скалярное произведение
│   ├── mojo-ffi.ts             # FFI привязки (C/Mojo) + TS fallback
│   ├── session-store.ts        # SQLite хранилище сессий
│   ├── event-bus.ts            # Pub/sub система событий
│   ├── history-manager.ts      # Персистентность истории диалогов
│   ├── atomic-io.ts            # Безопасная запись JSON (атомарный rename)
│   └── providers/
│       ├── index.ts            # Реестр провайдеров
│       ├── llm-provider.ts     # Абстрактный интерфейс провайдера
│       ├── provider-manager.ts # Роутинг между провайдерами
│       ├── openai-provider.ts
│       ├── ollama-provider.ts
│       ├── anthropic-provider.ts
│       ├── google-provider.ts
│       └── llamacpp-provider.ts
│
├── middleware/
│   ├── auth.ts                 # Cookie-авторизация (PBKDF2, CSRF, rate limiting)
│   ├── rate-limiter.ts         # Token bucket по IP
│   ├── security-headers.ts     # CSP, X-Frame-Options и т.д.
│   ├── error-handler.ts        # Глобальный обработчик ошибок
│   └── logger.ts               # Логирование запросов
│
├── models/                     # Модели данных (22 файла)
│   ├── entity.ts               # Core entity (uid, name, профиль L1/L2/L3)
│   ├── chat.ts                 # ChatMessageSchema, SessionSetupSchema (Zod)
│   ├── director.ts             # DirectorTask, TaskPriority
│   ├── memory.ts               # MemoryEntry
│   ├── probability.ts          # ProbabilityProfile, Modifier
│   ├── romance.ts              # RomanceState
│   ├── story.ts                # StoryContext
│   ├── quest.ts                # Quest, Objective, Reward
│   ├── item.ts                 # Item, ItemBoost
│   ├── rank.ts                 # Феодальная иерархия (10 рангов)
│   ├── archetype.ts            # 34 архетипа NPC
│   ├── npc-state.ts            # Состояние NPC
│   └── npc-stats.ts            # NPCStats, Vices, FamilyExpenses
│
├── routes/                     # API роуты (18 модулей)
│   ├── index.ts                # Агрегатор — монтирует все модули под /api
│   ├── chat.ts                 # POST /chat/setup, /message, /stream (SSE), /agent
│   ├── entities.ts             # GET /entity/:uid, /neighbors, /path, /search, /graph/*
│   ├── agents.ts               # CRUD конфигов агентов + промпты по языкам
│   ├── i18n.ts                 # CRUD переводов (7 языков)
│   ├── settings.ts             # GET/PUT настроек, управление LLM сервером
│   ├── worlds.ts               # Multi-world CRUD, переключение, генерация глав
│   ├── memory.ts               # Эндпоинты памяти
│   ├── branches.ts             # Управление ветками сюжета
│   ├── probability.ts          # Запросы вероятностей
│   ├── romance.ts              # Эндпоинты романтики
│   ├── quests.ts               # Эндпоинты квестов
│   ├── sessions.ts             # История сессий
│   ├── maintenance.ts          # Обслуживание графа
│   ├── launch.ts               # Новая игра / продолжение
│   ├── health.ts               # Проверка работоспособности
│   ├── models.ts               # Каталог моделей
│   ├── providers.ts            # Управление LLM провайдерами
│   └── system.ts               # Пауза/возобновление фоновых процессов
│
├── services/                   # Бизнес-логика (52+ сервиса)
│   │
│   │  ── Ядро ──
│   ├── narrative-service.ts    # DI контейнер — создаёт ВСЕ сервисы
│   ├── roleplay-engine.ts      # Основной пайплайн обработки (processInput)
│   ├── story-engine.ts         # Генерация сюжетных событий
│   ├── director-loop.ts        # Фоновое развитие сюжета (setInterval)
│   ├── agent-coordinator.ts    # Приоритетная очередь задач режиссёра
│   │
│   │  ── Агенты (14) ──
│   ├── narrator-agent.ts       # Основной рассказчик
│   ├── director-agent.ts       # Инъекция сюжетных beatов
│   ├── scene-agent.ts          # Переходы между сценами
│   ├── npc-agent.ts            # Диалоги и реакции NPC
│   ├── crafter-agent.ts        # Предложения крафта
│   ├── researcher-agent.ts     # Проверка фактов, валидация реализма
│   ├── historian-agent.ts      # Исторические события
│   ├── cartographer-agent.ts   # География, расстояния
│   ├── merchant-agent.ts       # Торговля, ценообразование
│   ├── quest-giver-agent.ts    # Генерация квестов
│   ├── lorekeeper-agent.ts     # Факты мира, правила магии
│   ├── chronicler.ts           # Управление таймлайном
│   ├── villain-manager.ts      # Действия антагонистов
│   ├── social-simulator.ts     # Социальная динамика NPC
│   │
│   │  ── Системы мира ──
│   ├── story-planner.ts        # Планирование арок (LLM-driven)
│   ├── story-arc-manager.ts    # Жизненный цикл арок
│   ├── branch-manager.ts       # Ветки сюжета
│   ├── world-builder.ts        # Создание сущностей мира
│   ├── world-clock.ts          # Время в мире
│   ├── world-evolver.ts        # Авто-добавление NPC/локаций/предметов
│   ├── world-manager.ts        # CRUD миров
│   ├── world-validator.ts      # Валидация world_frame
│   ├── birth.ts                # Мастер создания персонажа
│   ├── start-resolver.ts       # Разрешение начала игры
│   │
│   │  ── Системы NPC ──
│   ├── npc-runtime.ts          # Управление состоянием NPC
│   ├── npc-generator.ts        # Умное создание NPC
│   ├── npc-economy.ts          # Ядро феодальной экономики
│   ├── npc-economy-runtime.ts  # Пошаговая симуляция
│   ├── slave-economy.ts        # Механика работорговли
│   ├── memory-engine.ts        # Эпизодическая память NPC
│   ├── memory-manager.ts       # Поиск и контекст памяти
│   ├── behavior-engine.ts      # Автономные действия NPC
│   ├── dialogue-manager.ts     # Сессии разговоров NPC
│   ├── dialogue-context.ts     # Обогащённые промпты NPC
│   ├── social-graph.ts         # Отношения, фракции, альянсы
│   │
│   │  ── Игровые механики ──
│   ├── probability-engine.ts   # Детерминированные исходы
│   ├── probability-profiles.ts # Определения профилей
│   ├── probability-expression.ts # Безопасный math evaluator (рекурсивный спуск)
│   ├── probability-resolver.ts # Разрешение контекста
│   ├── romance-engine.ts       # Романтические отношения
│   ├── romance-profiles.ts     # Определения романтических действий
│   ├── quest-system.ts         # Жизненный цикл квестов, цели, цепочки
│   ├── quest-manager.ts        # Персистентность квестов
│   ├── inventory-manager.ts    # Предметы, экипировка, торговля
│   ├── item-evaluation.ts      # Уникальность + бусты предметов
│   ├── navigator.ts            # Поиск пути в графе (BFS)
│   │
│   │  ── Инфраструктура ──
│   ├── agent-config.ts         # Конфиг агентов (SQLite-first + JSON fallback)
│   ├── prompt-builder.ts       # Конструирование промптов
│   ├── model-manager.ts        # Каталог моделей + загрузка
│   ├── settings.ts             # Персистентность настроек
│   └── websocket-manager.ts    # Пул WebSocket соединений
│
├── intelligence/               # Интеллект графа
│   ├── graph-analyzer.ts       # Статистика графа
│   ├── graph-validator.ts      # Self-healing ремонт графа
│   ├── duplicate-detector.ts   # Дедупликация сущностей
│   ├── recommender.ts          # Предложения отношений
│   ├── relationship-repairer.ts
│   ├── rule-checker.ts         # Проверка правил мира
│   ├── scene-generator.ts      # Описания сцен
│   ├── subgraph-expander.ts    # Расширение контекста
│   └── pipeline.ts             # Оркестрация пайплайна
│
├── memory/                     # Подсистема памяти
│   ├── world-memory.ts         # Основной класс памяти
│   ├── cognitive-pipeline.ts   # Извлечение → противоречия → pain signals
│   ├── entity-extractor.ts     # Извлечение сущностей из текста
│   ├── contradiction-detector.ts
│   ├── pain-signals.ts         # Детекция важных моментов
│   ├── scoring.ts              # Оценка важности памяти
│   ├── clustering.ts           # Кластеризация памяти
│   ├── partition.ts            # Разбиение памяти
│   ├── faiss-index.ts          # Векторный индекс
│   ├── embedding-queue.ts      # Асинхронная генерация эмбеддингов
│   ├── optimizer.ts            # Оптимизация памяти
│   └── write-buffer.ts         # Буфер пакетной записи
│
├── i18n/                       # Интернационализация (7 языков)
│   ├── types.ts                # Интерфейс LanguagePack
│   ├── index.ts                # Реестр, getLanguagePack(), setLanguage()
│   ├── en.ts                   # Английский (базовый)
│   ├── ru.ts                   # Русский
│   ├── de.ts                   # Немецкий
│   ├── fr.ts                   # Французский
│   ├── es.ts                   # Испанский
│   ├── ja.ts                   # Японский
│   └── zh.ts                   # Китайский
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — O(1) доступ + NameIndex
│
└── utils/
    ├── logger.ts               # Pino логгер
    ├── hash.ts                 # Утилиты SHA-256
    ├── time.ts                 # Форматирование времени
    ├── sanitize.ts             # Защита от prompt injection
    └── template-resolver.ts    # Разрешение {variable} в шаблонах агентов

mojo/
├── kernels/                    # C FFI вычислительные ядра
│   ├── c/
│   │   ├── probability_ffi.c   # Шанс успеха, бросок, батч
│   │   ├── vector_ffi.c        # 4-мерные векторные операции
│   │   ├── vector_full.c       # 768-мерный батч косинуса (BGE-M3)
│   │   ├── batch_ops.c         # Батч операций NPC (decay, vice, tax)
│   │   └── graph_ops.c         # Обход графа, RRF, репутация
│   ├── build.sh                # Кросс-компиляция через Zig
│   └── dist/                   # Скомпилированные .so/.dylib/.dll
└── src/                        # 81 Mojo исходный файл (опциональный perf backend)

public/                         # Фронтенд (статический HTML)
├── index.html                  # Основной UI чата/ролевой игры
├── agents.html                 # Конфиг агентов (i18n)
├── graph.html                  # Визуализация графа знаний (D3.js)
├── models.html                 # Управление моделями
├── providers.html              # Настройки LLM провайдеров
├── settings.html               # Глобальные настройки (i18n)
├── worlds.html                 # Управление мирами + мастер создания
└── static/
    ├── fonts/                  # Кастомные шрифты
    └── vendor/                 # d3.v7.min.js, purify.min.js

conf/                           # Конфигурация (gitignored)
├── settings.json               # Настройки приложения (LLM, auth, сервер)
├── agents.json                 # Глобальные назначения моделей агентам
├── providers.json              # Реестр провайдеров
└── llm-config.json             # Конфиг LLM провайдеров

worlds/                         # Данные миров (gitignored)
└── default/
    ├── tns.db                  # SQLite (сущности, эмбеддинги, память, промпты, переводы)
    ├── entities.json           # Граф сущностей (JSON)
    ├── world_frame.json        # Определение мира
    ├── session_history/        # Логи сессий
    ├── chapters/               # Сгенерированные литературные главы
    ├── npc_profiles/           # Файлы состояний NPC
    ├── timeline.jsonl          # Таймлайн событий
    ├── story_planner.json      # Состояние планировщика
    ├── villains.json           # Состояние злодеев
    └── world_clock.json        # Время в мире

worlds/_sessions/
    └── sessions.db             # SQLite хранилище сессий
```

---

## DI контейнер — NarrativeService

`NarrativeService` (`src/services/narrative-service.ts`) — центральный DI контейнер. Создаёт все 30+ сервисов и связывает их зависимости.

```
NarrativeService
├── entityStore (UnifiedEntityStore) — O(1) доступ к сущностям
├── graphStore (GraphStore) — граф смежности + поиск пути
├── eventBus (EventBus) — pub/sub события
├── historyMgr (HistoryManager) — персистентность диалогов
├── llm (LLMClient) — HTTP клиент для LLM API
├── llmQueue (LLMQueue) — очередь параллельных запросов (макс. 3)
├── sqliteStore (SQLiteStore) — FTS5 + векторы + промпты + переводы
├── chronicler (Chronicler) — writer timeline.jsonl
├── validator (WorldValidator) — валидация world_frame
├── questMgr (QuestManager) — персистентность квестов
├── clock (WorldClock) — время в мире
├── probEngine (ProbabilityEngine) — детерминированные исходы
├── probResolver (ProbabilityContextResolver) — контекст для вероятностей
├── storyPlanner (StoryPlanner) — планирование арок (LLM)
├── villainManager (VillainManager) — действия антагонистов
├── socialSim (SocialSimulator) — социальная динамика NPC
├── npcRuntime (NPCRuntime) — управление состоянием NPC
├── storyEngine (StoryEngine) — генерация сюжетных событий
├── director (DirectorLoop) — фоновое развитие сюжета
├── worldBuilder (WorldBuilder) — создание сущностей
├── agentCoordinator (AgentCoordinator) — приоритетная очередь задач
├── storyArcManager (StoryArcManager) — жизненный цикл арок
├── userAgent (UserAgent) — группа + бой
├── npcGenerator (NPCGenerator) — умное создание NPC
├── worldEvolver (WorldEvolver) — авто-расширение мира
└── graphValidator (GraphValidator) — self-healing граф
```

**Жизненный цикл:**
1. `new NarrativeService({dbPath, worldFrame})` — конструктор связывает всё
2. `start()` — запуск LLM очереди, синхронизация сущностей в SQLite, старт director loop
3. `stop()` — остановка director + LLM очереди
4. `pause()` / `resume()` — когда пользователь уходит из чата
5. `reset(newDbPath, worldFrame)` — горячая замена на другой мир
6. `shutdown()` — корректное завершение

---

## Жизненный цикл запроса

### REST API (POST /api/chat/message)

```
1. Цепочка middleware Hono:
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. Обработчик роута (chat.ts):
   - Валидация Zod (ChatMessageSchema)
   - sanitizeInput() — удаление паттернов prompt injection
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput():
   - Детекция намерения: движение, разговор, @agent, или общее
   - Маршрутизация к нужному агенту
   - Сбор контекста (память, отношения, состояние мира)
   - Генерация промпта через PromptBuilder или userTemplate
   - Вызов LLM через llmQueue
   - Парсинг ответа
   - Обновление состояния мира (chronicler, entity store)
   - Возврат строки нарратива

4. Ответ: JSON { narrative, location, story_time, ... }
```

### SSE стриминг (POST /api/chat/stream)

То же, что REST, но оборачивает `engine.processInputStream()` в `ReadableStream` с keepalive пингами.

### WebSocket (ws://host/ws/...)

```
1. Upgrade: проверка session cookie (bring_session)
2. При сообщении: JSON parse → маршрутизация в engine
3. При ответе: JSON stringify → ws.send()
```

---

## Система агентов

Каждый агент — класс с методом `generateResponse()`, который:
1. Получает объект контекста (сообщение, локация, персонаж, правила и т.д.)
2. Строит промпт (system + user template + output format)
3. Вызывает LLM через очередь
4. Возвращает структурированный ответ

### Приоритет агентов (больше = обрабатывается первым)

| Приоритет | Агент |
|-----------|-------|
| 10 | Narrator |
| 9 | NPC |
| 8 | Director |
| 7 | Scene, Quest Giver |
| 6 | Story Planner, Villain, Historian, Lorekeeper |
| 5 | Chronicler, Merchant |
| 4 | Social Sim, Cartographer |
| 3 | Researcher |

### Разрешение промптов

Промпты агентов разрешаются в этом порядке:
1. SQLite таблица `agent_prompts` (по миру + языку)
2. JSON fallback (`worlds/{world}/agents/{agentId}.json`)
3. Захардкоженные дефолты (`DEFAULT_PROMPTS` в `agent-config.ts`)

Шаблоны используют плейсхолдеры `{variable}`, разрешаемые `resolveTemplate()`.

---

## Слой данных

### EntityStore (JSON)

- `entities.json` — граф смежности всех сущностей
- O(1) доступ по UID через `Map<string, EntityNode>`
- O(1) поиск по имени через `NameIndex` (регистронезависимый)
- Отслеживание мутаций через `onMutation()` → синхронизация в SQLite

### SQLiteStore

Таблицы:
- `entities` — FTS5 полнотекстовый поиск
- `embeddings` — векторные блоби (BGE-M3, 1024-мерные)
- `memories` — воспоминания с FTS5
- `agent_prompts` — хранение промптов по миру + языку
- `ui_translations` — UI строки по языку + странице

Гибридный поиск: FTS5 ключевые слова + плотные векторы + Reciprocal Rank Fusion.

### FFI ядра

5 C ядер, компилируемых через Zig:

| Ядро | Функции | Fallback |
|------|---------|----------|
| `probability_ffi` | success_chance, roll, batch | Чистый TS |
| `vector_ffi` | cosine_4d, l2_4d, dot_4d | Чистый TS |
| `vector_full` | batch_cosine_768d | Чистый TS |
| `batch_ops` | age_decay, vice_decay, tax, loyalty | Чистый TS |
| `graph_ops` | rrf_fusion, reputation | Чистый TS |

Детекция: `dlopen()` в `mojo-ffi.ts`, fallback при ошибке.

---

## Конфигурация

### Переменные окружения (.env)

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `WORLD_LLM_BASE_URL` | – | OpenAI-совместимый endpoint |
| `WORLD_LLM_API_KEY` | – | API ключ |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Имя модели |
| `WORLD_LLM_TIMEOUT` | `300` | Таймаут запроса (секунды) |
| `WORLD_LLM_MAX_TOKENS` | `4096` | Макс. токенов за ответ |
| `WORLD_LLM_TEMPERATURE` | `0.7` | Температура сэмплирования |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | Макс. параллельных LLM запросов |
| `WORLD_DB_PATH` | `./world_db` | Директория БД (legacy) |
| `WORLDS_ROOT` | `./worlds` | Корневая директория миров |
| `WORLD_SERVER_HOST` | `127.0.0.1` | Адрес прослушивания |
| `WORLD_SERVER_PORT` | `8000` | Порт прослушивания |
| `AUTH_PASSWORD` | – | Пароль (пусто = без auth) |
| `AUTH_PASSWORD_HASH` | – | PBKDF2 хеш (salt:hash) |

### Настройки (conf/settings.json)

Загружается через `loadSettings()`. Приоритет: settings.json > .env > дефолты.

Содержит: LLM параметры, конфиг эмбеддингов, настройки сервера, пароль auth, настройки памяти, удача вероятностей, выбор мира, язык.

---

## Цепочка middleware

Порядок важен — применяется в `app.ts`:

```
1. errorHandler     — глобальный обработчик ошибок
2. requestLogger    — Pino логирование запросов
3. rateLimiter      — 100 req/min по IP
4. securityHeaders  — CSP, X-Frame-Options и т.д.
5. CORS             — origins localhost:8000
6. authMiddleware   — валидация session cookie (защищает /api/*, /ws/*)
```

---

## Тестирование

```bash
bun test                                    # Все тесты
bun test tests/entity-store.test.ts         # Тесты хранилища сущностей
bun test tests/probability-engine.test.ts   # Тесты движка вероятностей
bun test tests/integration/server.test.ts   # Интеграционные (нужен запущенный сервер)
```

Тесты используют конвенцию `*.test.ts` рядом с исходными файлами.

---

## Добавление нового агента

1. Создать `src/services/my-agent.ts`:
```typescript
export class MyAgent {
  constructor(deps: { llmQueue: LLMQueue; entityStore: UnifiedEntityStore }) {}
  
  async generateResponse(ctx: AgentContext): Promise<string> {
    const prompt = buildPrompt(ctx);
    return await this.deps.llmQueue.enqueue({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4o-mini",
    });
  }
}
```

2. Зарегистрировать в `roleplay-engine.ts` (конструктор)
3. Добавить логику маршрутизации в `processInput()`
4. Добавить системный промпт в `agent-config.ts` или SQLite таблицу `agent_prompts`

---

## Добавление нового роута

1. Создать `src/routes/my-route.ts`:
```typescript
import { Hono } from "hono";
const myRoute = new Hono();
myRoute.get("/my-endpoint", async (c) => c.json({ ok: true }));
export { myRoute as myRouteRouter };
```

2. Монтировать в `src/routes/index.ts`:
```typescript
import { myRouteRouter } from "./my-route";
routes.route("/", myRouteRouter);
```

---

## Управление мирами

Несколько изолированных миров под `worlds/`:

```
worlds/
├── default/           # Активный мир
│   ├── tns.db         # SQLite база
│   ├── entities.json  # Граф сущностей
│   └── ...
├── levant/            # Другой мир
└── _sessions/         # Глобальное хранилище сессий
```

Переключение: `POST /api/worlds/:name/switch`. Горячая замена DI контейнера.

---

## Ключевые паттерны

- **Dual-write**: Записи настроек идут в SQLite и JSON (обратная совместимость)
- **Разрешение шаблонов**: Промпты агентов используют `{variable}` плейсхолдеры
- **Безопасный eval**: Формулы вероятностей — рекурсивный спуск (без eval)
- **Защита от prompt injection**: `sanitizeInput()` удаляет паттерны перед LLM
- **Атомарная запись JSON**: `atomicWriteJson()` через temp file + rename
- **Событийная архитектура**: `EventBus` декаплирует сервисы (создание сущностей, события памяти)
