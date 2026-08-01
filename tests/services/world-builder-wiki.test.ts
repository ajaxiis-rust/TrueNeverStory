import { describe, it, expect } from 'bun:test';

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that', 'these', 'those',
  ]);

  return text
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z]/g, ''))
    .filter(w => w.length > 3 && !stopWords.has(w))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 20);
}

describe('WorldBuilder Wikipedia integration', () => {
  it('should extract keywords from world description', () => {
    const worldDescription = 'A medieval world of knights and castles in England';
    const keywords = extractKeywords(worldDescription);
    expect(keywords).toContain('medieval');
    expect(keywords).toContain('knights');
    expect(keywords).toContain('castles');
    expect(keywords).toContain('england');
  });

  it('should filter out stop words', () => {
    const text = 'The knight is a brave warrior in the castle';
    const keywords = extractKeywords(text);
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('is');
    expect(keywords).not.toContain('a');
    expect(keywords).not.toContain('in');
    expect(keywords).toContain('knight');
    expect(keywords).toContain('brave');
    expect(keywords).toContain('warrior');
    expect(keywords).toContain('castle');
  });

  it('should deduplicate keywords', () => {
    const text = 'knight knight castle castle medieval medieval';
    const keywords = extractKeywords(text);
    const knightCount = keywords.filter(k => k === 'knight').length;
    expect(knightCount).toBe(1);
  });

  it('should limit to 20 keywords', () => {
    const words = Array(30).fill('word').map((w, i) => `${w}${i}`).join(' ');
    const keywords = extractKeywords(words);
    expect(keywords.length).toBeLessThanOrEqual(20);
  });
});
