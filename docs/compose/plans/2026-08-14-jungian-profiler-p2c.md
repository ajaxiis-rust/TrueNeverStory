# Jungian Profiler — Phase 2C: Actor.enrichNpcs (Task 2.3)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [x]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S12; impl-спека `spec-profiler-integration.md` §5.

**Acceptance (2C):** `ActorAgent.enrichNpcs` — чистый TS (0 LLM): psychotype × sampled informationStyle → hint-строка. Без psychotype → neutral hint. `process()` нетронут.

**Files:**
- Modify: `src/services/agents/actor.ts`
- Create: `src/services/agents/actor.test.ts`

---

## Task 2.3: Actor.enrichNpcs — pure TS

**Covers:** S12
**Interfaces (Produces):** `ActorAgent.enrichNpcs(informationStyleWeights: WeightedChoice[], npcs: Array<{ id; name; psychotype?: JungianProfile }>): NpcEnrichment[]` — 0 LLM.

- [x] **Step 1: Write failing test**

```typescript
// src/services/agents/actor.test.ts (create)
import { describe, test, expect } from 'bun:test';
import { ActorAgent } from './actor';
import { UnifiedEntityStore } from '@/store/entity-store';
import { LLMQueue } from '@/lib/llm-queue';
import type { JungianProfile } from '../jungian-profiler';

const istp: JungianProfile = {
  extraversion: { preference: 0.3, range: 0.1 }, intuition: { preference: 0.3, range: 0.1 },
  thinking: { preference: 0.8, range: 0.1 }, judging: { preference: 0.4, range: 0.1 },
  confidence: 0.8, axisConfidence: { extraversion: 0.8, intuition: 0.8, thinking: 0.8, judging: 0.8 }, source: 'default',
};

describe('ActorAgent.enrichNpcs', () => {
  const agent = new ActorAgent({} as UnifiedEntityStore, {} as LLMQueue);
  test('analytical infoStyle + ISTP → practical/blunt hint', () => {
    const out = agent.enrichNpcs([{ value: 'analytical', weight: 1 }], [{ id: 'n1', name: 'Bran', psychotype: istp }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Bran');
    expect(out[0]!.hint.toLowerCase()).toContain('practical');
  });
  test('no psychotype → neutral hint (still returns entry)', () => {
    const out = agent.enrichNpcs([{ value: 'analytical', weight: 1 }], [{ id: 'n2', name: 'Marta' }]);
    expect(out[0]!.hint.length).toBeGreaterThan(0);
  });
  test('empty NPC list → empty array', () => {
    expect(agent.enrichNpcs([{ value: 'analytical', weight: 1 }], [])).toEqual([]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/services/agents/actor.test.ts`
Expected: FAIL — `agent.enrichNpcs is not a function`

- [x] **Step 3: Write minimal implementation (add method to actor.ts)**

```typescript
// imports to add in actor.ts:
import { sample, type WeightedChoice, type NpcEnrichment, type JungianProfile, deriveType } from '../jungian-profiler';

// method on ActorAgent (additive — НЕ трогает process()):
enrichNpcs(
  informationStyleWeights: WeightedChoice[],
  npcs: Array<{ id: string; name: string; psychotype?: JungianProfile }>,
): NpcEnrichment[] {
  const infoStyle = sample(informationStyleWeights);
  return npcs.map(npc => ({ npcId: npc.id, name: npc.name, hint: this.buildHint(npc.name, npc.psychotype, infoStyle) }));
}

private buildHint(name: string, psychotype: JungianProfile | undefined, infoStyle: string): string {
  if (!psychotype) return `${name}: neutral presence. Responds plainly, without strong bias.`;
  const t = deriveType(psychotype);
  const base: Record<string, string> = {
    ISTP: 'Practical, blunt, tool-oriented. Short precise sentences. Exact prices.',
    ESFJ: 'Warm but orderly. Presents information as a structured list.',
    ENFP: 'Background presence. Cryptic, riddling lyrics if noticed at all.',
    INTJ: 'Strategic and reserved. Weighs words, reveals little.',
  };
  const fallback = `${name} (${t}): consistent with a ${t} temperament.`;
  const styleNote = infoStyle === 'analytical'
    ? ' Under analytical lens: favors facts, logic, concrete numbers.'
    : infoStyle === 'emotional'
      ? ' Under emotional lens: favors feeling, personal stories, empathy.'
      : '';
  return (base[t] ?? fallback) + styleNote;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/services/agents/actor.test.ts`
Expected: PASS

- [x] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/agents/actor.ts src/services/agents/actor.test.ts
git commit -m "feat(profiler): Actor.enrichNpcs — psychotype × informationStyle (pure TS)"
```

**Phase 2C DONE.** Переходи к `2026-08-14-jungian-profiler-p2d.md`.
