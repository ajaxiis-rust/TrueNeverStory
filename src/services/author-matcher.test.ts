import { describe, test, expect } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { matchAuthor, selectAuthor, loadAuthorCorpus, analyzeBirth } from './author-matcher';
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
    expect(captured).toContain('The wanderer strode through grey mist');
    expect(captured).toContain('Tolkien');
    expect(captured).toContain('In a hole in the ground');
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

describe('analyzeBirth', () => {
  const hints = 'A grim ranger who distrusts magic.';
  const prologue = 'The wanderer strode through grey mist along the cliff edge.';
  const validJson = JSON.stringify({
    psychotype: {
      extraversion: 0.3, intuition: 0.8, thinking: 0.7, judging: 0.6,
      axisConfidence: { extraversion: 0.8, intuition: 0.7, thinking: 0.8, judging: 0.7 },
      confidence: 0.9,
    },
    closestAuthor: 'Tolkien',
  });
  test('combined call: prompt includes description + prologue + samplePhrases', async () => {
    let captured = '';
    const llm = { generateText: async (p: string) => { captured = p; return validJson; } } as unknown as LLMQueue;
    await analyzeBirth(hints, prologue, corpus, async () => [1, 0, 0], llm);
    expect(captured).toContain('grim ranger');
    expect(captured).toContain('grey mist');
    expect(captured).toContain('In a hole in the ground');
  });
  test('LLM names top-3 author → psychotype + closestAuthor', async () => {
    const llm = { generateText: async () => validJson } as unknown as LLMQueue;
    const r = await analyzeBirth(hints, prologue, corpus, async () => [1, 0, 0], llm);
    expect(r!.closestAuthor).toBe('Tolkien');
    expect(r!.psychotype.thinking.preference).toBeCloseTo(0.7, 5);
  });
  test('LLM returns gibberish author → top-1 fallback', async () => {
    const llm = { generateText: async () => JSON.stringify({ psychotype: { confidence: 0.9 }, closestAuthor: 'nonsense' }) } as unknown as LLMQueue;
    const r = await analyzeBirth(hints, prologue, corpus, async () => [1, 0, 0], llm);
    expect(r!.closestAuthor).toBe('Tolkien');
  });
  test('LLM throws → graceful top-1 author (no psychotype refinement)', async () => {
    const llm = { generateText: async () => { throw new Error('llm down'); } } as unknown as LLMQueue;
    const r = await analyzeBirth(hints, prologue, corpus, async () => [1, 0, 0], llm);
    expect(r!.closestAuthor).toBe('Tolkien');
  });
  test('embed throws + LLM absent → null (no author, no crash)', async () => {
    const r = await analyzeBirth(hints, prologue, corpus, async () => { throw new Error('no embed'); });
    expect(r).toBeNull();
  });
});
