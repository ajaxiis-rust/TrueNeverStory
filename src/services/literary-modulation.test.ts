import { describe, it, expect } from 'bun:test';
import { logLiterarySignals, computeLiteraryToneHint } from './literary-modulation';
import type { ProbabilityDistribution } from './jungian-profiler';

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

describe('computeLiteraryToneHint', () => {
  it('returns hint string from distribution', () => {
    const dist: ProbabilityDistribution = {
      sceneTone: [
        { value: 'controlled, strategic', weight: 0.5 },
        { value: 'dry, precise', weight: 0.3 },
        { value: 'neutral', weight: 0.2 },
      ],
      archetypes: [],
      pacing: [
        { value: 'medium', weight: 0.4 },
        { value: 'slow', weight: 0.6 },
      ],
      sensoryChannels: [
        { value: 'visual', weight: 0.5 },
        { value: 'tactile', weight: 0.3 },
        { value: 'atmospheric', weight: 0.2 },
      ],
      informationStyle: [
        { value: 'analytical', weight: 0.6 },
        { value: 'balanced', weight: 0.4 },
      ],
      shadowInjection: 0.1,
      explorationFactor: 0.1,
    };
    const hint = computeLiteraryToneHint(dist);
    expect(typeof hint).toBe('string');
    expect(hint.length).toBeGreaterThan(0);
    // Should mention top tone or top sensory
    expect(hint).toMatch(/controlled|strategic|visual|analytical/i);
  });

  it('handles empty distribution gracefully', () => {
    const dist: ProbabilityDistribution = {
      sceneTone: [], archetypes: [], pacing: [], sensoryChannels: [],
      informationStyle: [], shadowInjection: 0, explorationFactor: 0,
    };
    const hint = computeLiteraryToneHint(dist);
    expect(typeof hint).toBe('string');
  });
});
