# Jungian Profiler — Phase 2A: buildPlayerVoice (Task 2.1)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [x]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются). Перед Phase 2 заведи git worktree (`compose:worktree`).
> **Covers:** дизайн S3.1, S9; impl-спека `spec-profiler-integration.md` §3.

**Acceptance (2A):** `buildPlayerVoice` собирает строку из Director+Dramaturg+Actor+Validator (tone, pace, sensory, archetype, NPC hints, fact-check notes, avoid-list). Pure, тестируемо, 0 LLM.

**Files:**
- Modify: `src/services/jungian-profiler.ts`
- Modify: `src/services/jungian-profiler.test.ts`

---

## Task 2.1: buildPlayerVoice (pure) + контрактные типы

**Covers:** S3.1, S9
**Interfaces (Produces):** `DramaturgEnrichment { archetype; filledSkeleton; mood }`; `NpcEnrichment { npcId; name; hint }`; `VerificationResult { claims; worldConsistency; notes }`; `CensorResult { cleaned; llmPolished }`; `buildPlayerVoice(dist, dramaturg, actor, validator): string`

- [x] **Step 1: Write failing test**

```typescript
// append to src/services/jungian-profiler.test.ts
import { buildPlayerVoice, type ProbabilityDistribution, type DramaturgEnrichment, type NpcEnrichment, type VerificationResult } from './jungian-profiler';

describe('buildPlayerVoice', () => {
  test('composes tone, pace, sensory, archetype, NPC hints, fact-check notes, avoid list', () => {
    const dist: ProbabilityDistribution = {
      sceneTone: [{ value: 'controlled, strategic', weight: 1 }],
      archetypes: [{ value: 'judgment_trial', weight: 1 }],
      pacing: [{ value: 'medium', weight: 1 }],
      sensoryChannels: [{ value: 'visual', weight: 1 }, { value: 'tactile', weight: 1 }, { value: 'atmospheric', weight: 1 }],
      informationStyle: [{ value: 'analytical', weight: 1 }],
      shadowInjection: 0.15, explorationFactor: 0.05,
    };
    const dramaturg: DramaturgEnrichment = { archetype: 'judgment_trial', filledSkeleton: 'Alek seeks Bran.', mood: 'tense' };
    const actor: NpcEnrichment[] = [{ npcId: 'n1', name: 'Bran', hint: 'Practical, blunt. Short precise sentences.' }];
    const validator: VerificationResult = {
      claims: [{ claim: 'Bran is in the tavern', verified: true, confidence: 'high', evidence: ['entity store'] }],
      worldConsistency: { npcInLocation: true, itemsAvailable: true, timelineCoherent: true },
      notes: ['Bran confirmed in Old Oak Tavern (entity store, high confidence)'],
    };
    const voice = buildPlayerVoice(dist, dramaturg, actor, validator);
    expect(voice).toContain('Player psychological context');
    expect(voice).toContain('controlled, strategic');
    expect(voice).toContain('Prefers analytical');
    expect(voice).toContain('visual, tactile, atmospheric');
    expect(voice).toContain('judgment_trial (mood: tense)');
    expect(voice).toContain('NPC Bran: Practical, blunt');
    expect(voice).toContain('Avoid');
    expect(voice).toContain('Fact-check notes:');
    expect(voice).toContain('Bran confirmed in Old Oak Tavern');
  });
  test('no NPCs → no NPC lines; no notes → empty fact-check', () => {
    const dist: ProbabilityDistribution = {
      sceneTone: [{ value: 'neutral', weight: 1 }], archetypes: [{ value: 'random', weight: 1 }],
      pacing: [{ value: 'medium', weight: 1 }], sensoryChannels: [{ value: 'visual', weight: 1 }],
      informationStyle: [{ value: 'balanced', weight: 1 }], shadowInjection: 0.05, explorationFactor: 0.05,
    };
    const dramaturg: DramaturgEnrichment = { archetype: 'random', filledSkeleton: 'x', mood: 'neutral' };
    const voice = buildPlayerVoice(dist, dramaturg, [], { claims: [], worldConsistency: { npcInLocation: false, itemsAvailable: false, timelineCoherent: false }, notes: [] });
    expect(voice).not.toContain('NPC ');
    expect(voice).not.toContain('Fact-check notes:');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL — `buildPlayerVoice is not exported`

- [x] **Step 3: Write minimal implementation (append to jungian-profiler.ts)**

```typescript
// append to src/services/jungian-profiler.ts
export interface DramaturgEnrichment { archetype: string; filledSkeleton: string; mood: string; }
export interface NpcEnrichment { npcId: string; name: string; hint: string; }
export interface VerificationResult {
  claims: Array<{ claim: string; verified: boolean; confidence: string; evidence: string[] }>;
  worldConsistency: { npcInLocation: boolean; itemsAvailable: boolean; timelineCoherent: boolean };
  notes: string[];
}

export interface CensorResult { cleaned: string; llmPolished: boolean; }

export function buildPlayerVoice(
  dist: ProbabilityDistribution,
  dramaturg: DramaturgEnrichment,
  actor: NpcEnrichment[],
  validator: VerificationResult,
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
  return lines.join('\n');
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS

- [x] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(profiler): buildPlayerVoice + enrichment contract types"
```

**Phase 2A DONE.** Переходи к `2026-08-14-jungian-profiler-p2b.md`.
