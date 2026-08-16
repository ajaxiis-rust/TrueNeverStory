import { describe, it, expect, beforeEach } from 'bun:test';
import { FeedbackStore, getFeedbackStore, resetFeedbackStore } from './feedback-store';

describe('FeedbackStore', () => {
  let store: FeedbackStore;

  beforeEach(() => {
    store = new FeedbackStore();
    resetFeedbackStore();
  });

  it('records a like feedback', () => {
    store.record({ turnId: 5, reaction: 'like', techniques: ['sensory-volume', 'npc-pressure'] });
    const recent = store.getRecent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.reaction).toBe('like');
  });

  it('records dislike feedback', () => {
    store.record({ turnId: 6, reaction: 'dislike', techniques: ['expansion-length'] });
    const recent = store.getRecent(10);
    expect(recent[0]!.reaction).toBe('dislike');
  });

  it('getByTechnique filters by technique name', () => {
    store.record({ turnId: 1, reaction: 'like', techniques: ['sensory-volume'] });
    store.record({ turnId: 2, reaction: 'like', techniques: ['npc-pressure'] });
    store.record({ turnId: 3, reaction: 'like', techniques: ['sensory-volume'] });
    const sensory = store.getByTechnique('sensory-volume');
    expect(sensory).toHaveLength(2);
  });

  it('counts consecutive dislikes for 1st vs 2nd dislike distinction', () => {
    store.record({ turnId: 7, reaction: 'dislike', techniques: ['npc-pressure'] });
    expect(store.getConsecutiveDislikes(7)).toBe(1);
    store.record({ turnId: 7, reaction: 'dislike', techniques: ['npc-pressure'] });
    expect(store.getConsecutiveDislikes(7)).toBe(2);
  });

  it('serializes and restores from JSON', () => {
    store.record({ turnId: 1, reaction: 'like', techniques: ['sensory-volume'] });
    const json = store.toJSON();
    const restored = FeedbackStore.fromJSON(json);
    expect(restored.getRecent(10)).toHaveLength(1);
  });

  it('getFeedbackStore returns a shared singleton', () => {
    const a = getFeedbackStore();
    const b = getFeedbackStore();
    expect(a).toBe(b);
    a.record({ turnId: 1, reaction: 'like', techniques: ['nudge-forward'] });
    expect(b.getRecent(1)).toHaveLength(1);
  });
});
