# Cleanup Execution Plan — Actions 2-5

**Дата:** 2026-08-18
**Baseline:** `v0.32.6-stable-pre-cleanup` (1308 pass, 0 fail, tsc 0 errors)
**Стратегия:** `docs/compose/specs/2026-08-18-boost-strategy.md`

> Каждое действие — отдельный коммит. После каждого: `bun test && bun run lint`.
> Coverage снимается до и после удалений.

---

## Action 2 — Удалить `legacy-adapter.ts` (Phase 2, P2.1)

### Контекст
`src/services/roleplay/agents/legacy-adapter.ts` — 17 строк, класс `LegacyAgentAdapter`.
v2-paradigm spec утверждал удаление, но файл существует.
`search_code` — 0 ссылок в коде. `trace_path` — function not found.

### Шаги

**2.1. Предварительная проверка (трёхсигнальная):**
```bash
# Сигнал 1: GRAPH — 0 inbound edges
# (уже проверено: search_code → 0 results, trace_path → not found)

# Сигнал 2: COVERAGE — 0%
# (legacy-adapter.ts отсутствует в coverage-таблице = ни один тест его не импортирует)

# Сигнал 3: CANONICAL — не в Big Six / State-First
# (v2-paradigm §S1: legacy prose-агенты удалены, адаптер для них — orphaned)
```

**2.2. Финальная grep-проверка (graph может иметь false negatives):**
```bash
rg "legacy-adapter|LegacyAgentAdapter" src/ --type ts
```
Ожидаемый результат: 0 совпадений (или только self-reference внутри файла).
Если есть внешние импорты — ОТМЕНИТЬ удаление, перейти к Phase 1 (mark deprecated).

**2.3. Снять coverage до удаления:**
```bash
bun test --coverage 2>&1 | grep -E '^\s*(src|tests|---)' > /tmp/cov-before.txt
```

**2.4. Удалить файл:**
```bash
rm src/services/roleplay/agents/legacy-adapter.ts
```

**2.5. Верификация:**
```bash
bun test                    # ожидаем: 1308 pass, 0 fail (те же)
bun run lint                # ожидаем: 0 errors (tsc ловит broken imports)
bun test --coverage 2>&1 | grep -E '^\s*(src|tests|---)' > /tmp/cov-after.txt
diff /tmp/cov-before.txt /tmp/cov-after.txt  # ожидаем: no regression
```

**2.6. Коммит:**
```bash
git add src/services/roleplay/agents/legacy-adapter.ts
git commit -m "cleanup(legacy): remove dead LegacyAgentAdapter — 0 refs, 0% coverage

Verified: search_code 0 results, trace_path not found, grep 0 external imports.
File was orphaned after legacy prose agents removal (v2-paradigm §S1).
See: docs/compose/specs/2026-08-18-boost-strategy.md Action 2"
```

---

## Action 3 — Пометить `@deprecated` (Phase 1)

### Контекст
Маркировка legacy без удаления. Делает legacy видимым в коде.
Один коммит — только маркеры, никаких изменений логики.

### Шаги

**3.1. `src/services/agent-config.ts` → `DEFAULT_PROMPTS`:**
Найти `DEFAULT_PROMPTS` (v2-paradigm: lines 152-188). Добавить перед определением:
```typescript
/** @deprecated Static prompts — scheduled for removal after v2-paradigm Vector 2.
 *  Replacement: Big Six computable prompts (stylist.buildMicroPrompt etc.).
 *  See: docs/compose/specs/2026-08-17-v2-paradigm-migration-design.md §S5 */
export const DEFAULT_PROMPTS = { ... }
```

**3.2. `src/services/prompt-builder.ts` → `class PromptBuilder`:**
```typescript
/** @deprecated Static prompt builder — scheduled for removal after v2-paradigm Vector 2.
 *  Used by: crafter-agent, world-builder, researcher-agent (all low-coverage).
 *  Replacement: Big Six computable prompts + MCP retrieval.
 *  See: docs/compose/specs/2026-08-17-v2-paradigm-migration-design.md §S4.2, §S4.3 */
export class PromptBuilder { ... }
```
⚠️ **Важно:** `PromptBuilder` НЕ мёртвый код. Используется 3 сервисами:
- `crafter-agent.ts:214` — `buildCrafterPrompt`
- `world-builder.ts:151,271,293` — `WORLD_FRAME_PROMPT`, `buildEntityL2Prompt`, `buildRelationshipPrompt`
- `researcher-agent.ts:39,53,66,81,93` — 5 build*Prompt методов
0% coverage = эти сервисы непротестированы, НЕ = мёртвый код.
Удалять ТОЛЬКО после v2-paradigm Вектор 2 (миграция этих 3 сервисов).

**3.3. `src/services/roleplay-engine.ts` → @mention inline-лямбды (lines ~869-929):**
Перед блоком `_getAgentById` или перед каждой лямбдой:
```typescript
// LEGACY — scheduled for removal, see v2-paradigm §S4.1
// These @mention agents use static prompts. Big Six replacement via adapter
// is planned in v2-paradigm Vector 2a.
```

**3.4. Верификация:**
```bash
bun test                    # ожидаем: 1308 pass, 0 fail (маркеры не меняют логику)
bun run lint                # ожидаем: 0 errors
```

**3.5. Коммит:**
```bash
git add src/services/agent-config.ts src/services/prompt-builder.ts src/services/roleplay-engine.ts
git commit -m "cleanup(mark): @deprecated on DEFAULT_PROMPTS, PromptBuilder, @mention lambdas

Phase 1 — mark, don't delete. All three are legacy static-prompt surfaces
scheduled for removal after v2-paradigm Vector 2 migration.
No logic changes — JSDoc + comments only."
```

---

## Action 4 — Почистить junk feature-flags (Phase 2, P2.2)

### Контекст
`conf/feature-flags.json` содержит 13 флагов, из которых 8 — мусорные/legacy.

### Классификация (верифицировано grep по `src/`)

| Flag ID | В src/ коде? | Действие |
|---|---|---|
| `test-flag` | ❌ 0 refs | Удалить из `conf/feature-flags.json` |
| `delete-test` | ❌ 0 refs | Удалить |
| `variant-test` | ❌ 0 refs | Удалить |
| `enabled-flag` | ❌ 0 refs | Удалить |
| `disabled-flag` | ❌ 0 refs | Удалить |
| `disabled-variant` | ❌ 0 refs | Удалить |
| `narrative-v2` | ⚠️ `src/lib/feature-flags.ts:44` (DEFAULT_FLAGS) | Удалить из обоих мест |
| `npc-memory-v2` | ⚠️ `src/lib/feature-flags.ts:58` (DEFAULT_FLAGS) | Удалить из обоих мест |

**Оставить (парадигмальные флаги):**
- `literary-compiler-v2` (ON) ✅
- `jungian-profiler-enabled` (OFF, v2-paradigm Вектор 1) ⛔
- `literary-modulation-enabled` (OFF, Вектор 1) ⛔
- `short-turn-expansion-enabled` (OFF, Вектор 1) ⛔
- `deferred-hooks-enabled` (OFF, Вектор 1) ⛔

### Шаги

**4.1. Удалить 6 junk-entries из `conf/feature-flags.json`:**
Удалить JSON-объекты с `id`: `test-flag`, `delete-test`, `variant-test`, `enabled-flag`, `disabled-flag`, `disabled-variant`.
Оставить только 7 парадигмальных флагов.

**4.2. Удалить 2 legacy-entries из `src/lib/feature-flags.ts`:**
Найти и удалить entries для `narrative-v2` (line 44) и `npc-memory-v2` (line 58) из `DEFAULT_FLAGS`.

**4.3. Верификация:**
```bash
bun test                    # ожидаем: 1308 pass, 0 fail
bun run lint                # ожидаем: 0 errors
# Проверить, что feature-flags service не падает без удалённых флагов:
bun test --coverage 2>&1 | grep "feature-flags"
```

**4.4. Коммит:**
```bash
git add conf/feature-flags.json src/lib/feature-flags.ts
git commit -m "cleanup(config): remove 8 junk/legacy feature flags

Removed 6 test artifacts (0 refs) + 2 legacy v2 flags (only in DEFAULT_FLAGS).
Remaining: 5 paradigm flags (1 ON, 4 OFF — v2-paradigm Vector 1 targets)."
```

---

## Action 5 — Тест для `chronicler-agent.ts` (Phase 3, P2)

### Контекст
`src/services/agents/chronicler-agent.ts` — единственный Big Six агент без `.test.ts`.
Coverage: 25% lines, 5.08% funcs. 142 строки.
Конструктор: `(entityStore: UnifiedEntityStore, eventBus: EventBus)`.
Метод: `process(intent, simulation, context) → AgentOutput`.

### Шаги (TDD)

**5.1. Прочитать `chronicler-agent.ts` целиком:**
```bash
# Понять contract: что process() возвращает, какие side-effects вызывает
```

**5.2. Посмотреть существующие Big Six тесты как образец:**
```
src/services/agents/dramaturg.test.ts  — образец mock-паттерна
src/services/agents/validator.test.ts  — 87.5% coverage, хороший пример
```

**5.3. Написать `src/services/agents/chronicler-agent.test.ts`:**
Минимальные тест-кейсы:
- `process()` возвращает `AgentOutput` с правильной структурой
- `entityStore.update` вызывается с правильными данными
- `eventBus.publish` вызывается для значимых событий
- Обработка пустого intent / пустого simulation (graceful)
- `id === 'chronicler'`, `name === 'Chronicler'`

**5.4. Запустить тест:**
```bash
bun test src/services/agents/chronicler-agent.test.ts
# Ожидаем: все pass
```

**5.5. Проверить coverage:**
```bash
bun test --coverage 2>&1 | grep "chronicler-agent"
# Ожидаем: % lines и % funcs значительно выше 25%/5%
```

**5.6. Полная верификация:**
```bash
bun test                    # ожидаем: >1308 pass (добавились новые тесты)
bun run lint                # 0 errors
```

**5.7. Коммит:**
```bash
git add src/services/agents/chronicler-agent.test.ts
git commit -m "test(agents): add chronicler-agent.test.ts — Big Six coverage gap

Was the only Big Six agent without tests (25% lines, 5.08% funcs).
Closes Phase 3 P3.2 coverage gap."
```

---

## Action 6 (дополнительно) — Аудит probability-файлов

### Контекст
4 файла: `probability-resolver.ts` (50%), `probability-profiles.ts` (67%),
`probability-expression.ts` (100%), `probability-types.ts`.
`probability-resolver.ts` — 50% coverage, uncovered lines 165-220, 248-320.

### Шаги
**6.1.** `trace_path` inbound на `probability-resolver` → кто вызывает?
**6.2.** Если только `SimulationEngine` (100% coverage) → проверить, какие методы
`probability-resolver` вызываются, а какие — dead branches.
**6.3.** Uncovered lines 165-220, 248-320 → прочитать, понять: dead code или untested?
**6.4.** Если dead → Phase 2 P2.3. Если untested → Phase 3 (написать тесты).

---

## Action 7 (дополнительно) — Аудит `item-evaluation.ts` и `start-resolver.ts`

### Контекст
Оба файла: <20% coverage, <10% funcs. Кандидаты в dead code.

### Шаги
**7.1.** `trace_path` inbound на каждый → есть ли живые callers?
**7.2.** Если 0 callers + 0% coverage + не canonical → Phase 2 P2.1 (удалить).
**7.3.** Если есть callers → Phase 3 (написать тесты).

---

## Порядок исполнения

```
Action 2 (delete legacy-adapter)     ← СЕЙЧАС, безопасно
    ↓
Action 3 (mark @deprecated)          ← Сразу после, только маркеры
    ↓
Action 4 (clean junk flags)          ← Независимо, можно параллельно с 3
    ↓
Action 5 (chronicler test)           ← Независимо, можно параллельно
    ↓
Action 6 (probability audit)         ← После 2-5
    ↓
Action 7 (item-eval/start-resolver)  ← После 6
```

**Параллелизм:** Actions 3, 4, 5 независимы — можно делать в любой последовательности
или параллельно (в разных коммитах). Actions 6-7 требуют результатов 2-5.

---

## Чеклист перед каждым коммитом

```
□ Изменение — ТОЛЬКО cleanup (не смешивать с новыми фичами)
□ Один скоуп = один коммит
□ bun test → 1308+ pass, 0 fail
□ bun run lint → 0 errors
□ Если удаление: bun test --coverage before/after → no regression
□ Коммит-сообщение: что + почему + ссылка на spec
```
