import { describe, it, expect } from 'bun:test';
import { logLiterarySignals } from './literary-modulation';

describe('logLiterarySignals', () => {
  it('returns structured signal object', () => {
    const result = logLiterarySignals(
      { parsedInput: 'I went to the tavern' } as any,
      { character: { name: 'Hero' }, location: { name: 'tavern' }, nearbyNpcs: [] } as any,
      { type: 'action', verb: 'go' } as any,
      'Player prefers concrete info',
      ['The evening air was crisp.'],
    );
    expect(result).toHaveProperty('turnWordCount');
    expect(result).toHaveProperty('playerVoiceLength');
    expect(result).toHaveProperty('authorPhrasesCount');
    expect(result).toHaveProperty('intentType');
    expect(result.turnWordCount).toBeGreaterThan(0);
    expect(result.playerVoiceLength).toBe(28); // 'Player prefers concrete info'.length
    expect(result.authorPhrasesCount).toBe(1);
    expect(result.intentType).toBe('action');
  });

  it('handles missing playerVoice and authorPhrases', () => {
    const result = logLiterarySignals(
      { parsedInput: 'test' } as any,
      { nearbyNpcs: [] } as any,
      { type: 'action' } as any,
      undefined,
      undefined,
    );
    expect(result.playerVoiceLength).toBe(0);
    expect(result.authorPhrasesCount).toBe(0);
  });
});
