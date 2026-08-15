# Jungian Profiler — Phase 1C: Director (Task 1.3)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [ ]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S9; impl-спека `spec-blend-algorithm.md`.

**Acceptance (1C):** `computeDistribution` возвращает uniform при confidence<0.3; веса нормализуются в 1.0; `shadowInjection` 0.15 при confidence>0.5; `explorationFactor ≥ 0.05`. 0 LLM.

**Files:**
- Modify: `src/services/jungian-profiler.ts`
- Modify: `src/services/jungian-profiler.test.ts`

---

## Task 1.3: Director — computeDistribution (pure, не wired)

**Covers:** S9
**Interfaces (Produces):** `WeightedChoice { value; weight }`; `ProbabilityDistribution { sceneTone; archetypes; pacing; sensoryChannels; informationStyle; shadowInjection; explorationFactor }`; `WorldState { genre?; socialSystem? }`; `SceneContext { mood?; timeOfDay? }`; `computeDistribution(profile: JungianProfile, worldState: WorldState, sceneContext: SceneContext): ProbabilityDistribution`; `sample(choices): string`

- [ ] **Step 1: Write failing tests**

```typescript
// append to src/services/jungian-profiler.test.ts
import { computeDistribution, sample } from './jungian-profiler';

describe('computeDistribution', () => {
  test('confidence < 0.3 → uniform (equal weights)', () => {
    const p = createDefaultProfile(); // confidence 0
    const dist = computeDistribution(p, {}, {});
    const w = dist.sceneTone[0]!.weight;
    for (const c of dist.sceneTone) expect(c.weight).toBeCloseTo(w, 5);
  });
  test('weights sum to ~1.0 after normalize', () => {
    const p = createDefaultProfile();
    p.extraversion.preference = 0.2; p.intuition.preference = 0.8;
    p.thinking.preference = 0.75; p.judging.preference = 0.7; p.confidence = 0.8;
    const dist = computeDistribution(p, {}, {});
    for (const key of ['sceneTone', 'archetypes', 'pacing', 'sensoryChannels', 'informationStyle'] as const) {
      const sum = dist[key].reduce((s, c) => s + c.weight, 0);
      expect(sum).toBeCloseTo(1.0, 4);
    }
  });
  test('shadowInjection 0.15 when confidence > 0.5', () => {
    const p = createDefaultProfile(); p.confidence = 0.8;
    expect(computeDistribution(p, {}, {}).shadowInjection).toBe(0.15);
  });
  test('explorationFactor ≥ 0.05', () => {
    const p = createDefaultProfile(); p.confidence = 0.8;
    expect(computeDistribution(p, {}, {}).explorationFactor).toBeGreaterThanOrEqual(0.05);
  });
});

describe('sample', () => {
  test('returns one of the choice values', () => {
    const choices = [{ value: 'a', weight: 0.5 }, { value: 'b', weight: 0.5 }];
    expect(['a', 'b']).toContain(sample(choices));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL — `computeDistribution is not exported`

- [ ] **Step 3: Write minimal implementation (append to jungian-profiler.ts)**

```typescript
// append to src/services/jungian-profiler.ts
export interface WeightedChoice { value: string; weight: number; }

export interface WorldState { genre?: string; socialSystem?: string; }
export interface SceneContext { mood?: string; timeOfDay?: string; }

export interface ProbabilityDistribution {
  sceneTone: WeightedChoice[];
  archetypes: WeightedChoice[];
  pacing: WeightedChoice[];
  sensoryChannels: WeightedChoice[];
  informationStyle: WeightedChoice[];
  shadowInjection: number;
  explorationFactor: number;
}

export function sample(choices: WeightedChoice[]): string {
  const r = Math.random();
  let cumulative = 0;
  for (const c of choices) { cumulative += c.weight; if (r <= cumulative) return c.value; }
  return choices[choices.length - 1]!.value;
}

function normalizeWeights(dist: ProbabilityDistribution): void {
  for (const key of ['sceneTone', 'archetypes', 'pacing', 'sensoryChannels', 'informationStyle'] as const) {
    const total = dist[key].reduce((s, c) => s + c.weight, 0);
    if (total > 0) dist[key].forEach(c => c.weight /= total);
  }
}

function uniformChoices(values: string[]): WeightedChoice[] {
  return values.map(v => ({ value: v, weight: 1 / values.length }));
}

function uniformDistribution(): ProbabilityDistribution {
  return {
    sceneTone: uniformChoices(['controlled, strategic', 'dry, precise', 'neutral', 'warm, emotional', 'chaotic']),
    archetypes: uniformChoices(['judgment_trial', 'political_intrigue', 'wisdom_counsel', 'rescue', 'random']),
    pacing: uniformChoices(['medium', 'slow', 'fast']),
    sensoryChannels: uniformChoices(['visual', 'tactile', 'atmospheric', 'auditory', 'emotional']),
    informationStyle: uniformChoices(['analytical', 'balanced', 'emotional', 'concrete']),
    shadowInjection: 0.05,
    explorationFactor: 0.05,
  };
}

function injectShadow(dist: ProbabilityDistribution, profile: JungianProfile): void {
  const rate = dist.shadowInjection;
  if (profile.thinking.preference > 0.6) {
    dist.informationStyle.push({ value: 'emotional', weight: rate });
    dist.sceneTone.push({ value: 'warm, personal', weight: rate });
  }
  if (profile.thinking.preference < 0.4) {
    dist.informationStyle.push({ value: 'analytical', weight: rate });
    dist.sceneTone.push({ value: 'dry, factual', weight: rate });
  }
  if (profile.intuition.preference > 0.6) dist.sensoryChannels.push({ value: 'concrete, tactile', weight: rate });
  if (profile.intuition.preference < 0.4) dist.sensoryChannels.push({ value: 'symbolic, metaphorical', weight: rate });
  normalizeWeights(dist);
}

function nudge(choices: WeightedChoice[], value: string, amount: number): void {
  const target = choices.find(c => c.value === value);
  if (target) target.weight += amount;
}

function applyContextNudges(dist: ProbabilityDistribution, worldState: WorldState, sceneContext: SceneContext): void {
  // genre/socialSystem → archetype bias (neutral default: no bias when fields absent)
  if (worldState.genre === 'political') nudge(dist.archetypes, 'political_intrigue', 0.1);
  else if (worldState.genre === 'horror') nudge(dist.archetypes, 'judgment_trial', 0.1);
  if (worldState.socialSystem === 'feudal') nudge(dist.archetypes, 'political_intrigue', 0.1);

  // mood/timeOfDay → tone bias (neutral default: no bias when fields absent)
  if (sceneContext.mood === 'somber') nudge(dist.sceneTone, 'dry, precise', 0.1);
  else if (sceneContext.mood === 'joyful') nudge(dist.sceneTone, 'warm, emotional', 0.1);
  if (sceneContext.timeOfDay === 'night') nudge(dist.sceneTone, 'neutral', 0.1);

  normalizeWeights(dist);
}

export function computeDistribution(profile: JungianProfile, worldState: WorldState, sceneContext: SceneContext): ProbabilityDistribution {
  if (profile.confidence < 0.3) return uniformDistribution();
  const e = profile.extraversion.preference, n = profile.intuition.preference;
  const t = profile.thinking.preference, j = profile.judging.preference;
  const dist: ProbabilityDistribution = {
    sceneTone: [
      { value: 'controlled, strategic', weight: 0.2 + t * 0.2 },
      { value: 'dry, precise', weight: 0.1 + t * 0.2 },
      { value: 'neutral', weight: 0.15 },
      { value: 'warm, emotional', weight: 0.1 + (1 - t) * 0.2 },
      { value: 'chaotic', weight: 0.05 + (1 - j) * 0.1 },
    ],
    archetypes: [
      { value: 'judgment_trial', weight: 0.15 + t * 0.2 },
      { value: 'political_intrigue', weight: 0.1 + j * 0.15 },
      { value: 'wisdom_counsel', weight: 0.1 + n * 0.1 },
      { value: 'rescue', weight: 0.1 + (1 - n) * 0.1 },
      { value: 'random', weight: 0.1 },
    ],
    pacing: [
      { value: 'medium', weight: 0.4 },
      { value: 'slow', weight: 0.2 + (1 - e) * 0.1 },
      { value: 'fast', weight: 0.2 + e * 0.1 },
    ],
    sensoryChannels: [
      { value: 'visual', weight: 0.3 },
      { value: 'tactile', weight: 0.2 + (1 - n) * 0.1 },
      { value: 'atmospheric', weight: 0.2 },
      { value: 'auditory', weight: 0.1 },
      { value: 'emotional', weight: 0.05 + (1 - t) * 0.1 },
    ],
    informationStyle: [
      { value: 'analytical', weight: 0.2 + t * 0.35 },
      { value: 'balanced', weight: 0.3 },
      { value: 'emotional', weight: 0.1 + (1 - t) * 0.15 },
      { value: 'concrete', weight: 0.1 + (1 - n) * 0.1 },
    ],
    shadowInjection: profile.confidence > 0.5 ? 0.15 : 0.05,
    explorationFactor: Math.max(0.05, averageRange(profile) * 0.3),
  };
  injectShadow(dist, profile);
  applyContextNudges(dist, worldState, sceneContext);
  return dist;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS (все тесты)

- [ ] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(profiler): Director computeDistribution + injectShadow + sample"
```

**Phase 1C DONE.** Переходи к `2026-08-14-jungian-profiler-p1d.md`.
