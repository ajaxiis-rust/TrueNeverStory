/**
 * Short Turn Expansion — literary enrichment of thin player turns.
 * Gated by 'short-turn-expansion-enabled' feature flag.
 */

import type { Intent } from '../models/intent';

const MAX_WORDS = 50;

export function shouldExpand(rawInput: string, intent: Intent): boolean {
  if (!rawInput || rawInput.trim().length === 0) return false;
  if (intent.type === 'dialogue') return false;
  if (intent.type === 'command') return false;

  const wordCount = rawInput.trim().split(/\s+/).length;
  return wordCount <= MAX_WORDS;
}
