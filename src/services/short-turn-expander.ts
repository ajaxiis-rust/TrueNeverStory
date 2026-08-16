/**
 * Short Turn Expansion — literary enrichment of thin player turns.
 * Gated by 'short-turn-expansion-enabled' feature flag.
 */

import type { Intent } from '../models/intent';
import type { GameContext } from './context-builder';
import type { SimulationResult } from '../models/simulation';

const MAX_WORDS = 50;

export function shouldExpand(rawInput: string, intent: Intent): boolean {
  if (!rawInput || rawInput.trim().length === 0) return false;
  if (intent.type === 'dialogue') return false;
  if (intent.type === 'command') return false;

  const wordCount = rawInput.trim().split(/\s+/).length;
  return wordCount <= MAX_WORDS;
}

const REFUSAL_VERBS = /ignore|ignored|refuse|refused|walked past|walked away|turned away|left|abandoned|dismissed|shook off|pulled away|broke away|freed/i;

export type ChargeLevel = 'none' | 'low' | 'medium' | 'high';

/** True if the player explicitly refuses/breaks off contact in this turn. */
export function detectRefusal(rawInput: string): boolean {
  return REFUSAL_VERBS.test(rawInput);
}

export function analyzeCharge(
  rawInput: string,
  _simResult: SimulationResult,
  gameContext: GameContext,
): ChargeLevel {
  if (!rawInput || rawInput.trim().length === 0) return 'none';

  const npcs = gameContext?.nearbyNpcs ?? [];
  const lower = rawInput.toLowerCase();
  // Mention detection is name-driven (robust to any NPC name), not a hardcoded word list.
  const mentionsNpc = npcs.some(n => n.name && lower.includes(n.name.toLowerCase()));
  const hasRefusal = detectRefusal(rawInput);

  if (mentionsNpc && hasRefusal) return 'high';
  if (mentionsNpc) return 'medium';
  if (npcs.length > 0) return 'medium';
  return 'low';
}
