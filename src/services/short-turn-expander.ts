/**
 * Short Turn Expansion — literary enrichment of thin player turns.
 * Gated by 'short-turn-expansion-enabled' feature flag.
 */

import type { Intent } from '../models/intent';
import type { GameContext } from './context-builder';
import type { SimulationResult } from '../models/simulation';
import type { LLMQueue } from '../lib/llm-queue';

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

const EXPANSION_SYSTEM = `You are a literary narrator. The player wrote a short turn in an interactive story.
Continue the scene from the player's last sentence (~2-3 paragraphs, ~100-150 words).

HARD RULES:
- NEVER change or restate the player's decision or action. It is already written.
- NEVER attribute feelings or motives the player didn't write.
- Add world/NPC reactions, sensory details, physical microdetails.
- Preserve the player's "I" voice. External details go in the same narrative flow.
- If the player refused/ignored an NPC, the NPC may react (grab, call out, appear).
- No moralizing. No summary. No modern slang.
- Write in the same language as the input.`;

export async function expand(
  rawInput: string,
  simResult: SimulationResult,
  gameContext: GameContext,
  playerVoice: string | undefined,
  authorPhrases: string[] | undefined,
  llmQueue: LLMQueue,
): Promise<string> {
  const parts = [
    `Player turn (already shown, do NOT repeat or alter it):\n${rawInput}`,
    `\nOutcome: ${simResult.outcome}`,
  ];
  if (simResult.narrativeHints?.length) {
    parts.push(`\nSimulation hints: ${simResult.narrativeHints.join('; ')}`);
  }
  parts.push(`Location: ${gameContext.location?.name ?? 'unknown'}`);
  if (playerVoice) parts.push(`\nPlayer voice notes:\n${playerVoice}`);
  if (authorPhrases && authorPhrases.length > 0) {
    parts.push(`\nAuthor style examples:\n${authorPhrases.map((p, i) => `  ${i + 1}) ${p}`).join('\n')}`);
  }
  parts.push('\nContinue from the player\'s last sentence. Add world/NPC reactions and sensory detail. Do not restate the player\'s sentences.');

  const prompt = parts.join('\n');
  const continuation = await llmQueue.generateText(
    `${EXPANSION_SYSTEM}\n\n${prompt}`,
    2, // TaskPriority.HIGH (enum range 0-3)
    0.7,
    'short-turn-expander',
  );
  // Player decision is inviolable: keep the raw turn verbatim, append the enrichment.
  return `${rawInput}\n\n${continuation}`.trim();
}

const MAX_REFUSALS = 2;

export class RefusalTracker {
  private refusals = new Map<string, number>();

  recordRefusal(sceneId: string): void {
    this.refusals.set(sceneId, (this.refusals.get(sceneId) ?? 0) + 1);
  }

  shouldSuppress(sceneId: string): boolean {
    return (this.refusals.get(sceneId) ?? 0) >= MAX_REFUSALS;
  }

  resetScene(sceneId: string): void {
    this.refusals.delete(sceneId);
  }
}
