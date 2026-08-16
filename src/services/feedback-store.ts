/**
 * Feedback Store — literary preference adjustment via like/dislike.
 * Learns narrow literary parameters, NOT psychotype.
 */

import { type LiteraryParam } from './literary-modulation';

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
