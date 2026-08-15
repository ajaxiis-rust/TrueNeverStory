# Jungian Profiler — Phase 1E: Flag + Hooks + Чекпоинт P1 (Tasks 1.5–1.6)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [ ]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S5.1, S16, S21; impl-спеки `spec-profiler-integration.md`, `spec-profiler-persistence.md`.

**Acceptance (1E):** Флаг `jungian-profiler-enabled` загружается (`false`). Engine инкрементирует метрики каждый ход и блендит профиль каждые 20 ходов. Профиль пишется в БД. Нарратив НЕ меняется.

**Files:**
- Modify: `src/lib/feature-flags.ts`
- Modify: `conf/feature-flags.json`
- Modify: `src/services/roleplay-engine.ts`
- Modify: `src/services/metrics-collector.ts` (add `restore()`)

---

## Task 1.5: Feature flag `jungian-profiler-enabled`

**Covers:** S16, S21

- [ ] **Step 1: Add flag to DEFAULT_FLAGS (append to array in feature-flags.ts)**

```typescript
{
  id: "jungian-profiler-enabled",
  name: "Jungian Profiler",
  description: "Psychotype-based narrative adaptation (Phase 1: logging only)",
  enabled: false,
  percentage: 0,
  conditions: [],
  variants: [
    { id: "control", name: "Control", weight: 50 },
    { id: "treatment", name: "Treatment", weight: 50 },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
},
```

- [ ] **Step 2: Add matching entry to conf/feature-flags.json** (same object, in `flags` array)

- [ ] **Step 3: Verify flag loads (and actually exists in JSON)**

> ⚠️ `isEnabled()` returns `false` for an **absent** flag (`if (!flag) return false`), so this check passes trivially even if the flag was never added. The flag MUST be present in `conf/feature-flags.json`, because `FeatureFlagManager._load()` only reads `DEFAULT_FLAGS` when the JSON file does **not** exist — once `conf/feature-flags.json` exists, `DEFAULT_FLAGS` is ignored. A flag added only to `DEFAULT_FLAGS` will NOT be loaded.

Run (assert the entry actually exists in the JSON):
`bun -e "import { readFileSync } from 'node:fs'; const flags = JSON.parse(readFileSync('conf/feature-flags.json','utf8')).flags; const f = flags.find(x => x.id === 'jungian-profiler-enabled'); console.log('exists:', !!f, 'enabled:', f?.enabled)"`
Expected: `exists: true enabled: false`

Run (runtime check):
`bun -e "import {getFeatureFlagManager} from './src/lib/feature-flags'; console.log(getFeatureFlagManager().isEnabled('jungian-profiler-enabled'))"`
Expected: `false`

- [ ] **Step 4: Commit**

```bash
git add src/lib/feature-flags.ts conf/feature-flags.json
git commit -m "feat(profiler): jungian-profiler-enabled feature flag (default off)"
```

---

## Task 1.6: Blend hook wiring в roleplay-engine (только логирование)

**Covers:** S5.1, S21
**Interfaces:**
- Consumes: `MetricsCollector`, `deriveMetrics`, `inferFromMetrics`, `blendBehavioralSignals`, `createDefaultProfile`; `PlayerProfileStore.getJungianProfile/upsertJungianProfile/upsertBehavioralMetrics`; `getFeatureFlagManager`
- Produces: engine обновляет `this.jungianProfile` каждые 20 ходов; профиль в БД; нарратив НЕ меняется

> **playerId:** `this.activeCharacter ?? this.activeSessionId ?? 'default'`.

- [ ] **Step 1: Add `restore()` to MetricsCollector + fields to RoleplayEngine**

```typescript
// In src/services/metrics-collector.ts:
restore(aggregates: RawAggregates, totalTurns: number): void {
  this.aggregates = { ...aggregates };
  this.turns = totalTurns;
}
```

```typescript
// In src/services/roleplay-engine.ts — imports (top):
import { MetricsCollector, deriveMetrics, inferFromMetrics } from './metrics-collector';
import { blendBehavioralSignals, createDefaultProfile, deriveType, type JungianProfile } from './jungian-profiler';
import { PlayerProfileStore } from '../lib/player-profile-store';
import { getFeatureFlagManager } from '../lib/feature-flags';

// EngineDeps — add field:
interface EngineDeps {
  // ...existing...
  playerProfileStore?: PlayerProfileStore;
}

// class fields:
private playerProfileStore?: PlayerProfileStore;
private jungianProfile: JungianProfile = createDefaultProfile();
private metricsCollector = new MetricsCollector();
private recentSignals: { extraversion: number[]; intuition: number[]; thinking: number[]; judging: number[] } = {
  extraversion: [], intuition: [], thinking: [], judging: [],
};

// Constructor — wire the dep:
this.playerProfileStore = deps.playerProfileStore;

// playerId getter (used consistently across hooks):
private get playerId(): string {
  return this.activeCharacter ?? this.activeSessionId ?? 'default';
}

// In constructor (or session-load), after playerProfileStore available:
private initJungianProfile(): void {
  const saved = this.playerProfileStore?.getJungianProfile(this.playerId);
  if (saved) this.jungianProfile = saved;
  const metrics = this.playerProfileStore?.getBehavioralMetrics(this.playerId);
  if (metrics) this.metricsCollector.restore(metrics.aggregates, metrics.totalTurns);
}
```

- [ ] **Step 2: Add hooks in `_processInputImpl` + вынести blend в `_runBlendCycle`**

```typescript
// After translateAndClassify(ctx) → intent:
if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
  this.metricsCollector.recordInput(ctx.parsedInput);
  this.metricsCollector.recordIntent(intent, ctx.parsedInput, true); // _processInputImpl — только player-initiated ввод
}
// After runSimulation(ctx) → simResult:
if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
  this.metricsCollector.recordSimulation(intent, simResult);
}
// After buildGameContext, before prose:
if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) this.runBlendCycle();

// Private method:
private runBlendCycle(): void {
  if (this.metricsCollector.getTurnCount() % 20 !== 0 || this.metricsCollector.getTurnCount() === 0) return;
  const playerId = this.playerId;
  const derived = deriveMetrics(this.metricsCollector.getAggregates(), this.metricsCollector.getTurnCount(), this.visitedLocations.size);
  const signals = inferFromMetrics(derived);
  for (const axis of ['extraversion', 'intuition', 'thinking', 'judging'] as const) {
    this.recentSignals[axis].push(signals[axis]);
    if (this.recentSignals[axis].length > 10) this.recentSignals[axis].shift();
  }
  this.jungianProfile = blendBehavioralSignals(signals, this.jungianProfile, this.recentSignals);
  this.metricsCollector.decay();
  this.playerProfileStore?.upsertJungianProfile(playerId, this.jungianProfile);
  this.playerProfileStore?.upsertBehavioralMetrics(playerId, this.metricsCollector.getAggregates(), this.metricsCollector.getTurnCount(), signals);
  log.info({ playerId, confidence: this.jungianProfile.confidence, type: deriveType(this.jungianProfile) }, 'jungian profile blended');
}
```

> `deriveType` импортируется из `./jungian-profiler` (Task 1.1).

- [ ] **Step 3: Mirror hooks in `_processInputStreamImpl`** — `recordInput`+`recordIntent` после parse, `recordSimulation` после simulate, `this.runBlendCycle()` после build.

- [ ] **Step 4: Write integration test (profile updates after 20 turns)**

```typescript
// src/services/roleplay-engine.jungian.test.ts
// Мок LLM (StubLLMQueue), mock engine. Вызвать _processInputImpl 20 раз с action-intents,
// флаг=true. Assert: engine.jungianProfile.source === 'blended' && confidence > 0.
// Если полный mock Engine тяжёл — unit-тест runBlendCycle(): после 20 циклов source==='blended'.
```

- [ ] **Step 5: Verify — narrative unchanged, profile updates**

Run: `bun test src/services/metrics-collector.test.ts src/services/jungian-profiler.test.ts src/lib/__tests__/player-profile-store.test.ts`
Expected: PASS. Вручную: с флагом true и false нарратив идентичен.

- [ ] **Step 6: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/roleplay-engine.ts src/services/metrics-collector.ts
git commit -m "feat(profiler): Phase 1 — metrics hooks + blend every 20 turns (logging only)"
```

---

## ✅ Чекпоинт Phase 1

```bash
# 1. Типы чистые
bunx tsc --noEmit
# Expected: exit 0

# 2. Все unit-тесты Phase 1 зелёные
bun test src/services/jungian-profiler.test.ts src/services/metrics-collector.test.ts src/lib/__tests__/player-profile-store.test.ts
# Expected: все PASS

# 3. Флаг загружается и выключен
bun -e "import {getFeatureFlagManager} from './src/lib/feature-flags'; console.log(getFeatureFlagManager().isEnabled('jungian-profiler-enabled'))"
# Expected: false

# 4. roundtrip профиля — покрыт тестом player-profile-store.test.ts
# 5. Нарратив не меняется — ручная проверка (флаг true vs false → одинаковый prose)
```

**Критерии прохождения:**
- [ ] `tsc --noEmit` без ошибок
- [ ] Все unit-тесты зелёные (нет `.only`/`.skip`)
- [ ] `jungian-profiler-enabled` → `false`
- [ ] roundtrip профиля в БД работает (тест)
- [ ] Нарратив идентичен при flag on/off
- [ ] `git log --oneline -7` показывает коммиты задач 1.1–1.6

**Если чекпоинт не пройден — НЕ начинай Phase 2.** Почини и повтори.

**Phase 1 DONE.** Переходи к `2026-08-14-jungian-profiler-p2a.md` (после `compose:worktree`).
