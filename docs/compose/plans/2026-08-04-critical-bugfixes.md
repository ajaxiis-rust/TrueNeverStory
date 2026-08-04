# Critical Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 critical bugs: broken probability critical outcomes, economy expense leak, providers.json corruption on parse error, director save race condition, and benchmark missing await.

**Architecture:** Surgical fixes to 10 files. No new abstractions. Each fix has its own test cycle. All thresholds and default values documented inline.

**Tech Stack:** TypeScript, Bun test, SQLite

## Global Constraints

- Run `bun test` from `/home/ajaxiis/Документы/TNS/TrueNeverStory` after each task
- Run `bun run build` (tsc --noEmit) after TypeScript changes
- Use `bun test <file>` for task-local verification
- Commit after each task with descriptive message

---

### Task 1: Fix probability-engine critical outcome thresholds

**Covers:** B1 — critical success/failure never trigger with default thresholds

**Files:**
- Modify: `src/services/probability-engine.ts:279,283`
- Modify: `src/models/probability.ts:185-186`
- Modify: `src/services/probability-profiles.ts:33-34,54,64,73,83,92,101,112,122,129,137,145,152,160`
- Modify: `src/services/romance-profiles.ts:33-34,57,66,75,84,93,101`
- Modify: `src/services/probability-engine.test.ts` (add new test)
- Modify: `src/services/probability-system.test.ts:65-66` (update assertions)
- Modify: `src/services/romance-engine.test.ts:95-96` (update assertions)

**Interfaces:**
- Produces: `ProbabilityProfile` defaults change: `criticalSuccessThreshold` 0.9→0.1, `criticalFailureThreshold` 0.1→0.9. `_determineQuality` operators swapped: success uses `roll <`, failure uses `roll >`. All 16 profile thresholds mirrored (x→1-x).

- [ ] **Step 1: Write failing test for critical outcomes**

Add to `src/services/probability-engine.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { ProbabilityEngine } from "./probability-engine";
import { ProbabilityProfile, OutcomeQuality, ParameterType } from "../models/probability";

describe("ProbabilityEngine critical outcomes", () => {
  const engine = new ProbabilityEngine(0.5);

  const critProfile = new ProbabilityProfile({
    name: "crit_test",
    parameters: {
      skill: { name: "skill", base_value: 1.0, weight: 1.0, param_type: ParameterType.STATIC },
    },
    formula: "sum_weighted",
    difficulty_modifier: 1.0,
    critical_success_threshold: 0.1,
    critical_failure_threshold: 0.9,
  });

  it("produces CRITICAL_SUCCESS when roll is far below probability", () => {
    const result = engine.roll(critProfile, { skill: 1.0 }, "test", 0.05);
    expect(result.quality).toBe(OutcomeQuality.CRITICAL_SUCCESS);
  });

  it("produces CRITICAL_FAILURE when roll is far above probability", () => {
    const hardProfile = new ProbabilityProfile({
      name: "hard_test",
      parameters: {
        skill: { name: "skill", base_value: 0.0, weight: 1.0, param_type: ParameterType.STATIC },
      },
      formula: "sum_weighted",
      difficulty_modifier: 0.1,
      critical_success_threshold: 0.1,
      critical_failure_threshold: 0.9,
    });
    // probability = 0.0*1.0 * 0.1 * (0.5+0.5) = 0.0; clamped to 0
    // roll = 0.98 → margin from 0 = 0.98, normalized = 0.98, roll > 0.9 → CRITICAL_FAILURE
    // This requires probability near 0 — use a different approach:
    // probability = 0.03 (base 0.0, diff 0.1, luck 0.5: 0 * 0.1 * 0.55 = 0)
    // Actually let's use a more reliable test:
    const lowProbProfile = new ProbabilityProfile({
      name: "low_prob",
      parameters: {
        skill: { name: "skill", base_value: 0.02, weight: 1.0, param_type: ParameterType.STATIC },
      },
      formula: "sum_weighted",
      difficulty_modifier: 1.0,
      critical_success_threshold: 0.1,
      critical_failure_threshold: 0.9,
    });
    // probability ≈ 0.02 * 1.0 * 1.0 * (0.5 + 0.5) = 0.02
    // roll = 0.97 → margin = 0.95, normalized > 0.8, roll > 0.9 → CRITICAL_FAILURE
    const result = engine.roll(lowProbProfile, { skill: 1.0 }, "test", 0.97);
    expect(result.quality).toBe(OutcomeQuality.CRITICAL_FAILURE);
  });

  it("produces SUCCESS for normal roll", () => {
    const result = engine.roll(critProfile, { skill: 1.0 }, "test", 0.5);
    expect(result.success).toBe(true);
    expect(result.quality).toBe(OutcomeQuality.SUCCESS);
  });
});
```

- [ ] **Step 2: Run new test — verify it fails**

Run: `bun test src/services/probability-engine.test.ts -t "critical"`

Expected: FAIL — critical test cases produce SUCCESS/FAILURE instead of CRITICAL_SUCCESS/CRITICAL_FAILURE.

- [ ] **Step 3: Swap operators in `_determineQuality`**

In `src/services/probability-engine.ts`, change two lines in `_determineQuality`:

```
Line 279: BEFORE
      if (normalizedMargin > 0.8 && roll > profile.criticalSuccessThreshold) return OutcomeQuality.CRITICAL_SUCCESS;
Line 279: AFTER
      if (normalizedMargin > 0.8 && roll < profile.criticalSuccessThreshold) return OutcomeQuality.CRITICAL_SUCCESS;

Line 283: BEFORE
      if (normalizedMargin > 0.8 && roll < profile.criticalFailureThreshold) return OutcomeQuality.CRITICAL_FAILURE;
Line 283: AFTER
      if (normalizedMargin > 0.8 && roll > profile.criticalFailureThreshold) return OutcomeQuality.CRITICAL_FAILURE;
```

- [ ] **Step 4: Swap default thresholds in `ProbabilityProfile` constructor**

In `src/models/probability.ts`, lines 185-186:

```
Line 185: BEFORE
    this.criticalSuccessThreshold = data.critical_success_threshold ?? 0.9;
Line 185: AFTER
    this.criticalSuccessThreshold = data.critical_success_threshold ?? 0.1;

Line 186: BEFORE
    this.criticalFailureThreshold = data.critical_failure_threshold ?? 0.1;
Line 186: AFTER
    this.criticalFailureThreshold = data.critical_failure_threshold ?? 0.9;
```

- [ ] **Step 5: Swap default thresholds in `profile()` factory**

In `src/services/probability-profiles.ts`, lines 33-34:

```
Line 33: BEFORE
  criticalSuccessThreshold = 0.9,
Line 33: AFTER
  criticalSuccessThreshold = 0.1,

Line 34: BEFORE
  criticalFailureThreshold = 0.1,
Line 34: AFTER
  criticalFailureThreshold = 0.9,
```

- [ ] **Step 6: Mirror all profile explicit thresholds**

Each profile's last two args swap to `(1-x, 1-y)`. In `src/services/probability-profiles.ts`:

```
Line 54:  COMBAT:           0.90, 0.10 → 0.10, 0.90
Line 64:  PERSUASION:       0.85, 0.15 → 0.15, 0.85
Line 73:  STEALTH:          0.85, 0.15 → 0.15, 0.85
Line 83:  ROMANCE:          0.85, 0.15 → 0.15, 0.85
Line 92:  INVESTIGATION:    0.90, 0.10 → 0.10, 0.90
Line 101: ATHLETICS:        0.85, 0.15 → 0.15, 0.85
Line 112: DECEPTION:        0.85, 0.15 → 0.15, 0.85
Line 122: INTIMIDATION:     0.85, 0.15 → 0.15, 0.85
Line 129: GENERIC:          0.90, 0.10 → 0.10, 0.90
Line 137: BIRTH_RACE:       0.85, 0.15 → 0.15, 0.85
Line 145: BIRTH_SOCIAL:     0.80, 0.20 → 0.20, 0.80
Line 152: BIRTH_MAGIC:      0.85, 0.15 → 0.15, 0.85
Line 160: BIRTH_TALENT:     0.90, 0.10 → 0.10, 0.90
```

- [ ] **Step 7: Mirror romance profile thresholds**

In `src/services/romance-profiles.ts`, mirror each `makeProfile()` call's last two args:

```
Line 33-34: makeProfile defaults:   0.85, 0.15 → 0.15, 0.85
Line 57:    ROMANCE_ATTRACTION:     0.85, 0.15 → 0.15, 0.85
Line 66:    ROMANCE_CONFESSION:     0.80, 0.20 → 0.20, 0.80
Line 75:    ROMANCE_DATE:           0.85, 0.15 → 0.15, 0.85
Line 84:    ROMANCE_KISS:           0.85, 0.15 → 0.15, 0.85
Line 93:    ROMANCE_PROPOSAL:       0.75, 0.25 → 0.25, 0.75
Line 101:   ROMANCE_BREAKUP:        0.25, 0.75 → 0.75, 0.25
```

- [ ] **Step 8: Update test threshold assertions**

In `src/services/probability-system.test.ts` (lines 65-66):

```ts
expect(ROMANCE_BREAKUP.criticalSuccessThreshold).toBe(0.75);   // was 0.25
expect(ROMANCE_BREAKUP.criticalFailureThreshold).toBe(0.25);   // was 0.75
```

In `src/services/romance-engine.test.ts` (lines 95-96):

```ts
expect(ROMANCE_BREAKUP.criticalSuccessThreshold).toBe(0.75);   // was 0.25
expect(ROMANCE_BREAKUP.criticalFailureThreshold).toBe(0.25);   // was 0.75
```

- [ ] **Step 9: Run full probability test suite**

Run: `bun test src/services/probability-engine.test.ts src/services/probability-system.test.ts src/services/romance-engine.test.ts src/services/probability-expression.test.ts`

Expected: All PASS, including the new critical outcome tests.

- [ ] **Step 10: Commit**

```bash
git add src/services/probability-engine.ts src/models/probability.ts src/services/probability-profiles.ts src/services/romance-profiles.ts src/services/probability-engine.test.ts src/services/probability-system.test.ts src/services/romance-engine.test.ts
git commit -m "fix: swap probability critical outcome operators and thresholds

Critical success/failure were unreachable: the roll-under system's
_determineQuality used inverted operators (roll > 0.9 for crit success,
roll < 0.1 for crit failure) making CRITICAL_SUCCESS/FAILURE mathematically
impossible for all probability values in [0,1].

Swapped operators (roll < 0.1 → crit success, roll > 0.9 → crit failure)
and mirrored all 16 profile thresholds to match. Added tests that verify
critical outcomes fire with controlled rolls."
```

---

### Task 2: Fix economy expenses not deducted from treasury balance

**Covers:** B2 — `processTreasury` computes expenses but never subtracts them

**Files:**
- Modify: `src/services/npc-economy.ts:290-296`
- Create: `src/services/npc-economy-runtime-expenses.test.ts` (add one test case to existing test file)

**Interfaces:**
- Produces: `processTreasury()` returns `balance = old + income + tribute - taxes - expenses`

- [ ] **Step 1: Write failing test**

Find existing test file. If `npc-economy-runtime.test.ts` exists, add there. Otherwise create minimal test:

```ts
import { describe, it, expect } from "bun:test";
import { createNPCWithEconomy, processTreasury } from "./npc-economy";
import { RankType } from "../models/rank";

describe("processTreasury", () => {
  it("deducts family expenses from balance", () => {
    const npc = createNPCWithEconomy("t1", "Test", RankType.COMMONER, "farmer", 30, "calm");
    npc.treasury.balance = 1000;
    npc.income = 200;
    npc.familyExpenses = { wife: 50, children: 100, food: 80, clothing: 30, spouse: 0 };
    npc.taxRate = 0.1;

    const result = processTreasury(npc);
    // balance = 1000 + 200 + 0 - 20 - 260 = 920
    expect(result.balance).toBe(920);
    expect(result.expenses).toBe(260);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `bun test src/services/npc-economy-runtime.test.ts -t "deducts"`

Expected: FAIL — balance is higher than 920 (expenses not deducted).

- [ ] **Step 3: Fix `processTreasury`**

In `src/services/npc-economy.ts`, replace lines 290-296:

```ts
const totalExpenses = npc.familyExpenses.wife + npc.familyExpenses.children + npc.familyExpenses.food + npc.familyExpenses.clothing;
return {
  balance: npc.treasury.balance + income + tribute - taxes - totalExpenses,
  income: income + tribute,
  expenses: totalExpenses,
  taxes,
  tribute,
};
```

- [ ] **Step 4: Run test — verify it passes**

Run: `bun test src/services/npc-economy-runtime.test.ts -t "deducts"`

Expected: PASS.

- [ ] **Step 5: Run economy test suite**

Run: `bun test src/services/npc-economy.test.ts src/services/npc-economy-extras.test.ts src/services/npc-economy-runtime.test.ts src/services/slave-economy.test.ts src/services/economic-service.test.ts`

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/npc-economy.ts src/services/npc-economy-runtime.test.ts
git commit -m "fix: deduct family expenses from treasury balance

processTreasury computed expenses on line 293 but never subtracted them
from balance on line 291. NPCs accumulated money indefinitely. Now
balance = old + income + tribute - taxes - expenses."
```

---

### Task 3: Fix providers.json corruption on parse error

**Covers:** B4 — `saveRateLimitToProviders` overwrites entire config with `{rateLimit: ...}` if JSON parse fails

**Files:**
- Modify: `src/routes/providers.ts:225-231`

**Interfaces:**
- Produces: `saveRateLimitToProviders` preserves existing config keys on parse failure

- [ ] **Step 1: Fix `saveRateLimitToProviders`**

In `src/routes/providers.ts`, replace lines 225-231:

```ts
function saveRateLimitToProviders(rateLimit: Record<string, unknown>): void {
  const path = getRateLimitPath();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    log.error({ path }, "Failed to parse providers.json — refusing to overwrite");
    return; // Don't overwrite on parse failure
  }
  data.rateLimit = rateLimit;
  writeFileSync(path, JSON.stringify(data, null, 2));
}
```

- [ ] **Step 2: Run providers route tests**

Run: `bun test tests/routes/providers.test.ts 2>&1 | head -30`

Expected: No new failures.

- [ ] **Step 3: Commit**

```bash
git add src/routes/providers.ts
git commit -m "fix: prevent providers.json corruption on parse error

saveRateLimitToProviders initialized data as {} in catch block, then
wrote only {rateLimit: ...} back — destroying all provider configs.
Now returns early on parse failure, preserving existing file."
```

---

### Task 4: Fix director save race condition (missing await)

**Covers:** B7 — `this._save()` called without `await` at end of `_runTick()`, racing with awaited saves in jubilee/major beat branches

**Files:**
- Modify: `src/services/director-loop.ts:240`

**Interfaces:**
- Produces: `_runTick()` now awaits `_save()`, preventing concurrent `atomicWriteJson` to `director_state.json`

- [ ] **Step 1: Add await to `_save()` call**

In `src/services/director-loop.ts`, line 240:

```
Line 240: BEFORE
      this._save();
Line 240: AFTER
      await this._save();
```

- [ ] **Step 2: Add overlapping tick guard**

In the same file, add a concurrency guard to prevent overlapping `_runTick()` calls. Replace the `start()` method (lines 106-113):

```ts
start(): void {
  if (this._running) return;
  this._running = true;
  this._paused = false;
  this._timer = setInterval(() => {
    if (this._tickInProgress) return;
    this._tickInProgress = true;
    this._runTick()
      .catch((err) => log.error({ err }, "Director tick failed"))
      .finally(() => { this._tickInProgress = false; });
  }, this._config.wakeIntervalSeconds * 1000);
  log.info("Director started");
}
```

Add the private field to the class (after line 71):

```ts
private _tickInProgress = false;
```

- [ ] **Step 3: Run tests**

Run: `bun test src/services/director-loop.test.ts 2>&1 | head -20`

Check that no new failures appear (director-loop may not have tests — if not, verify `bun run build` passes).

- [ ] **Step 4: Run build check**

Run: `bun run build 2>&1 | tail -5`

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/director-loop.ts
git commit -m "fix: prevent director save race and overlapping ticks

this._save() at end of _runTick was fire-and-forget (no await), racing
with awaited saves in _maybeGenerateMajorBeat. Added await to serialize
writes to director_state.json.

Added _tickInProgress guard to prevent overlapping _runTick executions
when LLM calls exceed wakeIntervalSeconds."
```

---

### Task 5: Fix benchmark missing await

**Covers:** B6 — `Promise.all(filePromises)` without `await` makes concurrent read test meaningless

**Files:**
- Modify: `src/lib/benchmark.test.ts:264`
- Modify: `src/lib/benchmark.test.ts:126-131` — wrap SQLite writes in transaction

**Interfaces:**
- Consumes: SQLiteStore.upsertEntity
- Produces: Accurate concurrent read measurement

- [ ] **Step 1: Fix missing await**

In `src/lib/benchmark.test.ts`, line 264:

```
Line 264: BEFORE
    Promise.all(filePromises);
Line 264: AFTER
    await Promise.all(filePromises);
```

Make the test function async (line 254):

```
Line 254: BEFORE
  test('concurrent reads: SQLite WAL vs File', () => {
Line 254: AFTER
  test('concurrent reads: SQLite WAL vs File', async () => {
```

- [ ] **Step 2: Fix write perf test — wrap SQLite in transaction**

In `src/lib/benchmark.test.ts`, replace lines 124-131:

```ts
const sqliteDir = join(BENCH_DIR, 'sqlite-db');
const sqlite = new SQLiteStore(sqliteDir);
sqlite.db.exec('BEGIN TRANSACTION');
const sqliteStart = performance.now();
for (const e of entities) {
  sqlite.upsertEntity(e);
}
sqlite.db.exec('COMMIT');
const sqliteWriteTime = performance.now() - sqliteStart;
sqlite.close();
```

Replace line 112-113 (make write test async to match SQLite API):

```ts
// Line 112:
test('write performance: SQLite vs File', async () => {
```

- [ ] **Step 3: Run benchmark test**

Run: `bun test src/lib/benchmark.test.ts -t "write"`

Expected: PASS (SQLite with transaction should be much faster).

- [ ] **Step 4: Commit**

```bash
git add src/lib/benchmark.test.ts
git commit -m "fix: benchmark missing await and SQLite transaction

Concurrent read test called Promise.all without await, measuring only
promise creation time (~0ms). Now awaits.

Write perf test did 1000 individual INSERTs without transaction,
making SQLite appear ~400x slower than reality. Wrapped in BEGIN/COMMIT."
```

---

### Task 6: Type-check, full test run, final commit

- [ ] **Step 1: Run full type check**

Run: `bun run build 2>&1 | tail -10`

Expected: No errors.

- [ ] **Step 2: Run full test suite (excluding known data-dependent failures)**

Run: `bun test --rerun-failures 2>&1 | tail -15`

Verify: Only 6 failures remain (4 Bible DB missing data, 1 performance, 1 Wikipedia timeout). Previous pass count maintained (1080+).

- [ ] **Step 3: Final commit (if any straggling changes)**

```bash
git status
```
