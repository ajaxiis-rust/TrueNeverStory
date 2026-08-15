# Jungian Profiler — Phase 2D: Validator + Stylist + Censor (Tasks 2.4–2.6)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [ ]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S3.1 (Validator/Stylist/Censor), S10; impl-спека `spec-profiler-integration.md` §4, §9.

**Acceptance (2D):** `ValidatorAgent.verify` возвращает pre-gen факт-чек (npcInLocation). `getMoralizingGate` маппит thinking→strict/relaxed/off. `StylistAgent.buildMicroPrompt` включает playerVoice. `CensorAgent.clean` удаляет клише regex'ом (llmPolished=false). `process()` нетронут.

**Files:**
- Modify: `src/services/agents/validator.ts` + create `validator.test.ts`
- Modify: `src/services/jungian-profiler.ts` (getMoralizingGate)
- Create: `src/services/agents/stylist.test.ts`
- Modify: `src/services/agents/censor.ts` + create `censor.test.ts`

---

## Task 2.4: Validator.verify — pre-gen факт-чек

**Covers:** S3.1 (Validator)
**Interfaces (Produces):** `ValidatorAgent.buildWorldConsistency(gameContext, filledSkeleton): { npcInLocation; itemsAvailable; timelineCoherent }` (public для теста); `ValidatorAgent.verify(gameContext, filledSkeleton): Promise<VerificationResult>`

> Граница (дизайн S3.1): Validator проверяет ТОЛЬКО факты, существующие ДО генерации. Детали, придуманные Stylist'ом, чистит Censor.

- [ ] **Step 1: Write failing test**

```typescript
// src/services/agents/validator.test.ts (create)
import { describe, test, expect } from 'bun:test';
import { ValidatorAgent } from './validator';
import { TNSServer } from '@/mcp/server';
import type { GameContext } from '@/services/context-builder';

const ctx = (npcs: string[]): GameContext =>
  ({ nearbyNpcs: npcs.map(name => ({ name })), location: { name: 'Old Oak' } }) as unknown as GameContext;

describe('ValidatorAgent.buildWorldConsistency', () => {
  const agent = new ValidatorAgent({} as TNSServer);
  test('NPC mentioned in skeleton AND present → npcInLocation true', () => {
    expect(agent.buildWorldConsistency(ctx(['Bran']), 'Alek looks for Bran the smith.').npcInLocation).toBe(true);
  });
  test('NPC NOT in nearby list → npcInLocation false', () => {
    expect(agent.buildWorldConsistency(ctx(['Marta']), 'Alek looks for Bran the smith.').npcInLocation).toBe(false);
  });
  test('no NPCs mentioned → npcInLocation true (vacuous)', () => {
    expect(agent.buildWorldConsistency(ctx([]), 'Alek enters the tavern.').npcInLocation).toBe(true);
  });
});

describe('ValidatorAgent.verify', () => {
  test('returns VerificationResult with worldConsistency + notes', async () => {
    const mcp = { handleToolCall: async () => ({ verified: false, confidence: 'unknown', evidence: [] }) } as unknown as TNSServer;
    const agent = new ValidatorAgent(mcp);
    const r = await agent.verify(ctx(['Bran']), 'Alek forges a blade. Bran is in the tavern.');
    expect(r.worldConsistency.npcInLocation).toBe(true);
    expect(Array.isArray(r.claims)).toBe(true);
    expect(Array.isArray(r.notes)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/agents/validator.test.ts`
Expected: FAIL — `agent.buildWorldConsistency is not a function`

- [ ] **Step 3: Write minimal implementation (add to validator.ts)**

```typescript
// imports to add in validator.ts:
import type { VerificationResult } from '../jungian-profiler';

// methods on ValidatorAgent (additive — НЕ трогает process()):
buildWorldConsistency(
  gameContext: GameContext,
  filledSkeleton: string,
): { npcInLocation: boolean; itemsAvailable: boolean; timelineCoherent: boolean } {
  const nearby = new Set(gameContext.nearbyNpcs.map(n => n.name));
  const mentioned = gameContext.nearbyNpcs.filter(n => filledSkeleton.includes(n.name));
  const npcInLocation = mentioned.every(n => nearby.has(n.name));
  return { npcInLocation, itemsAvailable: true, timelineCoherent: true };
}

async verify(gameContext: GameContext, filledSkeleton: string): Promise<VerificationResult> {
  const worldConsistency = this.buildWorldConsistency(gameContext, filledSkeleton);
  const claims = this.extractClaimsFromSkeleton(filledSkeleton).slice(0, 3);
  const verifications = await Promise.all(claims.map(c => this.verifyClaim(c)));
  const notes = verifications.map(v => `${v.claim} (${v.confidence})`);
  return { claims: verifications, worldConsistency, notes };
}

private extractClaimsFromSkeleton(filledSkeleton: string): string[] {
  const matches = filledSkeleton.match(/\b(forge|craft|repair|build|brew|smelt)\w*/gi) ?? [];
  return matches.length > 0
    ? [`The scene involves ${matches[0]!.toLowerCase()} work (plausibility check)`]
    : [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/agents/validator.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/agents/validator.ts src/services/agents/validator.test.ts
git commit -m "feat(profiler): Validator.verify — pre-gen fact-check + worldConsistency"
```

---

## Task 2.5: Stylist — getMoralizingGate + playerVoice

**Covers:** S3.1 (Stylist), S10

- [ ] **Step 1: Write failing tests**

```typescript
// append to src/services/jungian-profiler.test.ts
import { getMoralizingGate } from './jungian-profiler';

describe('getMoralizingGate', () => {
  test('thinking > 0.7 → strict', () => {
    const p = createDefaultProfile(); p.thinking.preference = 0.8;
    expect(getMoralizingGate(p)).toBe('strict');
  });
  test('0.5 < thinking ≤ 0.7 → relaxed', () => {
    const p = createDefaultProfile(); p.thinking.preference = 0.6;
    expect(getMoralizingGate(p)).toBe('relaxed');
  });
  test('thinking ≤ 0.5 → off', () => {
    const p = createDefaultProfile(); p.thinking.preference = 0.4;
    expect(getMoralizingGate(p)).toBe('off');
  });
});
```

```typescript
// src/services/agents/stylist.test.ts (create)
import { describe, test, expect } from 'bun:test';
import { StylistAgent } from './stylist';
import { TNSServer } from '@/mcp/server';
import { LLMQueue } from '@/lib/llm-queue';

describe('StylistAgent.buildMicroPrompt', () => {
  const agent = new StylistAgent({} as TNSServer, {} as LLMQueue);
  const style = { register: 'medium', pacing: 'medium', sensory: ['visual'], snippets: [], forbidden: [] };
  test('playerVoice passed → present in user prompt', () => {
    const { user } = agent.buildMicroPrompt('Alek seeks Bran.', style, { world: 'Dark Realm', location: 'Old Oak' }, 'success',
      'Player psychological context:\n- Prefers analytical');
    expect(user).toContain('Player psychological context');
    expect(user).toContain('Prefers analytical');
  });
  test('no playerVoice → no voice block', () => {
    const { user } = agent.buildMicroPrompt('Alek seeks Bran.', style, { world: 'Dark Realm', location: 'Old Oak' }, 'success');
    expect(user).not.toContain('Player psychological context');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts src/services/agents/stylist.test.ts`
Expected: FAIL — `getMoralizingGate is not exported`

- [ ] **Step 3: Write minimal implementation**

```typescript
// append to src/services/jungian-profiler.ts
export function getMoralizingGate(profile: JungianProfile): 'strict' | 'relaxed' | 'off' {
  if (profile.thinking.preference > 0.7) return 'strict';
  if (profile.thinking.preference > 0.5) return 'relaxed';
  return 'off';
}
```

> `StylistAgent.buildMicroPrompt` **уже** принимает `playerVoice?: string` (5-й параметр) и вставляет блок `Player voice notes (soft prior)`. Изменений в stylist.ts для этого шага НЕ требуется — тест фиксирует контракт.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts src/services/agents/stylist.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/jungian-profiler.ts src/services/agents/stylist.test.ts
git commit -m "feat(profiler): getMoralizingGate + Stylist playerVoice contract test"
```

---

## Task 2.6: Censor.clean — regex-замена клише

**Covers:** S3.1 (Censor)

- [ ] **Step 1: Write failing test**

```typescript
// src/services/agents/censor.test.ts (create)
import { describe, test, expect } from 'bun:test';
import { CensorAgent } from './censor';
import { LLMQueue } from '@/lib/llm-queue';
import type { GameContext } from '@/services/context-builder';

const ctx = { world: { name: 'Dark Realm', genre: 'fantasy', rules: {} }, location: { name: 'Old Oak' } } as unknown as GameContext;

describe('CensorAgent.clean', () => {
  const agent = new CensorAgent({} as LLMQueue);
  test('removes clichés, no LLM polish', async () => {
    const raw = "The very fabric of the tavern seemed woven with stories. It's worth noting that the stew is fresh. The palpable silence hung in the air.";
    const r = await agent.clean(raw, ctx);
    expect(r.llmPolished).toBe(false);
    expect(r.cleaned).not.toContain('very fabric');
    expect(r.cleaned).not.toContain("It's worth noting");
    expect(r.cleaned).not.toContain('palpable');
  });
  test('empty input → empty cleaned', async () => {
    const r = await agent.clean('', ctx);
    expect(r.cleaned).toBe('');
    expect(r.llmPolished).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/agents/censor.test.ts`
Expected: FAIL — `agent.clean is not a function`

- [ ] **Step 3: Write minimal implementation (add to censor.ts)**

```typescript
// imports to add in censor.ts:
import type { CensorResult } from '../jungian-profiler';

// method on CensorAgent (additive — НЕ трогает process()/review()):
async clean(rawNarrative: string, context: GameContext): Promise<CensorResult> {
  if (!rawNarrative || rawNarrative.length === 0) {
    return { cleaned: rawNarrative, llmPolished: false };
  }
  let cleaned = this.removeCliches(rawNarrative);
  cleaned = this.fixAnachronisms(cleaned, context);
  // clean() = только regex-замена (детерминированно) → llmPolished всегда false в этой фазе.
  return { cleaned, llmPolished: false };
}
```

> `CensorResult { cleaned; llmPolished }` определён в Task 2.1. **Polished path (важно не потерять):**
> - `clean()` — это ТОЛЬКО regex-этап (клише + анахронизмы), 0 LLM, возвращает `llmPolished: false`.
> - Опциональный LLM-polish (~10–15% случаев) — ОТДЕЛЬНЫЙ шаг: `llmPolish()` / `review()`. Конвейер (RoleplayEngine) может вызвать его после `clean()` при высоком `profile.confidence` (напр. ≥ 0.7) — тогда результат помечается `llmPolished: true`.
> - В unit-тесте `clean()` фиксируем контракт только regex-фазы; LLM-polish покрывается отдельно (или интеграционно).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/agents/censor.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/agents/censor.ts src/services/agents/censor.test.ts
git commit -m "feat(profiler): Censor.clean — regex cliché removal (0 LLM)"
```

**Phase 2D DONE.** Переходи к `2026-08-14-jungian-profiler-p2e.md`.
