# Jungian Profiler — Phase 4B: AuthorMatcher — cosine search + selection (Task 4.2)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [x]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S7, S5.2.

**Acceptance (4B):** `topNAuthors` (pure, в `jungian-profiler.ts`, **переиспользует** `cosineSimilarity` из `@/lib/vector-ops` — Mojo FFI) и `matchAuthor`/`selectAuthor`/`loadAuthorCorpus` (в `src/services/author-matcher.ts`) возвращают top-3 по косинусу, LLM-выбор лучшего из top-3 **по прологу + samplePhrases кандидатов** (с детерминированным top-1 fallback) и `null` при недоступном embedding или рассинхроне размерностей. Graceful: ни один путь не бросает наружу.

> **Важно (fix ревью):** НЕ определять локальный `cosineSimilarity` — в проекте уже есть `src/lib/vector-ops.ts:cosineSimilarity(a: Float32Array, b: Float32Array)` (бросает на dim-mismatch, делегирует в Mojo `cosineSimilarityFull`). AuthorMatcher переиспользует его. Embedding dim не хардкодится (384 в спеке S7 — предположительно неверно; реальный dim = настроенный `WORLD_EMBEDDING_MODEL`, BGE-M3). Consistency проверяется в рантайме: записи с другой dim skip'аются.

**Files:**
- Modify: `src/services/jungian-profiler.ts` (типы `AuthorEntry`/`AuthorMatch`, pure `topNAuthors`, pure `blendProfiles` [S5.2])
- Modify: `src/services/jungian-profiler.test.ts`
- Create: `src/services/author-matcher.ts`
- Create: `src/services/author-matcher.test.ts`

---

## Task 4.2: AuthorMatcher — cosine search + selection

**Covers:** S7
**Interfaces:**
- Consumes: `JungianProfile` из `./jungian-profiler`; `cosineSimilarity` из `@/lib/vector-ops` (Mojo FFI, Float32Array); `LLMQueue.generateText(prompt, priority, temperature, agentId?, timeout?)`.
- Produces: `AuthorEntry`, `AuthorMatch` (types); `topNAuthors(prologueEmbedding, corpus, n?): AuthorEntry[]`; `loadAuthorCorpus(path?): AuthorEntry[]`; `matchAuthor(prologue, corpus, embed, llmQueue?): Promise<AuthorMatch | null>`; `selectAuthor(top3, prologue, llmQueue?): Promise<{ author: AuthorEntry; reason: string }>`; `analyzeBirth(hints, prologue, corpus, embed, llmQueue): Promise<{ psychotype: JungianProfile; closestAuthor: string | null } | null>` ([S5.2]).

- [x] **Step 1: Write failing tests (jungian-profiler.test.ts + author-matcher.test.ts)**

```typescript
// append to src/services/jungian-profiler.test.ts
import { topNAuthors, type AuthorEntry } from './jungian-profiler';

describe('topNAuthors', () => {
  const corpus: AuthorEntry[] = [
    { name: 'A', embedding: [1, 0, 0], psychotype: createDefaultProfile(), samplePhrases: ['a'], genres: ['fantasy'] },
    { name: 'B', embedding: [0, 1, 0], psychotype: createDefaultProfile(), samplePhrases: ['b'], genres: ['scifi'] },
    { name: 'C', embedding: [0.9, 0.1, 0], psychotype: createDefaultProfile(), samplePhrases: ['c'], genres: ['horror'] },
    { name: 'D', embedding: [1, 0, 0, 0], psychotype: createDefaultProfile(), samplePhrases: ['d'], genres: ['romance'] }, // dim 4 — mismatch
  ];
  test('returns top-3 sorted by cosine desc (dim-matching only)', () => {
    const top = topNAuthors([1, 0, 0], corpus, 3);
    expect(top.map(a => a.name)).toEqual(['A', 'C', 'B']); // D skipped (dim 4 ≠ 3)
  });
  test('n smaller than corpus → slice', () => {
    expect(topNAuthors([1, 0, 0], corpus, 2)).toHaveLength(2);
  });
  test('default n = 3', () => {
    expect(topNAuthors([1, 0, 0], corpus)).toHaveLength(3);
  });
  test('all authors dim-mismatched → []', () => {
    expect(topNAuthors([1, 0, 0, 0, 0], corpus)).toEqual([]);
  });
});
```

```typescript
// src/services/author-matcher.test.ts (create)
import { describe, test, expect } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { matchAuthor, selectAuthor, loadAuthorCorpus } from './author-matcher';
import { createDefaultProfile, type AuthorEntry } from './jungian-profiler';
import type { LLMQueue } from '@/lib/llm-queue';

const corpus: AuthorEntry[] = [
  { name: 'Tolkien', embedding: [1, 0, 0], psychotype: createDefaultProfile(), samplePhrases: ['In a hole in the ground'], genres: ['fantasy'] },
  { name: 'Lovecraft', embedding: [0, 1, 0], psychotype: createDefaultProfile(), samplePhrases: ['the most merciful thing'], genres: ['horror'] },
  { name: 'Asimov', embedding: [0, 0, 1], psychotype: createDefaultProfile(), samplePhrases: ['the last question'], genres: ['scifi'] },
];

describe('matchAuthor', () => {
  test('deterministic top-1 without LLM', async () => {
    const m = await matchAuthor('a hobbit in a hole', corpus, async () => [1, 0, 0]);
    expect(m!.name).toBe('Tolkien');
    expect(m!.matchConfidence).toBeCloseTo(1, 5);
    expect(m!.matchReason).toBe('cosine top-1 (LLM fallback)');
  });
  test('embed throws → null (graceful fallback)', async () => {
    const m = await matchAuthor('x', corpus, async () => { throw new Error('no BGE-M3'); });
    expect(m).toBeNull();
  });
  test('embed returns empty → null', async () => {
    expect(await matchAuthor('x', corpus, async () => [])).toBeNull();
  });
  test('empty corpus → null', async () => {
    expect(await matchAuthor('x', [], async () => [1, 0, 0])).toBeNull();
  });
  test('empty prologue → null', async () => {
    expect(await matchAuthor('   ', corpus, async () => [1, 0, 0])).toBeNull();
  });
  test('all authors dim-mismatched → null (no crash)', async () => {
    // prologue dim 5, corpus dim 3 → topNAuthors вернёт [] → matchAuthor null
    expect(await matchAuthor('x', corpus, async () => [1, 0, 0, 0, 0])).toBeNull();
  });
});

describe('selectAuthor', () => {
  const prologue = 'The wanderer strode through grey mist along the cliff edge.';
  test('LLM picks a named author from top-3', async () => {
    const llm = { generateText: async () => 'Lovecraft' } as unknown as LLMQueue;
    expect((await selectAuthor(corpus, prologue, llm)).author.name).toBe('Lovecraft');
  });
  test('LLM returns gibberish → top-1 fallback', async () => {
    const llm = { generateText: async () => 'nonsense' } as unknown as LLMQueue;
    expect((await selectAuthor(corpus, prologue, llm)).author.name).toBe('Tolkien');
  });
  test('LLM throws → top-1 fallback', async () => {
    const llm = { generateText: async () => { throw new Error('llm down'); } } as unknown as LLMQueue;
    expect((await selectAuthor(corpus, prologue, llm)).author.name).toBe('Tolkien');
  });
  test('single candidate → returns it without LLM', async () => {
    const llm = { generateText: async () => 'Tolkien' } as unknown as LLMQueue;
    expect((await selectAuthor([corpus[0]!], prologue, llm)).author.name).toBe('Tolkien');
  });
  test('empty top3 → throws', async () => {
    await expect(selectAuthor([], prologue)).rejects.toThrow('empty top3');
  });
  test('LLM prompt includes prologue + candidate samplePhrases', async () => {
    let captured = '';
    const llm = { generateText: async (p: string) => { captured = p; return 'Tolkien'; } } as unknown as LLMQueue;
    await selectAuthor(corpus, prologue, llm);
    expect(captured).toContain('The wanderer strode through grey mist');   // пролог
    expect(captured).toContain('Tolkien');                                  // имя кандидата
    expect(captured).toContain('In a hole in the ground');                  // samplePhrases кандидата
  });
});

describe('loadAuthorCorpus', () => {
  test('parses JSON file + caches', () => {
    const path = join(tmpdir(), `corpus-${Date.now()}-${Math.random()}.json`);
    writeFileSync(path, JSON.stringify([corpus[0]]));
    const loaded = loadAuthorCorpus(path);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.name).toBe('Tolkien');
  });
  test('missing file → []', () => {
    expect(loadAuthorCorpus('/nonexistent/author-embeddings.json')).toEqual([]);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bun test src/services/jungian-profiler.test.ts src/services/author-matcher.test.ts`
Expected: FAIL — `topNAuthors is not exported` / `Cannot find module './author-matcher'`

- [x] **Step 3: Write minimal implementation — types + pure topNAuthors (jungian-profiler.ts)**

```typescript
// append to src/services/jungian-profiler.ts
import { cosineSimilarity as vecCosine } from '@/lib/vector-ops';

export interface AuthorEntry {
  name: string;
  embedding: number[];        // BGE-M3 (dim = настроенный embedding-модель; не хардкодим 384)
  psychotype: JungianProfile;
  samplePhrases: string[];    // 3-5 фраз для few-shot
  genres: string[];
}

export interface AuthorMatch {
  name: string;
  matchConfidence: number;    // cosine similarity выбранного автора (0-1)
  matchReason: string;
}

export function topNAuthors(prologueEmbedding: number[], corpus: AuthorEntry[], n = 3): AuthorEntry[] {
  const dim = prologueEmbedding.length;
  return corpus
    .filter(a => a.embedding.length === dim)   // skip dim-mismatched (корпус собран под другую модель)
    .map(a => ({ a, s: vecCosine(Float32Array.from(prologueEmbedding), Float32Array.from(a.embedding)) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, n)
    .map(x => x.a);
}
```

> `vecCosine` (из `@/lib/vector-ops`) бросает на dim-mismatch, но мы отфильтровали записи другой длины заранее → бросания нет. При полностью рассинхронизированном корпусе `topNAuthors` вернёт `[]`, а `matchAuthor` (Step 4) вернёт `null`.

- [x] **Step 4: Write minimal implementation — async matcher (author-matcher.ts)**

```typescript
// src/services/author-matcher.ts (create)
import { readFileSync, existsSync } from 'node:fs';
import type { LLMQueue } from '@/lib/llm-queue';
import { cosineSimilarity as vecCosine } from '@/lib/vector-ops';
import { topNAuthors, type AuthorEntry, type AuthorMatch } from './jungian-profiler';

const _corpusCache = new Map<string, AuthorEntry[]>();

export function loadAuthorCorpus(path = 'data/author-embeddings.json'): AuthorEntry[] {
  const cached = _corpusCache.get(path);
  if (cached) return cached;
  let entries: AuthorEntry[] = [];
  if (existsSync(path)) {
    try {
      entries = JSON.parse(readFileSync(path, 'utf8')) as AuthorEntry[];
    } catch {
      entries = [];
    }
  }
  _corpusCache.set(path, entries);
  return entries;
}

export async function selectAuthor(
  top3: AuthorEntry[],
  prologue: string,
  llmQueue?: LLMQueue,
): Promise<{ author: AuthorEntry; reason: string }> {
  if (top3.length === 0) throw new Error('selectAuthor: empty top3 — matchAuthor гарантирует non-empty');
  if (!llmQueue || top3.length <= 1) return { author: top3[0]!, reason: 'cosine top-1 (LLM fallback)' };
  const snippet = prologue.length > 2000 ? prologue.slice(0, 2000) : prologue; // ~500 слов
  const candidates = top3
    .map((a, i) => `${i + 1}) ${a.name}\n   sample: ${a.samplePhrases.slice(0, 3).join(' / ')}`)
    .join('\n');
  const prompt = `You are matching a player's writing style to a classical author for a few-shot style reference.

Player prologue:
"""
${snippet}
"""

Candidate authors (chosen by embedding cosine similarity):
${candidates}

Which candidate's prose style best matches the player's prologue? Consider register, pacing, sensory focus, sentence rhythm.
Reply with exactly the author name, nothing else.`;
  try {
    const answer = await llmQueue.generateText(prompt, 1, 0.2, 'author-matcher');
    const picked = top3.find(a => answer.includes(a.name));
    return picked
      ? { author: picked, reason: 'LLM pick among top-3' }
      : { author: top3[0]!, reason: 'cosine top-1 (LLM fallback)' }; // LLM вне top-3 → top-1
  } catch {
    return { author: top3[0]!, reason: 'cosine top-1 (LLM fallback)' }; // LLM недоступен → top-1
  }
}

export async function matchAuthor(
  prologue: string,
  corpus: AuthorEntry[],
  embed: (text: string) => Promise<number[]>,
  llmQueue?: LLMQueue,
): Promise<AuthorMatch | null> {
  if (!prologue.trim() || corpus.length === 0) return null;
  let prologueEmbedding: number[];
  try {
    prologueEmbedding = await embed(prologue);
  } catch {
    return null; // BGE-M3 недоступен → graceful fallback (closestAuthor отсутствует)
  }
  if (prologueEmbedding.length === 0) return null;
  const top3 = topNAuthors(prologueEmbedding, corpus, 3);
  if (top3.length === 0) return null; // ни один автор не совпал по dim → не ранжируем мусор
  const { author: chosen, reason } = await selectAuthor(top3, prologue, llmQueue);
  return {
    name: chosen.name,
    matchConfidence: Math.max(0, vecCosine(Float32Array.from(prologueEmbedding), Float32Array.from(chosen.embedding))),
    matchReason: reason,
  };
}
```

> **agentId `'author-matcher'` не зарегистрирован** в `DEFAULT_AGENTS`/`conf/agents.json`: `LLMQueue.generateText(prompt, 1, 0.2, 'author-matcher')` резолвится в default provider через `loadAgentConfig` fallback. Опционально: зарегистрировать `author-matcher` в `conf/agents.json` (своя модель/провайдер) либо принять default.

- [x] **Step 5: Run tests to verify they pass**

Run: `bun test src/services/jungian-profiler.test.ts src/services/author-matcher.test.ts`
Expected: PASS

- [x] **Step 6: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts src/services/author-matcher.ts src/services/author-matcher.test.ts
git commit -m "feat(profiler): AuthorMatcher — cosine top-3 + LLM selection (Phase 4)"
```

**Phase 4B DONE.** Переходи к `2026-08-14-jungian-profiler-p4c.md`.
