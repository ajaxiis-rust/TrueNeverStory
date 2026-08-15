# Jungian Profiler — Phase 1B: Blend (Task 1.2)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [ ]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S6; impl-спека `spec-blend-algorithm.md`.

**Acceptance (1B):** `BLEND_CONFIG`, `updateAxis`, `updateAxisConfidence`, `blendBehavioralSignals` реализованы. EMA converge + rate limit + range grow/decay тестируются. 0 LLM.

**Files:**
- Modify: `src/services/jungian-profiler.ts`
- Modify: `src/services/jungian-profiler.test.ts`

---

## Task 1.2: Blend math (updateAxis + blendBehavioralSignals)

**Covers:** S6
**Interfaces:**
- Consumes: `AxisSignals` from `./metrics-collector`
- Produces: `BLEND_CONFIG`; `updateAxis(current, signal, recentSignals): AxisProfile`; `updateAxisConfidence(current, incoming, blendedPreference): number`; `blendBehavioralSignals(signals, profile, recentSignals): JungianProfile`

- [ ] **Step 1: Write failing tests (append to test file)**

```typescript
// append to src/services/jungian-profiler.test.ts
import { BLEND_CONFIG, updateAxis, updateAxisConfidence, blendBehavioralSignals } from './jungian-profiler';
import type { AxisSignals } from './metrics-collector';

describe('updateAxis — EMA', () => {
  test('converges to constant signal', () => {
    let axis = { preference: 0.0, range: 0.1 };
    for (let i = 0; i < 20; i++) axis = updateAxis(axis, 1.0, []);
    expect(axis.preference).toBeGreaterThan(0.9);
  });
  test('rate limit: one blend-cycle shifts ≤ maxShift', () => {
    const axis = updateAxis({ preference: 0.0, range: 0.1 }, 1.0, []);
    expect(axis.preference).toBeLessThanOrEqual(BLEND_CONFIG.maxShiftPerTurn + 1e-9);
  });
  test('range clamped to [0.05, 0.95]', () => {
    let axis = { preference: 0.5, range: 0.05 };
    for (let i = 0; i < 100; i++) axis = updateAxis(axis, 0.5, []);
    expect(axis.range).toBeGreaterThanOrEqual(0.05);
    expect(axis.range).toBeLessThanOrEqual(0.95);
  });
  test('range grows on strong deviation from rolling avg', () => {
    const recent = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const axis = updateAxis({ preference: 0.5, range: 0.1 }, 0.95, recent);
    expect(axis.range).toBeGreaterThan(0.1);
  });
  test('range decays on stability', () => {
    const recent = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const axis = updateAxis({ preference: 0.5, range: 0.5 }, 0.5, recent);
    expect(axis.range).toBeLessThan(0.5);
  });
});

describe('updateAxisConfidence', () => {
  test('confirmation (< 0.1 diff) → +0.05', () => {
    expect(updateAxisConfidence(0.5, 0.55, 0.55)).toBeCloseTo(0.55, 5);
  });
  test('contradiction (> 0.3 diff) → -0.10, floor 0.30', () => {
    expect(updateAxisConfidence(0.35, 0.9, 0.5)).toBeCloseTo(0.3, 5);
  });
  test('neutral → unchanged', () => {
    expect(updateAxisConfidence(0.5, 0.7, 0.55)).toBe(0.5);
  });
});

describe('blendBehavioralSignals', () => {
  test('updates all 4 axes, confidence = mean axisConfidence', () => {
    const profile = createDefaultProfile();
    const signals: AxisSignals = { extraversion: 0.9, intuition: 0.8, thinking: 0.75, judging: 0.7 };
    const recent = { extraversion: [0.5], intuition: [0.5], thinking: [0.5], judging: [0.5] };
    const blended = blendBehavioralSignals(signals, profile, recent);
    expect(blended.source).toBe('blended');
    expect(blended.confidence).toBeCloseTo(
      (blended.axisConfidence.extraversion + blended.axisConfidence.intuition +
       blended.axisConfidence.thinking + blended.axisConfidence.judging) / 4, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL — `BLEND_CONFIG is not exported`

- [ ] **Step 3: Write minimal implementation (append to jungian-profiler.ts)**

```typescript
// append to src/services/jungian-profiler.ts
import type { AxisSignals } from './metrics-collector';

export const BLEND_CONFIG = {
  emaAlpha: 0.25,
  maxShiftPerTurn: 0.10,
  rangeGrowthThreshold: 0.3,
  rangeDecayRate: 0.005,
  minTurnsForBlend: 20,
};

export function updateAxis(
  current: AxisProfile,
  signal: number,
  recentSignals: number[],
): AxisProfile {
  const ema = current.preference * (1 - BLEND_CONFIG.emaAlpha) + signal * BLEND_CONFIG.emaAlpha;
  const delta = ema - current.preference;
  const clamped = current.preference + Math.sign(delta) * Math.min(Math.abs(delta), BLEND_CONFIG.maxShiftPerTurn);

  const rollingAvg = recentSignals.length > 0
    ? recentSignals.reduce((a, b) => a + b, 0) / recentSignals.length
    : current.preference;
  const deviation = Math.abs(signal - rollingAvg);
  const rangeDelta = deviation > BLEND_CONFIG.rangeGrowthThreshold
    ? 0.02
    : deviation > 0.15
      ? 0.01
      : -BLEND_CONFIG.rangeDecayRate;
  const newRange = Math.max(0.05, Math.min(0.95, current.range + rangeDelta));

  return {
    preference: Math.max(0.05, Math.min(0.95, clamped)),
    range: newRange,
  };
}

export function updateAxisConfidence(current: number, incoming: number, blendedPreference: number): number {
  const difference = Math.abs(incoming - blendedPreference);
  if (difference < 0.1) return Math.min(0.95, current + 0.05);
  if (difference > 0.3) return Math.max(0.3, current - 0.1);
  return current;
}

export function blendBehavioralSignals(
  signals: AxisSignals,
  profile: JungianProfile,
  recentSignals: { extraversion: number[]; intuition: number[]; thinking: number[]; judging: number[] },
): JungianProfile {
  const ex = updateAxis(profile.extraversion, signals.extraversion, recentSignals.extraversion);
  const in_ = updateAxis(profile.intuition, signals.intuition, recentSignals.intuition);
  const th = updateAxis(profile.thinking, signals.thinking, recentSignals.thinking);
  const ju = updateAxis(profile.judging, signals.judging, recentSignals.judging);

  const cEx = updateAxisConfidence(profile.axisConfidence.extraversion, signals.extraversion, ex.preference);
  const cIn = updateAxisConfidence(profile.axisConfidence.intuition, signals.intuition, in_.preference);
  const cTh = updateAxisConfidence(profile.axisConfidence.thinking, signals.thinking, th.preference);
  const cJu = updateAxisConfidence(profile.axisConfidence.judging, signals.judging, ju.preference);

  return {
    extraversion: ex, intuition: in_, thinking: th, judging: ju,
    confidence: (cEx + cIn + cTh + cJu) / 4,
    axisConfidence: { extraversion: cEx, intuition: cIn, thinking: cTh, judging: cJu },
    source: 'blended',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS (тесты 1.1 + 1.2)

- [ ] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(profiler): blend math — updateAxis/EMA/range/confidence"
```

**Phase 1B DONE.** Переходи к `2026-08-14-jungian-profiler-p1c.md`.
