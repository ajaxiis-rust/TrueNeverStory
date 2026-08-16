/**
 * Literary Modulation — observability and soft signal computation.
 * All features behind feature flags (default off).
 */

import type { GameContext } from './context-builder';
import type { Intent } from '../models/intent';
import type { ProbabilityDistribution, JungianProfile } from './jungian-profiler';

export interface LiterarySignals {
  turnWordCount: number;
  playerVoiceLength: number;
  authorPhrasesCount: number;
  intentType: string;
  isDialogue: boolean;
}

export function logLiterarySignals(
  ctx: { parsedInput: string },
  _gameContext: GameContext,
  intent: Intent,
  playerVoice?: string,
  authorPhrases?: string[],
): LiterarySignals {
  const words = ctx.parsedInput.trim().split(/\s+/).length;
  return {
    turnWordCount: words,
    playerVoiceLength: playerVoice?.length ?? 0,
    authorPhrasesCount: authorPhrases?.length ?? 0,
    intentType: intent.type,
    isDialogue: intent.type === 'dialogue',
  };
}

/**
 * Derive a weak literary tone hint from the probability distribution.
 * Returns 2-3 descriptors (e.g. "dense, concrete, close narration").
 * Weight is BELOW authorPhrases and playerVoice in Stylist prompt.
 */
export function computeLiteraryToneHint(dist: ProbabilityDistribution): string {
  const parts: string[] = [];

  // Top scene tone
  const topTone = dist.sceneTone.reduce(
    (best, c) => c.weight > best.weight ? c : best,
    { value: '', weight: 0 },
  );
  if (topTone.value) parts.push(topTone.value);

  // Top sensory channel
  const topSensory = dist.sensoryChannels.reduce(
    (best, c) => c.weight > best.weight ? c : best,
    { value: '', weight: 0 },
  );
  if (topSensory.value) parts.push(topSensory.value);

  // Pacing descriptor
  const topPace = dist.pacing.reduce(
    (best, c) => c.weight > best.weight ? c : best,
    { value: '', weight: 0 },
  );
  if (topPace.value) parts.push(`${topPace.value} pace`);

  return parts.length > 0 ? parts.join(', ') : 'neutral tone';
}

/**
 * Narrow literary parameters that feedback learns (NOT psychotype).
 * Single source of truth shared by FeedbackStore and expansion logic.
 */
export const LITERARY_PARAMS = [
  'npc-pressure', 'sensory-volume', 'expansion-length',
  'internal-state', 'nudge-forward', 'callback-softness',
] as const;
export type LiteraryParam = typeof LITERARY_PARAMS[number];

const MAX_COEFF = 0.15; // ±15%

/**
 * Compute small dramaturgical coefficients from behavioral signals.
 * Returns a map of archetype → adjustment (±15% max).
 * Used by Dramaturg to softly bias archetype selection.
 */
export function literaryModulationCoefficients(
  profile: JungianProfile,
  _dist: ProbabilityDistribution,
): Record<string, number> {
  if (profile.confidence < 0.3) return {};

  const e = profile.extraversion.preference;
  const n = profile.intuition.preference;

  const coeffs: Record<string, number> = {};

  // Action-oriented (high E) → bias toward judgment_trial, rescue
  const actionBias = (e - 0.5) * 0.3; // ±0.15 at extremes
  coeffs['judgment_trial'] = clamp(actionBias, -MAX_COEFF, MAX_COEFF);
  coeffs['rescue'] = clamp(actionBias * 0.8, -MAX_COEFF, MAX_COEFF);

  // Reflective (low E) → bias toward wisdom_counsel
  const reflectBias = (0.5 - e) * 0.3;
  coeffs['wisdom_counsel'] = clamp(reflectBias, -MAX_COEFF, MAX_COEFF);

  // Concrete (low N) → bias toward political_intrigue
  const concreteBias = (0.5 - n) * 0.2;
  coeffs['political_intrigue'] = clamp(concreteBias, -MAX_COEFF, MAX_COEFF);

  return coeffs;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
