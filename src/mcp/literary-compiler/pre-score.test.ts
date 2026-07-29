import { describe, it, expect } from 'bun:test';
import { preScoreChunk } from './pre-score';
import { type Chunk } from './chunker';

function makeChunk(text: string): Chunk {
  return { id: 'test-1', text, startOffset: 0, endOffset: text.length };
}

describe('preScoreChunk', () => {
  it('scores escape_liberation higher for escape-related text', () => {
    const chunk = makeChunk(
      'He decided to escape the dungeon. The chains broke and he fled through the wilderness, seeking freedom from bondage.',
    );
    const result = preScoreChunk(chunk);

    expect(result.archetypeScores['escape_liberation']).toBeGreaterThan(0);
    // Escape-related text should score meaningfully higher than random archetypes
    const scores = Object.values(result.archetypeScores);
    const maxScore = Math.max(...scores);
    expect(result.archetypeScores['escape_liberation']).toBe(maxScore);
  });

  it('returns dictHits with matched keywords', () => {
    const chunk = makeChunk(
      'He decided to escape the dungeon. The chains broke and he fled.',
    );
    const result = preScoreChunk(chunk);

    expect(result.dictHits.length).toBeGreaterThan(0);
    for (const hit of result.dictHits) {
      expect(typeof hit.keyword).toBe('string');
      expect(typeof hit.archetype).toBe('string');
      expect(typeof hit.position).toBe('number');
      expect(hit.position).toBeGreaterThanOrEqual(0);
    }

    // Should contain escape-related keywords
    const keywords = result.dictHits.map((h) => h.keyword);
    expect(keywords).toContain('escape');
  });

  it('narrativeScore is between 0 and 1', () => {
    const chunk = makeChunk('A quiet morning. The sun rose gently.');
    const result = preScoreChunk(chunk);

    expect(result.narrativeScore).toBeGreaterThanOrEqual(0);
    expect(result.narrativeScore).toBeLessThanOrEqual(1);
  });

  it('returns non-zero narrativeScore for dialogue-heavy text', () => {
    const chunk = makeChunk(
      '"I will fight!" he shouted, drawing his sword. "You cannot stop me!" The enemy charged.',
    );
    const result = preScoreChunk(chunk);
    expect(result.narrativeScore).toBeGreaterThan(0);
  });

  it('scores political_intrigue for power/throne/plot text', () => {
    const chunk = makeChunk(
      'The king plotted a secret coup against the throne. The cabinet conspired with the council faction.',
    );
    const result = preScoreChunk(chunk);

    expect(result.archetypeScores['political_intrigue']).toBeGreaterThan(0);
  });

  it('returns all archetype scores as numbers between 0 and 1', () => {
    const chunk = makeChunk('Some text about the journey and the quest ahead.');
    const result = preScoreChunk(chunk);

    for (const [archetype, score] of Object.entries(result.archetypeScores)) {
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
