import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { LiteraryCompilerDB, type SceneTemplate } from './schema';
import { computeRetrievalScore, searchTemplates, type RetrievalKeys } from './retrieval';

function makeTemplate(overrides: Partial<SceneTemplate> = {}): SceneTemplate {
  return {
    id: 'tmpl-1',
    source_book: 'Test Book',
    source_chapter: 1,
    source_chunk_ids: ['chunk-1'],
    archetype_primary: 'escape_liberation',
    archetype_secondary: null,
    applicable_positions: ['leader'],
    variables: ['current_leader'],
    template_text: 'The hero breaks free from bondage.',
    beat_sequence: ['setup', 'struggle', 'freedom'],
    mood: 'tense',
    difficulty: 'medium',
    moral_ambiguity: 0.3,
    tension_curve: [0.2, 0.5, 0.8],
    tags: ['escape', 'freedom', 'quest'],
    domain: 'political',
    scale: 1.0,
    embedding_id: null,
    quality_score: 0.8,
    use_count: 0,
    last_used_at: null,
    created_at: Date.now(),
    ...overrides,
  };
}

describe('computeRetrievalScore', () => {
  it('gives high score when archetype matches', () => {
    const keys: RetrievalKeys = { archetype: 'escape_liberation' };
    const template = makeTemplate({ archetype_primary: 'escape_liberation' });
    const score = computeRetrievalScore(keys, template);

    // archetype_match = 0.40 * 1 = 0.40
    // mood_match = 0.15 * 0.05 (no mood in keys)
    // domain_match = 0.15 * 0.05 (no domain in keys)
    // quality_score = 0.10 * 0.8 = 0.08
    // freshness = 0.05 * 1.0 (use_count=0)
    // tags_overlap = 0.15 * 0 (no domain in keys)
    // total = 0.40 + 0.0075 + 0.0075 + 0.08 + 0.05 + 0 = 0.545
    expect(score).toBeGreaterThanOrEqual(0.45);
    expect(score).toBeLessThanOrEqual(0.6);
  });

  it('score is lower when archetype mismatches', () => {
    const keys: RetrievalKeys = { archetype: 'betrayal' };
    const template = makeTemplate({ archetype_primary: 'escape_liberation' });
    const score = computeRetrievalScore(keys, template);

    // archetype_match = 0.40 * 0 = 0
    // rest same as above but mood/domain don't match → 0.05 each
    // total = 0 + 0.0075 + 0.0075 + 0.08 + 0.05 + 0 = 0.145
    expect(score).toBeLessThan(0.2);
  });

  it('mood_match gives bonus when mood matches', () => {
    const keysMatch: RetrievalKeys = { mood: 'tense' };
    const keysMismatch: RetrievalKeys = { mood: 'joyful' };
    const template = makeTemplate({ mood: 'tense' });

    const scoreMatch = computeRetrievalScore(keysMatch, template);
    const scoreMismatch = computeRetrievalScore(keysMismatch, template);

    expect(scoreMatch).toBeGreaterThan(scoreMismatch);
    // Difference should be 0.15 * (1 - 0.05) = 0.1425
    expect(scoreMatch - scoreMismatch).toBeCloseTo(0.1425, 2);
  });

  it('domain_match gives bonus when domain matches', () => {
    const keysMatch: RetrievalKeys = { domain: 'political' };
    const keysMismatch: RetrievalKeys = { domain: 'spiritual' };
    const template = makeTemplate({ domain: 'political' });

    const scoreMatch = computeRetrievalScore(keysMatch, template);
    const scoreMismatch = computeRetrievalScore(keysMismatch, template);

    expect(scoreMatch).toBeGreaterThan(scoreMismatch);
    // Difference should be 0.15 * (1 - 0.05) = 0.1425
    expect(scoreMatch - scoreMismatch).toBeCloseTo(0.1425, 2);
  });

  it('quality_score contributes proportionally', () => {
    const highQuality = makeTemplate({ quality_score: 1.0 });
    const lowQuality = makeTemplate({ quality_score: 0.0 });
    const keys: RetrievalKeys = {};

    const scoreHigh = computeRetrievalScore(keys, highQuality);
    const scoreLow = computeRetrievalScore(keys, lowQuality);

    expect(scoreHigh).toBeGreaterThan(scoreLow);
    expect(scoreHigh - scoreLow).toBeCloseTo(0.10, 2);
  });

  it('freshness rewards low use_count templates', () => {
    const fresh = makeTemplate({ use_count: 0 });
    const used = makeTemplate({ use_count: 100 });
    const keys: RetrievalKeys = {};

    const scoreFresh = computeRetrievalScore(keys, fresh);
    const scoreUsed = computeRetrievalScore(keys, used);

    expect(scoreFresh).toBeGreaterThan(scoreUsed);
  });

  it('tags_overlap gives bonus when domain is in template tags', () => {
    const keys: RetrievalKeys = { domain: 'political' };
    const withTag = makeTemplate({ tags: ['political', 'intrigue'] });
    const withoutTag = makeTemplate({ tags: ['spiritual', 'moral'] });

    const scoreWith = computeRetrievalScore(keys, withTag);
    const scoreWithout = computeRetrievalScore(keys, withoutTag);

    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('returns score between 0 and 1', () => {
    const keys: RetrievalKeys = { archetype: 'betrayal', mood: 'joyful', domain: 'spiritual' };
    const template = makeTemplate({ quality_score: 0.5 });
    const score = computeRetrievalScore(keys, template);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('searchTemplates', () => {
  let db: LiteraryCompilerDB;

  beforeEach(() => {
    db = new LiteraryCompilerDB(':memory:');
    db.createV2Tables();
    db.createV2FTS();

    const templates = [
      makeTemplate({
        id: 'escape-1',
        archetype_primary: 'escape_liberation',
        mood: 'tense',
        domain: 'political',
        tags: ['escape', 'freedom'],
        quality_score: 0.9,
        use_count: 0,
      }),
      makeTemplate({
        id: 'escape-2',
        archetype_primary: 'escape_liberation',
        mood: 'hopeful',
        domain: 'spiritual',
        tags: ['escape', 'redemption'],
        quality_score: 0.7,
        use_count: 5,
      }),
      makeTemplate({
        id: 'betrayal-1',
        archetype_primary: 'betrayal',
        mood: 'tense',
        domain: 'political',
        tags: ['betrayal', 'intrigue'],
        quality_score: 0.8,
        use_count: 2,
      }),
      makeTemplate({
        id: 'quest-1',
        archetype_primary: 'quest_journey',
        mood: 'adventurous',
        domain: 'general',
        tags: ['quest', 'travel'],
        quality_score: 0.6,
        use_count: 10,
      }),
    ];

    for (const t of templates) {
      db.insertSceneTemplate(t);
      // Also insert into FTS
      db.db.prepare(`
        INSERT INTO scene_fts (id, archetype_primary, mood, tags, template_text)
        VALUES (?, ?, ?, ?, ?)
      `).run(t.id, t.archetype_primary, t.mood, JSON.stringify(t.tags), t.template_text);
    }
  });

  it('returns templates ranked by composite score', async () => {
    const keys: RetrievalKeys = { archetype: 'escape_liberation', mood: 'tense', domain: 'political' };
    const results = await searchTemplates(db, keys, 3);

    expect(results.length).toBeGreaterThan(0);
    // escape-1 matches archetype, mood, domain → should be first
    expect(results[0]!.template.id).toBe('escape-1');
  });

  it('respects limit parameter', async () => {
    const keys: RetrievalKeys = { archetype: 'escape_liberation' };
    const results = await searchTemplates(db, keys, 1);

    expect(results.length).toBe(1);
  });

  it('returns empty array when no candidates match', async () => {
    const keys: RetrievalKeys = { archetype: 'nonexistent_archetype' };
    const results = await searchTemplates(db, keys, 5);

    expect(results).toEqual([]);
  });

  it('results include score field', async () => {
    const keys: RetrievalKeys = { archetype: 'escape_liberation' };
    const results = await searchTemplates(db, keys, 5);

    expect(results.length).toBeGreaterThan(0);
    expect(typeof results[0]!.score).toBe('number');
    expect(results[0]!.score).toBeGreaterThanOrEqual(0);
  });

  it('ranked results are sorted by score descending', async () => {
    const keys: RetrievalKeys = { archetype: 'escape_liberation' };
    const results = await searchTemplates(db, keys, 10);

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });
});
