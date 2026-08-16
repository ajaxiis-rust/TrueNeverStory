/**
 * Feedback Store — literary preference adjustment via like/dislike.
 * Learns narrow literary parameters, NOT psychotype.
 */

import { type LiteraryParam } from './literary-modulation';

const LEARNING_RATE = 0.02; // per like/dislike
const MAX_ADJUSTMENT = 0.15; // ±15%

export type FeedbackReaction = 'like' | 'dislike' | 'neutral';

export interface FeedbackEntry {
  turnId: number;
  reaction: FeedbackReaction;
  techniques: LiteraryParam[];
  timestamp: number;
}

export class FeedbackStore {
  private entries: FeedbackEntry[] = [];

  record(entry: Omit<FeedbackEntry, 'timestamp'>): void {
    this.entries.push({ ...entry, timestamp: Date.now() });
  }

  getRecent(limit: number): FeedbackEntry[] {
    return this.entries.slice(-limit);
  }

  getByTechnique(technique: LiteraryParam): FeedbackEntry[] {
    return this.entries.filter(e => e.techniques.includes(technique));
  }

  /** Consecutive dislike count for the most recent turn (1st vs 2nd dislike). */
  getConsecutiveDislikes(turnId: number): number {
    let count = 0;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.turnId !== turnId) break;
      if (e.reaction === 'dislike') count++;
      else break;
    }
    return count;
  }

  /** Accumulated parameter adjustments (±15% max) from likes/dislikes. */
  getParameterAdjustments(): Partial<Record<LiteraryParam, number>> {
    const adjustments: Partial<Record<LiteraryParam, number>> = {};

    for (const entry of this.entries) {
      const delta = entry.reaction === 'like' ? LEARNING_RATE
        : entry.reaction === 'dislike' ? -LEARNING_RATE
        : 0;
      if (delta === 0) continue;

      for (const technique of entry.techniques) {
        adjustments[technique] = Math.max(
          -MAX_ADJUSTMENT,
          Math.min(MAX_ADJUSTMENT, (adjustments[technique] ?? 0) + delta),
        );
      }
    }

    return adjustments;
  }

  toJSON(): FeedbackEntry[] {
    return this.entries;
  }

  static fromJSON(data: FeedbackEntry[]): FeedbackStore {
    const store = new FeedbackStore();
    store.entries = data.map(e => ({ ...e }));
    return store;
  }
}

// Singleton (matches getFeatureFlagManager pattern) so the route and engine share one store.
let _store: FeedbackStore | null = null;
export function getFeedbackStore(): FeedbackStore {
  if (!_store) _store = new FeedbackStore();
  return _store;
}
export function resetFeedbackStore(): void {
  _store = null;
}
