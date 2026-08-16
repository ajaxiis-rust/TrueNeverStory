/**
 * Literary Modulation — observability and soft signal computation.
 * All features behind feature flags (default off).
 */

import type { GameContext } from './context-builder';
import type { Intent } from '../models/intent';

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
