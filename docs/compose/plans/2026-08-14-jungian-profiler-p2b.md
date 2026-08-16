# Jungian Profiler — Phase 2B: Dramaturg.enrichScene (Task 2.2)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [x]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S11; impl-спека `spec-profiler-integration.md` §6.

**Acceptance (2B):** `DramaturgAgent.enrichScene` сэмплит архетип из весов → SQL literary-compiler (`searchTemplates`) → `fillTemplate` → `DramaturgEnrichment`. 0 LLM при SQL-hit. `process()` нетронут.

**Files:**
- Modify: `src/services/agents/dramaturg.ts`
- Create: `src/services/agents/dramaturg.test.ts`

---

## Task 2.2: Dramaturg.enrichScene — SQL к literary-compiler

**Covers:** S11
**Interfaces:**
- Consumes: `WeightedChoice`, `DramaturgEnrichment` из `../jungian-profiler`; `searchTemplates` из `@/mcp/literary-compiler/retrieval`; `fillTemplate` из `@/mcp/literary-compiler/fill-template`; `LiteraryCompilerDB` из `@/mcp/literary-compiler/schema`
- Produces: `DramaturgAgent.enrichScene(archetypeWeights, gameContext): Promise<DramaturgEnrichment>` (db резолвится ВНУТРИ агента через инжектированный `getLiteraryDb`)

- [x] **Step 1: Write failing test**

```typescript
// src/services/agents/dramaturg.test.ts (create)
import { describe, test, expect, beforeEach } from 'bun:test';
import { LiteraryCompilerDB, type SceneTemplate } from '@/mcp/literary-compiler/schema';
import { DramaturgAgent } from './dramaturg';
import { TNSServer } from '@/mcp/server';
import { LLMQueue } from '@/lib/llm-queue';
import type { GameContext } from '@/services/context-builder';

const makeTemplate = (overrides: Partial<SceneTemplate> = {}): SceneTemplate => ({
  id: 't1', source_book: 'T', source_chapter: 1, source_chunk_ids: [],
  archetype_primary: 'judgment_trial', archetype_secondary: null, applicable_positions: ['leader'],
  variables: ['character', 'location'], template_text: '[character] faces [location]\'s judgment.',
  beat_sequence: [], mood: 'tense', difficulty: 'medium', moral_ambiguity: 0.3,
  tension_curve: [], tags: [], domain: 'political', scale: 1, embedding_id: null,
  quality_score: 0.9, use_count: 0, last_used_at: null, created_at: Date.now(), ...overrides,
});

describe('DramaturgAgent.enrichScene', () => {
  let db: LiteraryCompilerDB;
  let agent: DramaturgAgent;
  beforeEach(() => {
    db = new LiteraryCompilerDB(':memory:');
    db.createV2Tables(); db.createV2FTS();
    db.insertSceneTemplate(makeTemplate());
    agent = new DramaturgAgent(
      {} as TNSServer,
      { generateText: async () => 'fallback skeleton' } as unknown as LLMQueue,
      () => db,
    );
  });
  test('samples archetype from weights → SQL hit → fillTemplate (0 LLM)', async () => {
    const ctx = { character: { name: 'Alek' }, location: { name: 'Old Oak' } } as unknown as GameContext;
    const r = await agent.enrichScene([{ value: 'judgment_trial', weight: 1 }], ctx);
    expect(r.archetype).toBe('judgment_trial');
    expect(r.filledSkeleton).toContain('Alek');
    expect(r.filledSkeleton).toContain('Old Oak');
    expect(r.mood).toBe('tense');
  });
  test('no template found → LLM fallback', async () => {
    const emptyDb = new LiteraryCompilerDB(':memory:');
    emptyDb.createV2Tables(); emptyDb.createV2FTS();
    const fallbackAgent = new DramaturgAgent(
      {} as TNSServer,
      { generateText: async () => 'fallback skeleton' } as unknown as LLMQueue,
      () => emptyDb,
    );
    const ctx = { character: { name: 'Alek' }, location: { name: 'X' } } as unknown as GameContext;
    const r = await fallbackAgent.enrichScene([{ value: 'rescue', weight: 1 }], ctx);
    expect(r.archetype).toBe('rescue');
    expect(typeof r.filledSkeleton).toBe('string');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/services/agents/dramaturg.test.ts`
Expected: FAIL — `agent.enrichScene is not a function`

- [x] **Step 3: Write minimal implementation (add method to dramaturg.ts)**

```typescript
// imports to add in dramaturg.ts:
import { sample, type WeightedChoice, type DramaturgEnrichment } from '../jungian-profiler';
import { searchTemplates } from '@/mcp/literary-compiler/retrieval';
import { fillTemplate } from '@/mcp/literary-compiler/fill-template';
import type { LiteraryCompilerDB } from '@/mcp/literary-compiler/schema';

// constructor: добавить 3-й опциональный параметр getLiteraryDb (db резолвится ВНУТРИ агента):
constructor(
  private mcpServer: TNSServer,
  private llmQueue: LLMQueue,
  private getLiteraryDb: () => LiteraryCompilerDB | null = () => null,
) {
  super();
}

// method on DramaturgAgent (additive — НЕ трогает process()):
async enrichScene(
  archetypeWeights: WeightedChoice[],
  gameContext: GameContext,
): Promise<DramaturgEnrichment> {
  const archetype = sample(archetypeWeights);
  const db = this.getLiteraryDb();
  if (db) {
    const ranked = await searchTemplates(db, { archetype }, 1);
    if (ranked.length > 0) {
      const t = ranked[0]!.template;
      const filled = fillTemplate(t.template_text, {
        character: gameContext.character?.name ?? 'the hero',
        location: gameContext.location?.name ?? 'the place',
      });
      return { archetype, filledSkeleton: filled, mood: t.mood };
    }
  }
  return { archetype, filledSkeleton: await this.generateFallbackSkeleton(archetype, gameContext), mood: 'neutral' };
}

private async generateFallbackSkeleton(archetype: string, gameContext: GameContext): Promise<string> {
  const prompt = `Write a 1-sentence scene skeleton for archetype "${archetype}" in location "${gameContext.location?.name ?? 'unknown'}". Respond with only the sentence.`;
  const text = await this.llmQueue.generateText(prompt, 1, 0.3, 'dramaturg');
  return text.trim() || `${archetype} unfolds in ${gameContext.location?.name ?? 'the place'}.`;
}
```

> **Wiring note:** в `roleplay-engine.ts` при конструировании `DramaturgAgent` передать 3-й аргумент `() => this.getLiteraryDb()` (существующий метод, см. `roleplay-engine.ts:634`). Дефолт `() => null` сохраняет обратную совместимость.

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/services/agents/dramaturg.test.ts`
Expected: PASS

- [x] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/agents/dramaturg.ts src/services/agents/dramaturg.test.ts
git commit -m "feat(profiler): Dramaturg.enrichScene — SQL literary-compiler + fillTemplate"
```

**Phase 2B DONE.** Переходи к `2026-08-14-jungian-profiler-p2c.md`.
