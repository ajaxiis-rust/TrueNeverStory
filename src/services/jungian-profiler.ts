import type { AxisSignals } from './metrics-collector';
import type { LLMQueue } from '@/lib/llm-queue';
import { cosineSimilarity as vecCosine } from '@/lib/vector-ops';

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

export interface TextAnalysis {
  psychotype: {
    extraversion: number;
    intuition: number;
    thinking: number;
    judging: number;
    axisConfidence: { extraversion: number; intuition: number; thinking: number; judging: number };
    confidence: number;
  };
  style: {
    register: 'high' | 'medium' | 'low';
    pacing: 'slow' | 'medium' | 'fast' | 'variable';
    sensoryFocus: string[];
    sentenceProfile: { avgLength: number; complexity: 'simple' | 'moderate' | 'complex' };
  };
  themes: string[];
  suggestedArcs: string[];
  worldHints: { suggestedGenres: string[]; suggestedSocialSystem: string; suggestedTone: string };
}

export function confidenceCap(wordCount: number): number {
  return wordCount < 50 ? 0.20 : wordCount < 200 ? 0.35 : wordCount < 500 ? 0.45 : 0.55;
}

export function createDefaultTextAnalysis(): TextAnalysis {
  return {
    psychotype: {
      extraversion: 0.5, intuition: 0.5, thinking: 0.5, judging: 0.5,
      axisConfidence: { extraversion: 0, intuition: 0, thinking: 0, judging: 0 },
      confidence: 0,
    },
    style: { register: 'medium', pacing: 'medium', sensoryFocus: [], sentenceProfile: { avgLength: 15, complexity: 'moderate' } },
    themes: [], suggestedArcs: [], worldHints: { suggestedGenres: [], suggestedSocialSystem: '', suggestedTone: '' },
  };
}

export function psychotypeToProfile(psychotype: TextAnalysis['psychotype'], wordCount: number): JungianProfile {
  const axis = (v: number): AxisProfile => ({ preference: v, range: 0.1 });
  return {
    extraversion: axis(psychotype.extraversion),
    intuition: axis(psychotype.intuition),
    thinking: axis(psychotype.thinking),
    judging: axis(psychotype.judging),
    confidence: Math.min(psychotype.confidence, confidenceCap(wordCount)),
    axisConfidence: { ...psychotype.axisConfidence },
    source: 'text',
  };
}

export async function analyzeText(
  synopsis: string,
  prologue: string,
  llmQueue: LLMQueue,
): Promise<TextAnalysis> {
  if (!synopsis.trim() && !prologue.trim()) return createDefaultTextAnalysis();

  const prompt = `Analyze this character synopsis and story prologue to determine psychological preferences and style.

CHARACTER SYNOPSIS:
${synopsis}

PROLOGUE:
${prologue}

Respond as JSON ONLY, matching this exact schema:
{
  "psychotype": {
    "extraversion": 0.5,
    "intuition": 0.5,
    "thinking": 0.5,
    "judging": 0.5,
    "axisConfidence": { "extraversion": 0.5, "intuition": 0.5, "thinking": 0.5, "judging": 0.5 },
    "confidence": 0.5
  },
  "style": {
    "register": "medium",
    "pacing": "medium",
    "sensoryFocus": ["visual", "tactile"],
    "sentenceProfile": { "avgLength": 15, "complexity": "moderate" }
  },
  "themes": ["betrayal"],
  "suggestedArcs": ["fall_and_rise"],
  "worldHints": { "suggestedGenres": ["dark fantasy"], "suggestedSocialSystem": "feudal", "suggestedTone": "grim" }
}`;

  const response = await llmQueue.generateText(prompt, 1, 0.3, 'psychotype-analyzer');
  try {
    return JSON.parse(response.trim()) as TextAnalysis;
  } catch {
    return createDefaultTextAnalysis();
  }
}

const ROLE_BIAS: Record<string, { intuition: number; thinking: number; judging: number }> = {
  craftsman:  { intuition: 0.3, thinking: 0.75, judging: 0.7 },
  guard:      { intuition: 0.3, thinking: 0.6,  judging: 0.75 },
  merchant:   { intuition: 0.35, thinking: 0.7, judging: 0.6 },
  scholar:    { intuition: 0.8, thinking: 0.8,  judging: 0.55 },
  wanderer:   { intuition: 0.8, thinking: 0.3,  judging: 0.3 },
  healer:     { intuition: 0.55, thinking: 0.35, judging: 0.6 },
};

function seededJitter(seed: number): () => number {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function assignNpcPsychotype(
  role: string,
  faction?: string,
  worldSystem?: string,
  seed: number = 0,
): JungianProfile {
  const base = ROLE_BIAS[role.toLowerCase()] ?? { intuition: 0.5, thinking: 0.5, judging: 0.5 };
  const rand = seededJitter(seed + role.length);
  const jitter = () => (rand() - 0.5) * 0.2;

  let intuition = base.intuition + jitter();
  let thinking = base.thinking + jitter();
  let judging = base.judging + jitter();
  // Faction bias — keyword match over arbitrary worldFrame.factions names (design S8).
  const f = (faction ?? '').toLowerCase();
  if (/(bandit|разбой)/.test(f)) judging -= 0.15;                                    // P (perceiving)
  if (/(inquisition|инквиз)/.test(f)) judging += 0.15;                               // J (judging)
  if (/(guild|гильдия|trade|торгов)/.test(f)) { intuition -= 0.1; thinking += 0.1; } // S+T (sensing+thinking)
  if (worldSystem === 'feudalism') judging += 0.1;
  if (worldSystem === 'anarchy') judging -= 0.15;

  const clamp = (x: number) => Math.max(0.05, Math.min(0.95, x));
  return {
    extraversion: { preference: 0.5 + jitter(), range: 0.1 },
    intuition:    { preference: clamp(intuition), range: 0.1 },
    thinking:     { preference: clamp(thinking), range: 0.1 },
    judging:      { preference: clamp(judging), range: 0.1 },
    confidence: 1,
    axisConfidence: { extraversion: 0.7, intuition: 0.7, thinking: 0.7, judging: 0.7 },
    source: 'default',
  };
}

export function computePerceivedPlayerType(player: JungianProfile, npc: JungianProfile): JungianProfile {
  const shift = (p: number, n: number): number => Math.max(0.05, Math.min(0.95, p + (n - 0.5) * 0.4));
  const axis = (a: { preference: number; range: number }, n: { preference: number; range: number }) =>
    ({ preference: shift(a.preference, n.preference), range: a.range });
  return {
    extraversion: axis(player.extraversion, npc.extraversion),
    intuition: axis(player.intuition, npc.intuition),
    thinking: axis(player.thinking, npc.thinking),
    judging: axis(player.judging, npc.judging),
    confidence: player.confidence,
    axisConfidence: player.axisConfidence,
    source: player.source,
  };
}

export interface AuthorEntry {
  name: string;
  embedding: number[];        // dim = настроенный embedding-модель; не хардкодим
  psychotype: JungianProfile;
  samplePhrases: string[];    // 3-5 фраз для few-shot
  genres: string[];
}

export interface AuthorMatch {
  name: string;
  matchConfidence: number;    // cosine similarity выбранного автора (0-1)
  matchReason: string;
}

export function topNAuthors(prologueEmbedding: number[], corpus: AuthorEntry[], n = 3): AuthorEntry[] {
  const dim = prologueEmbedding.length;
  return corpus
    .filter(a => a.embedding.length === dim)   // skip dim-mismatched (корпус собран под другую модель)
    .map(a => ({ a, s: vecCosine(Float32Array.from(prologueEmbedding), Float32Array.from(a.embedding)) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, n)
    .map(x => x.a);
}

export function blendProfiles(base: JungianProfile, incoming: JungianProfile): JungianProfile {
  const blend = (a: AxisProfile, b: AxisProfile): AxisProfile => {
    const ema = a.preference * (1 - BLEND_CONFIG.emaAlpha) + b.preference * BLEND_CONFIG.emaAlpha;
    const delta = ema - a.preference;
    const clamped = a.preference + Math.sign(delta) * Math.min(Math.abs(delta), BLEND_CONFIG.maxShiftPerTurn);
    return {
      preference: Math.max(0.05, Math.min(0.95, clamped)),
      range: Math.max(a.range, b.range),
    };
  };
  const maxc = (a: number, b: number): number => Math.max(a, b);
  return {
    extraversion: blend(base.extraversion, incoming.extraversion),
    intuition: blend(base.intuition, incoming.intuition),
    thinking: blend(base.thinking, incoming.thinking),
    judging: blend(base.judging, incoming.judging),
    confidence: maxc(base.confidence, incoming.confidence),
    axisConfidence: {
      extraversion: maxc(base.axisConfidence.extraversion, incoming.axisConfidence.extraversion),
      intuition: maxc(base.axisConfidence.intuition, incoming.axisConfidence.intuition),
      thinking: maxc(base.axisConfidence.thinking, incoming.axisConfidence.thinking),
      judging: maxc(base.axisConfidence.judging, incoming.axisConfidence.judging),
    },
    source: 'blended',
  };
}
