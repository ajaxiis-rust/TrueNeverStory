import { describe, it, expect, beforeEach } from 'bun:test';
import { DeferredHookStore } from './deferred-hook-store';

describe('DeferredHookStore', () => {
  let store: DeferredHookStore;

  beforeEach(() => {
    store = new DeferredHookStore();
  });

  it('adds a hook and retrieves it', () => {
    store.add({ npcId: 'npc1', npcName: 'Beggar Boy', hookStrength: 2, sourceTurn: 5 });
    const hooks = store.getAll();
    expect(hooks).toHaveLength(1);
    expect(hooks[0]!.npcId).toBe('npc1');
    expect(hooks[0]!.used).toBe(false);
  });

  it('getEligible returns hooks after block closure', () => {
    store.add({ npcId: 'npc1', npcName: 'Beggar Boy', hookStrength: 2, sourceTurn: 5 });
    store.closeBlock(10);
    const eligible = store.getEligible();
    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.blockClosedAt).toBe(10);
  });

  it('getEligible returns empty before block closure', () => {
    store.add({ npcId: 'npc1', npcName: 'Beggar Boy', hookStrength: 2, sourceTurn: 5 });
    expect(store.getEligible()).toHaveLength(0);
  });

  it('markUsed prevents re-selection', () => {
    store.add({ npcId: 'npc1', npcName: 'Beggar Boy', hookStrength: 2, sourceTurn: 5 });
    store.closeBlock(10);
    const eligible = store.getEligible();
    store.markUsed(eligible[0]!.npcId);
    expect(store.getEligible()).toHaveLength(0);
  });

  it('respects frequency limit (max 1 per block)', () => {
    store.add({ npcId: 'npc1', npcName: 'A', hookStrength: 1, sourceTurn: 1 });
    store.add({ npcId: 'npc2', npcName: 'B', hookStrength: 2, sourceTurn: 2 });
    store.closeBlock(10);
    const eligible = store.getEligible();
    expect(eligible).toHaveLength(1); // only strongest
  });

  it('serializes and restores from JSON', () => {
    store.add({ npcId: 'npc1', npcName: 'Test', hookStrength: 2, sourceTurn: 5 });
    const json = store.toJSON();
    const restored = DeferredHookStore.fromJSON(json);
    expect(restored.getAll()).toHaveLength(1);
    expect(restored.getAll()[0]!.npcId).toBe('npc1');
  });
});
