# Стратегия буста: Safe Cleanup + Coverage-Driven Refactor (TNS → v2 / Big Six)

**Дата:** 2026-08-18
**Статус:** Реализовано (v0.33.0)
**Основания:** `safe_cleanup.md` + `2026-08-17-v2-paradigm-migration-design.md`
**Версия кода:** 0.33.0 (верифицировано 2026-08-18)
**Метод:** Strangler Fig + Safe Delete + Bun coverage как навигатор

> Эта стратегия синтезирует обе спецификации и **корректирует** их там, где
> реальное состояние кода расходится с документацией (см. §1, «Расхождения»).

---

## 0. Расхождения спецификаций с реальным кодом (верифицировано)

Перед стратегией — факты, которые меняют план. Спецификации писались в разное
время; код ушёл вперёд в одних местах и отстал в других.

| Что спецификация утверждает | Реальность (2026-08-18) | Влияние на план |
|---|---|---|
| `safe_cleanup.md:26`: «LegacyIntentGenerator (deprecated, to be removed)» | **Удалён.** `ffgrep` / `search_graph` — 0 совпадений | Убрать из Phase 2; prose-путь уже = `literary-v2-generator.ts` |
| `v2-paradigm:42`: «legacy-adapter.ts — удалён (fff не находит файл)» | **Существует:** `src/services/roleplay/agents/legacy-adapter.ts` (17 строк, `LegacyAgentAdapter`). `search_code` — **0 ссылок** в коде | Phase 2, приоритет 1: мёртвый код, безопасное удаление |
| `safe_cleanup.md:54`: «устаревшие адаптеры» | `legacy-adapter.ts` — единственный найденный адаптер; `prose-generator.ts` — 13-строчный interface, **не legacy** | Не трогать `prose-generator.ts` |
| `v2-paradigm:40`: legacy prose-агенты удалены | **Подтверждено:** `NarratorAgent`/`NPCAgent`/`SceneAgent`/`DirectorAgent` — нет в `agents/` | OK |
| `v2-paradigm:131`: `literary-compiler-v2` ON | **Подтверждено:** `enabled:true, percentage:100` | OK |
| `v2-paradigm:76`: 4 флага OFF | **Подтверждено:** jungian-profiler, literary-modulation, short-turn-expansion, deferred-hooks — все OFF | Вектор 1 (активация) — отдельная задача, НЕ смешивать с cleanup |
| — | `chronicler.ts` (file logger) и `agents/chronicler-agent.ts` (Big Six) — **не дубликат**: разные слои | Investigate, не удалять вслепую |
| — | `@deprecated` в коде: **1 совпадение** (`routes/index.ts:41`) | Phase 1 фактически не начат |
| — | `bunfig.toml` — **не существует** | Phase 0: создать |
| — | `feature-flags.json`: 6 junk-флагов (`test-flag`, `delete-test`, `variant-test`, `enabled-flag`, `disabled-flag`, `disabled-variant`) + 2 OFF legacy (`narrative-v2`, `npc-memory-v2`) | Phase 1: пометить; Phase 2: удалить |
| — | `agents/chronicler-agent.ts` — **нет `.test.ts`** | Coverage-провал у Big Six |

---

## 1. Краткий диагноз текущих рисков

### Где больше всего раздутости относительно Big Six + State-First

**Эпицентр 1 — `src/services/` (100+ файлов, 1100 узлов графа).**
Services — hub всего проекта (fan-in 26, fan-out 227). Но внутри сосуществуют
канонический v2-путь и 3 legacy-слоя с нулевым пересечением с Big Six
(подтверждено v2-paradigm §S1):
- **Agent-bloat:** `agent-v2.ts` (Big Six defs) + `agent-registry-v2.ts` (runtime) + `agent-config.ts` (`DEFAULT_PROMPTS` static layer) + `agent-registry.ts` (v1 admin-config) + `agent-coordinator.ts` + `prompt-builder.ts` (static prompts). Шесть файлов для агентской подсистемы, из которых 2 — legacy config-слой.
- **@mention inline-лямбды** в `roleplay-engine.ts:869-929`: 5 агентов со статичными промптами-строками (`story-planner`, `social-sim`, `villain`, `researcher`, `chronicler`). Не используют психотип, MCP, distribution-signals.
- **`story-planner.ts`** — отдельный файл + тест, но v2-paradigm §S4.1 рекомендует удалить `@story-planner` (избыточен с dramaturg).
- **Дублирующие probability-файлы:** `probability-resolver.ts` + `probability-profiles.ts` + `probability-expression.ts` + `probability-types.ts` + `probability-system.test.ts`. Нужен аудит: что живо в каноническом pipeline, что — orphaned.

**Эпицентр 2 — `scripts/` (19 файлов, все `internal` fan-in=0).**
Gutenberg-pipeline скрипты (`download-gutenberg`, `import-gutenberg-texts`, `process-gutenberg`, `expand-corpus`, `gutenberg-selective`, `download-gutenberg-selected`, `build-gutenberg-catalog`, `compile-classics`) — одноразовая data-ingestion инфраструктура. Не dead code (запускаемы), но разделяют репозиторий и создают шум в coverage и graph.

**Эпицентр 3 — config-bloat.**
`conf/feature-flags.json`: 13 флагов, из которых 6 — test-артефакты и 2 — OFF legacy. Config-файл смешивает парадигмальные флаги с мусором.

**Эпицентр 4 — «мёртвый, но не помеченный».**
`legacy-adapter.ts` (0 ссылок, подтверждено graph). Практически нет `@deprecated` маркеров → невозможно отличить «legacy под флагом» от «активного кода» без graph-анализа. Это **главный риск**: cleanup без маркировки = удаление наугад.

**Риск-фактор 5 — coverage-слепота.**
`bunfig.toml` не существует. Нет baseline. Невозможно отличить «мёртвый код» (0% coverage) от «критичный, но непротестированный» (тоже 0%, но живой). Без baseline любое удаление — лотерея.

### Что НЕ является раздутостью (сохранять)
- `chronicler.ts` (file logger) — инфраструктура, не дубликат Big Six agent.
- `prose-generator.ts` — 13-строчный contract interface.
- v1 `AgentRegistry` — живой admin-API backend (`/api/agents/registry/*`), не мёртвый код (v2-paradigm §S5, §S7).
- Economy subsystem (4 модели + фасад) — канон per AGENTS.md.
- Gutenberg scripts — не удалять без отдельного решения (data-инфраструктура).

---

## 2. Пошаговый план cleanup по фазам

### Phase 0 — Подготовка (обязательно, ~1 сессия)

**0.1. Стабильная точка.**
```bash
git tag v0.33.0-stable-pre-cleanup
```

**0.2. Baseline тесты + typecheck.**
```bash
bun test                    # полный набор, фиксируем pass/fail count
bun run lint                # tsc --noEmit, фиксируем 0 errors
```
Записать baseline-цифры (кол-во тестов, pass/fail) в `docs/compose/reports/cleanup-baseline.md`.

**0.3. Создать `bunfig.toml` (coverage config).**
```toml
[coverage]
enabled = false          # включать флагом --coverage, не всегда
skipTestFiles = true
reporter = ["text", "lcov"]
dir = "./coverage"
# threshold = 0          # мягкий на старте, не блокирует cleanup
```
Снять baseline coverage:
```bash
bun test --coverage
```
Сохранить `coverage/` как reference. **Coverage-baseline = навигатор для всех последующих фаз.**

**0.4. CANONICAL-документ.**
Этот файл — часть canonical. Дополнительно: убедиться, что `safe_cleanup.md` §2 (Canonical Architecture) актуален — обновить пункт про `LegacyIntentGenerator` (уже удалён).

**Приоритетные модули Phase 0:** `bunfig.toml` (новый), `docs/compose/reports/cleanup-baseline.md` (новый).

---

### Phase 1 — Mark, don’t delete (~2–3 сессии)

Цель: сделать legacy **видимым** в коде, не удаляя ничего.

**1.1. Пометить `@deprecated` / `// LEGACY — scheduled for removal`.**

| Файл / артефакт | Маркер | Причина |
|---|---|---|
| `src/services/roleplay/agents/legacy-adapter.ts` | `@deprecated` на class | 0 ссылок в graph (верифицировано) |
| `src/services/agent-config.ts` → `DEFAULT_PROMPTS` | `@deprecated` на object | static-prompt слой, v2-paradigm §S5 шаг 3.2 |
| `src/services/prompt-builder.ts` → `buildCrafterPrompt` | `@deprecated` на method | v2-paradigm §S4.2: flavor → stylist+MCP |
| @mention inline-лямбды в `roleplay-engine.ts:878-929` | `// LEGACY — scheduled for removal, see v2-paradigm §S4.1` | static prompts, redundant с Big Six |
| `src/services/story-planner.ts` (если избыточен с dramaturg) | `@deprecated` | v2-paradigm §S4.1 рекомендация 2a-D2 |
| Junk-флаги в `feature-flags.json` | `"description": "DEPRECATED — test artifact, scheduled for removal"` | `test-flag`, `delete-test`, `variant-test`, `enabled-flag`, `disabled-flag`, `disabled-variant` |

**1.2. Feature-flag gating для legacy-путей.**
Для @mention-лямбд: если ещё не за флагом — обернуть в `if (!isEnabled('legacy-mention-agents'))` с warning в лог. Default = OFF (новый путь Big Six через адаптер — отдельная задача v2-paradigm Вектор 2).

**1.3. НЕ удалять.** Только маркеры + логирование.

**Приоритетные модули Phase 1:** `legacy-adapter.ts`, `agent-config.ts`, `prompt-builder.ts`, `roleplay-engine.ts` (@mention section), `feature-flags.json`.

---

### Phase 2 — Safe Delete (маленькими порциями, ~4–6 сессий)

**Порядок приоритета (строгий):**

#### P2.1 — Совсем мёртвый код (0 references)
Кандидаты (после graph + coverage подтверждения):
- `src/services/roleplay/agents/legacy-adapter.ts` — **подтверждено**: `search_code` 0 ссылок, `trace_path` — function not found. Удалить целиком.
- Любой файл из `src/services/` с 0% coverage И 0 inbound edges в graph (найти через coverage-baseline + `trace_path`).

**Процесс на каждый файл:**
1. `search_code` по имени файла/класса → подтвердить 0 ссылок.
2. `trace_path` inbound → подтвердить 0 callers.
3. `bun test --coverage` → подтвердить 0% coverage.
4. Удалить файл.
5. `bun test && bun run lint` → зелёные.
6. `bun test --coverage` → coverage не упала (мертвый код = 0%, удаление = нейтрально или рост %).

#### P2.2 — Legacy за флагом, default=false, не используется
- Junk-флаги из `feature-flags.json` (6 штук) — удалить entries. Проверить: `search_code` по каждому `id` флага → если только в config и тестах config-сервиса, безопасно.
- `narrative-v2`, `npc-memory-v2` (OFF, legacy) — если не referenced в коде (проверить `isEnabled('narrative-v2')` через ffgrep).

#### P2.3 — Тонкие адаптеры / дубли
- `story-planner.ts` — если v2-paradigm §S4.1 решение 2a-D2 принято (удалить `@story-planner`), и `trace_path` подтверждает, что единственный caller — @mention-лямбда (которая тоже помечена deprecated).
- Дублирующие probability-файлы — только после аудита: `search_graph` по `probability-*`, определить, какие imported каноническим `SimulationEngine`.

#### P2.4 — Большие legacy-подсистемы (только после покрытия нового пути)
- `DEFAULT_PROMPTS` entries для мигрировавших поверхностей — только после v2-paradigm Вектор 2 (миграция @mention, crafter, researcher). **Это блокируется отдельной задачей активации/миграции — не смешивать.**
- @mention inline-лямбды — удалить только после того, как Big Six @mention-адаптер построен и протестирован (v2-paradigm §S4.1).

**Правило порций:** 1 удаление = 1 коммит. Не паковать несколько unrelated удалений.

**Приоритетные модули Phase 2:** `legacy-adapter.ts` → `feature-flags.json` (junk) → `story-planner.ts` (после решения) → probability-аудит.

---

### Phase 3 — Harden (~2 сессии)

**3.1. Поднять coverage-threshold на критичных модулях.**
В `bunfig.toml`:
```toml
[coverage.threshold]
# Мягкий глобальный — не блокирует, но_warns
lines = 0
functions = 0
```
Перенести в per-module thresholds, когда Bun поддержит (или через отдельный threshold-check скрипт). Критичные модули для ужесточения:
- `src/services/roleplay-engine.ts` (pipeline hub)
- `src/services/agents/*` (Big Six — особенно `chronicler-agent.ts`, у которого нет теста)
- `src/store/entity-store.ts` (UnifiedEntityStore)
- `src/services/simulation-engine.ts`

**3.2. Закрыть coverage-провалы Big Six.**
- `agents/chronicler-agent.ts` — нет `.test.ts`. Написать тест (TDD: тест → фикс → зелёный).
- Проверить остальные Big Six: `dramaturg.test.ts` ✓, `stylist.test.ts` ✓, `actor.test.ts` ✓, `censor.test.ts` ✓, `validator.test.ts` ✓ — только chronicler без теста.

**3.3. Обновить CANONICAL / ARCHITECTURE.**
- `docs/en/ARCHITECTURE.md` — отразить post-cleanup реальность.
- `docs/AGENTS.md` — Big Six как единственный prose-pipeline.
- Убрать упоминания удалённых legacy-артефактов.

**3.4. Удалить оставшиеся feature-flag’и legacy**, когда уверены (после v2-paradigm Вектор 1+2 завершён).

**Приоритетные модули Phase 3:** `agents/chronicler-agent.ts` (тест), `bunfig.toml` (thresholds), `docs/`.

---

## 3. Как использовать Bun coverage на каждом шаге

### Команды

```bash
# Baseline (Phase 0)
bun test --coverage

# Перед каждым удалением (Phase 2)
bun test --coverage 2>&1 | tee coverage-before.txt

# После удаления
bun test --coverage 2>&1 | tee coverage-after.txt

# Быстрый diff (если нужен)
diff <(grep -E '^\|' coverage-before.txt) <(grep -E '^\|' coverage-after.txt)
```

### На что смотреть

| Метрика | Что значит | Действие |
|---|---|---|
| **0% Lines + 0% Funcs + 0 inbound edges** | Мёртвый код | Кандидат на удаление (P2.1) |
| **0% Lines, но есть inbound edges** | Живой, но непротестированный | НЕ удалять. Написать тест (Phase 3) |
| **Высокий %, но файл в legacy-списке** | Legacy всё ещё вызывается из канонического пути | Сначала strangler (переключить caller), потом удалять |
| **% вырос после удаления** | Удалён мёртвый код (знаменатель уменьшился) | Подтверждение успеха |
| **% упал после удаления** | Удалили живый код или тест | Откатить, investigate |

### Coverage — навигатор, не цель

- Не гнаться за 100%. Искать **0%-острова** и сопоставлять с graph.
- Coverage-baseline из Phase 0 — reference для всех сравнений.
- После каждого Phase 2 удаления — подтверждать: coverage не упала, тесты зелёные.
- Если Bun coverage показывает файл как покрытый, но graph показывает 0 inbound edges — это значит, файл вызывается только из тестов. Кандидат на P2.1, но проверить, что тест не тестирует что-то нужное runtime.

---

## 4. Правила принятия решения «удалять / оставлять / помечать deprecated»

### Трёхсигнальная проверка (все три должны совпасть для удаления)

```
┌─────────────────────────────────────────────────────┐
│  Сигнал 1: GRAPH — 0 inbound edges                  │
│           (trace_path inbound → пусто)               │
│                                                     │
│  Сигнал 2: COVERAGE — 0% lines/funcs                │
│           (bun test --coverage)                     │
│                                                     │
│  Сигнал 3: CANONICAL — не в Big Six / State-First   │
│           (safe_cleanup.md §2 + v2-paradigm §S1)    │
└─────────────────────────────────────────────────────┘
         │ Все 3 ✅ → УДАЛЯТЬ (Phase 2 P2.1)
         │ 2 из 3 → ПОМЕТИТЬ @deprecated (Phase 1), ждать 3-й сигнал
         │ 1 из 3 → ОСТАВИТЬ, investigate
         │ 0 из 3 → ОСТАВИТЬ (канонический код)
```

### Конкретные правила

1. **Удалять** — только если: 0 graph-references + 0% coverage + не в canonical списке (`safe_cleanup.md §2.3`).
2. **Помечать deprecated** — если: legacy по canonical, но ещё есть callers (graph ≠ 0). Сначала strangler (переключить caller на новый путь), потом удалять.
3. **Оставлять** — если: в canonical списке (`safe_cleanup.md §2.3`) ИЛИ имеет inbound edges из канонического pipeline.
4. **Никогда не удалять** без предварительного `trace_path` + coverage + зелёного `bun test`.
5. **При сомнении** — `@deprecated` + wait. Один sprint → если никто не пожаловался и coverage = 0 → удалять.

### Специальные случаи
- **v1 `AgentRegistry`** (`agent-registry.ts`): НЕ удалять. Живой admin-API backend (v2-paradigm §S5, §S7). Оставить как admin-config слой.
- **Gutenberg scripts**: не удалять как «dead code» (они запускаемы). Решение об архивации — отдельная задача, не часть cleanup.
- **`chronicler.ts` vs `chronicler-agent.ts`**: не дубликат. `chronicler.ts` — file logger (инфраструктура). `chronicler-agent.ts` — Big Six agent. Оба оставить, если `trace_path` подтверждает живые callers.
- **`DEFAULT_PROMPTS`**: удалять только entries для мигрировавших поверхностей, после v2-paradigm Вектор 2. Оставить `translation` и другие ещё-используемые entries.

---

## 5. Чеклист перед каждым PR / коммитом cleanup

```
□ Изменение — ТОЛЬКО cleanup (не смешивать с новыми фичами)
□ Один скоуп = один коммит (1 удаление = 1 коммит)
□ trace_path inbound выполнен → записан результат
□ coverage-before.txt снят
□ Код удалён / помечен
□ bun test → ЗЕЛЁНЫЕ (тот же pass count или больше)
□ bun run lint (tsc --noEmit) → 0 errors
□ bun test --coverage → coverage не упала
□ coverage-after.txt сравнён с before
□ Если удалён файл: import в других файлах не сломан (tsc ловит)
□ Коммит-сообщение: что удалено/помечено + почему (ссылка на canonical)
□ Если @deprecated: указать replacement (куда мигрировать)
```

---

## 6. Метрики успеха

| Метрика | Baseline (Phase 0) | Цель (Phase 3) |
|---|---|---|
| Кол-во файлов в `src/services/` | ~100+ (truncated) | Уменьшить на 5–10 (мёртвый код + дубли) |
| `@deprecated` / `LEGACY` маркеры | 1 | Все legacy-артефакты помечены → затем удалены |
| Junk-флаги в `feature-flags.json` | 6 | 0 |
| `bunfig.toml` | не существует | существует, coverage-baseline зафиксирован |
| `chronicler-agent.ts` test | нет | есть, зелёный |
| `legacy-adapter.ts` | существует, 0 ссылок | удалён |
| `bun test` pass count | baseline | ≥ baseline (не упал) |
| `tsc --noEmit` | 0 errors | 0 errors |
| Big Six — единственный prose-pipeline | v2Generator.generate() — да | да + @mention через Big Six адаптер |

**Главная метрика:** система работает как раньше (или лучше) на каноническом пути, при меньшем кол-ве кода и конфига.

---

## 7. Первые 3–5 конкретных действий (можно сделать сразу)

### Действие 1 — Создать `bunfig.toml` + снять baseline (Phase 0)
Создать `bunfig.toml` с coverage-конфигом (см. §2 Phase 0.3). Запустить:
```bash
bun test --coverage
bun run lint
git tag v0.33.0-stable-pre-cleanup
```
Записать baseline-цифры. **Без этого ничего не удалять.**

### Действие 2 — Удалить `legacy-adapter.ts` (Phase 2 P2.1)
Уже верифицировано: `search_code` — 0 ссылок, `trace_path` — function not found, 17 строк.
```bash
# Перед удалением — повторная проверка
bun test --coverage 2>&1 | tee coverage-before.txt
# Удалить файл
rm src/services/roleplay/agents/legacy-adapter.ts
# Проверка
bun test && bun run lint
bun test --coverage 2>&1 | tee coverage-after.txt
```
Если `tsc` ругается на import — значит есть скрытая ссылка (откатить, investigate). Если зелёно — коммит.

### Действие 3 — Пометить `@deprecated` на ключевых legacy-артефактах (Phase 1)
В одном коммите (чисто маркеры, без удаления):
- `legacy-adapter.ts` → уже удалён в действии 2 (пропустить)
- `agent-config.ts` → `DEFAULT_PROMPTS`: `@deprecated see v2-paradigm §S5`
- `prompt-builder.ts` → `buildCrafterPrompt`: `@deprecated see v2-paradigm §S4.2`
- `roleplay-engine.ts:878-929` → inline-лямбды: `// LEGACY — scheduled for removal`

### Действие 4 — Почистить junk-флаги в `feature-flags.json` (Phase 2 P2.2)
Перед удалением — `ffgrep` по каждому флаг-id (`test-flag`, `delete-test`, `variant-test`, `enabled-flag`, `disabled-flag`, `disabled-variant`):
- Если только в `feature-flags.json` + config-тестах → удалить entries.
- Если referenced в коде → пометить `DEPRECATED` в description, оставить.

### Действие 5 — Написать тест для `chronicler-agent.ts` (Phase 3.2)
Единственный Big Six agent без `.test.ts`. TDD-подход:
1. Прочитать `agents/chronicler-agent.ts` (142 строки) — понять contract `process(intent, simulation, context)`.
2. Написать `agents/chronicler-agent.test.ts` — базовые случаи (process returns AgentOutput, entityStore.update вызван, eventBus.publish вызван).
3. `bun test src/services/agents/chronicler-agent.test.ts` → зелёный.
4. `bun test --coverage` → coverage на `chronicler-agent.ts` > 0%.

---

## Приложение A — Карта приоритетных модулей

| Модуль / путь | Фаза | Приоритет | Действие |
|---|---|---|---|
| `bunfig.toml` (новый) | 0 | P0 | Создать |
| `src/services/roleplay/agents/legacy-adapter.ts` | 2 | P2.1 | Удалить (0 refs, верифицировано) |
| `conf/feature-flags.json` (junk-флаги) | 1→2 | P1→P2.2 | Пометить → удалить |
| `src/services/agent-config.ts` (`DEFAULT_PROMPTS`) | 1→2 | P1→P2.4 | Пометить → удалить entries (после Вектора 2) |
| `src/services/prompt-builder.ts` (`buildCrafterPrompt`) | 1→2 | P1→P2.4 | Пометить → удалить (после Вектора 2) |
| `roleplay-engine.ts:869-929` (@mention lambdas) | 1→2 | P1→P2.4 | Пометить → удалить (после адаптера) |
| `src/services/story-planner.ts` | 1→2 | P1→P2.3 | Пометить → удалить (после решения 2a-D2) |
| `src/services/agents/chronicler-agent.ts` (тест) | 3 | P3.2 | Написать .test.ts |
| `src/services/chronicler.ts` | — | — | Оставить (не дубликат) |
| `src/services/roleplay/prose/prose-generator.ts` | — | — | Оставить (contract interface) |
| `scripts/gutenberg-*.ts` | — | — | Не трогать в cleanup (data-инфра) |

## Приложение B — Связь с v2-paradigm migration

Эта стратегия — **cleanup-часть** v2-paradigm migration. Она НЕ выполняет
Векторы 1 (активация флагов) и 2 (миграция поверхностей) — это отдельные задачи.

- **Вектор 1 (активация):** 4 флага OFF → ON. Это **новая функциональность**, не cleanup. Не смешивать.
- **Вектор 2 (миграция):** @mention, crafter, researcher → computable prompts. Это **новый код**, не cleanup. Не смешивать.
- **Вектор 3 (декомиссия):** Это и есть Phase 2 P2.4 этой стратегии. Блокируется Вектором 2.

**Порядок исполнения:** Phase 0–2 (cleanup мёртвого/мусорного) → Вектор 1 (активация) → Вектор 2 (миграция) → Phase 2 P2.4 + Phase 3 (декомиссия + harden).

Cleanup мёртвого кода (P2.1–P2.3) можно и нужно делать **параллельно** с Вектором 1, но в разных коммитах/ветках.
