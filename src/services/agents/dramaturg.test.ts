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
