# TrueNeverStory — Документ архитектуры

> Анализ архитектуры на основе Domain-Driven Design для нарративного RPG-движка TrueNeverStory.
> Сгенерировано на основе анализа кодовой базы `src/` по состоянию на 2026-07-05.

---

## [A1] Архитектурный паттерн

**Слоёная архитектура «луковицы» с расширениями на основе событий**

TrueNeverStory в своём ядре следует паттерну **слоёной архитектуры «луковицы» (гексагональной архитектуры)**, обёрнутой **оркестрационным слоем на основе событий** для асинхронной нарративной обработки. Этот паттерн подходит по следующим причинам:

1. **Доменные модели изолированы** — `src/models/` содержит чистые структуры данных без зависимостей от инфраструктуры. `EntityNode`, `Quest`, `StoryContext`, `NPCProfile`, `ProbabilityModifier` — все они не зависят от фреймворков.
2. **Сервисы оркестрируют доменную логику** — `src/services/` содержит прикладные сервисы (`RoleplayEngine`, `StoryEngine`) и доменные сервисы (`ProbabilityEngine`, `SocialSimulator`, `RomanceEngine`).
3. **Инфраструктура вынесена на периферию** — `src/lib/` хранит персистентность (`SQLiteStore`, `AtomicIO`), внешние интеграции (`LLMClient`, `ProviderManager`) и транспорт (`WebSocketManager`).
4. **Маршруты — тонкие адаптеры** — `src/routes/` сопоставляет HTTP с вызовами сервисов с минимальной логикой.

**Шина событий** (`EventBus` в `src/lib/event-bus.ts`) добавляет слой асинхронной декомпозиции между ограниченными контекстами, позволяя Director Loop оркестрировать нарративные события без прямой связанности с подсистемами NPC, социальных взаимодействий или квестов.

```
┌─────────────────────────────────────────────────┐
│                   Маршруты (HTTP/WS)              │  ← Слой адаптеров
├─────────────────────────────────────────────────┤
│              Прикладные сервисы                   │  ← Варианты использования
│  RoleplayEngine │ NarrativeService │ StoryEngine │
├─────────────────────────────────────────────────┤
│               Доменные сервисы                    │  ← Доменная логика
│  ProbabilityEngine │ SocialSimulator │ NPCRuntime │
├─────────────────────────────────────────────────┤
│               Доменные модели                     │  ← Ядро сущностей
│  EntityNode │ Quest │ NPCProfile │ StoryArc      │
├─────────────────────────────────────────────────┤
│              Инфраструктура                       │  ← Персистентность/внешние
│  SQLiteStore │ LLMClient │ EventBus │ AtomicIO   │
└─────────────────────────────────────────────────┘
```

---

## [A2] Ограниченные контексты

### BC1: Управление миром

**Назначение:** Жизненный цикл мульти-мира — создание, конфигурация, переключение и персистентность состояния мира.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `World`, `WorldFrame` |
| **Ключевые сущности** | `EntityNode` (Персонаж, Фракция, Локация, Предмет, Событие, Раса, Мировое правило) |
| **Значимые объекты** | `WorldCreateParams`, `WorldSummary`, `LayeredProfile` (слои L1/L2/L3) |
| **Доменные события** | `WORLD_CREATED`, `WORLD_FRAME_LOADED`, `WORLD_EVOLVED` |
| **Персистентность** | `worlds/{name}/world_frame.json`, `worlds/{name}/entities.json` |

**Ключевые файлы:**
- `src/services/world-manager.ts` — CRUD-операции, переключение миров
- `src/services/world-builder.ts` — Слоёная постройка мира на основе LLM
- `src/services/world-validator.ts` — Проверки целостности
- `src/services/world-evolver.ts` — Добавление NPC/локаций/предметов со временем
- `src/routes/worlds.ts` — HTTP-адаптер

**Доменные правила:**
- Названия миров приводятся к slug-формату и должны быть уникальными
- Каждый мир имеет изолированную директорию данных под `worlds/`
- `WorldFrame` определяет каноническую структуру (календарь, магическая система, расы, фракции, локации, предметы, исторические события, мировые правила)
- Профили сущностей используют трёхуровневую систему: L1 (идентичность), L2 (динамическое состояние), L3 (скрытое/тайное)

---

### BC2: Сущности и граф

**Назначение:** Представление сущностей мира и их связей в графе в памяти. Обеспечивает поиск за O(1) и обход графа.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `GraphStore` (корневой агрегат графа мира) |
| **Ключевые сущности** | `EntityNode`, `GraphEdge` |
| **Значимые объекты** | `Relationship`, `LayeredProfile`, `GraphSummary` |
| **Доменные события** | `ENTITY_ADDED`, `ENTITY_UPDATED`, `ENTITY_REMOVED`, `RELATIONSHIP_ADDED`, `RELATIONSHIP_BROKEN`, `GRAPH_CHANGED` |
| **Персистентность** | `worlds/{name}/entities.json` (через `UnifiedEntityStore`), `worlds/{name}/branches.json` |

**Ключевые файлы:**
- `src/store/entity-store.ts` — `UnifiedEntityStore` с `NameIndex` для разрешения имён за O(1)
- `src/services/graph-store.ts` — Граф на основе карты смежности с прямыми/обратными рёбрами
- `src/services/branch-manager.ts` — Ветвление в стиле Git для нарративных графов
- `src/intelligence/` — Анализ графа, валидация, восстановление связей

**Доменные правила:**
- Сущности имеют уникальный `uid` и разрешаются по имени, токену или типовому префиксу
- `NameIndex` поддерживает нечёткое разрешение (без учёта регистра, на основе токенов, без типового префикса)
- `BranchManager` поддерживает ветвление родитель→потомок с добавлениями/удалениями на каждой ветке
- Рёбра графа двунаправленные (прямые + обратные карты)

---

### BC3: Нарратив и история

**Назначение:** Генерация основного нарратива — рассказчик, переходы между сценами, сюжетные узлы и драматургическая оркестрация.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `StoryContext`, `StoryArc`, `DirectorTask`, `ChapterData`, `BeatData` |
| **Ключевые сущности** | `StoryBeat`, `ArcPhase`, `ArcTimelineEvent` |
| **Значимые объекты** | `NarratorOutput`, `NPCDialogue`, `SceneTransition` |
| **Доменные события** | `STORY_EVENT`, `STORY_BEAT`, `VILLAIN_PROGRESS` |
| **Персистентность** | `worlds/{name}/director_state.json`, `worlds/{name}/story_arcs.json`, `worlds/{name}/planner_state.json` |

**Ключевые файлы:**
- `src/services/narrative-service.ts` — **Корень композиции** / DI-контейнер для всех нарративных сервисов
- `src/services/roleplay-engine.ts` — Основная обработка ролевой игры, диспетчеризация агентов
- `src/services/narrator-agent.ts` — Генерация нарратива на основе LLM
- `src/services/scene-agent.ts` — Нарративы переходов между сценами
- `src/services/director-agent.ts` — Инъекция сюжетных узлов в нарратив
- `src/services/director-loop.ts` — Фоновая оркестрация (часы→социальная→злодей→шанс→узлы)
- `src/services/story-engine.ts` — Генерация событий из сюжетных узлов + применение эффектов
- `src/services/story-planner.ts` — Планирование глав/узлов на основе LLM
- `src/services/story-arc-manager.ts` — CRUD для сюжетных арок с фазами
- `src/models/story.ts` — `StoryContext`, `NarratorOutput`, `NPCDialogue`, `SceneTransition`
- `src/models/director.ts` — `DirectorTask`, `StoryArc`, `StoryBeat`, `TaskPriority`

**Доменные правила:**
- `DirectorLoop` работает с настраиваемым интервалом тиков (по умолчанию 30 минут)
- Основные сюжетные узлы имеют кулдаун (по умолчанию 6 часов)
- `StoryPlanner` использует двухфазное планирование: контур главы → генерация узлов
- Перечисление `TaskPriority` управляет порядком очереди LLM (CRITICAL > HIGH > NORMAL > LOW)
- Промпты агентов сначала ищутся в SQLite, затем откатываются к JSON, затем к встроенным значениям по умолчанию

---

### BC4: NPC и диалоги

**Назначение:** Управление состоянием неигровых персонажей, эпизодическая память, сессии диалогов и генерация NPC.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `NPCProfile` (корневой агрегат для каждого NPC) |
| **Ключевые сущности** | `EpisodicMemory`, `DialogueSession`, `DialogueMessage` |
| **Значимые объекты** | `NPCSkills`, `NPCDialogue`, `DialogueChoice`, `GreetingTemplate` |
| **Доменные события** | `ENTITY_ADDED` (для сгенерированных NPC), `MEMORY_ADDED`, `MEMORY_CONSOLIDATED` |
| **Персистентность** | `worlds/{name}/npc_profiles.json`, `worlds/{name}/npc_profiles/{name}.json` |

**Ключевые файлы:**
- `src/services/npc-runtime.ts` — `NPCRuntime`: хранилище состояния с краткосрочной/долгосрочной памятью
- `src/services/npc-generator.ts` — Генерация NPC на основе LLM
- `src/services/npc-agent.ts` — Генерация диалогов NPC
- `src/services/npc-economy.ts` — Богатство NPC, налоги, казна, производство еды
- `src/services/dialogue-manager.ts` — Сессии бесед, темы, варианты выбора
- `src/services/dialogue-context.ts` — Контекстуальное состояние диалога
- `src/models/npc-state.ts` — `NPCProfile`, `EpisodicMemory`, `NPCSkills`

**Доменные правила:**
- Профили NPC имеют краткосрочную память (ограничена 20 записями) и долгосрочную эпизодическую память
- Консолидация памяти происходит при превышении краткосрочной памятью порога `_importanceThreshold` (0.4)
- NPC синхронизируются из хранилища сущностей при запуске — отсутствующие профили создаются автоматически
- Сессии диалогов отслеживают конечный автомат: `greeting → active → farewell → idle`
- Перечисление `TopicCategory` ограничивает допустимые темы разговора

---

### BC5: Социальные связи и отношения

**Назначение:** Взаимоотношения между персонажами, динамика фракций, альянсы, феодальные иерархии и романтические отношения.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `SocialGraph` (корневой агрегат для всего социального состояния) |
| **Ключевые сущности** | `Relationship`, `Faction`, `Alliance`, `FeudalRelationship` |
| **Значимые объекты** | `FactionSummary`, `FeudalSummary`, `RomanceStatus`, `RomanceProgression` |
| **Доменные события** | `RELATIONSHIP_ADDED`, `RELATIONSHIP_REPAIRED`, `RELATIONSHIP_BROKEN` |
| **Персистентность** | Директория `worlds/{name}/social/` (JSON-файлы для каждой подсистемы) |

**Ключевые файлы:**
- `src/services/social-graph.ts` — `SocialGraph`: отношения, фракции, альянсы, феодальная система
- `src/services/social-simulator.ts` — Выбор пар, генерация взаимодействий
- `src/services/romance-engine.ts` — Прогрессия романтических отношений
- `src/services/romance-profiles.ts` — Профили вероятностей для романтических событий
- `src/models/romance.ts` — `RelationshipMemory`, `RomanceStatus`, `RomanceProgression`

**Доменные правила:**
- `SocialSimulator` выбирает пары на основе близости локации и принадлежности к фракции
- Типы взаимодействий взвешиваются по контексту: одна локация vs одна фракция vs разные фракции
- Романтика использует `ProbabilityEngine` для детерминированного разрешения исходов
- Феодальные отношения отслеживают лояльность, налоговые взносы, военные обязательства
- Альянсы могут быть преданы; предательство имеет последствия

---

### BC6: Квесты

**Назначение:** Управление жизненным циклом квестов — генерация, цели, награды, цепочки и интеграция с диалогами.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `Quest`, `QuestDefinition` |
| **Ключевые сущности** | `QuestObjective`, `QuestObjectiveDef` |
| **Значимые объекты** | `QuestReward`, `QuestPrerequisite` |
| **Доменные события** | `QUEST_ADDED`, `QUEST_UPDATED` |
| **Персистентность** | `worlds/{name}/quests.json` |

**Ключевые файлы:**
- `src/services/quest-manager.ts` — Базовый CRUD квестов
- `src/services/quest-system.ts` — Полный жизненный цикл с цепочками, предусловиями, временными ограничениями
- `src/services/quest-giver-agent.ts` — Контекстная генерация квестов на основе LLM
- `src/models/quest.ts` — `Quest`, `QuestObjective`, `QuestData`

**Доменные правила:**
- Типы квестов: `main`, `side`, `daily`, `faction`, `chain`
- Состояния квестов: `available → active → completed | failed | abandoned`
- `QuestSystem` проверяет предусловия (минимальный уровень, фракция, завершённые квесты, отношения)
- `Quest.progress` — вычисляемое значение (завершённые цели / общее количество целей)
- Квесты-цепочки связываются через поле `chainNext`

---

### BC7: Память и знания

**Назначение:** Мировая память, память агентов, семантический поиск, поиск на основе эмбеддингов и управление жизненным циклом памяти.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `WorldMemory` (корневой агрегат), `AgentMemoryStore` (для каждого агента) |
| **Ключевые сущности** | `WorldMemoryEntry`, `AgentMemoryEntry` |
| **Значимые объекты** | `MemoryConfig`, `ScoringWeights`, `MemoryMetadata`, `RankedItem` |
| **Доменные события** | `MEMORY_ADDED`, `MEMORY_CONSOLIDATED`, `MEMORY_FORGOTTEN` |
| **Персистентность** | `tns.db` (SQLite), `worlds/{name}/memory/` (разделы), индекс FAISS |

**Ключевые файлы:**
- `src/memory/world-memory.ts` — `WorldMemory`: оценка, разделение, эмбеддинги, кластеризация
- `src/lib/agent-memory-store.ts` — `AgentMemoryStore`: RAG для каждого агента с гибридным поиском
- `src/lib/sqlite-store.ts` — `SQLiteStore`: FTS5 + векторный поиск + RRF-слияние
- `src/lib/vector-ops.ts` — Косинусное сходство, L2-расстояние, скалярное произведение
- `src/services/memory-engine.ts` — `MemoryEngine`: семантический поиск по эпизодической памяти NPC
- `src/services/memory-manager.ts` — `MemoryManager`: история разговоров
- `src/memory/` — Оценка, кластеризация, буфер записи, очередь эмбеддингов, когнитивный конвейер

**Доменные правила:**
- Оценка памяти использует взвешенную формулу: важность (0.35) + свежесть (0.25) + доступ (0.15) + эмоция (0.10) + релевантность (0.15)
- Записи памяти с оценкой ниже `minKeepScore` (0.15) и старше `minKeepDays` (30) удаляются
- Память агентов изолирована по столбцу `role` (ID агента) в SQLite
- Гибридный поиск: FTS5 по ключевым словам + плотные векторы → Reciprocal Rank Fusion (RRF)
- Индекс FAISS пересоздаётся при превышении порога фрагментации (200 новых записей)
- Буфер записи пакетирует генерацию эмбеддингов для эффективности

---

### BC8: Интеграция с LLM

**Назначение:** Управление LLM多位 провайдерами, постановка запросов в очередь, ограничение частоты, назначение моделей для каждого агента и построение промптов.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `ProviderManager` (синглтон), `LLMQueue` |
| **Ключевые сущности** | `AgentModelAssignment`, `LLMProvider` |
| **Значимые объекты** | `AgentConfig`, `AgentPromptConfig`, `LLMClientOptions` |
| **Доменные события** | Нет (инфраструктурный слой) |
| **Персистентность** | `conf/providers.json`, `conf/agents.json`, `tns.db` (таблица agent_prompts) |

**Ключевые файлы:**
- `src/lib/llm-client.ts` — `LLMClient`: LRU-кэш для каждого агента, диспетчеризация по провайдерам
- `src/lib/llm-queue.ts` — `LLMQueue`: очередь приоритетов, управление конкурентностью, ограничение частоты
- `src/lib/providers/provider-manager.ts` — `ProviderManager`:多位 провайдеры,多位 ключи
- `src/lib/providers/` — Провайдеры OpenAI, Anthropic, Google, Ollama, LlamaCpp
- `src/services/agent-config.ts` — Конфигурация агентов (глобальные +world-specific промпты)
- `src/services/prompt-builder.ts` — Статические шаблоны промптов для всех агентов
- `src/services/model-manager.ts` — Управление моделями

**Доменные правила:**
- `LLMQueue` обеспечивает максимальную конкурентность (по умолчанию 3) и размер очереди (по умолчанию 50)
- Вытеснение по приоритету: задачи с наименьшим приоритетом удаляются при заполнении очереди
- Ограничение частоты через `RateLimiter` (на основе RPM с автоматическим пополнением)
- Каждый агент может иметь своего провайдера, модель, температуру и максимальное количество токенов
- Разрешение промптов: SQLite (`agent_prompts`) → откат к JSON → встроенные значения по умолчанию
- `LLMClient` использует LRU-кэш (256 записей, TTL 5 минут) для повторных запросов

---

### BC9: Вероятности и бой

**Назначение:** Детерминированные вероятностные расчёты для всех игровых механик — бой, социальные действия, крафт, романтика.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `ProbabilityEngine` |
| **Ключевые сущности** | `ProbabilityModifier`, `ProbabilityProfile` |
| **Значимые объекты** | `ProbabilityParameter`, `ProbabilityResult`, `OutcomeQuality` |
| **Доменные события** | Нет (чистые вычисления) |
| **Персистентность** | Нет (в памяти, вычисляется из состояния NPC) |

**Ключевые файлы:**
- `src/services/probability-engine.ts` — Основные вероятностные расчёты
- `src/services/probability-resolver.ts` — Разрешение контекста (локация, отношения, состояние мира)
- `src/services/probability-expression.ts` — Парсер выражений для динамических модификаторов
- `src/services/probability-profiles.ts` — Предопределённые профили вероятностей
- `src/models/probability.ts` — `ProbabilityModifier`, `ProbabilityProfile`, `OutcomeQuality`

**Доменные правила:**
- Модификаторы имеют типы: `ADD`, `MULTIPLY`, `REPLACE`
- Правила наложения: `STACK`, `TAKE_HIGHEST`, `TAKE_LOWEST`, `OVERRIDE`
- Модификаторы могут истекать (по времени)
- `OutcomeQuality` варьируется от `CRITICAL_FAILURE` до `CRITICAL_SUCCESS`
- Разрешатель контекста вводит динамические модификаторы на основе локации, отношений, состояния мира
- Mojo FFI-ядра (`probability_ffi.mojo`) ускоряют пакетные расчёты

---

### BC10: Управление злодеем

**Назначение:** Управление жизненным циклом антагониста с стратегическим планированием на основе LLM и фазами конечного автомата.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `VillainAgendaData` |
| **Ключевые сущности** | `VillainMemoryData` |
| **Значимые объекты** | Фаза (`plotting → preparing → executing → climax`) |
| **Доменные события** | `VILLAIN_PROGRESS` |
| **Персистентность** | `worlds/{name}/villain_state.json` |

**Ключевые файлы:**
- `src/services/villain-manager.ts` — `VillainManager`: переходы фаз, стратегическое планирование

**Доменные правила:**
- Злодей следует четырёхфазному конечному автомату: `plotting → preparing → executing → climax`
- Каждый переход фазы требует выполнения набора действий
- LLM генерирует действия злодея с учётом контекста (саботаж, слухи, шпионаж и т.д.)
- Действия злодея имеют последствия успеха/провала, влияющие на состояние мира
- Миньоны могут быть назначены для выполнения планов злодея

---

### BC11: Интеллект и анализ

**Назначение:** Анализ графа, валидация, дедупликация и движок рекомендаций.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | Нет (сервисный слой) |
| **Ключевые сущности** | Нет |
| **Значимые объекты** | Результаты валидации, рекомендации |
| **Доменные события** | Нет |
| **Персистентность** | Чтение из хранилища сущностей, запись результатов валидации |

**Ключевые файлы:**
- `src/intelligence/graph-analyzer.ts` — Метрики графа, центральность, кластеры
- `src/intelligence/graph-validator.ts` — Проверки целостности
- `src/intelligence/duplicate-detector.ts` — Дедупликация сущностей
- `src/intelligence/relationship-repairer.ts` — Восстановление повреждённых связей
- `src/intelligence/recommender.ts` — Рекомендации контента
- `src/intelligence/scene-generator.ts` — Процедурная генерация сцен
- `src/intelligence/rule-checker.ts` — Проверка мировых правил
- `src/intelligence/subgraph-expander.ts` — Расширение подграфа

---

## [A3] Агрегаты и сущности

### BC1: Управление миром

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `World` | Корневой агрегат | Должен иметь уникальное slug- название; должен иметь валидный `WorldFrame` |
| `WorldFrame` | Значимый объект | Должен определять `world_name`; `world_rules` должен быть непустым для валидных миров |
| `LayeredProfile` | Значимый объект | L1 должен иметь `name` и `type`; слои — L1/L2/L3 |
| `EntityNode` | Сущность | Должен иметь уникальный `uid`; `entityType` должен быть валидным `EntityTypeValue` |
| `EntityType` | Значимый объект (перечисление) | `CHARACTER`, `FACTION`, `LOCATION`, `ITEM`, `EVENT`, `WORLD_RULE`, `RACE`, `UNKNOWN` |

### BC2: Сущности и граф

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `GraphStore` | Корневой агрегат | Должен быть инициализирован перед обходом; рёбра ссылаются на валидные UID |
| `GraphEdge` | Сущность | `source` и `target` должны быть валидными UID сущностей |
| `Relationship` | Значимый объект | `sourceUid` и `targetUid` должны существовать; `strength` — от 0 до 1 |
| `BranchManager` | Сущность | Имена веток должны быть уникальными; родитель должен существовать |

### BC3: Нарратив и история

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `StoryContext` | Значимый объект | Должен иметь `worldName`, `currentTime`, `location` |
| `StoryArc` | Корневой агрегат | Должен иметь уникальный `id`; массив `beats` упорядочен по времени |
| `DirectorTask` | Сущность | Должен иметь уникальный `id`; `priority` в диапазоне `TaskPriority` |
| `BeatData` | Сущность | Должен принадлежать валидному `chapter_id`; `triggered` — логическое значение |
| `ChapterData` | Значимый объект | Должен иметь уникальный `id`; массив `beats` не null |

### BC4: NPC и диалоги

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `NPCProfile` | Корневой агрегат (для каждого NPC) | Должен иметь уникальные `name` и `uid`; `health` — от 0 до 100; значения `skills` — от 0 до 1 |
| `EpisodicMemory` | Сущность | Должен иметь уникальный `id`; `importance` — от 0 до 1; `emotion` — непустое |
| `DialogueSession` | Сущность | Должен иметь уникальный `id`; `state` в допустимом диапазоне перечисления |
| `NPCSkills` | Значимый объект | Все значения навыков должны быть от 0 до 1 |
| `DialogueMessage` | Значимый объект | `role` должен быть `player` или `npc` |

### BC5: Социальные связи и отношения

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `SocialGraph` | Корневой агрегат | Должен иметь валидный путь хранилища; отношения ссылаются на валидные сущности |
| `Relationship` | Сущность | `type` в допустимом перечислении; `strength` — от 0 до 1; `source` ≠ `target` |
| `Faction` | Значимый объект | Должен иметь уникальное `name`; участники уникальны |
| `Alliance` | Значимый объект | `faction1` ≠ `faction2`; `strength` — от 0 до 1 |
| `FeudalRelationship` | Значимый объект | `vassal` ≠ `liege`; `loyalty` — от 0 до 1 |

### BC6: Квесты

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `Quest` | Корневой агрегат | Должен иметь уникальный `id`; `status` в допустимом перечислении; `progress` вычисляется |
| `QuestDefinition` | Корневой агрегат | Должен иметь уникальный `id`; `objectives` — непустой |
| `QuestObjective` | Сущность | `completed` — логическое значение |
| `QuestReward` | Значимый объект | `gold`, `experience` ≥ 0 |
| `QuestPrerequisite` | Значимый объект | Должно быть задано хотя бы одно предусловие |

### BC7: Память и знания

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `WorldMemory` | Корневой агрегат | Должен иметь валидный путь хранилища; записи оцениваются взвешенной формулой |
| `WorldMemoryEntry` | Сущность | Должен иметь уникальный `id`; `importance` — от 0 до 1; `content` — непустое |
| `AgentMemoryStore` | Корневой агрегат | Изолирован по `agentId`; использует гибридный FTS5 + векторный поиск |
| `MemoryConfig` | Значимый объект | Все веса ≥ 0; `halfLifeDays` > 0 |
| `ScoringWeights` | Значимый объект | Веса суммируются до 1.0 |

---

## [A4] Доменные сервисы

Сервисы общего назначения, которые не принадлежат одному агрегату:

| Сервис | Файл | Назначение |
|--------|------|------------|
| `NarrativeService` | `src/services/narrative-service.ts` | **Корень композиции** — создаёт и связывает все нарративные подсистемы |
| `RoleplayEngine` | `src/services/roleplay-engine.ts` | Точка входа для ввода игрока → диспетчеризация агентов |
| `StoryEngine` | `src/services/story-engine.ts` | Генерация событий из узлов + применение эффектов (перемещения NPC, изменения отношений, создание квестов) |
| `DirectorLoop` | `src/services/director-loop.ts` | Фоновая оркестрация: тик часов → социальная симуляция → злодей → случайные события → сюжетные узлы |
| `SocialSimulator` | `src/services/social-simulator.ts` | Выбор пар NPC + генерация взаимодействий |
| `ProbabilityEngine` | `src/services/probability-engine.ts` | Детерминированное разрешение исходов с наложением модификаторов |
| `MemoryEngine` | `src/services/memory-engine.ts` | Семантический поиск по эпизодической памяти NPC |
| `WorldValidator` | `src/services/world-validator.ts` | Валидация целостности мира |
| `AgentCoordinator` | `src/services/agent-coordinator.ts` | Очередь приоритетов для выполнения задач Director |
| `StartResolver` | `src/services/start-resolver.ts` | Разрешение начального нарративного контекста из состояния мира |

---

## [A5] Доменные события

Все события определены в перечислении `EventTopic` (`src/lib/event-bus.ts`):

| Событие | Издатель | Потребители | Описание |
|---------|----------|-------------|----------|
| `ENTITY_ADDED` | `WorldBuilder`, `NPCGenerator` | `GraphStore`, `WorldMemory` | Создана новая сущность |
| `ENTITY_UPDATED` | Различные сервисы | `GraphStore`, `WorldMemory` | Профиль сущности изменён |
| `ENTITY_REMOVED` | `GraphStore` | `WorldMemory` | Сущность удалена |
| `ENTITY_LAYER_COMPLETED` | `WorldBuilder` | `GraphStore` | Фаза построения L1/L2/L3 завершена |
| `RELATIONSHIP_ADDED` | `SocialSimulator` | `GraphStore` | Установлена новая связь |
| `RELATIONSHIP_REPAIRED` | `SocialSimulator` | `GraphStore` | Разорванная связь восстановлена |
| `RELATIONSHIP_BROKEN` | `SocialSimulator` | `GraphStore` | Связь разорвана |
| `WORLD_CREATED` | `WorldManager` | Все сервисы | Инициализирован новый мир |
| `WORLD_FRAME_LOADED` | `WorldBuilder` | Все сервисы | WorldFrame загружен с диска |
| `WORLD_EVOLVED` | `WorldEvolver` | `Chronicler`, `WebSocketManager` | Состояние мира изменилось |
| `STORY_EVENT` | `StoryEngine` | `Chronicler`, `WebSocketManager` | Сгенерировано нарративное событие |
| `STORY_BEAT` | `DirectorLoop` | `Chronicler`, `WebSocketManager` | Инъецирован сюжетный узел |
| `VILLAIN_PROGRESS` | `VillainManager` | `Chronicler`, `WebSocketManager` | Выполнено действие злодея |
| `QUEST_ADDED` | `QuestSystem` | `WebSocketManager` | Создан новый квест |
| `QUEST_UPDATED` | `QuestSystem` | `WebSocketManager` | Состояние квеста изменено |
| `MEMORY_ADDED` | `WorldMemory` | `AgentMemoryStore` | Сохранена новая запись памяти |
| `MEMORY_CONSOLIDATED` | `WorldMemory` | — | Продвижение из краткосрочной в долгосрочную память |
| `MEMORY_FORGOTTEN` | `WorldMemory` | — | Запись памяти удалена |
| `MAINTENANCE_START` | Система | Все сервисы | Цикл обслуживания начат |
| `MAINTENANCE_DONE` | Система | Все сервисы | Цикл обслуживания завершён |
| `GRAPH_CHANGED` | `GraphStore` | `Intelligence` | Топология графа изменена |
| `ERROR` | Различные | Логирование | Произошла ошибка |

**Механика шины событий:**
- Обработчики сортируются по `priority` (чем выше = тем раньше выполняются)
- Буфер повтора (по умолчанию 100 событий) для запоздавших подписчиков
- Асинхронная публикация с `await` — нет политики «выстрелил и забыл»

---

## [A6] Прикладной слой

### Поток варианта использования: Сообщение игрока → Ответ рассказчика

```
1. HTTP POST /chat/message
   └─→ routes/chat.ts: Валидация Zod, очистка ввода

2. RoleplayEngine.processInput(sanitizedMessage)
   ├─→ Определение намерения: перемещение, диалог, упоминание @agent или общий
   ├─→ Если перемещение: SceneAgent → обновление локации → NarratorAgent
   ├─→ Если диалог: NPCAgent → контекст диалога → ответ
   ├─→ Если @agent: диспетчеризация к именованному агенту (researcher, historian и т.д.)
   └─→ Иначе: NarratorAgent.generate(context, memories, facts, history)

3. NarratorAgent.generate()
   ├─→ loadAgentConfig("narrator") → промпты из SQLite → откат к JSON → значения по умолчанию
   ├─→ resolveTemplate(template, vars) с полями StoryContext
   └─→ LLMQueue.generateText(prompt, priority, temperature, agentId)

4. LLMQueue
   ├─→ RateLimiter.check() → управление конкурентностью
   ├─→ ProviderManager.getProvider(agentId) → провайдер/модель
   ├─→ LLMClient.generate() → проверка LRU-кэша → HTTP к LLM
   └─→ Возврат ответа

5. RoleplayEngine
   ├─→ MemoryManager.addEntry(user, response)
   ├─→ Chronicler.logEvent(...) → WorldMemory.addEvent(...)
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Возврат { narrative, location, storyTime, activeCharacter }

6. WebSocketManager.broadcast({ type: "narrative", ... })
```

### Поток варианта использования: Тик Director → Сюжетный узел

```
1. DirectorLoop (фоновый setInterval, по умолчанию 30 мин)
   ├─→ WorldClock.tick(minutes)
   ├─→ SocialSimulator.simulateInteraction()
   ├─→ VillainManager.tick() → переходы фаз
   ├─→ ProbabilityEngine.roll() → случайные события
   └─→ StoryPlanner.shouldGenerateBeat() → StoryEngine.generateEvent()

2. StoryEngine.generateEvent()
   ├─→ LLMQueue.generateJson(EVENT_PROMPT, ...) → структурированное событие
   ├─→ Применение эффектов: перемещения NPC, изменения отношений, создание квестов
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Chronicler.logEvent(...)

3. DirectorLoop
   ├─→ StoryEngine.generateBeat() → LLM генерирует нарративный узел
   ├─→ RoleplayEngine.injectBeat(beat) → вставка в начало следующего ответа
   └─→ Сохранение director_state.json
```

### Поток варианта использования: Создание мира

```
1. HTTP POST /api/worlds
   └─→ routes/worlds.ts → world-manager.createWorld(params)

2. WorldManager.createWorld()
   ├─→ mkdir worlds/{slugified-name}/
   ├─→ Запись world_frame.json
   ├─→ EventBus.publish(WORLD_CREATED)
   └─→ NarrativeService.reset(dbPath, worldFrame)

3. WorldBuilder (при /api/launch)
   ├─→ createWorld() → LLM генерирует WorldFrame
   ├─→ buildL1() → слой идентичности для всех сущностей
   ├─→ buildL2() → слой динамического состояния
   ├─→ buildL3() → слой скрытого/тайного
   ├─→ buildRelationships() → связи между сущностями
   └─→ EventBus.publish(ENTITY_ADDED) для каждой сущности

4. WebSocketManager.broadcast({ type: "world_created", ... })
```

### Поток варианта использования: Память агента

```
1. NarratorAgent генерирует нарратив
   └─→ EventBus.publish(MEMORY_ADDED, { content, source: "narrator" })

2. WorldMemory.addEvent()
   ├─→ Создание WorldMemoryEntry с метаданными оценки
   ├─→ EmbeddingQueue.enqueue(entry) → пакетная генерация эмбеддингов через BGE-M3
   ├─→ VectorIndex.add(embedding, entryId)
   ├─→ WriteBehindBuffer.add(entry)
   └─→ Периодическая запись в SQLite + пересоздание FAISS

3. AgentMemoryStore.search(agentId, query)
   ├─→ getEmbedding(query) → эндпоинт BGE-M3
   ├─→ SQLiteStore.searchMemoriesFTS(query) → поиск по ключевым словам
   ├─→ SQLiteStore.searchMemoriesDense(vector) → косинусное сходство
   ├─→ ReciprocalRankFusion(ftsResults, denseResults)
   └─→ Возврат топ-K результатов, отфильтрованных по agentId
```

---

## [A7] Инфраструктура

### Интеграция с LLM

```
ProviderManager (синглтон)
├── OpenAIProvider    (conf/providers.json)
├── AnthropicProvider
├── GoogleProvider
├── OllamaProvider
└── LlamaCppProvider  (локальный, порт 5002 для эмбеддингов)

LLMClient (для каждого агента)
├── ProviderManager.getProvider(agentId) → провайдер/модель
├── LRU-кэш (256 записей, TTL 5 минут)
├── parseJsonWithRetry() для структурированного вывода
└── Конфигурация для каждого агента: temperature, maxTokens, модель

LLMQueue (глобальная)
├── Очередь приоритетов (CRITICAL > HIGH > NORMAL > LOW)
├── RateLimiter (на основе RPM, автоматическое пополнение)
├── Максимальная конкурентность (по умолчанию 3)
├── Лимит очереди (по умолчанию 50) с вытеснением по приоритету
└── Экземпляры LLMClient для каждого агента
```

**Файл:** `src/lib/llm-client.ts`, `src/lib/llm-queue.ts`, `src/lib/providers/provider-manager.ts`

### Персистентность

| Хранилище | Технология | Путь | Назначение |
|-----------|-----------|------|------------|
| `UnifiedEntityStore` | JSON-файлы | `worlds/{name}/entities.json` | CRUD сущностей с разрешением имён за O(1) |
| `SQLiteStore` | `bun:sqlite` | `worlds/{name}/tns.db` | Поиск FTS5, векторные эмбеддинги, промпты агентов, переводы |
| `GraphStore` | Граф смежности в памяти | `worlds/{name}/entities.json` | Обход графа, ветвление |
| `SessionStore` | `bun:sqlite` | `worlds/_sessions/sessions.db` | Токены авторизации |
| `Chronicler` | JSONL-файлы | `worlds/{name}/timeline.jsonl` | Хронология событий с ротацией |
| `WorldClock` | JSON-файл | `worlds/{name}/clock_state.json` | Игровое время, запланированные события |
| `NPCRuntime` | JSON-файлы | `worlds/{name}/npc_profiles.json` | Состояние NPC + эпизодическая память |
| `SocialGraph` | JSON-файлы | `worlds/{name}/social/*.json` | Отношения, фракции, альянсы |
| `StoryPlanner` | JSON-файл | `worlds/{name}/planner_state.json` | Главы, узлы |
| `DirectorLoop` | JSON-файл | `worlds/{name}/director_state.json` | Состояние Director |
| `VillainManager` | JSON-файл | `worlds/{name}/villain_state.json` | Повестки злодея |
| `WorldMemory` | SQLite + FAISS | `worlds/{name}/memory/` | Семантическая память с эмбеддингами |
| `AgentMemoryStore` | SQLite | `tns.db` | RAG для каждого агента |
| `settings.json` | JSON-файл | `conf/settings.json` | Глобальные настройки приложения |
| `providers.json` | JSON-файл | `conf/providers.json` | Конфигурация провайдеров LLM |
| `agents.json` | JSON-файл | `conf/agents.json` | Назначения моделей агентам |

**Паттерн персистентности:** Все JSON-записи используют `atomicWriteJson()` (запись во временную файл + переименование) для устойчивости к сбоям. SQLite использует режим WAL с `PRAGMA synchronous = NORMAL`.

### WebSocket в реальном времени

**Файл:** `src/services/websocket-manager.ts`

- `WebSocketManager` управляет подключёнными клиентами с уникальными ID
- `broadcast(message)` отправляет всем подключённым клиентам (очистка мёртвых соединений)
- `sendTo(id, message)` для адресной доставки
- События из `EventBus` пересылаются клиентам WebSocket

### Аутентификация

**Файлы:** `src/middleware/auth.ts`, `src/lib/session-store.ts`

- Аутентификация на основе токенов (32-байтный случайный hex)
- Сессии хранятся в SQLite (`worlds/_sessions/sessions.db`)
- TTL 24 часа с ежечасной очисткой
- `authMiddleware` блокирует все маршруты `/api/*`, кроме `/login`
- Вход/выход через POST-эндпоинты

---

## [A8] Диаграммы потоков данных

### 1. Сообщение пользователя → Ответ рассказчика

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│ Браузер   │────▶│ routes/chat  │────▶│  RoleplayEngine  │
│           │◀────│   (Hono)     │◀────│                  │
└──────────┘     └──────────────┘     └────────┬─────────┘
                                               │
                    ┌──────────────────────────┤
                    ▼                          ▼
          ┌─────────────────┐      ┌──────────────────┐
          │  NarratorAgent   │      │  MemoryManager   │
          │  (промпт LLM)    │      │  (сохранение     │
          └────────┬─────────┘      │   истории)       │
                   │                └──────────────────┘
                   ▼
          ┌─────────────────┐
          │    LLMQueue      │
          │  (приоритет,     │
          │   ограничение,   │
          │   кэш)           │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐
          │  ProviderManager │
          │  (OpenAI/Anth/   │
          │   Google/Ollama) │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐     ┌──────────────────┐
          │   Внешний LLM    │────▶│  Chronicler.log   │
          │   API            │     │  EventBus.publish │
          └─────────────────┘     └──────────────────┘
```

### 2. Тик Director → Генерация сюжетного узла

```
┌─────────────────┐
│  DirectorLoop    │  (setInterval, каждые 30 мин)
│  ┌─────────────┐│
│  │ WorldClock  ││──▶ tick(minutes) → продвижение времени → запуск запланированных событий
│  └─────────────┘│
│  ┌─────────────┐│
│  │SocialSim    ││──▶ simulateInteraction() → выбор пар → генерация событий
│  └─────────────┘│
│  ┌─────────────┐│
│  │VillainMgr   ││──▶ tick() → переход фазы → стратегическое действие LLM
│  └─────────────┘│
│  ┌─────────────┐│
│  │ProbEngine   ││──▶ roll() → случайные события (погода, несчастные случаи, открытия)
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryPlanner ││──▶ shouldGenerateBeat() → generateNextBeat() → LLM
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryEngine  ││──▶ generateEvent() → LLM → применение эффектов → публикация события
│  └─────────────┘│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  EventBus        │────▶│  WebSocketManager │
│  (STORY_BEAT)    │     │  (broadcast)      │
└─────────────────┘     └──────────────────┘
```

### 3. Поток создания мира

```
┌──────────┐     ┌──────────────────┐     ┌────────────────┐
│ Браузер   │────▶│  POST /worlds     │────▶│  WorldManager   │
│           │     │  (routes/worlds)  │     │  createWorld()  │
└──────────┘     └──────────────────┘     └───────┬────────┘
                                                   │
                    ┌──────────────────────────────┤
                    ▼                              ▼
          ┌─────────────────┐            ┌────────────────┐
          │  mkdir worlds/   │            │ EventBus.publish│
          │  {name}/         │            │ (WORLD_CREATED) │
          └─────────────────┘            └────────────────┘
                                                   │
                                                   ▼
                                          ┌────────────────┐
                                          │NarrativeService │
                                          │    .reset()     │
                                          └────────────────┘

POST /api/launch:
┌─────────────────┐
│  WorldBuilder    │
│  ├─ createWorld()│──▶ LLM → WorldFrame JSON
│  ├─ buildL1()    │──▶ LLM → L1 идентичность для каждой сущности
│  ├─ buildL2()    │──▶ LLM → L2 динамическое состояние
│  ├─ buildL3()    │──▶ LLM → L3 скрытое/тайное
│  └─ buildRels()  │──▶ LLM → связи
└─────────────────┘
          │
          ▼
┌─────────────────┐
│ EventBus.publish │
│ (ENTITY_ADDED    │
│  × N сущностей)  │
└─────────────────┘
```

### 4. Поток памяти агента

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  NarratorAgent   │────▶│ EventBus.publish  │────▶│  WorldMemory    │
│  (генерирует     │     │ (MEMORY_ADDED)    │     │  .addEvent()    │
│   нарратив)      │     └──────────────────┘     └───────┬────────┘
└─────────────────┘                                       │
                                                    ┌─────┴──────┐
                                                    ▼            ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │EmbeddingQueue │ │ WriteBehind  │
                                            │ (пакетная     │ │   Buffer     │
                                            │  BGE-M3)      │ └──────┬───────┘
                                            └──────┬───────┘        │
                                                   │                │
                                                   ▼                ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │ VectorIndex   │ │ SQLiteStore  │
                                            │ (FAISS)       │ │ (tns.db)     │
                                            └──────────────┘ └──────────────┘

Поток запросов:
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│ AgentMemory   │────▶│ SQLiteStore       │────▶│ FTS5 (ключевые  │
│ .search()     │     │ .searchMemories   │     │  слова)         │
│               │     │                   │     │ + плотные       │
│               │     │                   │     │   векторы       │
│               │     │                   │     │ → RRF-слияние   │
└──────────────┘     └──────────────────┘     └────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │ ReciprocalRank    │
                    │ Fusion (RRF)      │
                    └──────────────────┘
```

---

## [A9] Межконтекстные зависимости

```
                    ┌─────────────────────┐
                    │  Управление миром    │
                    │  (BC1)               │
                    └──────────┬──────────┘
                               │ создаёт/загружает
                               ▼
┌──────────────┐    ┌─────────────────────┐    ┌──────────────┐
│ Сущности и   │◀──▶│  Нарратив и история  │◀──▶│  NPC и       │
│ граф (BC2)   │    │  (BC3)               │    │  диалоги     │
└──────┬───────┘    └──────────┬──────────┘    │  (BC4)       │
       │                       │               └──────┬───────┘
       │                       │                      │
       │                       ▼                      │
       │              ┌─────────────────────┐         │
       │              │  Интеграция с LLM    │         │
       │              │  (BC8)               │◀────────┘
       │              └──────────┬──────────┘
       │                         │
       │    ┌────────────────────┼────────────────────┐
       │    ▼                    ▼                    ▼
       │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │ │  Социальные   │ │  Квесты      │ │  Злодей      │
       │ │  связи        │ │  (BC6)       │ │  (BC10)      │
       │ │  (BC5)        │ └──────┬───────┘ └──────────────┘
       │ └──────┬───────┘        │
       │        │                │
       │        ▼                ▼
       │ ┌─────────────────────────────┐
       │ │  Вероятности и бой          │
       │ │  (BC9)                      │
       │ └─────────────────────────────┘
       │
       ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Память и знания     │◀──▶│  Интеллект и         │
│  (BC7)               │    │  анализ (BC11)       │
└─────────────────────┘    └─────────────────────┘
```

**Ключевые зависимости:**

| Исходный ЦК | Целевой ЦК | Механизм связанности |
|-------------|------------|---------------------|
| BC1 (Мир) | BC2 (Сущности) | Общий экземпляр `UnifiedEntityStore` |
| BC1 (Мир) | BC3 (Нарратив) | `NarrativeService.reset()` |
| BC3 (Нарратив) | BC4 (NPC) | `NPCRuntime` инжектируется в `RoleplayEngine` |
| BC3 (Нарратив) | BC5 (Социальные) | `SocialSimulator` инжектируется в `DirectorLoop` |
| BC3 (Нарратив) | BC6 (Квесты) | `QuestManager` инжектируется в `StoryEngine` |
| BC3 (Нарратив) | BC10 (Злодей) | `VillainManager` инжектируется в `DirectorLoop` |
| BC3 (Нарратив) | BC9 (Вероятности) | `ProbabilityEngine` в `RoleplayEngine` |
| BC4 (NPC) | BC7 (Память) | `NPCRuntime` использует `EpisodicMemory` |
| BC5 (Социальные) | BC2 (Сущности) | `SocialGraph` читает из `UnifiedEntityStore` |
| BC8 (LLM) | Все ЦК | `LLMQueue` является общим для всех агентов |
| BC7 (Память) | BC8 (LLM) | `EmbeddingQueue` вызывает `LLMClient` для эмбеддингов |
| BC11 (Интеллект) | BC2 (Сущности) | Анализ графа читает `GraphStore` |

---

## [A10] Ключевые архитектурные решения

### D1: Паттерн корня композиции

**Решение:** `NarrativeService` (`src/services/narrative-service.ts`) выступает в роли корня композиции, создавая все сервисы и связывая зависимости вручную.

**Компромисс:** Явное внедрение зависимостей без фреймворка. Все зависимости видны в одном конструкторе, что делает систему отладочной, но многословной. Альтернатива (контейнер IoC) добавила бы рантайм-магию.

### D2: JSON-файлы как основное хранилище (SQLite для поиска)

**Решение:** Состояние сущностей, профили NPC и социальные отношения хранятся как JSON-файлы. SQLite используется только для поиска (FTS5), эмбеддингов (векторы), сессий и промптов агентов.

**Компромисс:** Простые чтения/записи с атомарными файловыми операциями, но без транзакционных гарантий между сущностями. Паттерн `atomicWriteJson()` (запись во временный файл + переименование) обеспечивает устойчивость к сбоям для отдельных записей, но не к согласованности нескольких файлов. SQLite обеспечивает полный ACID для поиска и эмбеддингов.

### D3: Шина событий для межконтекстной коммуникации

**Решение:** `EventBus` с обработчиками, отсортированными по приоритету, и буфером повтора соединяет ограниченные контексты асинхронно.

**Компромисс:** Декомпозирует контексты (NPC не знает о памяти, память не знает о NPC), но добавляет косвенность. Буфер повтора (100 событий) гарантирует, что запоздавшие подписчики не пропускают недавние события, ценой памяти.

### D4: Назначение модели для каждого агента

**Решение:** Каждый агент (рассказчик, NPC, режиссёр, исследователь и т.д.) может иметь своего провайдера LLM, модель, температуру и максимальное количество токенов.

**Компромисс:** Максимальная гибкость (дешёвые модели для хрониста, мощные модели для рассказчика), но требуется управление конфигурацией. ProviderManager решает это через `conf/providers.json` и `conf/agents.json`.

### D5: Трёхуровневый профиль сущности (L1/L2/L3)

**Решение:** Профили сущностей используют три слоя: L1 (идентичность/имя), L2 (динамическое состояние/локация), L3 (скрытое/тайное).

**Компромисс:** Позволяет постепенное раскрытие и секреты, управляемые Мастером. L1 всегда виден, L2 обновляется во время игры, L3 скрыт от игроков. Цена — дополнительная сложность в разрешении профилей.

### D6: Фоновый цикл Director

**Решение:** `DirectorLoop` работает как фоновый интервал, оркестрируя тики часов, социальную симуляцию, действия злодея и сюжетные узлы независимо от ввода игрока.

**Компромисс:** Создаёт живой мир, который развивается даже когда игроки оффлайн. Компромисс — сложность управления состоянием (приостановка/работа, кулдауны основных узлов) и возможность событий, которые игроки пропускают.

### D7: Гибридный поиск (FTS5 + векторы + RRF)

**Решение:** Поиск по памяти использует как ключевые слова (FTS5), так и семантический (плотный вектор) поиск, объединённые через Reciprocal Rank Fusion.

**Компромисс:** Лучшее из обоих миров — точные совпадения по ключевым словам и семантическое сходство. Цена — поддержка обоих индексов и конвейера эмбеддингов (BGE-M3 через llama.cpp сервер на порту 5002).

### D8: Ветвление в стиле Git для графов нарратива

**Решение:** `BranchManager` поддерживает ветвление графа сущностей, позволяя альтернативные нарративные пути.

**Компромисс:** Позволяет сценарии «а что, если» и параллельные таймлайны без дублирования всего состояния мира. Каждая ветка хранит только добавления и удаления относительно родителя.

### D9: Промпты агентов на основе шаблонов с откатом к SQLite

**Решение:** Промпты агентов хранятся в SQLite (`agent_prompts`) с изоляцией по мирам и языкам, с откатом к JSON-файлам и затем к встроенным значениям по умолчанию.

**Компромисс:** Поддержка i18n иworld-specific кастомизации без изменений кода. Трёхуровневый откат гарантирует работоспособность системы даже без базы данных.

### D10: Mojo FFI для вычислений критичных к производительности

**Решение:** Вероятностные расчёты и векторные операции могут использовать Mojo FFI-ядра (`probability_ffi.mojo`, `vector_ffi.mojo`) с откатами на TypeScript.

**Компромисс:** Значительный прирост производительности для пакетных операций (вероятностные броски, косинусное сходство), но увеличивается сложность сборки и зависимость от платформы. Откаты на TypeScript обеспечивают портируемость.

---

## Приложение: Справочник по файлам

| Директория | Файлы | Назначение |
|------------|-------|------------|
| `src/models/` | 12 файлов | Доменные модели (Entity, Quest, Story, Director, NPC, Romance, Probability, Memory, Item, Rank, Archetype) |
| `src/services/` | 45+ файлов | Прикладные + доменные сервисы |
| `src/routes/` | 18 файлов | HTTP-адаптеры (роутеры Hono) |
| `src/lib/` | 15+ файлов | Инфраструктура (LLM, SQLite, EventBus, векторные операции, провайдеры) |
| `src/memory/` | 12 файлов | Подсистема памяти (оценка, кластеризация, эмбеддинги, когнитивный конвейер) |
| `src/intelligence/` | 10 файлов | Анализ и валидация графа |
| `src/store/` | 1 файл | Единое хранилище сущностей с NameIndex |
| `src/config/` | env.ts | Конфигурация окружения |
| `src/i18n/` | Интернационализация | Многоязычная поддержка (7 языков) |
| `src/middleware/` | auth, rate-limiter и т.д. | HTTP-промежуточное ПО |
| `src/utils/` | logger, sanitize и т.д. | Общие утилиты |
