import { describe, test, expect } from 'bun:test';
import { createDefaultProfile, deriveType, averageRange, axisClarity, BLEND_CONFIG, updateAxis, updateAxisConfidence, blendBehavioralSignals, computeDistribution, sample, buildPlayerVoice, getMoralizingGate, analyzeText, psychotypeToProfile, confidenceCap, assignNpcPsychotype, computePerceivedPlayerType, topNAuthors, blendProfiles } from './jungian-profiler';
import type { AuthorEntry } from './jungian-profiler';
import type { AxisSignals } from './metrics-collector';
import type { ProbabilityDistribution, DramaturgEnrichment, NpcEnrichment, VerificationResult, TextAnalysis } from './jungian-profiler';
import type { LLMQueue } from '@/lib/llm-queue';

describe('createDefaultProfile', () => {
  test('all axes 0.5/0.1, confidence 0, source default', () => {
    const p = createDefaultProfile();
    expect(p.extraversion).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.intuition).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.thinking).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.judging).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.confidence).toBe(0);
    expect(p.axisConfidence).toEqual({ extraversion: 0, intuition: 0, thinking: 0, judging: 0 });
    expect(p.source).toBe('default');
  });
});

describe('deriveType', () => {
  test('clear preferences map to MBTI letters', () => {
    const p = createDefaultProfile();
    p.extraversion.preference = 0.3; // I
    p.intuition.preference = 0.8;    // N
    p.thinking.preference = 0.75;    // T
    p.judging.preference = 0.7;      // J
    expect(deriveType(p)).toBe('INTJ');
  });
  test('ambivalent axes map to X', () => {
    expect(deriveType(createDefaultProfile())).toBe('XXXX');
  });
});

describe('averageRange', () => {
  test('averages 4 axes', () => {
    const p = createDefaultProfile();
    p.extraversion.range = 0.2; p.intuition.range = 0.4; p.thinking.range = 0.6; p.judging.range = 0.8;
    expect(averageRange(p)).toBeCloseTo(0.5, 5);
  });
});

describe('axisClarity', () => {
  test('0.5 everywhere → 0', () => {
    expect(axisClarity(createDefaultProfile())).toBe(0);
  });
  test('1.0 everywhere → 1', () => {
    const p = createDefaultProfile();
    p.extraversion.preference = 1; p.intuition.preference = 1; p.thinking.preference = 1; p.judging.preference = 1;
    expect(axisClarity(p)).toBeCloseTo(1, 5);
  });
});

describe('updateAxis — EMA', () => {
  test('converges to constant signal', () => {
    let axis = { preference: 0.0, range: 0.1 };
    for (let i = 0; i < 20; i++) axis = updateAxis(axis, 1.0, []);
    expect(axis.preference).toBeGreaterThan(0.9);
  });
  test('rate limit: one blend-cycle shifts ≤ maxShift', () => {
    const axis = updateAxis({ preference: 0.0, range: 0.1 }, 1.0, []);
    expect(axis.preference).toBeLessThanOrEqual(BLEND_CONFIG.maxShiftPerTurn + 1e-9);
  });
  test('range clamped to [0.05, 0.95]', () => {
    let axis = { preference: 0.5, range: 0.05 };
    for (let i = 0; i < 100; i++) axis = updateAxis(axis, 0.5, []);
    expect(axis.range).toBeGreaterThanOrEqual(0.05);
    expect(axis.range).toBeLessThanOrEqual(0.95);
  });
  test('range grows on strong deviation from rolling avg', () => {
    const recent = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const axis = updateAxis({ preference: 0.5, range: 0.1 }, 0.95, recent);
    expect(axis.range).toBeGreaterThan(0.1);
  });
  test('range decays on stability', () => {
    const recent = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const axis = updateAxis({ preference: 0.5, range: 0.5 }, 0.5, recent);
    expect(axis.range).toBeLessThan(0.5);
  });
});

describe('updateAxisConfidence', () => {
  test('confirmation (< 0.1 diff) → +0.05', () => {
    expect(updateAxisConfidence(0.5, 0.55, 0.55)).toBeCloseTo(0.55, 5);
  });
  test('contradiction (> 0.3 diff) → -0.10, floor 0.30', () => {
    expect(updateAxisConfidence(0.35, 0.9, 0.5)).toBeCloseTo(0.3, 5);
  });
  test('neutral → unchanged', () => {
    expect(updateAxisConfidence(0.5, 0.7, 0.55)).toBe(0.5);
  });
});

describe('blendBehavioralSignals', () => {
  test('updates all 4 axes, confidence = mean axisConfidence', () => {
    const profile = createDefaultProfile();
    const signals: AxisSignals = { extraversion: 0.9, intuition: 0.8, thinking: 0.75, judging: 0.7 };
    const recent = { extraversion: [0.5], intuition: [0.5], thinking: [0.5], judging: [0.5] };
    const blended = blendBehavioralSignals(signals, profile, recent);
    expect(blended.source).toBe('blended');
    expect(blended.confidence).toBeCloseTo(
      (blended.axisConfidence.extraversion + blended.axisConfidence.intuition +
       blended.axisConfidence.thinking + blended.axisConfidence.judging) / 4, 5);
  });
});

describe('computeDistribution', () => {
  test('confidence < 0.3 → uniform (equal weights)', () => {
    const p = createDefaultProfile(); // confidence 0
    const dist = computeDistribution(p, {}, {});
    const w = dist.sceneTone[0]!.weight;
    for (const c of dist.sceneTone) expect(c.weight).toBeCloseTo(w, 5);
  });
  test('weights sum to ~1.0 after normalize', () => {
    const p = createDefaultProfile();
    p.extraversion.preference = 0.2; p.intuition.preference = 0.8;
    p.thinking.preference = 0.75; p.judging.preference = 0.7; p.confidence = 0.8;
    const dist = computeDistribution(p, {}, {});
    for (const key of ['sceneTone', 'archetypes', 'pacing', 'sensoryChannels', 'informationStyle'] as const) {
      const sum = dist[key].reduce((s, c) => s + c.weight, 0);
      expect(sum).toBeCloseTo(1.0, 4);
    }
  });
  test('shadowInjection 0.15 when confidence > 0.5', () => {
    const p = createDefaultProfile(); p.confidence = 0.8;
    expect(computeDistribution(p, {}, {}).shadowInjection).toBe(0.15);
  });
  test('explorationFactor ≥ 0.05', () => {
    const p = createDefaultProfile(); p.confidence = 0.8;
    expect(computeDistribution(p, {}, {}).explorationFactor).toBeGreaterThanOrEqual(0.05);
  });
});

describe('sample', () => {
  test('returns one of the choice values', () => {
    const choices = [{ value: 'a', weight: 0.5 }, { value: 'b', weight: 0.5 }];
    expect(['a', 'b']).toContain(sample(choices));
  });
});

describe('buildPlayerVoice', () => {
  test('composes tone, pace, sensory, archetype, NPC hints, fact-check notes, avoid list', () => {
    const dist: ProbabilityDistribution = {
      sceneTone: [{ value: 'controlled, strategic', weight: 1 }],
      archetypes: [{ value: 'judgment_trial', weight: 1 }],
      pacing: [{ value: 'medium', weight: 1 }],
      sensoryChannels: [{ value: 'visual', weight: 1 }, { value: 'tactile', weight: 1 }, { value: 'atmospheric', weight: 1 }],
      informationStyle: [{ value: 'analytical', weight: 1 }],
      shadowInjection: 0.15, explorationFactor: 0.05,
    };
    const dramaturg: DramaturgEnrichment = { archetype: 'judgment_trial', filledSkeleton: 'Alek seeks Bran.', mood: 'tense' };
    const actor: NpcEnrichment[] = [{ npcId: 'n1', name: 'Bran', hint: 'Practical, blunt. Short precise sentences.' }];
    const validator: VerificationResult = {
      claims: [{ claim: 'Bran is in the tavern', verified: true, confidence: 'high', evidence: ['entity store'] }],
      worldConsistency: { npcInLocation: true, itemsAvailable: true, timelineCoherent: true },
      notes: ['Bran confirmed in Old Oak Tavern (entity store, high confidence)'],
    };
    const voice = buildPlayerVoice(dist, dramaturg, actor, validator);
    expect(voice).toContain('Player psychological context');
    expect(voice).toContain('controlled, strategic');
    expect(voice).toContain('Prefers analytical');
    expect(voice).toContain('visual, tactile, atmospheric');
    expect(voice).toContain('judgment_trial (mood: tense)');
    expect(voice).toContain('NPC Bran: Practical, blunt');
    expect(voice).toContain('Avoid');
    expect(voice).toContain('Fact-check notes:');
    expect(voice).toContain('Bran confirmed in Old Oak Tavern');
  });
  test('no NPCs → no NPC lines; no notes → empty fact-check', () => {
    const dist: ProbabilityDistribution = {
      sceneTone: [{ value: 'neutral', weight: 1 }], archetypes: [{ value: 'random', weight: 1 }],
      pacing: [{ value: 'medium', weight: 1 }], sensoryChannels: [{ value: 'visual', weight: 1 }],
      informationStyle: [{ value: 'balanced', weight: 1 }], shadowInjection: 0.05, explorationFactor: 0.05,
    };
    const dramaturg: DramaturgEnrichment = { archetype: 'random', filledSkeleton: 'x', mood: 'neutral' };
    const voice = buildPlayerVoice(dist, dramaturg, [], { claims: [], worldConsistency: { npcInLocation: false, itemsAvailable: false, timelineCoherent: false }, notes: [] });
    expect(voice).not.toContain('NPC ');
    expect(voice).not.toContain('Fact-check notes:');
  });
});

describe('getMoralizingGate', () => {
  test('thinking > 0.7 → strict', () => {
    const p = createDefaultProfile(); p.thinking.preference = 0.8;
    expect(getMoralizingGate(p)).toBe('strict');
  });
  test('0.5 < thinking ≤ 0.7 → relaxed', () => {
    const p = createDefaultProfile(); p.thinking.preference = 0.6;
    expect(getMoralizingGate(p)).toBe('relaxed');
  });
  test('thinking ≤ 0.5 → off', () => {
    const p = createDefaultProfile(); p.thinking.preference = 0.4;
    expect(getMoralizingGate(p)).toBe('off');
  });
});

const stubLlm = (json: string): LLMQueue => ({ generateText: async () => json }) as unknown as LLMQueue;

const validJson = JSON.stringify({
  psychotype: {
    extraversion: 0.3, intuition: 0.8, thinking: 0.75, judging: 0.7,
    axisConfidence: { extraversion: 0.8, intuition: 0.7, thinking: 0.8, judging: 0.7 },
    confidence: 0.9,
  },
  style: {
    register: 'medium', pacing: 'medium', sensoryFocus: ['visual', 'tactile'],
    sentenceProfile: { avgLength: 14, complexity: 'moderate' },
  },
  themes: ['betrayal', 'duty'],
  suggestedArcs: ['fall_and_rise'],
  worldHints: { suggestedGenres: ['dark fantasy'], suggestedSocialSystem: 'feudal', suggestedTone: 'grim' },
});

describe('analyzeText', () => {
  test('valid JSON → полный TextAnalysis (S5 schema)', async () => {
    const prologue = 'word '.repeat(120);
    const ta = await analyzeText('a story', prologue, stubLlm(validJson));
    expect(ta.psychotype.extraversion).toBeCloseTo(0.3, 5);
    expect(ta.psychotype.confidence).toBeCloseTo(0.9, 5);
    expect(ta.style.register).toBe('medium');
    expect(ta.themes).toContain('betrayal');
    expect(ta.worldHints.suggestedGenres).toContain('dark fantasy');
  });
  test('invalid JSON → default TextAnalysis (fallback)', async () => {
    const ta = await analyzeText('x', 'y', stubLlm('not json'));
    expect(ta.psychotype.confidence).toBe(0);
    expect(ta.themes).toEqual([]);
  });
});

describe('psychotypeToProfile', () => {
  test('маппит оси + caps confidence = min(LLM скаляр, cap(wordCount))', () => {
    const psychotype = (JSON.parse(validJson) as TextAnalysis).psychotype;
    const p = psychotypeToProfile(psychotype, 100);
    expect(p.extraversion.preference).toBeCloseTo(0.3, 5);
    expect(p.thinking.preference).toBeCloseTo(0.75, 5);
    expect(p.confidence).toBeCloseTo(0.35, 5);
    expect(p.source).toBe('text');
  });
});

describe('confidenceCap', () => {
  test('cap table: <50→0.20, <200→0.35, <500→0.45, ≥500→0.55', () => {
    expect(confidenceCap(10)).toBeCloseTo(0.20, 5);
    expect(confidenceCap(120)).toBeCloseTo(0.35, 5);
    expect(confidenceCap(300)).toBeCloseTo(0.45, 5);
    expect(confidenceCap(600)).toBeCloseTo(0.55, 5);
  });
});

describe('assignNpcPsychotype', () => {
  test('craftsman → S+J (thinking high, judging high, intuition low)', () => {
    const p = assignNpcPsychotype('craftsman');
    expect(p.thinking.preference).toBeGreaterThan(0.6);
    expect(p.judging.preference).toBeGreaterThan(0.6);
    expect(p.intuition.preference).toBeLessThan(0.5);
  });
  test('wanderer → N+F+P (intuition high, thinking low, judging low)', () => {
    const p = assignNpcPsychotype('wanderer');
    expect(p.intuition.preference).toBeGreaterThan(0.6);
    expect(p.thinking.preference).toBeLessThan(0.5);
    expect(p.judging.preference).toBeLessThan(0.5);
  });
  test('deterministic with same seed', () => {
    expect(assignNpcPsychotype('guard', undefined, undefined, 42)).toEqual(assignNpcPsychotype('guard', undefined, undefined, 42));
  });
  test('anarchy world → P bias (judging lowered)', () => {
    const feudal = assignNpcPsychotype('craftsman', undefined, 'feudalism');
    const anarchy = assignNpcPsychotype('craftsman', undefined, 'anarchy');
    expect(anarchy.judging.preference).toBeLessThan(feudal.judging.preference);
  });
});

describe('computePerceivedPlayerType', () => {
  test('ISTP smith sees INTJ player as colder (thinking shifted +)', () => {
    const player = createDefaultProfile();
    player.thinking.preference = 0.75; player.extraversion.preference = 0.3;
    const npc = assignNpcPsychotype('craftsman'); // T-high
    const perceived = computePerceivedPlayerType(player, npc);
    expect(perceived.thinking.preference).toBeGreaterThan(player.thinking.preference);
  });
});

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

describe('blendProfiles', () => {
  test('EMA-shifts preference toward incoming, rate-limited by maxShiftPerTurn', () => {
    const base = createDefaultProfile();
    const incoming = createDefaultProfile();
    incoming.extraversion.preference = 0.9;
    const blended = blendProfiles(base, incoming);
    expect(blended.extraversion.preference).toBeCloseTo(0.5 + BLEND_CONFIG.maxShiftPerTurn, 5);
    expect(blended.source).toBe('blended');
  });
  test('range = max of both, confidence = max of both', () => {
    const base = createDefaultProfile();
    base.extraversion.range = 0.2; base.confidence = 0.4;
    const incoming = createDefaultProfile();
    incoming.extraversion.range = 0.6; incoming.confidence = 0.7;
    const blended = blendProfiles(base, incoming);
    expect(blended.extraversion.range).toBe(0.6);
    expect(blended.confidence).toBe(0.7);
  });
});
