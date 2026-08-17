# Миграция на v2-парадигму — спецификация полной зачистки

**Дата:** 2026-08-17
**Статус:** Дизайн (ожидает одобрения)
**Автор:** Архитектурная сессия (compose:brainstorm)
**Скоуп:** Полный переход на v2-парадигму (Big Six + computable prompts), отказ от старых static-prompt поверхностей

> **Терминология:**
> - **Big Six (Большая шестёрка)** — шесть v2-агентов: `dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`. Определены в `src/services/agent-v2.ts:7`.
> - **Computable prompts (вычисляемые промпты)** — промпты, которые конструируются как функция от нескольких сигналов: психотип игрока, MCP-retrieval (поиск по шаблонам), распределение вероятностей, стиль. Не статическая строка, а результат вычисления.
> - **Static prompts (статичные промпты)** — фиксированные строки-шаблоны в `DEFAULT_PROMPTS` (`agent-config.ts:152-188`), куда подставляются переменные. Нет адаптации к психотипу, нет检索а (retrieval).
> - **MCP** — Model Context Protocol; здесь: инструменты литературного компилятора (`searchTemplates`, bible `search_verses`), доступные через `src/mcp/literary-compiler/`.
> - **Психотип** — Jungian-профиль игрока (L3), собираемый из поведенческих сигналов; влияет на tone/style нарратива.

---

## [S1] Проблема

В кодовой базе сосуществуют две парадигмы генерации текста.

**v2-парадигма (Big Six):** промпт вычисляется из множества сигналов.
Пример — `StylistAgent.buildMicroPrompt` (`src/services/agents/stylist.ts:203-250`):
```
prompt = f(filledSkeleton, style, context, outcome, playerVoice, authorPhrases)
```
Где `style` приходит из MCP (`getStyleForTemplate`), `playerVoice` — из распределения и психотипа, `filledSkeleton` — из Dramaturg-шаблона. Это адаптивная, контекстно-зависимая генерация.

**Старая парадигма (static prompts):** промпт — фиксированная строка с подстановкой переменных.
Пример — `DEFAULT_PROMPTS.story-planner` (`agent-config.ts:163-167`):
```
systemPrompt: "You are a story planner for an interactive fantasy world..."
userTemplate: "World state:\n{world_state}\n\nActive characters:\n{characters}..."
```
Никакой адаптации к психотипу, нет поиска по MCP-шаблонам, нет модуляции tone по распределению.

**Когда v2-парадигма активна, старая не просто хуже — она семантически некорректна:** статичный промпт игнорирует психотип игрока, не тянет релевантные шаблоны из литературного компилятора, не модулирует tone. Это другой эпистемический уровень.

### Что уже сделано (верифицировано 2026-08-17)

- Legacy prose-агенты (`NarratorAgent`, `NPCAgent`, `SceneAgent`, `DirectorAgent`) — **уже удалены**. `grep -E "class\s+(NarratorAgent|NPCAgent|SceneAgent|DirectorAgent)"` по `*.ts` возвращает пусто.
- Big Six — **полностью встроены** в главный pipeline: `_processInputImpl` (`roleplay-engine.ts:440-569`) вызывает `v2Generator.generate()` (line 502) как единственный prose-путь.
- `legacy-adapter.ts` — **удалён** (fff не находит файл).
- 4 бага v2-prose pipeline — **исправлены**: DB-путь (`getLiteraryDb` → `data/literary-compiler/literary.db`, line 961), retrieval keys (`buildRetrievalKeys`, line 107-115), context field (`extractVariables` использует `ctx.character?.name`, line 119), style shape (`getStyleForTemplate` возвращает `MicroStyle`, line 126-140).
- Флаг `literary-compiler-v2` — **ON** (`conf/feature-flags.json:131-152`, enabled:true, percentage:100).
- `EngineAgents` interface (`roleplay-engine.ts:86-95`) содержит **только Big Six + crafter + researcher** — legacy prose-агентов там нет.

### Что осталось «старым» (3 слоя, ноль пересечений с Big Six)

1. **@mention service-агенты** — 5 инлайн-лямбд в `_getAgentById` (`roleplay-engine.ts:869-929`) со статичными промптами-строками. Реагируют на `@agent сообщение` в чате.
2. **crafter + researcher** — подсистемы игровых механик со статичными промптами (`PromptBuilder.buildCrafterPrompt`, `ResearcherAgent`).
3. **v1 `AgentRegistry` + `DEFAULT_AGENTS`/`DEFAULT_PROMPTS`** — config/metadata-слой для admin-API (`/api/agents/registry/*`, `/api/agents/:id`).

---

## [S2] Обзор решения

Последовательная миграция в 3 вектора: **Активация → Миграция поверхностей → Декомиссия**.

1. **Вектор 1 (Активация):** Включить 4 построенных, но выключенных feature-флага. Код v2-парадигмы уже интегрирован в `_processInputImpl` — нужно только активировать.
2. **Вектор 2 (Миграция поверхностей):** Перевести 3 static-prompt поверхности на вычисляемые промпты: @mention-агенты, flavor-text крафтера, researcher.
3. **Вектор 3 (Декомиссия):** Удалить `DEFAULT_PROMPTS` static-слой, почистить v1 registry, обновить документацию.

Последовательность жёсткая: 1 → 2 → 3. Декомиссия (3) блокируется миграцией поверхностей (2) — нельзя удалить то, что ещё используется.

---

## [S3] Вектор 1 — Активация

Цель: включить 4 парадигмальных слоя, которые уже построены и встроены в pipeline, но выключены через feature-flags.

### Текущее состояние активации (верифицировано по `conf/feature-flags.json`)

| Парадигмальный слой | Флаг | Состояние | Где встроен в код |
|---------------------|------|-----------|-------------------|
| MCP retrieval в prose | `literary-compiler-v2` | ✅ ON | `v2Generator.generate()` (`roleplay-engine.ts:502`) |
| Psychotype profiling | `jungian-profiler-enabled` | ⛔ OFF | `metricsCollector.recordInput/recordIntent/recordSimulation` (lines 456-477), `runBlendCycle` (489), `runEnrichmentConveyor` (491), `censor.clean` (553) |
| Literary modulation (tone hints) | `literary-modulation-enabled` | ⛔ OFF | `computeLiteraryToneHint(dist)` (line 420), `logLiterarySignals` (562) |
| Short turn expansion | `short-turn-expansion-enabled` | ⛔ OFF | `shouldExpand` + `expand()` (lines 511-531) |
| Deferred hooks | `deferred-hooks-enabled` | ⛔ OFF | `DeferredHookStore` (lines 534-550) |

### Шаги

**Шаг 1.1 — Pre-flight: аудит кодовых путей психотипа.**

Перед активацией нужно подтвердить, что код психотипа完整ен — нет заглушек, TODO, неполных веток. Прочитать и проверить:
- `RoleplayEngine.initJungianProfile()` — инициализация профиля
- `metricsCollector` — собирает ли поведенческие сигналы (recordInput, recordIntent, recordSimulation)
- `runBlendCycle()` — смешивает ли профиль (EMA + rate limit)
- `runEnrichmentConveyor(gameContext, outcome)` — строит ли playerVoice из dramaturg + actor + validator
- `censor.clean(narrative, gameContext)` — фильтрует ли вывод

Особое внимание: `runEnrichmentConveyor` защищён проверкой `jungianProfile.confidence >= 0.3` (`roleplay-engine.ts:490`). Это означает, что на первых ходах (когда сигналов мало и confidence низкий) конвейер НЕ запускается — это правильный design, нужно подтвердить, что 0.3 достижимо за разумное число ходов.

**Шаг 1.2 — Включить `jungian-profiler-enabled`.**

Изменить в `conf/feature-flags.json` (runtime-конфиг) и в `DEFAULT_FLAGS` (`src/config/feature-flags.ts`, для свежих установок):
```json
{ "id": "jungian-profiler-enabled", "enabled": true, "percentage": 100 }
```
Важно: `conf/feature-flags.json` переопределяет `DEFAULT_FLAGS` когда загружен — нужно обновить ОБА места. Также `isEnabled()` требует `percentage:100` (или проходящий hash) в дополнение к `enabled:true`.

**Шаг 1.3 — Включить `literary-modulation-enabled`.**

Тот же паттерн: `conf/feature-flags.json` + `DEFAULT_FLAGS`. Этот флаг включает `computeLiteraryToneHint(dist)` (line 420) — soft bias на archetype selection через literary coefficients.

**Шаг 1.4 — Включить `short-turn-expansion-enabled`.**

Включает `shouldExpand` + `expand()` (lines 511-531). Короткие игровые ходы ("Я иду к двери") получают литературное расширение через LLM.

**Шаг 1.5 — Включить `deferred-hooks-enabled`.**

Включает `DeferredHookStore` (lines 534-550). NPC, которых игрок заметил, но отверг, получают «мягкий» callback позже.

**Шаг 1.6 — E2E валидация: полная play-сессия со всеми 4 флагами ON.**

Это критический checkpoint. Запустить полноценную игровую сессию и проверить:
- `metricsCollector` собирает сигналы (логи `recordInput`/`recordIntent`/`recordSimulation` не пустые)
- `runBlendCycle()` не падает на пустом профиле (первый ход — confidence=0, конвейер не запускается, но blend должен работать)
- `censor.clean()` фильтрует вывод без ошибок
- Нет пустых нарративов (fallback "The story pauses here." — line 505 — не должен срабатывать)
- `jungianProfile.confidence` растёт и достигает 0.3 за разумное число ходов
- `expand()` не ломает short turns

**Шаг 1.7 — Commit + push.**

Зафиксировать активированное состояние.

---

## [S4] Вектор 2 — Миграция поверхностей

### [S4.1] 2a. @mention → вычисляемые промпты

#### Контекст

@mention-роутинг сейчас работает через `_getAgentById` (`roleplay-engine.ts:869-929`) — метод возвращает `ServiceMessageAgent` (interface из `roleplay-engine.ts:78-82`):
```typescript
interface ServiceMessageAgent {
  name: string;
  generateServiceMessage(ctx: ServiceMessageContext): Promise<string>;
}
```
Текущие 5 агентов — инлайн-лямбды со статичными промптами-строками:
- `chronicler` (line 871-877) — возвращает timeline без LLM
- `story-planner` (line 878-893) — статичный промпт + `generateText('story-planner')`
- `social-sim` (line 894-909) — статичный промпт + `generateText('social-sim')`
- `villain` (line 910-925) — статичный промпт + `generateText('villain')`
- `researcher` (line 926) — `this.researcher` (ResearcherAgent instance)

Ни один из них не использует психотип, MCP-retrieval или distribution-signals.

#### Точка решения 2a-D1: контрактный разрыв

Big Six принимают `(intent: Intent, simulation: SimulationResult, context: GameContext, pattern?)` — это prose-контракт. @mention принимает `(message: string, ctx: ServiceMessageContext)` — free-text, без intent/simulation.

**Рекомендация: adapter-подход.** Построить адаптер, который оборачивает free-text сообщение в синтетический `Intent` + минимальный `SimulationResult` + существующий `GameContext`, и вызывает Big Six через `AgentRegistryV2`:
```typescript
// Концепция адаптера (не финальный код)
function adaptToBigSixInput(message: string, ctx: ServiceMessageContext): BigSixInput {
  return {
    intent: { type: 'dialogue', content: message } as Intent,
    simulation: { stateChanges: [], outcome: 'neutral' } as SimulationResult,
    context: buildGameContextFromServiceCtx(ctx),
  };
}
```
Это переиспользует computable-prompt-машинерию Big Six без нового интерфейса.

#### Шаги

**Шаг 2a.1 — Аудит маппинга @mention → Big Six.**

Определить, какие @mention-ID маппятся на Big Six:
- `@chronicler` → `ChroniclerAgent` (Big Six, уже зарегистрирован в `agentRegistry` line 279). Сейчас работает через лямбду — заменить на `this.agentRegistry.get('chronicler')`.
- `@dramaturg` → `DramaturgAgent` (новый route)
- `@stylist` → `StylistAgent` (новый route)
- `@actor` → `ActorAgent` (новый route)
- `@validator` → `ValidatorAgent` (новый route)
- `@censor` → `CensorAgent` (новый route)

**Шаг 2a.2 — Построить адаптер.**

Создать функцию-адаптер (см. концепцию выше), которая конвертирует `ServiceMessageContext` в `Intent` + `SimulationResult` + `GameContext`. Разместить рядом с `_getAgentById` или в отдельном модуле.

**Шаг 2a.3 — Wire Big Six в `_getAgentById`.**

Заменить инлайн-лямбды на вызовы через `this.agentRegistry.get(id)` + адаптер. Для Big Six agents, которые не подходят для @mention (например, `validator` проверяет narrative, не отвечает на сообщения), — вернуть информативное сообщение или не регистрировать в @mention-роутинге.

**Шаг 2a.4 — Точка решения 2a-D2: non-redundant @mention-агенты.**

`@story-planner`, `@social-sim`, `@villain`, `@researcher` — не имеют прямого Big Six-эквивалента. Варианты:
- **Удалить** `@story-planner` (≈ dramaturg) и `@social-sim` (≈ actor) — Big Six покрывает их функцию
- **Оставить** `@villain` и `@researcher` если они имеют самостоятельную ценность (villain-управление, research-задачи), либо тоже удалить

**Рекомендация:** удалить `@story-planner` и `@social-sim` (избыточны с Big Six), оставить `@villain` и `@researcher` — но перевести их промпты на computable-подход (психотип + MCP).

**Шаг 2a.5 — Обновить error-сообщение и тесты.**

Error-строка в `processAgentMessage` (line 837) сейчас перечисляет `chronicler, story-planner, social-sim, villain, researcher` — обновить под новый список доступных агентов. Обновить `tests/security-fixes.test.ts` (AGENT_MENTION regex-тесты).

---

### [S4.2] 2b. crafter flavor → вычисляемые промпты

#### Контекст

`CrafterAgent` (`src/services/crafter-agent.ts:38-314`) — игровая механика для команд `/craft`, `/inventory`. Механика (state changes, инвентарь) детерминирована и не нуждается в v2. Но **flavor text** — описания созданных предметов, атмосферные детали — сейчас генерируется через `PromptBuilder.buildCrafterPrompt` (статичный промпт).

#### Шаги

**Шаг 2b.1 — Аудит: разделить mechanics от flavor.**

Прочитать `CrafterAgent` и `PromptBuilder.buildCrafterPrompt`. Определить, где генерируется текст (descriptions, atmospheric details) vs где применяются механические изменения (stateChanges, инвентарь).

**Шаг 2b.2 — Flavor text через stylist + MCP.**

Направить flavor-генерацию через `stylist.buildMicroPrompt` + MCP retrieval. Craft-result выступает как "outcome" в терминологии Big Six:
```typescript
// Концепция
const flavorPrompt = stylist.buildMicroPrompt(
  craftDescription,           // filledSkeleton
  styleFromMCP,               // style (getStyleForTemplate)
  { world, location },        // context
  craftOutcome,               // outcome ("crafted: iron_sword")
  playerVoice,                // психотип-адаптация
  authorPhrases,              // авторские фразы
);
```
Механика (stateChanges) остаётся в CrafterAgent нетронутой.

**Шаг 2b.3 — Интеграция + тесты.**

Убедиться, что механика крафта не сломана (предметы создаются, инвентарь обновляется), а flavor-текст адаптирован к психотипу и стилю.

---

### [S4.3] 2c. researcher → MCP retrieval

#### Контекст

`ResearcherAgent` (`src/services/researcher-agent.ts:24-152`) — фоновый research через `IdleResearchScheduler` + `item-evaluation.ts`. Сейчас использует статичные промпты. Research-задачи (fact-checking, realism validation) могли бы использовать MCP-retrieval вместо статичных промптов.

#### Шаги

**Шаг 2c.1 — Аудит: найти static промпты.**

Прочитать `ResearcherAgent` и `IdleResearchScheduler`, определить, где используются статичные промпт-строки.

**Шаг 2c.2 — Заменить на MCP retrieval.**

Вместо статичного промпта — использовать `searchTemplates(db, keys, 2)` (литературные шаблоны) или bible `search_verses` / `get_pattern` (библейские архетипы) для retrieval-augmented research. Это даст research-агенту доступ к компилированному литературному корпусу вместо генерации "из пустоты".

**Шаг 2c.3 — Интеграция + тесты.**

Убедиться, что background research работает и возвращает релевантные результаты.

---

## [S5] Вектор 3 — Декомиссия

### Шаги

**Шаг 3.1 — Аудит: подтвердить, что `DEFAULT_PROMPTS` больше не используется.**

После Вектора 2 (когда @mention, crafter, researcher мигрированы), проверить, что `DEFAULT_PROMPTS` (`agent-config.ts:152-188`) не referenced активным кодом. Использовать `grep` или `codebase-memory-mcp search_code` для поиска ссылок.

**Шаг 3.2 — Удалить static `DEFAULT_PROMPTS` для мигрировавших поверхностей.**

Оставить только те entries, которые ещё используются (например, `translation` — переводческий промпт, если он не мигрирован).

**Шаг 3.3 — Точка решения 3-D1: v1 `AgentRegistry`.**

v1 `AgentRegistry` (`src/services/agent-registry.ts:35-194`) — это **не мёртвый код**, а живой backend для admin-API:
- `/api/agents/registry` (list, stats) — `routes/agents.ts:185-206`
- `/api/agents/:id` (config, prompts, model assignment) — `routes/agents.ts:70-114`

Он управляет metadata (name, description, priority, enabled, prompts, provider/model) — это конфигурация, не промпт-генерация. **Не конфликтует с v2-парадигмой.**

Варианты:
- **Объединить** в `AgentRegistryV2` — единый registry, но требует расширения V2-интерфейса metadata-методами (enable/disable/update/getStats)
- **Оставить** как admin-config слой — он serves другую цель (UI-конфигурация), не дублирует Big Six-runtime-registry

**Рекомендация:** оставить как admin-config слой. v1 registry управляет конфигурацией агентов для UI, AgentRegistryV2 управляет runtime-инстансами Big Six. Это разные concerns (zones of responsibility). Объединение добавит риск без парадигмальной пользы.

**Шаг 3.4 — Удалить мёртвый код.**

После удаления `DEFAULT_PROMPTS`-entries — почистить unused imports, orphaned файлы, неиспользуемые типы. Проверить через `tsc --noEmit` (typecheck).

**Шаг 3.5 — Обновить документацию.**

- `docs/AGENTS.md` — отразить v2-only реальность (Big Six как единственный prose-pipeline, @mention-routing через Big Six)
- `docs/en/ARCHITECTURE.md` (и переводы) — обновить диаграммы pipeline
- Убрать упоминания удалённых legacy-агентов

**Шаг 3.6 — Финальная верификация.**

`bun test` (полный набор) + typecheck. Убедиться, что ничего не сломано.

---

## [S6] Точки принятия решений

Три решения требуют вашего подтверждения перед реализацией:

- **2a-D1:** @mention-адаптер (синтетический Intent) vs отдельный `ServiceMessageAgentV2` интерфейс.
  - **Рекомендация:** adapter — переиспользует Big Six-машинерию без нового интерфейса.

- **2a-D2:** `@story-planner` / `@social-sim` / `@villain` / `@researcher` — удалить или построить computable-версию.
  - **Рекомендация:** удалить `@story-planner` и `@social-sim` (избыточны с Big Six), оставить `@villain` и `@researcher` с computable-промптами.

- **3-D1:** v1 `AgentRegistry` — объединить в AgentRegistryV2 или оставить как admin-config слой.
  - **Рекомендация:** оставить как admin-config слой (metadata для UI, не промпты — не конфликтует с v2-парадигмой).

---

## [S7] Архитектурные наблюдения

- **Big Six `process(intent, simulation, context)` — это prose-generation контракт.** Его нельзя forced-навязывать game-mechanic подсистемам (crafter, researcher), чьи invocation-паттерны — command-driven / timer-driven. Их v2-миграция = computable prompts для text-output, не смена интерфейса.
- **v1 `AgentRegistry` — живой admin-config API** (`/api/agents/registry/*`, `/api/agents/:id`), не мёртвый код. Управляет metadata (name, priority, enabled, prompts, provider/model) для admin UI. Удаление без замены ломает UI.
- **Feature flags — механизм активации.** `conf/feature-flags.json` переопределяет `DEFAULT_FLAGS` при наличии — обновлять нужно оба места. `isEnabled()` требует `percentage:100` (или проходящий hash) в дополнение к `enabled:true`.
- **`getLiteraryDb()` открывает `data/literary-compiler/literary.db`** (`roleplay-engine.ts:961`) — корректный путь. `scene_templates` / `style_patterns` могут быть пустыми (0 rows) — это вызывает graceful fallback к `stylist.process()` (ожидаемое поведение, не баг). Заполнение этих таблиц — отдельная задача Gutenberg-pipeline, не часть данной миграции.
- **Психотип-код строился с phase-gating** и не тестировался под нагрузкой со всеми 4 флагами ON. Шаг 1.6 (E2E валидация) — критический checkpoint: если pipeline падает на пустом профиле (первый ход), нужен fallback. Защита уже в коде: `runEnrichmentConveyor` guarded by `confidence >= 0.3` (line 490).
