import { describe, test, expect, beforeEach } from 'bun:test';
import { ChroniclerAgent } from './chronicler-agent';
import type { Intent } from '@/models/intent';
import type { SimulationResult } from '@/models/simulation';
import type { GameContext } from '@/services/context-builder';
import type { UnifiedEntityStore } from '@/store/entity-store';
import { EventTopic } from '@/lib/event-bus';
import { OutcomeQuality } from '@/models/simulation';

const makeIntent = (overrides: Partial<Intent> = {}): Intent =>
  ({ type: 'action', verb: 'forge', target: 'sword', ...overrides }) as Intent;

const makeSimulation = (overrides: Partial<SimulationResult> = {}): SimulationResult =>
  ({
    outcome: OutcomeQuality.SUCCESS,
    probability: 0.7,
    rawRoll: 15,
    modifiers: [],
    stateChanges: [],
    narrativeHints: [],
    requiresRoll: true,
    ...overrides,
  }) as SimulationResult;

const makeContext = (overrides: Partial<GameContext> = {}): GameContext =>
  ({
    character: { name: 'Alek', uid: 'char-1' },
    location: { name: 'Forge', uid: 'loc-1' },
    time: new Date('2026-01-01T12:00:00Z'),
    nearbyNpcs: [],
    ...overrides,
  }) as unknown as GameContext;

describe('ChroniclerAgent', () => {
  let agent: ChroniclerAgent;
  let mockEntityStore: UnifiedEntityStore;
  let publishedEvents: Array<{ topic: EventTopic; payload: Record<string, unknown>; source: string }>;

  beforeEach(() => {
    publishedEvents = [];
    mockEntityStore = {
      getByNameAndType: () => undefined,
    } as unknown as UnifiedEntityStore;

    const mockEventBus = {
      publishSimple: (topic: EventTopic, payload: Record<string, unknown>, source: string) => {
        publishedEvents.push({ topic, payload, source });
      },
    };

    agent = new ChroniclerAgent(mockEntityStore, mockEventBus as never);
  });

  test('has correct id and name', () => {
    expect(agent.id).toBe('chronicler');
    expect(agent.name).toBe('Chronicler');
  });

  test('process returns AgentOutput with metadata', async () => {
    const result = await agent.process(
      makeIntent(),
      makeSimulation(),
      makeContext(),
    );
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.eventLogged).toBe(true);
    expect(result.metadata!.eventType).toBe('action');
    expect(Array.isArray(result.stateChanges)).toBe(true);
  });

  test('publishes STORY_EVENT to eventBus', async () => {
    await agent.process(
      makeIntent({ type: 'action', verb: 'forge', target: 'sword' }),
      makeSimulation(),
      makeContext(),
    );
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]!.topic).toBe(EventTopic.STORY_EVENT);
    expect(publishedEvents[0]!.source).toBe('chronicler');
    expect(publishedEvents[0]!.payload.type).toBe('action');
    expect(publishedEvents[0]!.payload.outcome).toBe(OutcomeQuality.SUCCESS);
    expect(publishedEvents[0]!.payload.location).toBe('Forge');
    expect(publishedEvents[0]!.payload.character).toBe('Alek');
  });

  test('movement intent → eventType "movement"', async () => {
    const result = await agent.process(
      makeIntent({ type: 'movement', destination: 'Tavern' }),
      makeSimulation(),
      makeContext(),
    );
    expect(result.metadata!.eventType).toBe('movement');
  });

  test('dialogue intent → eventType "dialogue"', async () => {
    const result = await agent.process(
      makeIntent({ type: 'dialogue', target: 'Bran', content: 'Hello' }),
      makeSimulation(),
      makeContext(),
    );
    expect(result.metadata!.eventType).toBe('dialogue');
  });

  test('observation intent → eventType "observation"', async () => {
    const result = await agent.process(
      makeIntent({ type: 'observation', detail_level: 'brief' }),
      makeSimulation(),
      makeContext(),
    );
    expect(result.metadata!.eventType).toBe('observation');
  });

  test('nearby NPCs with action intent → entityStore queried + stateChanges returned', async () => {
    const npcEntity = { uid: 'npc-1', name: 'Bran' };
    mockEntityStore = {
      getByNameAndType: (name: string, type: string) => {
        if (name === 'Bran' && type === 'Character') return npcEntity as never;
        return undefined;
      },
    } as unknown as UnifiedEntityStore;

    const mockEventBus = { publishSimple: () => {} };
    agent = new ChroniclerAgent(mockEntityStore, mockEventBus as never);

    const ctx = makeContext({
      nearbyNpcs: [{ name: 'Bran', uid: 'npc-1' }] as never,
    });

    const result = await agent.process(
      makeIntent({ type: 'action', verb: 'forge', target: 'sword' }),
      makeSimulation(),
      ctx,
    );
    expect(result.stateChanges).toHaveLength(1);
    expect(result.stateChanges![0]!.entityUid).toBe('npc-1');
    expect(result.stateChanges![0]!.field).toBe('episodic_memory');
    expect(result.stateChanges![0]!.description).toContain('Bran');
  });

  test('nearby NPC not in store → skipped (no stateChange)', async () => {
    mockEntityStore = {
      getByNameAndType: () => undefined,
    } as unknown as UnifiedEntityStore;

    const mockEventBus = { publishSimple: () => {} };
    agent = new ChroniclerAgent(mockEntityStore, mockEventBus as never);

    const ctx = makeContext({
      nearbyNpcs: [{ name: 'Ghost', uid: 'npc-ghost' }] as never,
    });

    const result = await agent.process(
      makeIntent({ type: 'action', verb: 'look', target: 'around' }),
      makeSimulation(),
      ctx,
    );
    expect(result.stateChanges).toHaveLength(0);
  });

  test('non-action intent with nearby NPCs → no stateChanges', async () => {
    mockEntityStore = {
      getByNameAndType: () => ({ uid: 'npc-1', name: 'Bran' }),
    } as unknown as UnifiedEntityStore;

    const mockEventBus = { publishSimple: () => {} };
    agent = new ChroniclerAgent(mockEntityStore, mockEventBus as never);

    const ctx = makeContext({
      nearbyNpcs: [{ name: 'Bran', uid: 'npc-1' }] as never,
    });

    const result = await agent.process(
      makeIntent({ type: 'movement', destination: 'Tavern' }),
      makeSimulation(),
      ctx,
    );
    expect(result.stateChanges).toHaveLength(0);
  });

  test('graceful with null character/location', async () => {
    const ctx = makeContext({
      character: null,
      location: null,
      nearbyNpcs: [],
    });

    const result = await agent.process(
      makeIntent({ type: 'action', verb: 'look' }),
      makeSimulation(),
      ctx,
    );
    expect(result.metadata?.eventLogged).toBe(true);
    expect(publishedEvents[0]!.payload.character).toBeUndefined();
    expect(publishedEvents[0]!.payload.location).toBeUndefined();
  });

  test('only first 3 nearby NPCs are processed', async () => {
    let callCount = 0;
    mockEntityStore = {
      getByNameAndType: () => {
        callCount++;
        return { uid: `npc-${callCount}`, name: `NPC${callCount}` };
      },
    } as unknown as UnifiedEntityStore;

    const mockEventBus = { publishSimple: () => {} };
    agent = new ChroniclerAgent(mockEntityStore, mockEventBus as never);

    const npcs = [1, 2, 3, 4, 5].map(i => ({ name: `NPC${i}`, uid: `npc-${i}` }));
    const ctx = makeContext({ nearbyNpcs: npcs as never });

    const result = await agent.process(
      makeIntent({ type: 'action', verb: 'shout' }),
      makeSimulation(),
      ctx,
    );
    expect(result.stateChanges).toHaveLength(3);
  });
});
