import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { StateMutator } from './state-mutator';
import { EventBus } from '@/lib/event-bus';
import { StateChange } from '@/models/simulation';

describe('StateMutator', () => {
  let mutator: StateMutator;
  let mockEntityStore: { get: ReturnType<typeof mock>; saveIfDirty: ReturnType<typeof mock> };
  let mockChronicler: { logEvent: ReturnType<typeof mock> };
  let eventBus: EventBus;

  beforeEach(() => {
    mockEntityStore = {
      get: mock(() => ({
        uid: 'Character:Hero',
        name: 'Hero',
        entityType: 'Character',
        profile: {
          l1: { name: 'Hero', type: 'Character' },
          l2: { health: 100, gold: 50 },
          l3: {},
        },
      })),
      saveIfDirty: mock(() => {}),
    };
    mockChronicler = { logEvent: mock(() => Promise.resolve('log-id')) };
    eventBus = new EventBus();
    mutator = new StateMutator(mockEntityStore as any, eventBus, mockChronicler as any);
  });

  describe('applyChanges', () => {
    it('applies set operations', async () => {
      const changes: StateChange[] = [{
        entityUid: 'Character:Hero',
        layer: 'l2',
        field: 'location',
        operation: 'set',
        value: 'tavern',
        description: 'Move to tavern',
      }];

      const result = await mutator.applyChanges(changes);
      expect(result.applied.length).toBe(1);
      expect(result.applied[0]!.newValue).toBe('tavern');
      expect(mockEntityStore.saveIfDirty).toHaveBeenCalled();
    });

    it('applies increment operations', async () => {
      const changes: StateChange[] = [{
        entityUid: 'Character:Hero',
        layer: 'l2',
        field: 'gold',
        operation: 'increment',
        value: 10,
        description: 'Gain 10 gold',
      }];

      const result = await mutator.applyChanges(changes);
      expect(result.applied.length).toBe(1);
      expect(result.applied[0]!.newValue).toBe(60);
    });

    it('applies decrement operations', async () => {
      const changes: StateChange[] = [{
        entityUid: 'Character:Hero',
        layer: 'l2',
        field: 'health',
        operation: 'decrement',
        value: 25,
        description: 'Take 25 damage',
      }];

      const result = await mutator.applyChanges(changes);
      expect(result.applied.length).toBe(1);
      expect(result.applied[0]!.newValue).toBe(75);
    });

    it('skips non-existent entities', async () => {
      mockEntityStore.get.mockReturnValueOnce(null);

      const changes: StateChange[] = [{
        entityUid: 'Character:Nonexistent',
        layer: 'l2',
        field: 'health',
        operation: 'set',
        value: 100,
        description: 'Set health',
      }];

      const result = await mutator.applyChanges(changes);
      expect(result.applied.length).toBe(0);
    });

    it('publishes entity update events', async () => {
      let eventPublished = false;
      eventBus.subscribe('entity.updated' as any, async () => {
        eventPublished = true;
      });

      const changes: StateChange[] = [{
        entityUid: 'Character:Hero',
        layer: 'l2',
        field: 'gold',
        operation: 'set',
        value: 100,
        description: 'Set gold',
      }];

      await mutator.applyChanges(changes);
      expect(eventPublished).toBe(true);
    });

    it('logs to chronicler', async () => {
      const changes: StateChange[] = [{
        entityUid: 'Character:Hero',
        layer: 'l2',
        field: 'gold',
        operation: 'set',
        value: 100,
        description: 'Set gold',
      }];

      await mutator.applyChanges(changes);
      expect(mockChronicler.logEvent).toHaveBeenCalled();
    });
  });
});
