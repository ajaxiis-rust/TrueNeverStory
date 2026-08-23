# TrueNeverStory — Документ архитектуры

> Анализ на основе Domain-Driven Design нарративного RPG-движка TrueNeverStory.
> Обновлено для v0.33.4 — рефакторинг RoleplayEngine с SessionState, CommandHandler, PipelineRunner и стратегиями прозы.

---

## [A1] Архитектурный паттерн

**Слоёная архитектура «луковицы» с событийными расширениями + конвейер State-First**

TrueNeverStory в своём ядре следует **слоёной архитектуре «луковицы» (гексагональной архитектуре)**, обёрнутой **слоем событийной оркестрации** для асинхронной нарративной обработки. Начиная с v0.33.4 движок использует **конвейер State-First**, в котором детерминированная симуляция выполняется до генерации прозы.

Этот паттерн подходит, потому что:

1. **Доменные модели изолированы** — `src/models/` содержит чистые структуры данных без зависимостей от инфраструктуры. `EntityNode`, `Quest`, `StoryContext`, `NPCProfile`, `ProbabilityModifier`, `Intent`, `SimulationResult` — все они не зависят от фреймворков.
2. **Сервисы оркестрируют доменную логику** — `src/services/` содержит прикладные сервисы (`RoleplayEngine`, `StoryEngine`) и доменные сервисы (`ProbabilityEngine`, `SocialSimulator`, `RomanceEngine`, `SimulationEngine`).
3. **Инфраструктура вынесена на периферию** — `src/lib/` хранит персистентность (`SQLiteStore`, `AtomicIO`), внешние интеграции (`LLMClient`, `ProviderManager`) и транспорт (`WebSocketManager`).
4. **Маршруты — тонкие адаптеры** — `src/routes/` сопоставляет HTTP с вызовами сервисов с минимальной логикой.
5. **Интеграция MCP** — `src/mcp/` предоставляет внешние источники знаний (Bible, Gutenberg, Wikipedia) через Model Context Protocol.

**Шина событий** (`EventBus` в `src/lib/event-bus.ts`) добавляет асинхронный слой декомпозиции между ограниченными контекстами, позволяя Director Loop оркестрировать нарративные события без прямой связанности с подсистемами NPC, социальных взаимодействий или квестов.

### Конвейер State-First (v0.33.4)

Теперь конвейер структурирован как композируемые стадии, управляемые `PipelineRunner`:

```
Player Input (any language)
  │
  ▼
PipelineRunner.buildContext() — snapshot engine state
  │
  ▼
PipelineRunner.translateAndClassify() — IntentParser + TranslationService
  │ translated text + intent
  ▼
CommandHandler.handle() — early exit for commands
  │
  ▼
PipelineRunner.runSimulation() — SimulationEngine (deterministic)
  │ outcome, probability, stateChanges
  ▼
StateMutator.applyChanges() — apply to EntityStore
  │
  ▼
PipelineRunner.buildGameContext() — ContextBuilder
  │
  ▼
Prose Generators:
  └─ LiteraryV2Generator → Stylist
  │
  ▼
TranslationService.translate() — if non-English target language
  │
  ▼
Response to User

Total: 2-3 LLM calls
```

### Конвейер обработки Gutenberg (v0.33.4)

Двухфазный конвейер преобразует сырые .txt-файлы Gutenberg в базы данных, пригодные для использования агентами:

**Фаза A (V1 — на основе правил, без LLM):**
```
classics.db → GutenbergParser → gutenberg-normalized.db (styles + FTS)
         └→ 4-pass compiler → classics-compiled.db (quest templates)
              DramaturgicPass → StylisticPass → EmotionalPass → MetadataPass → Linter
```

**Фаза B (V2 — обогащённая LLM):**
```
classics-compiled.db → AnalyzePass → narrative_extractor → literary.db (scene_templates + style_patterns)
```

**Новые таблицы в classics-compiled.db:**
- `narrative_arcs` — архетипы сюжетных арок и точки напряжения для каждой книги
- `thematic_motifs` — символические мотивы с отслеживанием эволюции
- `quality_calibration` — оценки качества ответов LLM

**PlayerProfileStore** — автономные кросс-агентные стилевые профили игрока (14 метрик), хранятся в `data/player-profiles.db`.

### Архитектура с двумя моделями (v0.33.4)

Движок поддерживает две LLM-модели для каждого агента:

| Модель | Назначение | Примеры |
|-------|---------|----------|
| **Основная модель** | Генерация нарратива, диалоги NPC, планирование истории | llama-3.1-8b, qwen2.5-14b |
| **Модель перевода** | Перевод, классификация намерений (быстрая, компактная) | phi-3-mini, gemma-2-2b, qwen2.5-3b |

**Конфигурация** (для каждого агента в `conf/agents.json`):
```json
{
  "agentId": "translation",
  "providerId": "ollama",
  "modelId": "qwen2.5:14b",
  "translationProviderId": "ollama",
  "translationModelId": "phi3:mini"
}
```

**LLMClient** разрешает модель через флаг `useTranslationModel`:
- `LLMQueue.getAgentClient("translation", { useTranslationModel: true })` → использует `translationModelId`
- `LLMQueue.getAgentClient("stylist")` → использует `modelId`

```
┌─────────────────────────────────────────────────┐
│                   Routes (HTTP/WS)               │  ← Adapter Layer
├─────────────────────────────────────────────────┤
│              Application Services                │  ← Use Cases
│  RoleplayEngine │ NarrativeService │ StoryEngine │
├─────────────────────────────────────────────────┤
│               Domain Services                    │  ← Domain Logic
│  ProbabilityEngine │ SocialSimulator │ NPCRuntime │
├─────────────────────────────────────────────────┤
│               Domain Models                      │  ← Core Entities
│  EntityNode │ Quest │ NPCProfile │ StoryArc      │
├─────────────────────────────────────────────────┤
│              Infrastructure                      │  ← Persistence/External
│  SQLiteStore │ LLMClient │ EventBus │ AtomicIO   │
└─────────────────────────────────────────────────┘
```

---

## [A2] Ограниченные контексты

### BC1: Управление миром

**Назначение:** Жизненный цикл нескольких миров — создание, конфигурация, переключение и персистентность состояния мира.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `World`, `WorldFrame` |
| **Ключевые сущности** | `EntityNode` (Character, Faction, Location, Item, Event, Race, WorldRule) |
| **Объекты-значения** | `WorldCreateParams`, `WorldSummary`, `LayeredProfile` (слои L1/L2/L3) |
| **Доменные события** | `WORLD_CREATED`, `WORLD_FRAME_LOADED`, `WORLD_EVOLVED` |
| **Персистентность** | `worlds/{name}/world_frame.json`, `worlds/{name}/entities.json` |

**Ключевые файлы:**
- `src/services/world-manager.ts` — CRUD-операции, переключение миров
- `src/services/world-builder.ts` — Слоёное построение мира на основе LLM
- `src/services/world-validator.ts` — Проверки целостности
- `src/services/world-evolver.ts` — Добавляет NPC/локации/предметы со временем
- `src/routes/worlds.ts` — HTTP-адаптер

**Доменные правила:**
- Названия миров приводятся к slug-формату и уникальны
- Каждый мир имеет собственную изолированную директорию данных в `worlds/`
- `WorldFrame` определяет каноническую структуру (календарь, система магии, расы, фракции, локации, предметы, исторические события, правила мира)
- Профили сущностей используют трёхуровневую систему: L1 (идентичность), L2 (динамическое состояние), L3 (скрытое/тайное)

---

### BC2: Сущности и граф

**Назначение:** Представление сущностей мира и их связей в графе в памяти. Обеспечивает поиск за O(1) и обход графа.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `GraphStore` (корневой агрегат графа мира) |
| **Ключевые сущности** | `EntityNode`, `GraphEdge` |
| **Объекты-значения** | `Relationship`, `LayeredProfile`, `GraphSummary` |
| **Доменные события** | `ENTITY_ADDED`, `ENTITY_UPDATED`, `ENTITY_REMOVED`, `RELATIONSHIP_ADDED`, `RELATIONSHIP_BROKEN`, `GRAPH_CHANGED` |
| **Персистентность** | `worlds/{name}/entities.json` (через `UnifiedEntityStore`), `worlds/{name}/branches.json` |

**Ключевые файлы:**
- `src/store/entity-store.ts` — `UnifiedEntityStore` с `NameIndex` для разрешения имя→UID за O(1)
- `src/services/graph-store.ts` — Граф на основе карты смежности с прямыми/обратными рёбрами
- `src/services/branch-manager.ts` — Ветвление в стиле Git для сюжетных графов
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
| **Объекты-значения** | `NarratorOutput`, `NPCDialogue`, `SceneTransition` |
| **Доменные события** | `STORY_EVENT`, `STORY_BEAT`, `VILLAIN_PROGRESS` |
| **Персистентность** | `worlds/{name}/director_state.json`, `worlds/{name}/story_arcs.json`, `worlds/{name}/planner_state.json` |

**Ключевые файлы:**
- `src/services/narrative-service.ts` — **Корень композиции** / DI-контейнер для всех нарративных сервисов
- `src/services/roleplay-engine.ts` — Основная обработка ролевой игры, диспетчеризация агентов
- `src/services/agents/stylist.ts` — Генерация прозы на основе LLM (единственный генератор прозы)
- `src/services/agents/dramaturg.ts` — Выбор нарративных паттернов из библейских архетипов
- `src/services/agents/validator.ts` — Проверка фактов через Wikipedia MCP
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
| **Объекты-значения** | `NPCSkills`, `NPCDialogue`, `DialogueChoice`, `GreetingTemplate` |
| **Доменные события** | `ENTITY_ADDED` (для сгенерированных NPC), `MEMORY_ADDED`, `MEMORY_CONSOLIDATED` |
| **Персистентность** | `worlds/{name}/npc_profiles.json`, `worlds/{name}/npc_profiles/{name}.json` |

**Ключевые файлы:**
- `src/services/npc-runtime.ts` — `NPCRuntime`: хранилище состояния с краткосрочной/долгосрочной памятью
- `src/services/npc-generator.ts` — Генерация NPC на основе LLM
- `src/services/agents/actor.ts` — Генерация диалогов и взаимодействий NPC
- `src/services/npc-economy.ts` — Богатство NPC, налоги, казна, производство еды
- `src/services/dialogue-manager.ts` — Сессии бесед, темы, варианты выбора
- `src/services/dialogue-context.ts` — Контекстуальное состояние диалога
- `src/models/npc-state.ts` — `NPCProfile`, `EpisodicMemory`, `NPCSkills`

**Доменные правила:**
- Профили NPC имеют краткосрочную память (ограничена 20 записями) и долгосрочную эпизодическую память
- Консолидация памяти происходит, когда краткосрочная память превышает порог `_importanceThreshold` (0.4)
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
| **Объекты-значения** | `FactionSummary`, `FeudalSummary`, `RomanceStatus`, `RomanceProgression` |
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
| **Объекты-значения** | `QuestReward`, `QuestPrerequisite` |
| **Доменные события** | `QUEST_ADDED`, `QUEST_UPDATED` |
| **Персистентность** | `worlds/{name}/quests.json` |

**Ключевые файлы:**
- `src/services/quest-manager.ts` — Базовый CRUD квестов
- `src/services/quest-system.ts` — Полный жизненный цикл с цепочками, предусловиями, временными ограничениями
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
| **Объекты-значения** | `MemoryConfig`, `ScoringWeights`, `MemoryMetadata`, `RankedItem` |
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
- Индекс FAISS пересоздаётся, когда фрагментация превышает порог (200 новых записей)
- Буфер записи пакетирует генерацию эмбеддингов для эффективности

---

### BC8: Интеграция с LLM

**Назначение:** Управление LLM от нескольких провайдеров, постановка запросов в очередь, ограничение частоты, назначение моделей для каждого агента и построение промптов.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `ProviderManager` (синглтон), `LLMQueue` |
| **Ключевые сущности** | `AgentModelAssignment`, `LLMProvider` |
| **Объекты-значения** | `AgentConfig`, `AgentPromptConfig`, `LLMClientOptions` |
| **Доменные события** | Нет (инфраструктурный слой) |
| **Персистентность** | `conf/providers.json`, `conf/agents.json`, `tns.db` (таблица agent_prompts) |

**Ключевые файлы:**
- `src/lib/llm-client.ts` — `LLMClient`: LRU-кэш для каждого агента, диспетчеризация по провайдерам
- `src/lib/llm-queue.ts` — `LLMQueue`: очередь приоритетов, управление конкурентностью, ограничение частоты
- `src/lib/providers/provider-manager.ts` — `ProviderManager`: поддержка нескольких провайдеров и ключей
- `src/lib/providers/` — Провайдеры OpenAI, Anthropic, Google, Ollama, LlamaCpp
- `src/services/agent-config.ts` — Конфигурация агентов (глобальные + промпты для каждого мира)
- `src/services/prompt-builder.ts` — Статические шаблоны промптов для всех агентов
- `src/services/model-manager.ts` — Управление моделями

**Доменные правила:**
- `LLMQueue` обеспечивает максимальную конкурентность (по умолчанию 3) и лимит очереди (по умолчанию 50)
- Вытеснение по приоритету: задачи с наименьшим приоритетом удаляются при заполнении очереди
- Ограничение частоты через `RateLimiter` (на основе RPM с автоматическим пополнением)
- Каждый агент может иметь собственного провайдера, модель, температуру и максимальное количество токенов
- Разрешение промптов: SQLite (`agent_prompts`) → откат к JSON → встроенные значения по умолчанию
- `LLMClient` использует LRU-кэш (256 записей, TTL 5 минут) для повторных запросов

---

### BC9: Вероятности и бой

**Назначение:** Детерминированные вероятностные расчёты для всех игровых механик — бой, социальные действия, крафт, романтика.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `ProbabilityEngine` |
| **Ключевые сущности** | `ProbabilityModifier`, `ProbabilityProfile` |
| **Объекты-значения** | `ProbabilityParameter`, `ProbabilityResult`, `OutcomeQuality` |
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
- Модификаторы могут истекать (продолжительность по времени)
- `OutcomeQuality` варьируется от `CRITICAL_FAILURE` до `CRITICAL_SUCCESS`
- Разрешатель контекста вводит динамические модификаторы на основе локации, отношений, состояния мира
- Mojo FFI-ядра (`probability_ffi.mojo`) ускоряют пакетные расчёты

---

### BC10: Управление злодеем

**Назначение:** Управление жизненным циклом антагониста со стратегическим планированием на основе LLM и фазами конечного автомата.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `VillainAgendaData` |
| **Ключевые сущности** | `VillainMemoryData` |
| **Объекты-значения** | Фаза (`plotting → preparing → executing → climax`) |
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
| **Объекты-значения** | Результаты валидации, рекомендации |
| **Доменные события** | Нет |
| **Персистентность** | Чтение из хранилища сущностей, запись результатов валидации |

**Ключевые файлы:**
- `src/intelligence/graph-analyzer.ts` — Метрики графа, центральность, кластеры
- `src/intelligence/graph-validator.ts` — Проверки целостности
- `src/intelligence/duplicate-detector.ts` — Дедупликация сущностей
- `src/intelligence/relationship-repairer.ts` — Восстановление повреждённых связей
- `src/intelligence/recommender.ts` — Рекомендации контента
- `src/intelligence/scene-generator.ts` — Процедурная генерация сцен
- `src/intelligence/rule-checker.ts` — Проверка правил мира
- `src/intelligence/subgraph-expander.ts` — Расширение подграфа

---

### BC12: Литературный компилятор v2 (v0.33.4)

**Назначение:** Оффлайн-извлечение нарратива из литературных источников и гибридный поиск во время выполнения для генерации прозы с ограничениями. Заменяет ресурсоёмкий конвейер v1 на основе LLM на детерминированную систему шаблонов и стилевых паттернов.

| Аспект | Детали |
|--------|--------|
| **Ключевые агрегаты** | `LiteraryCompilerDB` (корневой агрегат для всех таблиц v2) |
| **Ключевые сущности** | `SceneTemplate`, `StylePattern`, `ChunkIndex`, `TemplateStyleLink` |
| **Объекты-значения** | `RetrievalKeys`, `RankedTemplate`, `ExtractResult`, `PreScoreResult`, `TurnMetrics` |
| **Доменные события** | Нет (оффлайн-конвейер + поиск во время выполнения) |
| **Персистентность** | `literary.db` (SQLite с индексами FTS5) |

**Ключевые файлы:**
- `src/mcp/literary-compiler/schema.ts` — `LiteraryCompilerDB`: 6 таблиц v2, FTS5, методы CRUD
- `src/mcp/literary-compiler/archetypes.ts` — 12 канонических архетипов + наборы ключевых слов + переменные + позиции
- `src/mcp/literary-compiler/chunker.ts` — Разбиение текста на предложения (200-400 токенов, перекрытие 40-80)
- `src/mcp/literary-compiler/pre-score.ts` — Оценка по ключевым словам из словаря + плотность нарратива (диалог/действие/конфликт)
- `src/mcp/literary-compiler/extractor.ts` — LLM-экстрактор JSON с валидацией в стиле Zod
- `src/mcp/literary-compiler/retrieval.ts` — Составная оценка: архетип (0.40) + настроение (0.15) + домен (0.15) + качество (0.10) + свежесть (0.05) + теги (0.15)
- `src/mcp/literary-compiler/fill-template.ts` — Детерминированная замена `[placeholder]`
- `src/mcp/literary-compiler/linter.ts` — Валидация V2: обнаружение морализаторства, лимиты токенов, валидность архетипа
- `src/mcp/literary-compiler/runtime-metrics.ts` — Отслеживание задержки для каждого хода
- `src/services/agents/stylist.ts` — `buildMicroPrompt()` для генерации с ограничениями v2
- `src/lib/feature-flags.ts` — Флаги `literary-compiler-v2`, `literary-v2-retrieval`, `literary-v2-stylist`
- `scripts/migrate-v1-to-v2.ts` — Миграция названий архетипов (escape → escape_liberation и т.д.)

**Доменные правила:**
- Все шаблоны используют английский (Interlingua) для оптимизации RAG
- Шаблоны анонимизированы (без имён персонажей из источника)
- Ограничение против морализаторства применяется на уровне линтера и промпта
- Каждый шаблон имеет скелет ≤ 120 токенов
- Поиск возвращает шаблон top-1 (top-2 при почти равных оценках)
- Жёсткий бюджет: 1-2 LLM-вызова на ход (против 4-5 в v1)
- Выкатывается постепенно через feature-флаги

**Оффлайн-конвейер:**
```
Source text
  → A. Chunker (pure code, 200-400 tokens, overlap 40-80)
  → B. BGE-M3 embed + store
  → C. Dictionary/heuristic candidate pass
  → D. Cluster / near-dup collapse (vectors)
  → E. Select representatives
  → F. Small local LLM JSON extract (Qwen3-8B, temp=0.1)
  → G. Role consistency map
  → H. Linter / quality gate
  → I. Write scene_templates + style_patterns + links
  → J. Emit metrics report
```

**Поток во время выполнения:**
```
Player input
  → Intent + Simulation + State mutation (0 LLM)
  → Build retrieval keys (position, archetype, mood, domain)
  → FTS + dictionary hybrid retrieval → top-1 template
  → Get linked style_pattern
  → fillTemplate (deterministic)
  → Stylist micro-prompt → 1 LLM call → 2-3 paragraphs
  → Rule-based Censor
```

---

## [A3] Агрегаты и сущности

### BC1: Управление миром

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `World` | Корневой агрегат | Должен иметь уникальное slug-имя; должен иметь валидный `WorldFrame` |
| `WorldFrame` | Объект-значение | Должен определять `world_name`; `world_rules` должен быть непустым для валидных миров |
| `LayeredProfile` | Объект-значение | L1 должен иметь `name` и `type`; слои — L1/L2/L3 |
| `EntityNode` | Сущность | Должен иметь уникальный `uid`; `entityType` должен быть валидным `EntityTypeValue` |
| `EntityType` | Объект-значение (перечисление) | `CHARACTER`, `FACTION`, `LOCATION`, `ITEM`, `EVENT`, `WORLD_RULE`, `RACE`, `UNKNOWN` |

### BC2: Сущности и граф

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `GraphStore` | Корневой агрегат | Должен быть инициализирован перед обходом; рёбра ссылаются на валидные UID |
| `GraphEdge` | Сущность | `source` и `target` должны быть валидными UID сущностей |
| `Relationship` | Объект-значение | `sourceUid` и `targetUid` должны существовать; `strength` — от 0 до 1 |
| `BranchManager` | Сущность | Имена веток должны быть уникальными; родитель должен существовать |

### BC3: Нарратив и история

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `StoryContext` | Объект-значение | Должен иметь `worldName`, `currentTime`, `location` |
| `StoryArc` | Корневой агрегат | Должен иметь уникальный `id`; массив `beats` упорядочен по времени |
| `DirectorTask` | Сущность | Должен иметь уникальный `id`; `priority` в диапазоне `TaskPriority` |
| `BeatData` | Сущность | Должен принадлежать валидному `chapter_id`; `triggered` — логическое значение |
| `ChapterData` | Объект-значение | Должен иметь уникальный `id`; массив `beats` не null |

### BC4: NPC и диалоги

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `NPCProfile` | Корневой агрегат (для каждого NPC) | Должен иметь уникальные `name` и `uid`; `health` — от 0 до 100; значения `skills` — от 0 до 1 |
| `EpisodicMemory` | Сущность | Должен иметь уникальный `id`; `importance` — от 0 до 1; `emotion` — непустое |
| `DialogueSession` | Сущность | Должен иметь уникальный `id`; `state` в допустимом диапазоне перечисления |
| `NPCSkills` | Объект-значение | Все значения навыков должны быть от 0 до 1 |
| `DialogueMessage` | Объект-значение | `role` должен быть `player` или `npc` |

### BC5: Социальные связи и отношения

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `SocialGraph` | Корневой агрегат | Должен иметь валидный путь хранилища; отношения ссылаются на валидные сущности |
| `Relationship` | Сущность | `type` в допустимом перечислении; `strength` — от 0 до 1; `source` ≠ `target` |
| `Faction` | Объект-значение | Должен иметь уникальное `name`; участники уникальны |
| `Alliance` | Объект-значение | `faction1` ≠ `faction2`; `strength` — от 0 до 1 |
| `FeudalRelationship` | Объект-значение | `vassal` ≠ `liege`; `loyalty` — от 0 до 1 |

### BC6: Квесты

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `Quest` | Корневой агрегат | Должен иметь уникальный `id`; `status` в допустимом перечислении; `progress` вычисляется |
| `QuestDefinition` | Корневой агрегат | Должен иметь уникальный `id`; `objectives` — непустой |
| `QuestObjective` | Сущность | `completed` — логическое значение |
| `QuestReward` | Объект-значение | `gold`, `experience` ≥ 0 |
| `QuestPrerequisite` | Объект-значение | Должно быть задано хотя бы одно предусловие |

### BC7: Память и знания

| Компонент | Тип | Инварианты |
|-----------|------|------------|
| `WorldMemory` | Корневой агрегат | Должен иметь валидный путь хранилища; записи оцениваются взвешенной формулой |
| `WorldMemoryEntry` | Сущность | Должен иметь уникальный `id`; `importance` — от 0 до 1; `content` — непустое |
| `AgentMemoryStore` | Корневой агрегат | Изолирован по `agentId`; использует гибридный FTS5 + векторный поиск |
| `MemoryConfig` | Объект-значение | Все веса ≥ 0; `halfLifeDays` > 0 |
| `ScoringWeights` | Объект-значение | Веса суммируются до 1.0 |

---

## [A4] Доменные сервисы

Сквозные сервисы, которые не принадлежат одному агрегату:

| Сервис | Файл | Назначение |
|---------|------|---------|
| `NarrativeService` | `src/services/narrative-service.ts` | **Корень композиции** — создаёт и связывает все нарративные подсистемы |
| `RoleplayEngine` | `src/services/roleplay-engine.ts` | Основная точка входа: оркестрирует PipelineRunner → CommandHandler → генераторы прозы. SessionState вынесен в `roleplay/session-state.ts`, обработчики — в `roleplay/handlers/` |
| `StoryEngine` | `src/services/story-engine.ts` | Генерация событий из узлов + применение эффектов (перемещения NPC, изменения отношений, создание квестов) |
| `DirectorLoop` | `src/services/director-loop.ts` | Фоновая оркестрация: тик часов → социальная симуляция → злодей → случайные события → сюжетные узлы |
| `SocialSimulator` | `src/services/social-simulator.ts` | Выбор пар NPC + генерация взаимодействий |
| `ProbabilityEngine` | `src/services/probability-engine.ts` | Детерминированное разрешение исходов с наложением модификаторов |
| `MemoryEngine` | `src/services/memory-engine.ts` | Семантический поиск по эпизодической памяти NPC |
| `WorldValidator` | `src/services/world-validator.ts` | Валидация целостности мира |
| `AgentCoordinator` | `src/services/agent-coordinator.ts` | Очередь приоритетов для выполнения задач Director |
| `StartResolver` | `src/services/start-resolver.ts` | Разрешение начального сюжетного контекста из состояния мира |
| `WorldIsolator` | `src/services/world-isolator.ts` | Изоляция нескольких миров с мониторингом ресурсов (память, CPU, токены) |
| `CrossWorldBus` | `src/services/cross-world-bus.ts` | Межмировая коммуникация событий с порталами |
| `PluginManager` | `src/plugins/plugin-manager.ts` | Управление жизненным циклом плагинов (регистрация, отмена регистрации, возможности) |

---

## [A5] Доменные события

Все события определены в перечислении `EventTopic` (`src/lib/event-bus.ts`):

| Событие | Издатель | Потребители | Описание |
|-------|-----------|-----------|-------------|
| `ENTITY_ADDED` | `WorldBuilder`, `NPCGenerator` | `GraphStore`, `WorldMemory` | Создана новая сущность |
| `ENTITY_UPDATED` | Различные сервисы | `GraphStore`, `WorldMemory` | Профиль сущности изменён |
| `ENTITY_REMOVED` | `GraphStore` | `WorldMemory` | Сущность удалена |
| `ENTITY_LAYER_COMPLETED` | `WorldBuilder` | `GraphStore` | Фаза построения L1/L2/L3 завершена |
| `RELATIONSHIP_ADDED` | `SocialSimulator` | `GraphStore` | Установлена новая связь |
| `RELATIONSHIP_REPAIRED` | `SocialSimulator` | `GraphStore` | Разорванная связь восстановлена |
| `RELATIONSHIP_BROKEN` | `SocialSimulator` | `GraphStore` | Связь разорвана |
| `WORLD_CREATED` | `WorldManager` | Все сервисы | Инициализирован новый мир |
| `WORLD_FRAME_LOADED` | `WorldBuilder` | Все сервисы | Каркас мира загружен с диска |
| `WORLD_EVOLVED` | `WorldEvolver` | `Chronicler`, `WebSocketManager` | Состояние мира изменилось |
| `STORY_EVENT` | `StoryEngine` | `Chronicler`, `WebSocketManager` | Сгенерировано сюжетное событие |
| `STORY_BEAT` | `DirectorLoop` | `Chronicler`, `WebSocketManager` | Внедрён сюжетный узел |
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
- Асинхронная публикация с `await` — без политики «выстрелил и забыл»

---

## [A6] Прикладной слой

### Поток варианта использования: Сообщение игрока → Ответ Stylist

```
1. HTTP POST /chat/message
   └─→ routes/chat.ts: Zod validation, input sanitization

2. RoleplayEngine.processInput(sanitizedMessage)
   ├─→ SessionState (activeCharacter, currentLocation, currentTime)
   ├─→ PipelineRunner.translateAndClassify() → IntentParser
   ├─→ CommandHandler.handle() for commands
   ├─→ PipelineRunner.runSimulation() → SimulationEngine
   ├─→ Prose generation: LiteraryV2Generator
   └─→ Returns narrative string

3. Stylist.process(intent, simulation, context, pattern)
   ├─→ loadAgentConfig("stylist") → SQLite prompts → JSON fallback → defaults
   ├─→ resolveTemplate(template, vars) with StoryContext fields
   └─→ LLMQueue.generateText(prompt, priority, temperature, agentId)

4. LLMQueue
   ├─→ RateLimiter.check() → concurrency control
   ├─→ ProviderManager.getProvider(agentId) → provider/model
   ├─→ LLMClient.generate() → LRU cache check → HTTP to LLM
   └─→ Return response

5. RoleplayEngine
   ├─→ MemoryManager.addEntry(user, response)
   ├─→ Chronicler.logEvent(...) → WorldMemory.addEvent(...)
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Return { narrative, location, storyTime, activeCharacter }

6. WebSocketManager.broadcast({ type: "narrative", ... })
```

### Поток варианта использования: Тик Director → Сюжетный узел

```
1. DirectorLoop (background setInterval, default 30min)
   ├─→ WorldClock.tick(minutes)
   ├─→ SocialSimulator.simulateInteraction()
   ├─→ VillainManager.tick() → phase transitions
   ├─→ ProbabilityEngine.roll() → chance events
   └─→ StoryPlanner.shouldGenerateBeat() → StoryEngine.generateEvent()

2. StoryEngine.generateEvent()
   ├─→ LLMQueue.generateJson(EVENT_PROMPT, ...) → structured event
   ├─→ Apply effects: NPC moves, relationship changes, quest creation
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Chronicler.logEvent(...)

3. DirectorLoop
   ├─→ StoryEngine.generateBeat() → LLM generates narrative beat
   ├─→ RoleplayEngine.injectBeat(beat) → prepend to next response
   └─→ Save director_state.json
```

### Поток варианта использования: Создание мира

```
1. HTTP POST /api/worlds
   └─→ routes/worlds.ts → world-manager.createWorld(params)

2. WorldManager.createWorld()
   ├─→ mkdir worlds/{slugified-name}/
   ├─→ Write world_frame.json
   ├─→ EventBus.publish(WORLD_CREATED)
   └─→ NarrativeService.reset(dbPath, worldFrame)

3. WorldBuilder (on /api/launch)
   ├─→ createWorld() → LLM generates WorldFrame
   ├─→ buildL1() → identity layer for all entities
   ├─→ buildL2() → dynamic state layer
   ├─→ buildL3() → hidden/secret layer
   ├─→ buildRelationships() → entity relationships
   └─→ EventBus.publish(ENTITY_ADDED) for each entity

4. WebSocketManager.broadcast({ type: "world_created", ... })
```

### Поток варианта использования: Память агента

```
1. Stylist generates narrative prose
   └─→ EventBus.publish(MEMORY_ADDED, { content, source: "stylist" })

2. WorldMemory.addEvent()
   ├─→ Create WorldMemoryEntry with scoring metadata
   ├─→ EmbeddingQueue.enqueue(entry) → batch embedding via BGE-M3
   ├─→ VectorIndex.add(embedding, entryId)
   ├─→ WriteBehindBuffer.add(entry)
   └─→ Periodic flush to SQLite + FAISS rebuild

3. AgentMemoryStore.search(agentId, query)
   ├─→ getEmbedding(query) → BGE-M3 endpoint
   ├─→ SQLiteStore.searchMemoriesFTS(query) → keyword matches
   ├─→ SQLiteStore.searchMemoriesDense(vector) → cosine similarity
   ├─→ ReciprocalRankFusion(ftsResults, denseResults)
   └─→ Return top-K results filtered by agentId
```

---

## [A7] Инфраструктура

### Интеграция с LLM

```
ProviderManager (singleton)
├── OpenAIProvider    (conf/providers.json)
├── AnthropicProvider
├── GoogleProvider
├── OllamaProvider
└── LlamaCppProvider  (local, port 5002 for embeddings)

LLMClient (per-agent)
├── ProviderManager.getProvider(agentId) → provider/model
├── LRU Cache (256 entries, 5-min TTL)
├── parseJsonWithRetry() for structured output
└── Per-agent config: temperature, maxTokens, model

LLMQueue (global)
├── Priority queue (CRITICAL > HIGH > NORMAL > LOW)
├── RateLimiter (RPM-based, auto-refill)
├── Max concurrency (default 3)
├── Queue cap (default 50) with priority eviction
└── Per-agent LLMClient instances
```

**Файл:** `src/lib/llm-client.ts`, `src/lib/llm-queue.ts`, `src/lib/providers/provider-manager.ts`

### Персистентность

| Хранилище | Технология | Путь | Назначение |
|-------|-----------|------|---------|
| `UnifiedEntityStore` | JSON-файлы | `worlds/{name}/entities.json` | CRUD сущностей с разрешением имён за O(1) |
| `SQLiteStore` | `bun:sqlite` | `worlds/{name}/tns.db` | Поиск FTS5, векторные эмбеддинги, промпты агентов, переводы |
| `GraphStore` | Карта смежности в памяти | `worlds/{name}/entities.json` | Обход графа, ветвление |
| `SessionStore` | `bun:sqlite` | `worlds/_sessions/sessions.db` | Токены сессий авторизации |
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
| `providers.json` | JSON-файл | `conf/providers.json` | Конфигурации провайдеров LLM |
| `agents.json` | JSON-файл | `conf/agents.json` | Назначения моделей агентам |

**Паттерн персистентности:** Все JSON-записи используют `atomicWriteJson()` (запись во временный файл + переименование) для устойчивости к сбоям. SQLite использует режим WAL с `PRAGMA synchronous = NORMAL`.

### WebSocket в реальном времени

**Файл:** `src/services/websocket-manager.ts`

- `WebSocketManager` управляет подключёнными клиентами с уникальными ID
- `broadcast(message)` отправляет всем подключённым клиентам (очистка мёртвых соединений)
- `sendTo(id, message)` для адресной доставки
- События из `EventBus` пересылаются клиентам WebSocket

### Аутентификация

**Файл:** `src/middleware/auth.ts`, `src/lib/session-store.ts`

- Аутентификация сессий на основе токенов (32-байтный случайный hex)
- Сессии хранятся в SQLite (`worlds/_sessions/sessions.db`)
- TTL 24 часа с ежечасной очисткой
- `authMiddleware` блокирует все маршруты `/api/*`, кроме `/login`
- Вход/выход через POST-эндпоинты

---

## [A8] Диаграммы потоков данных

### 1. Сообщение пользователя → Ответ Stylist

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│  Browser  │────▶│ routes/chat  │────▶│  RoleplayEngine  │
│           │◀────│   (Hono)     │◀────│                  │
└──────────┘     └──────────────┘     └────────┬─────────┘
                                               │
                    ┌──────────────────────────┤
                    ▼                          ▼
          ┌─────────────────┐      ┌──────────────────┐
          │    Stylist       │      │  MemoryManager   │
          │  (LLM prompt)    │      │  (history save)  │
          └────────┬─────────┘      └──────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │    LLMQueue      │
          │  (priority, rate │
          │   limit, cache)  │
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
          │   External LLM   │────▶│  Chronicler.log   │
          │   API            │     │  EventBus.publish │
          └─────────────────┘     └──────────────────┘
```

### 2. Тик Director → Генерация сюжетного узла

```
┌─────────────────┐
│  DirectorLoop    │  (setInterval, every 30min)
│  ┌─────────────┐│
│  │ WorldClock  ││──▶ tick(minutes) → advance time → fire scheduled events
│  └─────────────┘│
│  ┌─────────────┐│
│  │SocialSim    ││──▶ simulateInteraction() → pair selection → event generation
│  └─────────────┘│
│  ┌─────────────┐│
│  │VillainMgr   ││──▶ tick() → phase transition → LLM strategic action
│  └─────────────┘│
│  ┌─────────────┐│
│  │ProbEngine   ││──▶ roll() → chance events (weather, accidents, discoveries)
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryPlanner ││──▶ shouldGenerateBeat() → generateNextBeat() → LLM
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryEngine  ││──▶ generateEvent() → LLM → apply effects → publish event
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
│  Browser  │────▶│  POST /worlds     │────▶│  WorldManager   │
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
│  ├─ buildL1()    │──▶ LLM → L1 identity for each entity
│  ├─ buildL2()    │──▶ LLM → L2 dynamic state
│  ├─ buildL3()    │──▶ LLM → L3 hidden/secret
│  └─ buildRels()  │──▶ LLM → relationships
└─────────────────┘
          │
          ▼
┌─────────────────┐
│ EventBus.publish │
│ (ENTITY_ADDED    │
│  × N entities)   │
└─────────────────┘
```

### 4. Поток памяти агента

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│    Stylist       │────▶│ EventBus.publish  │────▶│  WorldMemory    │
│  (generates      │     │ (MEMORY_ADDED)    │     │  .addEvent()    │
│   narrative)     │     └──────────────────┘     └───────┬────────┘
└─────────────────┘                                       │
                                                    ┌─────┴──────┐
                                                    ▼            ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │EmbeddingQueue │ │ WriteBehind  │
                                            │ (batch BGE-M3)│ │   Buffer     │
                                            └──────┬───────┘ └──────┬───────┘
                                                   │                │
                                                   ▼                ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │ VectorIndex   │ │ SQLiteStore  │
                                            │ (FAISS)       │ │ (tns.db)     │
                                            └──────────────┘ └──────────────┘

Query flow:
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│ AgentMemory   │────▶│ SQLiteStore       │────▶│ FTS5 (keyword)  │
│ .search()     │     │ .searchMemories   │     │ + Dense vectors │
│               │     │                   │     │ → RRF fusion    │
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
                    │  World Management    │
                    │  (BC1)               │
                    └──────────┬──────────┘
                               │ creates/loads
                               ▼
┌──────────────┐    ┌─────────────────────┐    ┌──────────────┐
│ Entity &     │◀──▶│  Narrative & Story   │◀──▶│  NPC &       │
│ Graph (BC2)  │    │  (BC3)               │    │  Dialogue    │
└──────┬───────┘    └──────────┬──────────┘    │  (BC4)       │
       │                       │                └──────┬───────┘
       │                       │                       │
       │                       ▼                       │
       │              ┌─────────────────────┐          │
       │              │  LLM Integration     │          │
       │              │  (BC8)               │◀─────────┘
       │              └──────────┬──────────┘
       │                         │
       │    ┌────────────────────┼────────────────────┐
       │    ▼                    ▼                    ▼
       │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │ │  Social &     │ │  Quests      │ │  Villain     │
       │ │  Relationships│ │  (BC6)       │ │  (BC10)      │
       │ │  (BC5)        │ └──────┬───────┘ └──────────────┘
       │ └──────┬───────┘        │
       │        │                │
       │        ▼                ▼
       │ ┌─────────────────────────────┐
       │ │  Probability & Combat       │
       │ │  (BC9)                      │
       │ └─────────────────────────────┘
       │
       ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Memory & Knowledge  │◀──▶│  Intelligence        │
│  (BC7)               │    │  (BC11)              │
└─────────────────────┘    └─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Literary Compiler   │  (BC12, v0.33.4)
│  v2                  │
└─────────────────────┘
```

**Ключевые зависимости:**

| Исходный BC | Целевой BC | Механизм связанности |
|-----------|-----------|-------------------|
| BC1 (Мир) | BC2 (Сущности) | Общий экземпляр `UnifiedEntityStore` |
| BC1 (Мир) | BC3 (Нарратив) | `NarrativeService.reset()` |
| BC3 (Нарратив) | BC4 (NPC) | `NPCRuntime` внедряется в `RoleplayEngine` |
| BC3 (Нарратив) | BC5 (Социальное) | `SocialSimulator` внедряется в `DirectorLoop` |
| BC3 (Нарратив) | BC6 (Квесты) | `QuestManager` внедряется в `StoryEngine` |
| BC3 (Нарратив) | BC10 (Злодей) | `VillainManager` внедряется в `DirectorLoop` |
| BC3 (Нарратив) | BC9 (Вероятности) | `ProbabilityEngine` в `RoleplayEngine` |
| BC3 (Нарратив) | BC12 (ЛитКомпилятор) | `RoleplayEngine` вызывает `searchTemplates` + `fillTemplate` |
| BC4 (NPC) | BC7 (Память) | `NPCRuntime` использует `EpisodicMemory` |
| BC5 (Социальное) | BC2 (Сущности) | `SocialGraph` читает из `UnifiedEntityStore` |
| BC8 (LLM) | Все BC | `LLMQueue` общий для всех агентов |
| BC8 (LLM) | BC12 (ЛитКомпилятор) | Оффлайн-экстрактор использует `LLMClient` для структурированного извлечения |
| BC7 (Память) | BC8 (LLM) | `EmbeddingQueue` вызывает `LLMClient` для эмбеддингов |
| BC11 (Интеллект) | BC2 (Сущности) | Анализ графа читает `GraphStore` |

---

## [A10] Ключевые проектные решения

### D1: Паттерн «Корень композиции»

**Решение:** `NarrativeService` (`src/services/narrative-service.ts`) выступает корнем композиции, создавая все сервисы и связывая зависимости вручную.

**Компромисс:** Явный DI без фреймворка. Все зависимости видны в одном конструкторе, что делает систему удобной для отладки, но многословной. Альтернатива (IoC-контейнер) добавила бы «магию» во время выполнения.

### D2: JSON-файлы как основное хранилище (с SQLite для поиска)

**Решение:** Состояние сущностей, профили NPC и социальные связи хранятся в виде JSON-файлов. SQLite используется только для поиска (FTS5), эмбеддингов (векторы), сессий и промптов агентов.

**Компромисс:** Простые чтения/записи с атомарными файловыми операциями, но без транзакционных гарантий между сущностями. Паттерн `atomicWriteJson()` (запись во временный файл + переименование) обеспечивает устойчивость к сбоям для отдельных записей, но не согласованность между несколькими файлами. SQLite обеспечивает полный ACID для поиска и эмбеддингов.

### D3: Шина событий для межконтекстной коммуникации

**Решение:** `EventBus` с обработчиками, отсортированными по приоритету, и буфером повтора асинхронно связывает ограниченные контексты.

**Компромисс:** Разделяет контексты (NPC не знает о Памяти, Память не знает о NPC), но добавляет косвенность. Буфер повтора (100 событий) гарантирует, что запоздавшие подписчики не пропустят недавние события, ценой затрат памяти.

### D4: Назначение модели для каждого агента

**Решение:** Каждый агент (`stylist`, `director`, `researcher`, `translation` и т.д.) может иметь собственного LLM-провайдера, модель, температуру и максимальное количество токенов.

**Компромисс:** Максимальная гибкость (дешёвые модели для chronicler, мощные — для stylist), но требует управления конфигурацией. ProviderManager обрабатывает это с помощью `conf/providers.json` и `conf/agents.json`.

### D5: Трёхуровневый профиль сущности (L1/L2/L3)

**Решение:** Профили сущностей используют три уровня: L1 (идентичность/имя), L2 (динамическое состояние/локация), L3 (скрытое/тайное).

**Компромисс:** Позволяет постепенное раскрытие и скрытые секреты, контролируемые DM. L1 всегда видим, L2 обновляется во время игры, L3 скрыт от игроков. Цена — дополнительная сложность разрешения профилей.

### D6: Фоновый Director Loop

**Решение:** `DirectorLoop` работает как фоновый интервал, оркестрируя тики часов, социальную симуляцию, действия злодея и сюжетные узлы независимо от ввода игрока.

**Компромисс:** Создаёт живой мир, который развивается даже когда игроки офлайн. Компромисс — сложность управления состоянием (состояния паузы/работы, кулдауны основных узлов) и возможность событий, которые игроки пропустят.

### D7: Гибридный поиск (FTS5 + Векторный + RRF)

**Решение:** Поиск по памяти использует как ключевые слова (FTS5), так и семантический (плотный векторный) поиск, объединённые через Reciprocal Rank Fusion.

**Компромисс:** Лучшее из двух миров — точное совпадение по ключевым словам и семантическое сходство. Цена — поддержка обоих индексов и конвейера эмбеддингов (BGE-M3 через сервер llama.cpp на порту 5002).

### D8: Ветвление в стиле Git для сюжетных графов

**Решение:** `BranchManager` поддерживает ветвление графа сущностей, позволяя альтернативные сюжетные пути.

**Компромисс:** Позволяет сценарии «что если» и параллельные таймлайны без дублирования всего состояния мира. Каждая ветка хранит только добавления и удаления относительно родителя.

### D9: Промпты агентов на основе шаблонов с откатом к SQLite

**Решение:** Промпты агентов хранятся в SQLite (`agent_prompts`) с изоляцией для каждого мира и языка, с откатом к JSON-файлам, а затем к встроенным значениям по умолчанию.

**Компромисс:** Поддерживает i18n и настройку для каждого мира без изменения кода. Трёхуровневый откат гарантирует работу системы даже без базы данных.

### D10: Mojo FFI для критичных по производительности вычислений

**Решение:** Вероятностные расчёты и векторные операции могут использовать Mojo FFI-ядра (`probability_ffi.mojo`, `vector_ffi.mojo`) с откатом на TypeScript.

**Компромисс:** Значительный выигрыш производительности для пакетных операций (броски вероятностей, косинусное сходство), но добавляет сложность сборки и зависимость от платформы. Откаты на TypeScript обеспечивают переносимость.

---

## Приложение: Справочник файлов

| Директория | Файлы | Назначение |
|-----------|-------|---------|
| `src/models/` | 12 файлов | Доменные модели (Entity, Quest, Story, Director, NPC, Romance, Probability, Memory, Item, Rank, Archetype) |
| `src/services/` | 45+ файлов | Прикладные + доменные сервисы |
| `src/routes/` | 18 файлов | HTTP-адаптеры (роутеры Hono) |
| `src/lib/` | 15+ файлов | Инфраструктура (LLM, SQLite, EventBus, векторные операции, провайдеры) |
| `src/memory/` | 12 файлов | Подсистема памяти (оценка, кластеризация, эмбеддинги, когнитивный конвейер) |
| `src/intelligence/` | 10 файлов | Анализ графа и валидация |
| `src/store/` | 1 файл | Единое хранилище сущностей с NameIndex |
| `src/config/` | env.ts | Конфигурация окружения |
| `src/i18n/` | Интернационализация | Многоязычная поддержка (7 языков) |
| `src/middleware/` | auth, rate-limiter и т.д. | HTTP-промежуточный слой |
| `src/utils/` | logger, sanitize и т.д. | Общие утилиты |

