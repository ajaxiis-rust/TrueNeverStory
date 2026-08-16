# Literary Modulation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make narrative prose richer and more compelling for an outside reader through soft stylistic modulation, short-turn expansion, deferred NPC callbacks, and literary feedback — all behind feature flags.

**Architecture:** Additive layers on the existing State-First pipeline. New services (`ShortTurnExpander`, `DeferredHookStore`, `FeedbackStore`) are pure TypeScript with 0 LLM in hot path. The only new LLM call is in `ShortTurnExpander.expand()` (1 call per expanded turn). All features gated by independent feature flags (default off).

**Tech Stack:** TypeScript, Bun, SQLite (bun:sqlite), existing `LLMQueue`/`LLMClient`, existing `FeatureFlagManager`.

**Spec:** `docs/compose/specs/literary-modulation.md`

## Global Constraints

- State-First pipeline order is never violated (Intent → Simulation → State → Context → Prose).
- Player decision is inviolable — expansion never changes player's choice or attributes unmotivated feelings. The raw turn is always preserved verbatim (prefixed in `expand()`, kept in `lastTurn.rawInput`).
- All features default OFF behind `literary-modulation-enabled`, `short-turn-expansion-enabled`, `deferred-hooks-enabled`.
- Second explicit refusal → stop pressure in scene/session (`RefusalTracker`).
- `literaryToneHint` weight is BELOW `authorPhrases` and `playerVoice` in Stylist prompt.
- Deferred hooks: 0-1 per major block, graduated strength (1=trace, 2=edge, 3=soft contact). Block closure = `EventTopic.STORY_BEAT`, NOT a turn-count heuristic.
- Feedback learns narrow literary parameters (`LITERARY_PARAMS`), NOT psychotype.
- Soft dramaturgical priors: ±15% max coefficient on archetype weights.
- New LLM agent IDs (`short-turn-expander`, `feedback-regen`) are NOT in `conf/agents.json`; they resolve to the default provider via `loadAgentConfig` fallback (same as existing `author-matcher`/`psychotype-analyzer`).
- Type imports: `Intent` from `../models/intent`; `SimulationResult` from `../models/simulation`; `LLMQueue.generateText(prompt, priority, temp, agentId)` priority is `TaskPriority` (0-3), use `2` for HIGH.
- **English inside, translate at boundary** (project rule): all string literals, regexes, and test fixtures operate on ENGLISH. `ctx.parsedInput` is the English translation (set in `translateAndClassify`); `ctx.rawInput` holds the player's original language. No Cyrillic in code, regex, or test fixtures.

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/feature-flags.ts` | Modify | Add 3 new default flags |
| `src/services/literary-modulation.ts` | Create | `computeLiteraryToneHint()`, `LITERARY_PARAMS`, `logLiterarySignals()` |
| `src/services/literary-modulation.test.ts` | Create | Tests for tone hint + signals |
| `src/services/short-turn-expander.ts` | Create | `shouldExpand()`, `analyzeCharge()`, `detectRefusal()`, `expand()`, `RefusalTracker` |
| `src/services/short-turn-expander.test.ts` | Create | Unit tests for expansion logic |
| `src/services/deferred-hook-store.ts` | Create | `DeferredHookStore` — in-memory + JSON persistence |
| `src/services/deferred-hook-store.test.ts` | Create | Unit tests for hook CRUD |
| `src/services/feedback-store.ts` | Create | `FeedbackStore` + singleton `getFeedbackStore()` |
| `src/services/feedback-store.test.ts` | Create | Unit tests for feedback |
| `src/services/roleplay-engine.ts` | Modify | Wire all new features into pipeline |
| `src/services/agents/dramaturg.ts` | Modify | Add `literaryModulationCoefficients()` |
| `src/services/jungian-profiler.ts` | Modify | Add `literaryToneHint` to `buildPlayerVoice()` |
| `src/routes/feedback.ts` | Create | `POST /feedback` endpoint |
| `src/routes/index.ts` | Modify | Register `feedbackRouter` |
| `src/routes/chat.ts` | Modify | Export `getEngine()` for regen |

---

## Phase 0 — Observability

### Task T0.1: Register 3 new feature flags

**Covers:** S2.1

**Files:**
- Modify: `src/lib/feature-flags.ts`
- Test: `src/lib/feature-flags.test.ts` (create if not exists)

**Interfaces:**
- Consumes: `FeatureFlagManager`, `DEFAULT_FLAGS` array
- Produces: 3 new flag IDs: `literary-modulation-enabled`, `short-turn-expansion-enabled`, `deferred-hooks-enabled`

- [ ] **Step 1: Write failing test**

Create `src/lib/feature-flags.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { getFeatureFlagManager, resetFeatureFlagManager } from './feature-flags';

describe('Literary Modulation feature flags', () => {
  beforeEach(() => {
    resetFeatureFlagManager();
  });

  it('literary-modulation-enabled exists and defaults to off', () => {
    const mgr = getFeatureFlagManager();
    const flag = mgr.get('literary-modulation-enabled');
    expect(flag).toBeDefined();
    expect(flag!.enabled).toBe(false);
    expect(flag!.percentage).toBe(0);
  });

  it('short-turn-expansion-enabled exists and defaults to off', () => {
    const mgr = getFeatureFlagManager();
    const flag = mgr.get('short-turn-expansion-enabled');
    expect(flag).toBeDefined();
    expect(flag!.enabled).toBe(false);
  });

  it('deferred-hooks-enabled exists and defaults to off', () => {
    const mgr = getFeatureFlagManager();
    const flag = mgr.get('deferred-hooks-enabled');
    expect(flag).toBeDefined();
    expect(flag!.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/feature-flags.test.ts`
Expected: FAIL — flags not found in DEFAULT_FLAGS

- [ ] **Step 3: Add flags to DEFAULT_FLAGS**

In `src/lib/feature-flags.ts`, append to `DEFAULT_FLAGS` array (after the `jungian-profiler-enabled` entry):

```typescript
{
  id: 'literary-modulation-enabled',
  name: 'Literary Modulation',
  description: 'Soft style/dramaturgy priors based on player signals',
  enabled: false,
  percentage: 0,
  conditions: [],
  variants: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
},
{
  id: 'short-turn-expansion-enabled',
  name: 'Short Turn Expansion',
  description: 'Literary expansion of short actionable player turns',
  enabled: false,
  percentage: 0,
  conditions: [],
  variants: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
},
{
  id: 'deferred-hooks-enabled',
  name: 'Deferred Character Hooks',
  description: 'Soft deferred callbacks for noticed-but-rejected NPCs',
  enabled: false,
  percentage: 0,
  conditions: [],
  variants: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/feature-flags.test.ts`
Expected: PASS — all 3 flags exist and default to off

- [ ] **Step 5: Commit**

```bash
git add src/lib/feature-flags.ts src/lib/feature-flags.test.ts
git commit -m "feat(literary): register 3 feature flags for literary modulation"
```

---

### Task T0.2: Add observability logger

**Covers:** S2.1

**Files:**
- Create: `src/services/literary-modulation.ts`
- Create: `src/services/literary-modulation.test.ts`
- Modify: `src/services/roleplay-engine.ts`

**Interfaces:**
- Consumes: `getFeatureFlagManager()`, `PipelineContext`, `GameContext`, `Intent`
- Produces: `logLiterarySignals(ctx, gameContext, intent, playerVoice, authorPhrases)` function

- [ ] **Step 1: Write failing test**

Create `src/services/literary-modulation.test.ts`:

```typescript
import { describe, it, expect, mock } from 'bun:test';
import { logLiterarySignals } from './literary-modulation';

describe('logLiterarySignals', () => {
  it('returns structured signal object', () => {
    const result = logLiterarySignals(
      { parsedInput: 'I went to the tavern' } as any,
      { character: { name: 'Hero' }, location: { name: 'tavern' }, nearbyNpcs: [] } as any,
      { type: 'action', verb: 'go' } as any,
      'Player prefers concrete info',
      ['The evening air was crisp.'],
    );
    expect(result).toHaveProperty('turnWordCount');
    expect(result).toHaveProperty('playerVoiceLength');
    expect(result).toHaveProperty('authorPhrasesCount');
    expect(result).toHaveProperty('intentType');
    expect(result.turnWordCount).toBeGreaterThan(0);
    expect(result.playerVoiceLength).toBe(28); // 'Player prefers concrete info'.length
    expect(result.authorPhrasesCount).toBe(1);
    expect(result.intentType).toBe('action');
  });

  it('handles missing playerVoice and authorPhrases', () => {
    const result = logLiterarySignals(
      { parsedInput: 'test' } as any,
      { nearbyNpcs: [] } as any,
      { type: 'action' } as any,
      undefined,
      undefined,
    );
    expect(result.playerVoiceLength).toBe(0);
    expect(result.authorPhrasesCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/literary-modulation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement logLiterarySignals**

Create `src/services/literary-modulation.ts`:

```typescript
/**
 * Literary Modulation — observability and soft signal computation.
 * All features behind feature flags (default off).
 */

import type { GameContext } from './context-builder';
import type { Intent } from '../models/intent';
import type { ProbabilityDistribution } from './jungian-profiler';

export interface LiterarySignals {
  turnWordCount: number;
  playerVoiceLength: number;
  authorPhrasesCount: number;
  intentType: string;
  isDialogue: boolean;
}

export function logLiterarySignals(
  ctx: { parsedInput: string },
  _gameContext: GameContext,
  intent: Intent,
  playerVoice?: string,
  authorPhrases?: string[],
): LiterarySignals {
  const words = ctx.parsedInput.trim().split(/\s+/).length;
  return {
    turnWordCount: words,
    playerVoiceLength: playerVoice?.length ?? 0,
    authorPhrasesCount: authorPhrases?.length ?? 0,
    intentType: intent.type,
    isDialogue: intent.type === 'dialogue',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/literary-modulation.test.ts`
Expected: PASS

- [ ] **Step 5: Wire logLiterarySignals into the engine**

In `src/services/roleplay-engine.ts`, add import at top:

```typescript
import { logLiterarySignals } from './literary-modulation';
```

In `_processInputImpl()` and `_processInputStreamImpl()`, after the prose is generated and censored (before translate, around line 460), add:

```typescript
// Observability — log literary signals without affecting generation
if (getFeatureFlagManager().isEnabled('literary-modulation-enabled')
    || getFeatureFlagManager().isEnabled('short-turn-expansion-enabled')
    || getFeatureFlagManager().isEnabled('deferred-hooks-enabled')) {
  const signals = logLiterarySignals(
    ctx, gameContext, intent, ctx.playerVoice, this.resolveAuthorPhrases(),
  );
  log.info({ literarySignals: signals }, 'literary modulation observability');
}
```

- [ ] **Step 6: Commit**

```bash
git add src/services/literary-modulation.ts src/services/literary-modulation.test.ts src/services/roleplay-engine.ts
git commit -m "feat(literary): add observability logger for literary signals"
```

---

## Phase 1 — Stylistics

### Task T1.1: Add `literaryToneHint` to `buildPlayerVoice()`

**Covers:** S2.2

**Files:**
- Modify: `src/services/jungian-profiler.ts` (function `buildPlayerVoice`, line 257)
- Modify: `src/services/literary-modulation.ts` (add `computeLiteraryToneHint()`)
- Modify: `src/services/literary-modulation.test.ts`

**Interfaces:**
- Consumes: `ProbabilityDistribution` (sceneTone, pacing, sensoryChannels, informationStyle)
- Produces: `computeLiteraryToneHint(dist): string` — 2-3 descriptors like "dense, concrete, close narration"

- [ ] **Step 1: Write failing test**

Add to `src/services/literary-modulation.test.ts`:

```typescript
import { computeLiteraryToneHint } from './literary-modulation';
import type { ProbabilityDistribution } from './jungian-profiler';

describe('computeLiteraryToneHint', () => {
  it('returns hint string from distribution', () => {
    const dist: ProbabilityDistribution = {
      sceneTone: [
        { value: 'controlled, strategic', weight: 0.5 },
        { value: 'dry, precise', weight: 0.3 },
        { value: 'neutral', weight: 0.2 },
      ],
      archetypes: [],
      pacing: [
        { value: 'medium', weight: 0.4 },
        { value: 'slow', weight: 0.6 },
      ],
      sensoryChannels: [
        { value: 'visual', weight: 0.5 },
        { value: 'tactile', weight: 0.3 },
        { value: 'atmospheric', weight: 0.2 },
      ],
      informationStyle: [
        { value: 'analytical', weight: 0.6 },
        { value: 'balanced', weight: 0.4 },
      ],
      shadowInjection: 0.1,
      explorationFactor: 0.1,
    };
    const hint = computeLiteraryToneHint(dist);
    expect(typeof hint).toBe('string');
    expect(hint.length).toBeGreaterThan(0);
    // Should mention top tone or top sensory
    expect(hint).toMatch(/controlled|strategic|visual|analytical/i);
  });

  it('handles empty distribution gracefully', () => {
    const dist: ProbabilityDistribution = {
      sceneTone: [], archetypes: [], pacing: [], sensoryChannels: [],
      informationStyle: [], shadowInjection: 0, explorationFactor: 0,
    };
    const hint = computeLiteraryToneHint(dist);
    expect(typeof hint).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/literary-modulation.test.ts`
Expected: FAIL — `computeLiteraryToneHint` not exported

- [ ] **Step 3: Implement computeLiteraryToneHint**

Add to `src/services/literary-modulation.ts`:

```typescript
/**
 * Derive a weak literary tone hint from the probability distribution.
 * Returns 2-3 descriptors (e.g. "dense, concrete, close narration").
 * Weight is BELOW authorPhrases and playerVoice in Stylist prompt.
 */
export function computeLiteraryToneHint(dist: ProbabilityDistribution): string {
  const parts: string[] = [];

  // Top scene tone
  const topTone = dist.sceneTone.reduce(
    (best, c) => c.weight > best.weight ? c : best,
    { value: '', weight: 0 },
  );
  if (topTone.value) parts.push(topTone.value);

  // Top sensory channel
  const topSensory = dist.sensoryChannels.reduce(
    (best, c) => c.weight > best.weight ? c : best,
    { value: '', weight: 0 },
  );
  if (topSensory.value) parts.push(topSensory.value);

  // Pacing descriptor
  const topPace = dist.pacing.reduce(
    (best, c) => c.weight > best.weight ? c : best,
    { value: '', weight: 0 },
  );
  if (topPace.value) parts.push(`${topPace.value} pace`);

  return parts.length > 0 ? parts.join(', ') : 'neutral tone';
}

/**
 * Narrow literary parameters that feedback learns (NOT psychotype).
 * Single source of truth shared by FeedbackStore and expansion logic.
 */
export const LITERARY_PARAMS = [
  'npc-pressure', 'sensory-volume', 'expansion-length',
  'internal-state', 'nudge-forward', 'callback-softness',
] as const;
export type LiteraryParam = typeof LITERARY_PARAMS[number];
```

Make sure `ProbabilityDistribution` is imported in the file (it's already used by `logLiterarySignals` via the type import).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/literary-modulation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/literary-modulation.ts src/services/literary-modulation.test.ts
git commit -m "feat(literary): add computeLiteraryToneHint from distribution"
```

---

### Task T1.2: Wire `literaryToneHint` into `buildPlayerVoice()`

**Covers:** S2.2

**Files:**
- Modify: `src/services/jungian-profiler.ts` (line 257-285, `buildPlayerVoice`)
- Modify: `src/services/roleplay-engine.ts` (pass `dist` to `buildPlayerVoice`)

**Interfaces:**
- Consumes: `computeLiteraryToneHint(dist)` from `literary-modulation.ts` (computed in the engine, NOT inside `buildPlayerVoice` — avoids circular import)
- Produces: `buildPlayerVoice(dist, dramaturg, actor, validator, literaryToneHint?)` — 5th param is a pre-computed hint string

- [ ] **Step 1: Write failing test**

Add to `src/services/literary-modulation.test.ts`:

```typescript
import { buildPlayerVoice } from './jungian-profiler';
import type { ProbabilityDistribution, DramaturgEnrichment, NpcEnrichment, VerificationResult } from './jungian-profiler';

describe('buildPlayerVoice with literaryToneHint', () => {
  const dist: ProbabilityDistribution = {
    sceneTone: [{ value: 'controlled, strategic', weight: 1 }],
    archetypes: [],
    pacing: [{ value: 'medium', weight: 1 }],
    sensoryChannels: [{ value: 'visual', weight: 1 }],
    informationStyle: [{ value: 'analytical', weight: 1 }],
    shadowInjection: 0.1,
    explorationFactor: 0.1,
  };
  const dramaturg: DramaturgEnrichment = { archetype: 'test', filledSkeleton: 'test scene', mood: 'neutral' };
  const validator: VerificationResult = { claims: [], worldConsistency: { npcInLocation: true, itemsAvailable: true, timelineCoherent: true }, notes: [] };

  it('appends tone hint line when hint string is provided', () => {
    const voice = buildPlayerVoice(dist, dramaturg, [], validator, 'controlled, visual');
    expect(voice).toContain('Literary tone hint: controlled, visual');
  });

  it('omits tone hint when hint is not provided (backward compat)', () => {
    const voice = buildPlayerVoice(dist, dramaturg, [], validator);
    expect(voice).not.toContain('Literary tone hint:');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/literary-modulation.test.ts`
Expected: FAIL — `buildPlayerVoice` signature doesn't accept 5th arg

- [ ] **Step 3: Modify buildPlayerVoice**

In `src/services/jungian-profiler.ts`, change `buildPlayerVoice` signature to accept optional `literaryToneHint?: string` and append the line:

```typescript
export function buildPlayerVoice(
  dist: ProbabilityDistribution,
  dramaturg: DramaturgEnrichment,
  actor: NpcEnrichment[],
  validator: VerificationResult,
  literaryToneHint?: string,
): string {
  const tone = sample(dist.sceneTone);
  const pace = sample(dist.pacing);
  const sensory = dist.sensoryChannels.slice(0, 3).map(c => c.value);
  const infoStyle = sample(dist.informationStyle);

  const forbidden = dist.sceneTone
    .filter(t => t.weight < 0.08).map(t => t.value)
    .concat(['melodrama', 'emotional outburst']);

  const lines = [
    `Player psychological context:`,
    `- Prefers ${infoStyle}, structured information`,
    `- Responds to ${tone} tone (pacing: ${pace})`,
    `- Sensory focus: ${sensory.join(', ')}`,
    `- Scene archetype: ${dramaturg.archetype} (mood: ${dramaturg.mood})`,
    ...actor.map(a => `- NPC ${a.name}: ${a.hint}`),
    `- Avoid: ${forbidden.join(', ')}`,
  ];
  if (validator.notes.length > 0) {
    lines.push('', `Fact-check notes:`, ...validator.notes.map(n => `- ${n}`));
  }
  if (literaryToneHint) {
    lines.push('', `Literary tone hint: ${literaryToneHint}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Update caller in roleplay-engine.ts**

In `src/services/roleplay-engine.ts`, in `runEnrichmentConveyor()`, compute the hint (gated by flag) and pass it as 5th arg:

```typescript
// Add import at top of file:
import { computeLiteraryToneHint } from './literary-modulation';

// In runEnrichmentConveyor(), replace:
const voice = buildPlayerVoice(dist, dramaturg, actor, validator);
// with:
const toneHint = getFeatureFlagManager().isEnabled('literary-modulation-enabled')
  ? computeLiteraryToneHint(dist)
  : undefined;
const voice = buildPlayerVoice(dist, dramaturg, actor, validator, toneHint);
```

- [ ] **Step 5: Run all tests**

Run: `bun test src/services/literary-modulation.test.ts && bun test src/services/roleplay-engine.jungian.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/jungian-profiler.ts src/services/roleplay-engine.ts src/services/literary-modulation.test.ts
git commit -m "feat(literary): wire literaryToneHint into buildPlayerVoice"
```

---

## Phase 2 — Short Turn Expansion

### Task T2.1: Create `shouldExpand()` — turn eligibility check

**Covers:** S2.3

**Files:**
- Create: `src/services/short-turn-expander.ts`
- Create: `src/services/short-turn-expander.test.ts`

**Interfaces:**
- Consumes: raw player input string, `Intent`
- Produces: `shouldExpand(rawInput: string, intent: Intent): boolean`

- [ ] **Step 1: Write failing test**

Create `src/services/short-turn-expander.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { shouldExpand } from './short-turn-expander';
import type { Intent } from '../models/intent';

function makeIntent(type: string): Intent {
  return { type, verb: 'test' } as Intent;
}

describe('shouldExpand', () => {
  it('returns true for short actionable turn (≤50 words)', () => {
    const input = 'I walked down the street and noticed a boy. He was begging.';
    expect(shouldExpand(input, makeIntent('action'))).toBe(true);
  });

  it('returns false for long turn (>50 words)', () => {
    const input = 'word '.repeat(51).trim();
    expect(shouldExpand(input, makeIntent('action'))).toBe(false);
  });

  it('returns false for pure dialogue', () => {
    const input = 'Hello, how are you?';
    expect(shouldExpand(input, makeIntent('dialogue'))).toBe(false);
  });

  it('returns false for command intent', () => {
    const input = '/look around';
    expect(shouldExpand(input, makeIntent('command'))).toBe(false);
  });

  it('returns true for short non-dialogue turn', () => {
    const input = 'I looked around the room.';
    expect(shouldExpand(input, makeIntent('action'))).toBe(true);
  });

  it('returns false for empty input', () => {
    expect(shouldExpand('', makeIntent('action'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/short-turn-expander.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement shouldExpand**

Create `src/services/short-turn-expander.ts`:

```typescript
/**
 * Short Turn Expansion — literary enrichment of thin player turns.
 * Gated by 'short-turn-expansion-enabled' feature flag.
 */

import type { Intent } from '../models/intent';
import type { GameContext } from './context-builder';
import type { SimulationResult } from '../models/simulation';

const MAX_WORDS = 50;

export function shouldExpand(rawInput: string, intent: Intent): boolean {
  if (!rawInput || rawInput.trim().length === 0) return false;
  if (intent.type === 'dialogue') return false;
  if (intent.type === 'command') return false;

  const wordCount = rawInput.trim().split(/\s+/).length;
  return wordCount <= MAX_WORDS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/short-turn-expander.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/short-turn-expander.ts src/services/short-turn-expander.test.ts
git commit -m "feat(literary): add shouldExpand for short turn detection"
```

---

### Task T2.2: Add `analyzeCharge()` — scene charge analysis

**Covers:** S2.3

**Files:**
- Modify: `src/services/short-turn-expander.ts`
- Modify: `src/services/short-turn-expander.test.ts`

**Interfaces:**
- Consumes: rawInput, `SimulationResult`, `GameContext`
- Produces: `analyzeCharge(rawInput, simResult, gameContext): 'none' | 'low' | 'medium' | 'high'`

- [ ] **Step 1: Write failing test**

Add to `src/services/short-turn-expander.test.ts`:

```typescript
import { analyzeCharge } from './short-turn-expander';

describe('analyzeCharge', () => {
  it('returns high when NPC is mentioned and contact breaks off', () => {
    const input = 'I noticed the boy and ignored him.';
    const simResult = { outcome: 'success', probability: 0.8 } as any;
    const gameContext = { nearbyNpcs: [{ name: 'boy', uid: 'npc1' }] } as any;
    expect(analyzeCharge(input, simResult, gameContext)).toBe('high');
  });

  it('returns low for generic action with no NPC mention', () => {
    const input = 'I walked on.';
    const simResult = { outcome: 'success', probability: 0.8 } as any;
    const gameContext = { nearbyNpcs: [] } as any;
    expect(analyzeCharge(input, simResult, gameContext)).toBe('low');
  });

  it('returns medium when NPC present but no explicit refusal', () => {
    const input = 'I entered the tavern.';
    const simResult = { outcome: 'success', probability: 0.8 } as any;
    const gameContext = { nearbyNpcs: [{ name: 'innkeeper', uid: 'npc2' }] } as any;
    expect(analyzeCharge(input, simResult, gameContext)).toBe('medium');
  });

  it('returns none for empty input', () => {
    expect(analyzeCharge('', {} as any, {} as any)).toBe('none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/short-turn-expander.test.ts`
Expected: FAIL — `analyzeCharge` not exported

- [ ] **Step 3: Implement analyzeCharge**

Add to `src/services/short-turn-expander.ts`:

```typescript
const REFUSAL_VERBS = /ignore|ignored|refuse|refused|walked past|walked away|turned away|left|abandoned|dismissed|shook off|pulled away|broke away|freed/i;

export type ChargeLevel = 'none' | 'low' | 'medium' | 'high';

/** True if the player explicitly refuses/breaks off contact in this turn. */
export function detectRefusal(rawInput: string): boolean {
  return REFUSAL_VERBS.test(rawInput);
}

export function analyzeCharge(
  rawInput: string,
  _simResult: SimulationResult,
  gameContext: GameContext,
): ChargeLevel {
  if (!rawInput || rawInput.trim().length === 0) return 'none';

  const npcs = gameContext?.nearbyNpcs ?? [];
  const lower = rawInput.toLowerCase();
  // Mention detection is name-driven (robust to any NPC name), not a hardcoded word list.
  const mentionsNpc = npcs.some(n => n.name && lower.includes(n.name.toLowerCase()));
  const hasRefusal = detectRefusal(rawInput);

  if (mentionsNpc && hasRefusal) return 'high';
  if (mentionsNpc) return 'medium';
  if (npcs.length > 0) return 'medium';
  return 'low';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/short-turn-expander.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/short-turn-expander.ts src/services/short-turn-expander.test.ts
git commit -m "feat(literary): add analyzeCharge for scene charge detection"
```

---

### Task T2.3: Add `expand()` — LLM-powered literary expansion

**Covers:** S2.3

**Files:**
- Modify: `src/services/short-turn-expander.ts`
- Modify: `src/services/short-turn-expander.test.ts`

**Interfaces:**
- Consumes: rawInput, `SimulationResult`, `GameContext`, playerVoice?, authorPhrases?, `LLMQueue`
- Produces: `expand(rawInput, simResult, gameContext, playerVoice, authorPhrases, llmQueue): Promise<string>`

- [ ] **Step 1: Write failing test**

Add to `src/services/short-turn-expander.test.ts`:

```typescript
import { expand } from './short-turn-expander';

describe('expand', () => {
  it('preserves player turn verbatim and appends LLM continuation', async () => {
    const mockLLM = {
      generateText: (async (prompt: string) => {
        expect(prompt).toContain('I walked down the street and noticed a boy');
        return 'But a thin hand grabbed my sleeve.';
      }) as any,
    };
    const result = await expand(
      'I walked down the street and noticed a boy.',
      { outcome: 'success', probability: 0.8, narrativeHints: [] } as any,
      { character: { name: 'Hero' }, location: { name: 'street' }, nearbyNpcs: [] } as any,
      undefined,
      undefined,
      mockLLM as any,
    );
    // Player decision preserved verbatim at the start
    expect(result.startsWith('I walked down the street and noticed a boy.')).toBe(true);
    expect(result).toContain('But a thin hand grabbed my sleeve.');
  });

  it('includes playerVoice and authorPhrases in prompt', async () => {
    let capturedPrompt = '';
    const mockLLM = {
      generateText: (async (prompt: string) => {
        capturedPrompt = prompt;
        return 'continuation';
      }) as any,
    };
    await expand(
      'test input',
      { outcome: 'success', narrativeHints: [] } as any,
      { nearbyNpcs: [] } as any,
      'Player prefers concrete info',
      ['Author phrase one.'],
      mockLLM as any,
    );
    expect(capturedPrompt).toContain('Player prefers concrete info');
    expect(capturedPrompt).toContain('Author phrase one');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/short-turn-expander.test.ts`
Expected: FAIL — `expand` not exported

- [ ] **Step 3: Implement expand**

Add to `src/services/short-turn-expander.ts`:

```typescript
import type { LLMQueue } from '../lib/llm-queue';

const EXPANSION_SYSTEM = `You are a literary narrator. The player wrote a short turn in an interactive story.
Continue the scene from the player's last sentence (~2-3 paragraphs, ~100-150 words).

HARD RULES:
- NEVER change or restate the player's decision or action. It is already written.
- NEVER attribute feelings or motives the player didn't write.
- Add world/NPC reactions, sensory details, physical microdetails.
- Preserve the player's "I" voice. External details go in the same narrative flow.
- If the player refused/ignored an NPC, the NPC may react (grab, call out, appear).
- No moralizing. No summary. No modern slang.
- Write in the same language as the input.`;

export async function expand(
  rawInput: string,
  simResult: SimulationResult,
  gameContext: GameContext,
  playerVoice: string | undefined,
  authorPhrases: string[] | undefined,
  llmQueue: LLMQueue,
): Promise<string> {
  const parts = [
    `Player turn (already shown, do NOT repeat or alter it):\n${rawInput}`,
    `\nOutcome: ${simResult.outcome}`,
  ];
  if (simResult.narrativeHints?.length) {
    parts.push(`\nSimulation hints: ${simResult.narrativeHints.join('; ')}`);
  }
  parts.push(`Location: ${gameContext.location?.name ?? 'unknown'}`);
  if (playerVoice) parts.push(`\nPlayer voice notes:\n${playerVoice}`);
  if (authorPhrases && authorPhrases.length > 0) {
    parts.push(`\nAuthor style examples:\n${authorPhrases.map((p, i) => `  ${i + 1}) ${p}`).join('\n')}`);
  }
  parts.push('\nContinue from the player\'s last sentence. Add world/NPC reactions and sensory detail. Do not restate the player\'s sentences.');

  const prompt = parts.join('\n');
  const continuation = await llmQueue.generateText(
    `${EXPANSION_SYSTEM}\n\n${prompt}`,
    2, // TaskPriority.HIGH (enum range 0-3)
    0.7,
    'short-turn-expander',
  );
  // Player decision is inviolable: keep the raw turn verbatim, append the enrichment.
  return `${rawInput}\n\n${continuation}`.trim();
}
```

> **Note:** `'short-turn-expander'` is a new agent ID not present in `conf/agents.json`. `LLMQueue.generateText` resolves unknown agent IDs to the default provider via `loadAgentConfig` fallback (same as `'author-matcher'`, `'psychotype-analyzer'`). Acceptable; optionally register it in `conf/agents.json` later.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/short-turn-expander.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/short-turn-expander.ts src/services/short-turn-expander.test.ts
git commit -m "feat(literary): add expand() for LLM-powered short turn expansion"
```

---

### Task T2.4: Wire ShortTurnExpander into roleplay-engine.ts

**Covers:** S2.3

**Files:**
- Modify: `src/services/roleplay-engine.ts`

**Interfaces:**
- Consumes: `shouldExpand()`, `analyzeCharge()`, `expand()` from `short-turn-expander.ts`, `getFeatureFlagManager()`
- Produces: expansion runs between Step 6 (prose) and Step 6.5 (censor) when flag is on

- [ ] **Step 1: Add import**

At top of `src/services/roleplay-engine.ts`:

```typescript
import { shouldExpand, analyzeCharge, detectRefusal, expand, RefusalTracker } from './short-turn-expander';
```

Also add a property to the `RoleplayEngine` class (near the other private fields, e.g. after `private refusalTracker` if T2.5 already added it — see note below):

```typescript
private refusalTracker = new RefusalTracker();
```

> **Ordering note:** T2.5 defines `RefusalTracker`. If T2.4 is executed before T2.5, add the class to `short-turn-expander.ts` first (see T2.5 Step 3). T2.4 and T2.5 are tightly coupled; run them together.

- [ ] **Step 2: Add expansion logic after prose generation**

In `_processInputImpl()`, after the `narrative = await this.v2Generator.generate(...)` block and before the Censor block, add:

```typescript
// Short Turn Expansion — gated by feature flag, respecting repeated refusals
if (getFeatureFlagManager().isEnabled('short-turn-expansion-enabled')
    && shouldExpand(ctx.parsedInput, intent)) {
  const sceneId = `${gameContext.location?.name ?? 'unknown'}_${gameContext.character?.name ?? 'hero'}`;
  // Record explicit refusal so a second refusal in this scene suppresses expansion.
  if (detectRefusal(ctx.parsedInput)) {
    this.refusalTracker.recordRefusal(sceneId);
  }
  if (!this.refusalTracker.shouldSuppress(sceneId)
      && analyzeCharge(ctx.parsedInput, simResult, gameContext) !== 'none') {
    try {
      narrative = await expand(
        ctx.parsedInput, simResult, gameContext,
        ctx.playerVoice, this.resolveAuthorPhrases(),
        this._llmQueue,
      );
      log.info({ originalLen: ctx.parsedInput.length, expandedLen: narrative.length }, 'short turn expanded');
    } catch (err) {
      log.warn({ err }, 'short turn expansion failed, using original narrative');
    }
  }
}
```

- [ ] **Step 3: Add same logic to `_processInputStreamImpl()`**

The streaming variant needs the same expansion hook. Find the equivalent prose generation point (after the narrative is produced, before censor) and add the identical block.

- [ ] **Step 4: Run existing engine tests**

Run: `bun test src/services/roleplay-engine.test.ts && bun test src/services/roleplay-engine.jungian.test.ts`
Expected: PASS (expansion is gated by flag which is off by default)

- [ ] **Step 5: Commit**

```bash
git add src/services/roleplay-engine.ts
git commit -m "feat(literary): wire short turn expansion into pipeline"
```

---

### Task T2.5: Add `RefusalTracker` — per-scene refusal counting

**Covers:** S2.3

**Files:**
- Modify: `src/services/short-turn-expander.ts`
- Modify: `src/services/short-turn-expander.test.ts`

**Interfaces:**
- Consumes: scene/session identifier
- Produces: `RefusalTracker` class with `recordRefusal(sceneId)`, `shouldSuppress(sceneId): boolean`

- [ ] **Step 1: Write failing test**

Add to `src/services/short-turn-expander.test.ts`:

```typescript
import { RefusalTracker } from './short-turn-expander';

describe('RefusalTracker', () => {
  it('allows expansion on first refusal', () => {
    const tracker = new RefusalTracker();
    expect(tracker.shouldSuppress('scene1')).toBe(false);
  });

  it('suppresses expansion after second refusal in same scene', () => {
    const tracker = new RefusalTracker();
    tracker.recordRefusal('scene1');
    tracker.recordRefusal('scene1');
    expect(tracker.shouldSuppress('scene1')).toBe(true);
  });

  it('tracks scenes independently', () => {
    const tracker = new RefusalTracker();
    tracker.recordRefusal('scene1');
    tracker.recordRefusal('scene1');
    expect(tracker.shouldSuppress('scene1')).toBe(true);
    expect(tracker.shouldSuppress('scene2')).toBe(false);
  });

  it('resets scene on new scene', () => {
    const tracker = new RefusalTracker();
    tracker.recordRefusal('scene1');
    tracker.recordRefusal('scene1');
    tracker.resetScene('scene1');
    expect(tracker.shouldSuppress('scene1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/short-turn-expander.test.ts`
Expected: FAIL — `RefusalTracker` not exported

- [ ] **Step 3: Implement RefusalTracker**

Add to `src/services/short-turn-expander.ts`:

```typescript
const MAX_REFUSALS = 2;

export class RefusalTracker {
  private refusals = new Map<string, number>();

  recordRefusal(sceneId: string): void {
    this.refusals.set(sceneId, (this.refusals.get(sceneId) ?? 0) + 1);
  }

  shouldSuppress(sceneId: string): boolean {
    return (this.refusals.get(sceneId) ?? 0) >= MAX_REFUSALS;
  }

  resetScene(sceneId: string): void {
    this.refusals.delete(sceneId);
  }
}
```

- [ ] **Step 4: Wire RefusalTracker into roleplay-engine.ts (already done in T2.4)**

T2.4 already adds `private refusalTracker = new RefusalTracker()` and the `recordRefusal` / `shouldSuppress` logic. No further wiring is needed here. This task's only remaining change is the `RefusalTracker` class itself (Step 3).

- [ ] **Step 5: Run all tests**

Run: `bun test src/services/short-turn-expander.test.ts && bun test src/services/roleplay-engine.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/short-turn-expander.ts src/services/short-turn-expander.test.ts src/services/roleplay-engine.ts
git commit -m "feat(literary): add RefusalTracker for per-scene expansion suppression"
```

---

## Phase 3 — Deferred Character Hook

### Task T3.1: Create `DeferredHookStore`

**Covers:** S2.4

**Files:**
- Create: `src/services/deferred-hook-store.ts`
- Create: `src/services/deferred-hook-store.test.ts`

**Interfaces:**
- Produces: `DeferredHookStore` class with `add()`, `getEligible()`, `markUsed()`, `getAll()`

- [ ] **Step 1: Write failing test**

Create `src/services/deferred-hook-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { DeferredHookStore } from './deferred-hook-store';

describe('DeferredHookStore', () => {
  let store: DeferredHookStore;

  beforeEach(() => {
    store = new DeferredHookStore();
  });

  it('adds a hook and retrieves it', () => {
    store.add({ npcId: 'npc1', npcName: 'Beggar Boy', hookStrength: 2, sourceTurn: 5 });
    const hooks = store.getAll();
    expect(hooks).toHaveLength(1);
    expect(hooks[0]!.npcId).toBe('npc1');
    expect(hooks[0]!.used).toBe(false);
  });

  it('getEligible returns hooks after block closure', () => {
    store.add({ npcId: 'npc1', npcName: 'Beggar Boy', hookStrength: 2, sourceTurn: 5 });
    store.closeBlock(10);
    const eligible = store.getEligible();
    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.blockClosedAt).toBe(10);
  });

  it('getEligible returns empty before block closure', () => {
    store.add({ npcId: 'npc1', npcName: 'Beggar Boy', hookStrength: 2, sourceTurn: 5 });
    expect(store.getEligible()).toHaveLength(0);
  });

  it('markUsed prevents re-selection', () => {
    store.add({ npcId: 'npc1', npcName: 'Beggar Boy', hookStrength: 2, sourceTurn: 5 });
    store.closeBlock(10);
    const eligible = store.getEligible();
    store.markUsed(eligible[0]!.npcId);
    expect(store.getEligible()).toHaveLength(0);
  });

  it('respects frequency limit (max 1 per block)', () => {
    store.add({ npcId: 'npc1', npcName: 'A', hookStrength: 1, sourceTurn: 1 });
    store.add({ npcId: 'npc2', npcName: 'B', hookStrength: 2, sourceTurn: 2 });
    store.closeBlock(10);
    const eligible = store.getEligible();
    expect(eligible).toHaveLength(1); // only strongest
  });

  it('serializes and restores from JSON', () => {
    store.add({ npcId: 'npc1', npcName: 'Test', hookStrength: 2, sourceTurn: 5 });
    const json = store.toJSON();
    const restored = DeferredHookStore.fromJSON(json);
    expect(restored.getAll()).toHaveLength(1);
    expect(restored.getAll()[0]!.npcId).toBe('npc1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/deferred-hook-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement DeferredHookStore**

Create `src/services/deferred-hook-store.ts`:

```typescript
/**
 * Deferred Character Hook — soft callbacks for noticed-but-rejected NPCs.
 * Gated by 'deferred-hooks-enabled' feature flag.
 */

export interface DeferredHook {
  npcId: string;
  npcName: string;
  hookStrength: 1 | 2 | 3; // 1=trace, 2=edge, 3=soft contact
  sourceTurn: number;
  blockClosedAt?: number;
  used: boolean;
}

export class DeferredHookStore {
  private hooks: DeferredHook[] = [];
  private currentBlockClosed = false;

  add(hook: Omit<DeferredHook, 'used' | 'blockClosedAt'>): void {
    // Don't duplicate for same NPC
    if (this.hooks.some(h => h.npcId === hook.npcId && !h.used)) return;
    this.hooks.push({ ...hook, used: false });
  }

  closeBlock(turnNumber: number): void {
    for (const h of this.hooks) {
      if (!h.used && !h.blockClosedAt) {
        h.blockClosedAt = turnNumber;
      }
    }
    this.currentBlockClosed = true;
  }

  getEligible(): DeferredHook[] {
    const eligible = this.hooks.filter(h => !h.used && h.blockClosedAt !== undefined);
    if (eligible.length === 0) return [];
    // Return only the strongest hook (max 1 per block)
    eligible.sort((a, b) => b.hookStrength - a.hookStrength);
    return [eligible[0]!];
  }

  markUsed(npcId: string): void {
    const hook = this.hooks.find(h => h.npcId === npcId);
    if (hook) hook.used = true;
  }

  getAll(): DeferredHook[] {
    return [...this.hooks];
  }

  toJSON(): DeferredHook[] {
    return this.hooks;
  }

  static fromJSON(data: DeferredHook[]): DeferredHookStore {
    const store = new DeferredHookStore();
    store.hooks = data.map(h => ({ ...h }));
    return store;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/deferred-hook-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/deferred-hook-store.ts src/services/deferred-hook-store.test.ts
git commit -m "feat(literary): add DeferredHookStore for deferred NPC callbacks"
```

---

### Task T3.2: Add hook detection + persistence in roleplay-engine.ts

**Covers:** S2.4

**Files:**
- Modify: `src/services/roleplay-engine.ts`

**Interfaces:**
- Consumes: `DeferredHookStore`, `analyzeCharge()` from short-turn-expander, `getFeatureFlagManager()`, `EventTopic.STORY_BEAT`
- Produces: hooks created when player refuses NPC interaction; hooks persisted to `deferred-hooks.json`; block closure triggered by story beat

- [ ] **Step 1: Add imports and property**

In `src/services/roleplay-engine.ts`:

```typescript
import { DeferredHookStore } from './deferred-hook-store';
import { readJsonFileSync, atomicWriteJson } from '../lib/atomic-io';
import { join } from 'node:path';

// In RoleplayEngine class:
private deferredHookStore = new DeferredHookStore();
```

- [ ] **Step 2: Add hook detection after expansion logic**

After the Short Turn Expansion block, add:

```typescript
// Deferred Hook Detection — gated by feature flag
if (getFeatureFlagManager().isEnabled('deferred-hooks-enabled')) {
  const charge = analyzeCharge(ctx.parsedInput, simResult, gameContext);
  if (charge === 'high') {
    // Player mentioned + refused an NPC — find the mentioned NPC by name.
    const lower = ctx.parsedInput.toLowerCase();
    const refusedNpc = gameContext.nearbyNpcs.find(n => n.name && lower.includes(n.name.toLowerCase()));
    if (refusedNpc) {
      this.deferredHookStore.add({
        npcId: refusedNpc.uid ?? refusedNpc.name,
        npcName: refusedNpc.name,
        hookStrength: 2, // default to "edge"
        sourceTurn: this.metricsCollector?.getTurnCount() ?? 0,
      });
      this.persistDeferredHooks();
      log.info({ npcId: refusedNpc.uid, npcName: refusedNpc.name }, 'deferred hook created');
    }
  }
}
```

- [ ] **Step 3: Block closure via story beat (NOT a turn-count heuristic)**

The spec requires block closure after an arc/quest/major event. `DirectorLoop` publishes `EventTopic.STORY_BEAT` on story beats. Subscribe to it in the engine (in the constructor, after `this._eventBus` is assigned):

```typescript
this._eventBus.subscribe(EventTopic.STORY_BEAT, async () => {
  if (getFeatureFlagManager().isEnabled('deferred-hooks-enabled')) {
    this.deferredHookStore.closeBlock(this.metricsCollector?.getTurnCount() ?? 0);
    this.persistDeferredHooks();
  }
});
```

- [ ] **Step 4: Persistence**

Add helper methods to `RoleplayEngine` (writes to `<dbPath>/deferred-hooks.json` using the same `atomic-io` utilities as feature-flags):

```typescript
private deferredHooksPath(): string {
  return join(this._dbPath ?? '.', 'deferred-hooks.json');
}

private persistDeferredHooks(): void {
  atomicWriteJson(this.deferredHooksPath(), this.deferredHookStore.toJSON());
}

private loadDeferredHooks(): void {
  const data = readJsonFileSync<unknown>(this.deferredHooksPath());
  if (Array.isArray(data)) {
    this.deferredHookStore = DeferredHookStore.fromJSON(data as any);
  }
}
```

Call `this.loadDeferredHooks()` in the constructor (after `_dbPath` is set). This makes hooks survive session restarts, satisfying the spec's "in-memory + session persistence" requirement.

- [ ] **Step 5: Run existing tests**

Run: `bun test src/services/roleplay-engine.test.ts`
Expected: PASS (all new code gated by flag which is off)

- [ ] **Step 6: Commit**

```bash
git add src/services/roleplay-engine.ts
git commit -m "feat(literary): add deferred hook detection, persistence, story-beat closure"
```

---

### Task T3.3: Add hook recall as Dramaturg candidate

**Covers:** S2.4

**Files:**
- Modify: `src/services/roleplay-engine.ts` (in `runEnrichmentConveyor`)

**Interfaces:**
- Consumes: `DeferredHookStore.getEligible()`, `DramaturgAgent.enrichScene()`
- Produces: eligible hook injected as candidate in enrichment

- [ ] **Step 1: Modify runEnrichmentConveyor**

In `runEnrichmentConveyor()` (line 347), after the `dramaturg.enrichScene()` call, check for eligible hooks:

```typescript
const dramaturg = await this.dramaturg.enrichScene(dist.archetypes, gameContext);

// Deferred hook recall — inject as enrichment candidate
if (getFeatureFlagManager().isEnabled('deferred-hooks-enabled')) {
  const eligible = this.deferredHookStore.getEligible();
  if (eligible.length > 0) {
    const hook = eligible[0]!;
    // Append hook info to filledSkeleton as a soft candidate
    dramaturg.filledSkeleton += `\n\n[Deferred hook: ${hook.npcName} (${hook.hookStrength === 1 ? 'trace' : hook.hookStrength === 2 ? 'edge' : 'soft contact'})]`;
    this.deferredHookStore.markUsed(hook.npcId);
    log.info({ npcId: hook.npcId, strength: hook.hookStrength }, 'deferred hook recalled');
  }
}
```

- [ ] **Step 2: Run existing tests**

Run: `bun test src/services/roleplay-engine.jungian.test.ts`
Expected: PASS

> **Coupling note:** the recall lives in `runEnrichmentConveyor()`, which only runs when `jungian-profiler-enabled` is on AND `confidence >= 0.3`. This is a known simplification: deferred hooks currently ride the profiler conveyor's Dramaturg stage. A fully independent injection point (e.g. a post-`buildGameContext` hook in `_processInputImpl`) is a follow-up if deferred hooks must work with the profiler flag off. Both flags remain independently gated; the conveyor dependency is the only coupling.

- [ ] **Step 3: Commit**

```bash
git add src/services/roleplay-engine.ts
git commit -m "feat(literary): add deferred hook recall in enrichment conveyor"
```

---

### Task T3.4: Wire deferred hooks into pipeline with graduated strength

**Covers:** S2.4

**Files:**
- Modify: `src/services/roleplay-engine.ts`
- Modify: `src/services/deferred-hook-store.ts`

**Interfaces:**
- Produces: graduated strength logic (1=trace, 2=edge, 3=soft contact) in hook recall

- [ ] **Step 1: Add strength-based text to hook recall**

In the hook recall block (T3.3), replace the skeleton append with strength-appropriate text:

```typescript
const strengthText = hook.hookStrength === 1
  ? `A rumor reaches you about ${hook.npcName}.`
  : hook.hookStrength === 2
    ? `You glimpse ${hook.npcName} in the distance.`
    : `${hook.npcName} appears with new purpose.`;

dramaturg.filledSkeleton += `\n\n[Deferred hook: ${strengthText}]`;
```

- [ ] **Step 2: Run tests**

Run: `bun test src/services/roleplay-engine.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/roleplay-engine.ts
git commit -m "feat(literary): add graduated strength to deferred hook recall"
```

---

## Phase 4 — Feedback

### Task T4.1: Create `FeedbackStore`

**Covers:** S2.5

**Files:**
- Create: `src/services/feedback-store.ts`
- Create: `src/services/feedback-store.test.ts`

**Interfaces:**
- Produces: `FeedbackStore` class with `record()`, `getByTechnique()`, `getRecent()`

- [ ] **Step 1: Write failing test**

Create `src/services/feedback-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { FeedbackStore, getFeedbackStore, resetFeedbackStore } from './feedback-store';

describe('FeedbackStore', () => {
  let store: FeedbackStore;

  beforeEach(() => {
    store = new FeedbackStore();
    resetFeedbackStore();
  });

  it('records a like feedback', () => {
    store.record({ turnId: 5, reaction: 'like', techniques: ['sensory-volume', 'npc-pressure'] });
    const recent = store.getRecent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.reaction).toBe('like');
  });

  it('records dislike feedback', () => {
    store.record({ turnId: 6, reaction: 'dislike', techniques: ['expansion-length'] });
    const recent = store.getRecent(10);
    expect(recent[0]!.reaction).toBe('dislike');
  });

  it('getByTechnique filters by technique name', () => {
    store.record({ turnId: 1, reaction: 'like', techniques: ['sensory-volume'] });
    store.record({ turnId: 2, reaction: 'like', techniques: ['npc-pressure'] });
    store.record({ turnId: 3, reaction: 'like', techniques: ['sensory-volume'] });
    const sensory = store.getByTechnique('sensory-volume');
    expect(sensory).toHaveLength(2);
  });

  it('counts consecutive dislikes for 1st vs 2nd dislike distinction', () => {
    store.record({ turnId: 7, reaction: 'dislike', techniques: ['npc-pressure'] });
    expect(store.getConsecutiveDislikes(7)).toBe(1);
    store.record({ turnId: 7, reaction: 'dislike', techniques: ['npc-pressure'] });
    expect(store.getConsecutiveDislikes(7)).toBe(2);
  });

  it('serializes and restores from JSON', () => {
    store.record({ turnId: 1, reaction: 'like', techniques: ['sensory-volume'] });
    const json = store.toJSON();
    const restored = FeedbackStore.fromJSON(json);
    expect(restored.getRecent(10)).toHaveLength(1);
  });

  it('getFeedbackStore returns a shared singleton', () => {
    const a = getFeedbackStore();
    const b = getFeedbackStore();
    expect(a).toBe(b);
    a.record({ turnId: 1, reaction: 'like', techniques: ['nudge-forward'] });
    expect(b.getRecent(1)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/feedback-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement FeedbackStore**

Create `src/services/feedback-store.ts`:

```typescript
/**
 * Feedback Store — literary preference adjustment via like/dislike.
 * Learns narrow literary parameters, NOT psychotype.
 */

import { LITERARY_PARAMS, type LiteraryParam } from './literary-modulation';

export type FeedbackReaction = 'like' | 'dislike' | 'neutral';

export interface FeedbackEntry {
  turnId: number;
  reaction: FeedbackReaction;
  techniques: LiteraryParam[];
  timestamp: number;
}

export class FeedbackStore {
  private entries: FeedbackEntry[] = [];

  record(entry: Omit<FeedbackEntry, 'timestamp'>): void {
    this.entries.push({ ...entry, timestamp: Date.now() });
  }

  getRecent(limit: number): FeedbackEntry[] {
    return this.entries.slice(-limit);
  }

  getByTechnique(technique: LiteraryParam): FeedbackEntry[] {
    return this.entries.filter(e => e.techniques.includes(technique));
  }

  getLikeCount(): number {
    return this.entries.filter(e => e.reaction === 'like').length;
  }

  getDislikeCount(): number {
    return this.entries.filter(e => e.reaction === 'dislike').length;
  }

  /** Consecutive dislike count for the most recent turn (1st vs 2nd dislike). */
  getConsecutiveDislikes(turnId: number): number {
    let count = 0;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.turnId !== turnId) break;
      if (e.reaction === 'dislike') count++;
      else break;
    }
    return count;
  }

  toJSON(): FeedbackEntry[] {
    return this.entries;
  }

  static fromJSON(data: FeedbackEntry[]): FeedbackStore {
    const store = new FeedbackStore();
    store.entries = data.map(e => ({ ...e }));
    return store;
  }
}

// Singleton (matches getFeatureFlagManager pattern) so the route and engine share one store.
let _store: FeedbackStore | null = null;
export function getFeedbackStore(): FeedbackStore {
  if (!_store) _store = new FeedbackStore();
  return _store;
}
export function resetFeedbackStore(): void {
  _store = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/feedback-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/feedback-store.ts src/services/feedback-store.test.ts
git commit -m "feat(literary): add FeedbackStore for literary preference tracking"
```

---

### Task T4.2: Add feedback API endpoint

**Covers:** S2.5

**Files:**
- Create: `src/routes/feedback.ts`
- Modify: `src/routes/index.ts` (register the route)

**Interfaces:**
- Consumes: `getFeedbackStore()` singleton, `LITERARY_PARAMS` from `literary-modulation.ts`
- Produces: `POST /api/feedback` — records reaction tied to a narrative turn

- [ ] **Step 1: Create feedback route**

Create `src/routes/feedback.ts` (follows the `feature-flags.ts` pattern — a `new Hono()` instance exported as a named const):

```typescript
/**
 * Feedback routes — like/dislike literary preferences.
 */

import { Hono } from "hono";
import { getFeedbackStore } from "../services/feedback-store";
import { LITERARY_PARAMS } from "../services/literary-modulation";
import { getLogger } from "../utils/logger";

const log = getLogger("feedback-route");
export const feedbackRouter = new Hono();

/**
 * POST /feedback — record like/dislike/neutral for the last narrative turn.
 * Body: { turnId: number, reaction: 'like'|'dislike'|'neutral', techniques: string[] }
 */
feedbackRouter.post("/feedback", async (c) => {
  const body = await c.req.json();
  const { turnId, reaction, techniques } = body ?? {};

  if (typeof turnId !== 'number' || !reaction || !Array.isArray(techniques)) {
    return c.json({ error: "Missing required fields: turnId (number), reaction, techniques (array)" }, 400);
  }
  if (!['like', 'dislike', 'neutral'].includes(reaction)) {
    return c.json({ error: "Invalid reaction. Must be: like, dislike, neutral" }, 400);
  }
  const unknown = techniques.filter((t: string) => !(LITERARY_PARAMS as readonly string[]).includes(t));
  if (unknown.length > 0) {
    return c.json({ error: `Unknown techniques: ${unknown.join(', ')}` }, 400);
  }

  getFeedbackStore().record({ turnId, reaction, techniques });
  log.info({ turnId, reaction }, "feedback recorded");
  return c.json({ ok: true });
});
```

- [ ] **Step 2: Register the route**

In `src/routes/index.ts`, add the import and mount:

```typescript
// import block (top of file):
import { feedbackRouter } from "./feedback";

// inside createRoutes(), after the featureFlagsRouter mount:
routes.route("/", feedbackRouter);
```

This makes the endpoint reachable at `POST /api/feedback` (app.ts mounts `createRoutes()` under `/api`).

- [ ] **Step 3: Run typecheck**

Run: `bun typecheck`
Expected: PASS (project convention — never `tsc` directly)

- [ ] **Step 4: Commit**

```bash
git add src/routes/feedback.ts src/routes/index.ts
git commit -m "feat(literary): add POST /api/feedback endpoint"
```

---

### Task T4.3: Add feedback-driven regeneration (1st dislike = softer, 2nd = rollback)

**Covers:** S2.5

**Files:**
- Modify: `src/services/roleplay-engine.ts`
- Modify: `src/routes/chat.ts` (export `getEngine`)
- Modify: `src/routes/feedback.ts`

**Interfaces:**
- Consumes: `getFeedbackStore()`, `getConsecutiveDislikes(turnId)`, `LLMQueue.generateText`
- Produces: `RoleplayEngine.regenerateLastTurn(): Promise<{ turnId: number; narrative: string } | null>` — softer regen on 1st dislike, raw-turn rollback on 2nd

- [ ] **Step 1: Export `getEngine` from chat.ts**

In `src/routes/chat.ts`, `getEngine()` is currently module-private. Add `export`:

```typescript
export function getEngine(): RoleplayEngine {
  if (!_engine) throw new Error("RoleplayEngine not initialised");
  return _engine;
}
```

- [ ] **Step 2: Add last-turn snapshot + regenerateLastTurn to RoleplayEngine**

In `src/services/roleplay-engine.ts`, add imports and fields:

```typescript
import { getFeedbackStore } from './feedback-store';

// In RoleplayEngine class:
private turnCounter = 0;
private lastTurn: { turnId: number; rawInput: string; narrative: string } | null = null;
```

In `_processInputImpl()` (and `_processInputStreamImpl()`), increment the counter at the top and snapshot the finalized narrative at the end (before returning):

```typescript
// At the start of the turn (after intent is parsed):
this.turnCounter++;

// At the end of the turn (after censor/translate, before return):
this.lastTurn = {
  turnId: this.turnCounter,
  // ctx.rawInput = the player's ORIGINAL words (rollback target); ctx.parsedInput is the English translation used by logic.
  rawInput: ctx.rawInput,
  narrative,
};
```

Add the regeneration method:

```typescript
/**
 * Regenerate the last narrative after a dislike.
 * 1st dislike → softer regen; 2nd dislike → rollback to the raw player turn.
 * The raw turn is always preserved in lastTurn.rawInput.
 */
async regenerateLastTurn(): Promise<{ turnId: number; narrative: string } | null> {
  if (!this.lastTurn) return null;
  const dislikes = getFeedbackStore().getConsecutiveDislikes(this.lastTurn.turnId);

  if (dislikes >= 2) {
    // Rollback to the raw turn + temporary caution (suppress further regen this turn).
    this.lastTurn = { ...this.lastTurn, narrative: this.lastTurn.rawInput };
    log.info({ turnId: this.lastTurn.turnId }, 'feedback: 2nd dislike — rolled back to raw turn');
    return { turnId: this.lastTurn.turnId, narrative: this.lastTurn.rawInput };
  }

  try {
    const softer = await this._llmQueue.generateText(
      `Previous response was too aggressive. Regenerate the narrative with: less NPC pressure, softer sensory detail, a different narrative angle. Preserve all facts and the player's decision.\n\nOriginal narrative:\n${this.lastTurn.narrative}`,
      2, // TaskPriority.HIGH
      0.6,
      'feedback-regen',
    );
    this.lastTurn = { ...this.lastTurn, narrative: softer };
    log.info({ turnId: this.lastTurn.turnId }, 'feedback: regenerated with softer approach');
    return { turnId: this.lastTurn.turnId, narrative: softer };
  } catch (err) {
    log.warn({ err }, 'feedback regeneration failed');
    return null;
  }
}
```

> **Note:** `'feedback-regen'` is a new agent ID; resolves to the default provider via `loadAgentConfig` fallback (same as `'short-turn-expander'`).

- [ ] **Step 3: Trigger regen from the feedback route**

In `src/routes/feedback.ts`, on a `dislike` reaction, call the engine's `regenerateLastTurn()` and return the regenerated narrative:

```typescript
import { getEngine } from "./chat";

// Inside the POST /feedback handler, after recording:
if (reaction === 'dislike') {
  const result = await getEngine().regenerateLastTurn();
  return c.json({ ok: true, regenerated: result });
}
return c.json({ ok: true });
```

- [ ] **Step 4: Run existing tests**

Run: `bun test src/services/roleplay-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/roleplay-engine.ts src/routes/chat.ts src/routes/feedback.ts
git commit -m "feat(literary): add feedback-driven regeneration (softer / rollback)"
```

---

### Task T4.4: Add feedback learning — parameter drift

**Covers:** S2.5

**Files:**
- Modify: `src/services/feedback-store.ts`
- Modify: `src/services/feedback-store.test.ts`

**Interfaces:**
- Produces: `FeedbackStore.getParameterAdjustments(): Record<string, number>` — returns accumulated adjustments

- [ ] **Step 1: Write failing test**

Add to `src/services/feedback-store.test.ts`:

```typescript
describe('FeedbackStore parameter adjustments', () => {
  it('increases sensory parameter after likes', () => {
    const store = new FeedbackStore();
    for (let i = 0; i < 5; i++) {
      store.record({ turnId: i, reaction: 'like', techniques: ['sensory-volume'] });
    }
    const adj = store.getParameterAdjustments();
    expect(adj['sensory-volume']).toBeGreaterThan(0);
    expect(adj['sensory-volume']).toBeLessThanOrEqual(0.15); // max 15%
  });

  it('does not drift on neutral', () => {
    const store = new FeedbackStore();
    for (let i = 0; i < 10; i++) {
      store.record({ turnId: i, reaction: 'neutral', techniques: ['sensory-volume'] });
    }
    const adj = store.getParameterAdjustments();
    expect(adj['sensory-volume'] ?? 0).toBe(0);
  });

  it('clamps adjustments at ±15%', () => {
    const store = new FeedbackStore();
    for (let i = 0; i < 100; i++) {
      store.record({ turnId: i, reaction: 'like', techniques: ['sensory-volume'] });
    }
    const adj = store.getParameterAdjustments();
    expect(adj['sensory-volume']).toBeLessThanOrEqual(0.15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/feedback-store.test.ts`
Expected: FAIL — `getParameterAdjustments` not defined

- [ ] **Step 3: Implement getParameterAdjustments**

Add to `src/services/feedback-store.ts` (inside the class; `LiteraryParam` is already imported):

```typescript
const LEARNING_RATE = 0.02; // per like/dislike
const MAX_ADJUSTMENT = 0.15; // ±15%

getParameterAdjustments(): Partial<Record<LiteraryParam, number>> {
  const adjustments: Partial<Record<LiteraryParam, number>> = {};

  for (const entry of this.entries) {
    const delta = entry.reaction === 'like' ? LEARNING_RATE
      : entry.reaction === 'dislike' ? -LEARNING_RATE
      : 0;
    if (delta === 0) continue;

    for (const technique of entry.techniques) {
      adjustments[technique] = Math.max(
        -MAX_ADJUSTMENT,
        Math.min(MAX_ADJUSTMENT, (adjustments[technique] ?? 0) + delta),
      );
    }
  }

  return adjustments;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/feedback-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/feedback-store.ts src/services/feedback-store.test.ts
git commit -m "feat(literary): add parameter drift from feedback likes/dislikes"
```

---

## Phase 5 — Soft Dramaturgical Priors

### Task T5.1: Add `literaryModulationCoefficients()`

**Covers:** S2.2

**Files:**
- Modify: `src/services/literary-modulation.ts`
- Modify: `src/services/literary-modulation.test.ts`

**Interfaces:**
- Consumes: `JungianProfile` (behavioral metrics), `ProbabilityDistribution`
- Produces: `literaryModulationCoefficients(profile, dist): Record<string, number>` — ±15% adjustments per archetype

- [ ] **Step 1: Write failing test**

Add to `src/services/literary-modulation.test.ts`:

```typescript
import { literaryModulationCoefficients } from './literary-modulation';
import type { JungianProfile, ProbabilityDistribution } from './jungian-profiler';

describe('literaryModulationCoefficients', () => {
  it('returns coefficients within ±15% bounds', () => {
    const profile: JungianProfile = {
      extraversion: { preference: 0.7, range: 0.3 },
      intuition: { preference: 0.6, range: 0.4 },
      thinking: { preference: 0.3, range: 0.5 },
      judging: { preference: 0.8, range: 0.2 },
      confidence: 0.6,
      axisConfidence: { extraversion: 0.6, intuition: 0.6, thinking: 0.6, judging: 0.6 },
      source: 'blended',
    };
    const dist: ProbabilityDistribution = {
      sceneTone: [{ value: 'controlled', weight: 0.5 }],
      archetypes: [
        { value: 'judgment_trial', weight: 0.3 },
        { value: 'rescue', weight: 0.3 },
        { value: 'wisdom_counsel', weight: 0.4 },
      ],
      pacing: [{ value: 'medium', weight: 1 }],
      sensoryChannels: [{ value: 'visual', weight: 1 }],
      informationStyle: [{ value: 'analytical', weight: 1 }],
      shadowInjection: 0.1,
      explorationFactor: 0.1,
    };
    const coeffs = literaryModulationCoefficients(profile, dist);
    for (const [_key, val] of Object.entries(coeffs)) {
      expect(val).toBeGreaterThanOrEqual(-0.15);
      expect(val).toBeLessThanOrEqual(0.15);
    }
  });

  it('returns empty coefficients when profile confidence < 0.3', () => {
    const profile: JungianProfile = {
      extraversion: { preference: 0.5, range: 0 },
      intuition: { preference: 0.5, range: 0 },
      thinking: { preference: 0.5, range: 0 },
      judging: { preference: 0.5, range: 0 },
      confidence: 0.1,
      axisConfidence: { extraversion: 0.1, intuition: 0.1, thinking: 0.1, judging: 0.1 },
      source: 'default',
    };
    const dist: ProbabilityDistribution = {
      sceneTone: [], archetypes: [], pacing: [], sensoryChannels: [],
      informationStyle: [], shadowInjection: 0, explorationFactor: 0,
    };
    const coeffs = literaryModulationCoefficients(profile, dist);
    expect(Object.keys(coeffs)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/literary-modulation.test.ts`
Expected: FAIL — `literaryModulationCoefficients` not exported

- [ ] **Step 3: Implement literaryModulationCoefficients**

Add to `src/services/literary-modulation.ts`:

```typescript
import type { JungianProfile } from './jungian-profiler';

const MAX_COEFF = 0.15; // ±15%

/**
 * Compute small dramaturgical coefficients from behavioral signals.
 * Returns a map of archetype → adjustment (±15% max).
 * Used by Dramaturg to softly bias archetype selection.
 */
export function literaryModulationCoefficients(
  profile: JungianProfile,
  dist: ProbabilityDistribution,
): Record<string, number> {
  if (profile.confidence < 0.3) return {};

  const e = profile.extraversion.preference;
  const n = profile.intuition.preference;
  const t = profile.thinking.preference;
  const j = profile.judging.preference;

  const coeffs: Record<string, number> = {};

  // Action-oriented (high E) → bias toward judgment_trial, rescue
  const actionBias = (e - 0.5) * 0.3; // ±0.15 at extremes
  coeffs['judgment_trial'] = clamp(actionBias, -MAX_COEFF, MAX_COEFF);
  coeffs['rescue'] = clamp(actionBias * 0.8, -MAX_COEFF, MAX_COEFF);

  // Reflective (low E) → bias toward wisdom_counsel
  const reflectBias = (0.5 - e) * 0.3;
  coeffs['wisdom_counsel'] = clamp(reflectBias, -MAX_COEFF, MAX_COEFF);

  // Concrete (low N) → bias toward political_intrigue
  const concreteBias = (0.5 - n) * 0.2;
  coeffs['political_intrigue'] = clamp(concreteBias, -MAX_COEFF, MAX_COEFF);

  return coeffs;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/literary-modulation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/literary-modulation.ts src/services/literary-modulation.test.ts
git commit -m "feat(literary): add literaryModulationCoefficients for soft archetype bias"
```

---

### Task T5.2: Wire coefficients into DramaturgAgent.enrichScene()

**Covers:** S2.2

**Files:**
- Modify: `src/services/agents/dramaturg.ts`
- Modify: `src/services/roleplay-engine.ts`

**Interfaces:**
- Consumes: `literaryModulationCoefficients()` from `literary-modulation.ts`
- Produces: `enrichScene()` accepts optional coefficients and applies them to archetype weights

- [ ] **Step 1: Modify enrichScene signature**

In `src/services/agents/dramaturg.ts`, change `enrichScene` to accept optional coefficients:

```typescript
async enrichScene(
  archetypeWeights: WeightedChoice[],
  gameContext: GameContext,
  literaryCoeffs?: Record<string, number>,
): Promise<DramaturgEnrichment> {
  // Apply literary coefficients if provided
  const adjustedWeights = literaryCoeffs
    ? archetypeWeights.map(w => ({
        ...w,
        weight: Math.max(0.01, w.weight + (literaryCoeffs[w.value] ?? 0)),
      }))
    : archetypeWeights;

  const archetype = sample(adjustedWeights);
  // ... rest unchanged
}
```

- [ ] **Step 2: Pass coefficients from roleplay-engine.ts**

In `runEnrichmentConveyor()`, compute and pass coefficients:

```typescript
import { literaryModulationCoefficients } from './literary-modulation';

// In runEnrichmentConveyor:
const literaryCoeffs = getFeatureFlagManager().isEnabled('literary-modulation-enabled')
  ? literaryModulationCoefficients(this.jungianProfile, dist)
  : undefined;
const dramaturg = await this.dramaturg.enrichScene(dist.archetypes, gameContext, literaryCoeffs);
```

- [ ] **Step 3: Run all tests**

Run: `bun test src/services/roleplay-engine.test.ts && bun test src/services/roleplay-engine.jungian.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/services/agents/dramaturg.ts src/services/roleplay-engine.ts
git commit -m "feat(literary): wire literary coefficients into Dramaturg archetype selection"
```

---

## Summary

| Phase | Tasks | Key Files | LLM Calls Added |
|-------|-------|-----------|-----------------|
| 0 — Observability | T0.1, T0.2 | feature-flags.ts, literary-modulation.ts | 0 |
| 1 — Stylistics | T1.1, T1.2 | jungian-profiler.ts, literary-modulation.ts | 0 |
| 2 — Short Turn Expansion | T2.1-T2.5 | short-turn-expander.ts, roleplay-engine.ts | 1 per expanded turn |
| 3 — Deferred Hooks | T3.1-T3.4 | deferred-hook-store.ts, roleplay-engine.ts | 0 |
| 4 — Feedback | T4.1-T4.4 | feedback-store.ts, routes/feedback.ts | 1 on dislike regen |
| 5 — Soft Priors | T5.1, T5.2 | literary-modulation.ts, dramaturg.ts | 0 |

**Total: 16 tasks, ~20 commits, 0-2 new LLM calls per turn (gated by flags).**
