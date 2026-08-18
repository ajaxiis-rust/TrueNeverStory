import { describe, test, expect } from 'bun:test';
import { ChroniclerAgent } from './chronicler-agent';
import { EventTopic } from '@/lib/event-bus';
import type { Intent } from '@/models/intent';
import type { SimulationResult } from '@/models/simulation';
import type { GameContext } from '@/services/context-builder';

// ── Mock helpers ────────────────────────────────────────────────

const makeIntent = (o: Partial<Intent> = {}): Intent =>
  ({ type: 'action', verb: 'forges', target: 'sword', ...o } as unknown as Intent);

const makeSim = (o: Partial<SimulationResult> = {}): SimulationResult =>
  ({ outcome: 'success', stateChanges: [], ...o } as unknown as SimulationResult);

const makeCtx = (o: Partial<GameContext> = {}): GameContext =>
  ({
    nearbyNpcs: [],
    location: { name: 'Tavern' },
    character: { name: 'Alek' },
    time: new Date('2026-01-01T12:00:00Z'),
    ...o,
  } as unknown as GameContext);

const makeEventBus = () => {
  const calls: [unknown, unknown, unknown][] = [];
  return {
    publishSimple: (t: unknown, d: unknown, s: unknown) => { calls.push([t, d, s]); },
    _calls: calls,
  };
};

const makeStore = (entities: Record<string, { uid: string }> = {}) => ({
  getByNameAndType: (name: string) => entities[name] ?? null,
});

// ── Tests ───────────────────────────────────────────────────────

describe('ChroniclerAgent identity', () => {
  const agent = new ChroniclerAgent(makeStore() as any, makeEventBus() as any);

  test('id is "chronicler"', () => {
    expect(agent.id).toBe('chronicler');
  });

  test('name is "Chronicler"', () => {
    expect(agent.name).toBe('Chronicler');
  });

  test('mcpTools is empty', () => {
    expect(agent.mcpTools).toEqual([]);
  });
});

describe('ChroniclerAgent.process — return value', () => {
  test('returns AgentOutput with eventLogged=true', async () => {
    const agent = new ChroniclerAgent(makeStore() as any, makeEventBus() as any);
    const result = await agent.process(makeIntent(), makeSim(), makeCtx());
    expect(result.metadata!.eventLogged).toBe(true);
  });

  test('returns stateChanges array', async () => {
    const agent = new ChroniclerAgent(makeStore() as any, makeEventBus() as any);
    const result = await agent.process(makeIntent(), makeSim(), makeCtx());
    expect(Array.isArray(result.stateChanges)).toBe(true);
  });
});

describe('ChroniclerAgent.process — EventBus publishing', () => {
  test('publishes STORY_EVENT to EventBus', async () => {
    const bus = makeEventBus();
    const agent = new ChroniclerAgent(makeStore() as any, bus as any);
    await agent.process(makeIntent(), makeSim(), makeCtx());
    expect(bus._calls.length).toBe(1);
    expect(bus._calls[0]![0]).toBe(EventTopic.STORY_EVENT);
  });

  test('publishes with source "chronicler"', async () => {
    const bus = makeEventBus();
    const agent = new ChroniclerAgent(makeStore() as any, bus as any);
    await agent.process(makeIntent(), makeSim(), makeCtx());
    expect(bus._calls[0]![2]).toBe('chronicler');
  });
});

describe('ChroniclerAgent.process — intent types → eventType', () => {
  const agent = new ChroniclerAgent(makeStore() as any, makeEventBus() as any);

  test('movement → eventType "movement"', async () => {
    const r = await agent.process(makeIntent({ type: 'movement' }), makeSim(), makeCtx());
    expect(r.metadata!.eventType).toBe('movement');
  });

  test('dialogue → eventType "dialogue"', async () => {
    const r = await agent.process(makeIntent({ type: 'dialogue', target: 'Bran' }), makeSim(), makeCtx());
    expect(r.metadata!.eventType).toBe('dialogue');
  });

  test('action → eventType "action"', async () => {
    const r = await agent.process(makeIntent({ type: 'action', verb: 'forges' }), makeSim(), makeCtx());
    expect(r.metadata!.eventType).toBe('action');
  });

  test('observation → eventType "observation"', async () => {
    const r = await agent.process(makeIntent({ type: 'observation' }), makeSim(), makeCtx());
    expect(r.metadata!.eventType).toBe('observation');
  });
});

describe('ChroniclerAgent.process — NPC memory updates', () => {
  test('action + nearby NPC in store → stateChange with episodic_memory', async () => {
    const store = makeStore({ Bran: { uid: 'char_bran' } });
    const agent = new ChroniclerAgent(store as any, makeEventBus() as any);
    const ctx = makeCtx({ nearbyNpcs: [{ name: 'Bran' }] as any });
    const r = await agent.process(makeIntent({ type: 'action', verb: 'forges' }), makeSim(), ctx);

    expect(r.stateChanges!.length).toBe(1);
    expect(r.stateChanges![0]!.entityUid).toBe('char_bran');
    expect(r.stateChanges![0]!.field).toBe('episodic_memory');
    expect(r.stateChanges![0]!.operation).toBe('add');
    expect(r.stateChanges![0]!.layer).toBe('l3');
  });

  test('action + nearby NPC NOT in store → no stateChange', async () => {
    const store = makeStore({});
    const agent = new ChroniclerAgent(store as any, makeEventBus() as any);
    const ctx = makeCtx({ nearbyNpcs: [{ name: 'Ghost' }] as any });
    const r = await agent.process(makeIntent({ type: 'action' }), makeSim(), ctx);
    expect(r.stateChanges!.length).toBe(0);
  });

  test('action + no nearby NPCs → no stateChange', async () => {
    const agent = new ChroniclerAgent(makeStore() as any, makeEventBus() as any);
    const r = await agent.process(makeIntent({ type: 'action' }), makeSim(), makeCtx({ nearbyNpcs: [] }));
    expect(r.stateChanges!.length).toBe(0);
  });

  test('dialogue + nearby NPCs → no stateChange (only action triggers memory)', async () => {
    const store = makeStore({ Bran: { uid: 'char_bran' } });
    const agent = new ChroniclerAgent(store as any, makeEventBus() as any);
    const ctx = makeCtx({ nearbyNpcs: [{ name: 'Bran' }] as any });
    const r = await agent.process(makeIntent({ type: 'dialogue' }), makeSim(), ctx);
    expect(r.stateChanges!.length).toBe(0);
  });

  test('action + 5 nearby NPCs → max 3 stateChanges (slice limit)', async () => {
    const store = makeStore({
      A: { uid: 'a' }, B: { uid: 'b' }, C: { uid: 'c' }, D: { uid: 'd' }, E: { uid: 'e' },
    });
    const agent = new ChroniclerAgent(store as any, makeEventBus() as any);
    const ctx = makeCtx({ nearbyNpcs: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }] as any });
    const r = await agent.process(makeIntent({ type: 'action' }), makeSim(), ctx);
    expect(r.stateChanges!.length).toBe(3);
  });
});
