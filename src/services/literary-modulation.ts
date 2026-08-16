/**
 * Literary Modulation — observability and soft signal computation.
 * All features behind feature flags (default off).
 */

import type { GameContext } from './context-builder';
import type { Intent } from '../models/intent';
import type { ProbabilityDistribution } from './jungian-profiler';

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
