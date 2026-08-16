import { describe, it, expect } from 'bun:test';
import { logLiterarySignals, computeLiteraryToneHint, literaryModulationCoefficients } from './literary-modulation';
import { buildPlayerVoice } from './jungian-profiler';
import type { ProbabilityDistribution, DramaturgEnrichment, VerificationResult, JungianProfile } from './jungian-profiler';

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

describe('buildPlayerVoice with literaryToneHint', () => {
  const dist: ProbabilityDistribution = {
    sceneTone: [{ value: 'controlled, strategic', weight: 1 }],
    archetypes: [],
    pacing: [{ value: 'medium', weight: 1 }],
    sensoryChannels: [{ value: 'visual', weight: 1 }],
    informationStyle: [{ value: 'analytical', weight: 1 }],
    shadowInjection: 0.1,
    explorationFactor: 0.1,
  };
  const dramaturg: DramaturgEnrichment = { archetype: 'test', filledSkeleton: 'test scene', mood: 'neutral' };
  const validator: VerificationResult = { claims: [], worldConsistency: { npcInLocation: true, itemsAvailable: true, timelineCoherent: true }, notes: [] };

  it('appends tone hint line when hint string is provided', () => {
    const voice = buildPlayerVoice(dist, dramaturg, [], validator, 'controlled, visual');
    expect(voice).toContain('Literary tone hint: controlled, visual');
  });

  it('omits tone hint when hint is not provided (backward compat)', () => {
    const voice = buildPlayerVoice(dist, dramaturg, [], validator);
    expect(voice).not.toContain('Literary tone hint:');
  });
});

describe('literaryModulationCoefficients', () => {
  it('returns coefficients within ±15% bounds', () => {
    const profile: JungianProfile = {
      extraversion: { preference: 0.7, range: 0.3 },
      intuition: { preference: 0.6, range: 0.4 },
      thinking: { preference: 0.3, range: 0.5 },
      judging: { preference: 0.8, range: 0.2 },
      confidence: 0.6,
      axisConfidence: { extraversion: 0.6, intuition: 0.6, thinking: 0.6, judging: 0.6 },
      source: 'blended',
    };
    const dist: ProbabilityDistribution = {
      sceneTone: [{ value: 'controlled', weight: 0.5 }],
      archetypes: [
        { value: 'judgment_trial', weight: 0.3 },
        { value: 'rescue', weight: 0.3 },
        { value: 'wisdom_counsel', weight: 0.4 },
      ],
      pacing: [{ value: 'medium', weight: 1 }],
      sensoryChannels: [{ value: 'visual', weight: 1 }],
      informationStyle: [{ value: 'analytical', weight: 1 }],
      shadowInjection: 0.1,
      explorationFactor: 0.1,
    };
    const coeffs = literaryModulationCoefficients(profile, dist);
    for (const [_key, val] of Object.entries(coeffs)) {
      expect(val).toBeGreaterThanOrEqual(-0.15);
      expect(val).toBeLessThanOrEqual(0.15);
    }
  });

  it('returns empty coefficients when profile confidence < 0.3', () => {
    const profile: JungianProfile = {
      extraversion: { preference: 0.5, range: 0 },
      intuition: { preference: 0.5, range: 0 },
      thinking: { preference: 0.5, range: 0 },
      judging: { preference: 0.5, range: 0 },
      confidence: 0.1,
      axisConfidence: { extraversion: 0.1, intuition: 0.1, thinking: 0.1, judging: 0.1 },
      source: 'default',
    };
    const dist: ProbabilityDistribution = {
      sceneTone: [], archetypes: [], pacing: [], sensoryChannels: [],
      informationStyle: [], shadowInjection: 0, explorationFactor: 0,
    };
    const coeffs = literaryModulationCoefficients(profile, dist);
    expect(Object.keys(coeffs)).toHaveLength(0);
  });
});
