# SPEC: Safe Cleanup + Coverage-Driven Refactor (TNS → v2 / Big Six)

> Цель: получить хорошо работающий, менее раздутый код с актуальными фичами и решениями.
> Без полного rewrite. Без внешних coverage-инструментов (только Bun built-in).
> Стратегия: Strangler Fig + Safe Delete + Coverage as navigator.

## 1. Non-goals
- Полный rewrite с нуля.
- Внешние инструменты coverage (c8, nyc, Vitest, Codecov и т.д.).
- Смешивание cleanup и новых фич в одном изменении.
- Удаление кода без baseline-тестов и без понимания вызовов.
- Жёсткий высокий coverage-threshold на весь репозиторий на старте.

## 2. Canonical Architecture (источник правды)

### 2.1 Актуальный pipeline (State-First)
Player Input
  → PipelineRunner.buildContext()
  → translateAndClassify() (IntentParser + TranslationService)
  → CommandHandler (early exit)
  → runSimulation() (SimulationEngine, deterministic)
  → StateMutator.applyChanges()
  → buildGameContext()
  → Prose:
       • LiteraryV2Generator (feature-flag, preferred)
       • LegacyIntentGenerator (deprecated, to be removed)
  → TranslationService (если нужно)
  → Response

### 2.2 Актуальные агенты (Big Six)
- Dramaturg
- Validator
- Stylist
- Actor
- Censor
- Chronicler

Всё, что относится к старым 14 агентам / старым orchestration-путям — legacy.

### 2.3 Актуальные подсистемы (сохраняем)
- State-First PipelineRunner + SessionState + CommandHandler
- UnifiedEntityStore + Graph
- Memory / RAG (hybrid)
- Literary V2 + modulation / feedback / deferred hooks (если уже в main)
- Jungian Profiler (v1.3, за feature-flag)
- Probability / Simulation
- NPC runtime, economy, social (текущие рабочие пути)
- i18n, feature flags, provider system

### 2.4 Legacy (под удаление / strangler)
- LegacyIntentGenerator и связанные handlers (Movement/Dialogue/Observation/Action старого стиля)
- Старые multi-agent пути до консолидации в Big Six
- Мёртвый код (0 импортов, 0 вызовов, низкое coverage)
- Устаревшие адаптеры, дубли конфигов, неиспользуемые Mojo/скрипты (только после проверки)
- Любые пути, выключенные feature-flag’ом и не используемые по умолчанию

## 3. Coverage Strategy (только Bun)

### 3.1 Конфигурация
- Использовать только `bun test --coverage`.
- `bunfig.toml`:
  - coverage = true (или включать флагом)
  - coverageSkipTestFiles = true
  - coverageReporter = ["text", "lcov"]
  - coverageDir = "./coverage"
  - coverageThreshold сначала мягкий или 0 (чтобы не блокировать cleanup)

### 3.2 Как использовать coverage
1. Снять baseline: `bun test --coverage`.
2. Искать файлы с низким % Lines / % Funcs и большим Uncovered Line #s.
3. Сопоставлять с legacy-списком и с реальными вызовами из PipelineRunner / RoleplayEngine / NarrativeService.
4. Кандидаты на удаление: низкое покрытие + нет живых вызовов из канонического пути.
5. После каждого удаления — снова coverage + полный test suite.

Coverage — навигатор, а не цель «100%».

## 4. Cleanup Process (безопасный порядок)

### Phase 0 — Подготовка (обязательно)
- Тег стабильной точки (например v0.32.x-stable).
- Полный `bun test` + `tsc --noEmit` как baseline.
- Документ CANONICAL (этот SPEC является его частью).
- Feature flags: новый путь = default, legacy = opt-in + warning в лог.

### Phase 1 — Mark, don’t delete
- Пометить legacy: `@deprecated` или `// LEGACY — scheduled for removal`.
- Выключить legacy-пути по умолчанию.
- Не удалять ещё.

### Phase 2 — Safe Delete (маленькими порциями)
Порядок приоритета:
1. Совсем мёртвый код (0 references).
2. Legacy за флагом, который уже default=false и не используется.
3. Тонкие адаптеры/дубли.
4. Большие legacy-подсистемы (только после покрытия тестами нового пути).

Каждое изменение:
- Зелёные тесты.
- Coverage не ухудшается критично (желательно растёт за счёт удаления мёртвого).
- Короткое описание: что удалили и почему это больше не канон.

### Phase 3 — Harden
- Поднять coverageThreshold на критичных модулях (Pipeline, EntityStore, Agents, Simulation).
- Обновить ARCHITECTURE / CANONICAL.
- Удалить оставшиеся feature-flag’и legacy, когда уверены.

## 5. Правила для агента

1. Любое предложение об удалении должно опираться на:
   - отсутствие вызовов из канонического pipeline/Big Six;
   - низкое coverage или явную пометку legacy;
   - сохранение зелёных тестов.
2. Не менять публичные контракты domain/pipeline без явного указания в задаче.
3. Не смешивать cleanup и новые фичи.
4. Предпочитать Strangler (новый путь рядом → переключение → удаление старого).
5. После изменений всегда предлагать команды проверки:
   `bun test` и `bun test --coverage`.
6. При сомнении — сначала mark as deprecated, потом delete.

## 6. Критерии успеха
- Система работает как раньше (или лучше) на каноническом пути.
- Меньше кода, меньше legacy-веток.
- Big Six + State-First — единственный основной путь.
- Coverage используется как инструмент поиска мёртвого/раздутого кода.
- Можно безопасно продолжать добавлять новые фичи поверх чистого канона.
