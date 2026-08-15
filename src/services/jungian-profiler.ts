import type { AxisSignals } from './metrics-collector';

export interface AxisProfile {
  preference: number;
  range: number;
}

export interface AxisConfidence {
  extraversion: number;
  intuition: number;
  thinking: number;
  judging: number;
}

export interface JungianProfile {
  extraversion: AxisProfile;
  intuition: AxisProfile;
  thinking: AxisProfile;
  judging: AxisProfile;
  confidence: number;
  axisConfidence: AxisConfidence;
  source: 'text' | 'metrics' | 'blended' | 'default';
}

export function createDefaultProfile(): JungianProfile {
  const axis: AxisProfile = { preference: 0.5, range: 0.1 };
  return {
    extraversion: { ...axis },
    intuition: { ...axis },
    thinking: { ...axis },
    judging: { ...axis },
    confidence: 0,
    axisConfidence: { extraversion: 0, intuition: 0, thinking: 0, judging: 0 },
    source: 'default',
  };
}

export function deriveType(profile: JungianProfile): string {
  const e = profile.extraversion.preference > 0.55 ? 'E' : profile.extraversion.preference < 0.45 ? 'I' : 'X';
  const n = profile.intuition.preference > 0.55 ? 'N' : profile.intuition.preference < 0.45 ? 'S' : 'X';
  const t = profile.thinking.preference > 0.55 ? 'T' : profile.thinking.preference < 0.45 ? 'F' : 'X';
  const j = profile.judging.preference > 0.55 ? 'J' : profile.judging.preference < 0.45 ? 'P' : 'X';
  return `${e}${n}${t}${j}`;
}

export function averageRange(profile: JungianProfile): number {
  return (profile.extraversion.range + profile.intuition.range +
          profile.thinking.range + profile.judging.range) / 4;
}

export function axisClarity(profile: JungianProfile): number {
  const axes = [profile.extraversion.preference, profile.intuition.preference,
                profile.thinking.preference, profile.judging.preference];
  return axes.reduce((sum, x) => sum + Math.abs(x - 0.5) * 2, 0) / 4;
}

export const BLEND_CONFIG = {
  emaAlpha: 0.25,
  maxShiftPerTurn: 0.10,
  rangeGrowthThreshold: 0.3,
  rangeDecayRate: 0.005,
  minTurnsForBlend: 20,
};

export function updateAxis(
  current: AxisProfile,
  signal: number,
  recentSignals: number[],
): AxisProfile {
  const ema = current.preference * (1 - BLEND_CONFIG.emaAlpha) + signal * BLEND_CONFIG.emaAlpha;
  const delta = ema - current.preference;
  const clamped = current.preference + Math.sign(delta) * Math.min(Math.abs(delta), BLEND_CONFIG.maxShiftPerTurn);

  const rollingAvg = recentSignals.length > 0
    ? recentSignals.reduce((a, b) => a + b, 0) / recentSignals.length
    : current.preference;
  const deviation = Math.abs(signal - rollingAvg);
  const rangeDelta = deviation > BLEND_CONFIG.rangeGrowthThreshold
    ? 0.02
    : deviation > 0.15
      ? 0.01
      : -BLEND_CONFIG.rangeDecayRate;
  const newRange = Math.max(0.05, Math.min(0.95, current.range + rangeDelta));

  return {
    preference: Math.max(0.05, Math.min(0.95, clamped)),
    range: newRange,
  };
}

export function updateAxisConfidence(current: number, incoming: number, blendedPreference: number): number {
  const difference = Math.abs(incoming - blendedPreference);
  if (difference < 0.1) return Math.min(0.95, current + 0.05);
  if (difference > 0.3) return Math.max(0.3, current - 0.1);
  return current;
}

export function blendBehavioralSignals(
  signals: AxisSignals,
  profile: JungianProfile,
  recentSignals: { extraversion: number[]; intuition: number[]; thinking: number[]; judging: number[] },
): JungianProfile {
  const ex = updateAxis(profile.extraversion, signals.extraversion, recentSignals.extraversion);
  const in_ = updateAxis(profile.intuition, signals.intuition, recentSignals.intuition);
  const th = updateAxis(profile.thinking, signals.thinking, recentSignals.thinking);
  const ju = updateAxis(profile.judging, signals.judging, recentSignals.judging);

  const cEx = updateAxisConfidence(profile.axisConfidence.extraversion, signals.extraversion, ex.preference);
  const cIn = updateAxisConfidence(profile.axisConfidence.intuition, signals.intuition, in_.preference);
  const cTh = updateAxisConfidence(profile.axisConfidence.thinking, signals.thinking, th.preference);
  const cJu = updateAxisConfidence(profile.axisConfidence.judging, signals.judging, ju.preference);

  return {
    extraversion: ex, intuition: in_, thinking: th, judging: ju,
    confidence: (cEx + cIn + cTh + cJu) / 4,
    axisConfidence: { extraversion: cEx, intuition: cIn, thinking: cTh, judging: cJu },
    source: 'blended',
  };
}

export interface WeightedChoice { value: string; weight: number; }

export interface WorldState { genre?: string; socialSystem?: string; }
export interface SceneContext { mood?: string; timeOfDay?: string; }

export interface ProbabilityDistribution {
  sceneTone: WeightedChoice[];
  archetypes: WeightedChoice[];
  pacing: WeightedChoice[];
  sensoryChannels: WeightedChoice[];
  informationStyle: WeightedChoice[];
  shadowInjection: number;
  explorationFactor: number;
}

export function sample(choices: WeightedChoice[]): string {
  const r = Math.random();
  let cumulative = 0;
  for (const c of choices) { cumulative += c.weight; if (r <= cumulative) return c.value; }
  return choices[choices.length - 1]!.value;
}

function normalizeWeights(dist: ProbabilityDistribution): void {
  for (const key of ['sceneTone', 'archetypes', 'pacing', 'sensoryChannels', 'informationStyle'] as const) {
    const total = dist[key].reduce((s, c) => s + c.weight, 0);
    if (total > 0) dist[key].forEach(c => c.weight /= total);
  }
}

function uniformChoices(values: string[]): WeightedChoice[] {
  return values.map(v => ({ value: v, weight: 1 / values.length }));
}

function uniformDistribution(): ProbabilityDistribution {
  return {
    sceneTone: uniformChoices(['controlled, strategic', 'dry, precise', 'neutral', 'warm, emotional', 'chaotic']),
    archetypes: uniformChoices(['judgment_trial', 'political_intrigue', 'wisdom_counsel', 'rescue', 'random']),
    pacing: uniformChoices(['medium', 'slow', 'fast']),
    sensoryChannels: uniformChoices(['visual', 'tactile', 'atmospheric', 'auditory', 'emotional']),
    informationStyle: uniformChoices(['analytical', 'balanced', 'emotional', 'concrete']),
    shadowInjection: 0.05,
    explorationFactor: 0.05,
  };
}

function injectShadow(dist: ProbabilityDistribution, profile: JungianProfile): void {
  const rate = dist.shadowInjection;
  if (profile.thinking.preference > 0.6) {
    dist.informationStyle.push({ value: 'emotional', weight: rate });
    dist.sceneTone.push({ value: 'warm, personal', weight: rate });
  }
  if (profile.thinking.preference < 0.4) {
    dist.informationStyle.push({ value: 'analytical', weight: rate });
    dist.sceneTone.push({ value: 'dry, factual', weight: rate });
  }
  if (profile.intuition.preference > 0.6) dist.sensoryChannels.push({ value: 'concrete, tactile', weight: rate });
  if (profile.intuition.preference < 0.4) dist.sensoryChannels.push({ value: 'symbolic, metaphorical', weight: rate });
  normalizeWeights(dist);
}

function nudge(choices: WeightedChoice[], value: string, amount: number): void {
  const target = choices.find(c => c.value === value);
  if (target) target.weight += amount;
}

function applyContextNudges(dist: ProbabilityDistribution, worldState: WorldState, sceneContext: SceneContext): void {
  // genre/socialSystem → archetype bias (neutral default: no bias when fields absent)
  if (worldState.genre === 'political') nudge(dist.archetypes, 'political_intrigue', 0.1);
  else if (worldState.genre === 'horror') nudge(dist.archetypes, 'judgment_trial', 0.1);
  if (worldState.socialSystem === 'feudal') nudge(dist.archetypes, 'political_intrigue', 0.1);

  // mood/timeOfDay → tone bias (neutral default: no bias when fields absent)
  if (sceneContext.mood === 'somber') nudge(dist.sceneTone, 'dry, precise', 0.1);
  else if (sceneContext.mood === 'joyful') nudge(dist.sceneTone, 'warm, emotional', 0.1);
  if (sceneContext.timeOfDay === 'night') nudge(dist.sceneTone, 'neutral', 0.1);

  normalizeWeights(dist);
}

export function computeDistribution(profile: JungianProfile, worldState: WorldState, sceneContext: SceneContext): ProbabilityDistribution {
  if (profile.confidence < 0.3) return uniformDistribution();
  const e = profile.extraversion.preference, n = profile.intuition.preference;
  const t = profile.thinking.preference, j = profile.judging.preference;
  const dist: ProbabilityDistribution = {
    sceneTone: [
      { value: 'controlled, strategic', weight: 0.2 + t * 0.2 },
      { value: 'dry, precise', weight: 0.1 + t * 0.2 },
      { value: 'neutral', weight: 0.15 },
      { value: 'warm, emotional', weight: 0.1 + (1 - t) * 0.2 },
      { value: 'chaotic', weight: 0.05 + (1 - j) * 0.1 },
    ],
    archetypes: [
      { value: 'judgment_trial', weight: 0.15 + t * 0.2 },
      { value: 'political_intrigue', weight: 0.1 + j * 0.15 },
      { value: 'wisdom_counsel', weight: 0.1 + n * 0.1 },
      { value: 'rescue', weight: 0.1 + (1 - n) * 0.1 },
      { value: 'random', weight: 0.1 },
    ],
    pacing: [
      { value: 'medium', weight: 0.4 },
      { value: 'slow', weight: 0.2 + (1 - e) * 0.1 },
      { value: 'fast', weight: 0.2 + e * 0.1 },
    ],
    sensoryChannels: [
      { value: 'visual', weight: 0.3 },
      { value: 'tactile', weight: 0.2 + (1 - n) * 0.1 },
      { value: 'atmospheric', weight: 0.2 },
      { value: 'auditory', weight: 0.1 },
      { value: 'emotional', weight: 0.05 + (1 - t) * 0.1 },
    ],
    informationStyle: [
      { value: 'analytical', weight: 0.2 + t * 0.35 },
      { value: 'balanced', weight: 0.3 },
      { value: 'emotional', weight: 0.1 + (1 - t) * 0.15 },
      { value: 'concrete', weight: 0.1 + (1 - n) * 0.1 },
    ],
    shadowInjection: profile.confidence > 0.5 ? 0.15 : 0.05,
    explorationFactor: Math.max(0.05, averageRange(profile) * 0.3),
  };
  injectShadow(dist, profile);
  applyContextNudges(dist, worldState, sceneContext);
  return dist;
}

export interface DramaturgEnrichment { archetype: string; filledSkeleton: string; mood: string; }
export interface NpcEnrichment { npcId: string; name: string; hint: string; }
export interface VerificationResult {
  claims: Array<{ claim: string; verified: boolean; confidence: string; evidence: string[] }>;
  worldConsistency: { npcInLocation: boolean; itemsAvailable: boolean; timelineCoherent: boolean };
  notes: string[];
}

export interface CensorResult { cleaned: string; llmPolished: boolean; }

export function buildPlayerVoice(
  dist: ProbabilityDistribution,
  dramaturg: DramaturgEnrichment,
  actor: NpcEnrichment[],
  validator: VerificationResult,
): string {
  const tone = sample(dist.sceneTone);
  const pace = sample(dist.pacing);
  const sensory = dist.sensoryChannels.slice(0, 3).map(c => c.value);
  const infoStyle = sample(dist.informationStyle);

  const forbidden = dist.sceneTone
    .filter(t => t.weight < 0.08).map(t => t.value)
    .concat(['melodrama', 'emotional outburst']);

  const lines = [
    `Player psychological context:`,
    `- Prefers ${infoStyle}, structured information`,
    `- Responds to ${tone} tone (pacing: ${pace})`,
    `- Sensory focus: ${sensory.join(', ')}`,
    `- Scene archetype: ${dramaturg.archetype} (mood: ${dramaturg.mood})`,
    ...actor.map(a => `- NPC ${a.name}: ${a.hint}`),
    `- Avoid: ${forbidden.join(', ')}`,
  ];
  if (validator.notes.length > 0) {
    lines.push('', `Fact-check notes:`, ...validator.notes.map(n => `- ${n}`));
  }
  return lines.join('\n');
}

export function getMoralizingGate(profile: JungianProfile): 'strict' | 'relaxed' | 'off' {
  if (profile.thinking.preference > 0.7) return 'strict';
  if (profile.thinking.preference > 0.5) return 'relaxed';
  return 'off';
}
