import { describe, it, expect, mock } from 'bun:test';
import { RoleplayEngine } from './roleplay-engine';
import { EventBus } from '../lib/event-bus';
import { createDefaultProfile } from './jungian-profiler';
import type { GameContext } from './context-builder';

function createMockEntityStore() {
  return {
    getByNameAndType: mock(() => null),
    allNodes: mock(() => []),
    listByType: mock(() => []),
    getByUid: mock(() => null),
    get: mock(() => null),
    add: mock(() => {}),
    update: mock(() => {}),
    remove: mock(() => {}),
    search: mock(() => []),
    saveIfDirty: mock(() => {}),
  };
}

function createMockLLMQueue() {
  return {
    generateText: mock(() => Promise.resolve('Test narrative response')),
    generateJson: mock(() => Promise.resolve({})),
    getAgentClient: mock(() => ({
      generate: mock(() => Promise.resolve('Test narrative')),
      generateJson: mock(() => Promise.resolve({})),
    })),
  };
}

function createEngine() {
  const dbPath = '/tmp/test-world-jungian';
  const entityStore = createMockEntityStore();
  const llmQueue = createMockLLMQueue();
  const historyMgr = { add: mock(() => {}), getRecent: mock(() => []), clear: mock(() => {}) };
  const chronicler = { logEvent: mock(() => {}), getTimeline: mock(() => Promise.resolve([])) };
  const eventBus = new EventBus();

  const engine = new RoleplayEngine({
    dbPath,
    entityStore,
    llmQueue,
    historyMgr,
    worldFrame: { world_name: 'Test World', language: 'en' },
    chronicler,
    eventBus,
  } as any);

  engine.setSession({
    character: 'Hero',
    location: 'tavern',
    storyTime: new Date('2025-01-01T12:00:00Z'),
    role: 'protagonist',
  });

  return { engine, llmQueue };
}

function makeGameContext(nearbyNpcs: Array<{ name: string; uid?: string }> = []): GameContext {
  return {
    world: { name: 'Test World', calendar: {}, magic: {}, races: [], factions: [], rules: {} },
    character: { name: 'Hero', uid: 'hero-1' },
    location: { name: 'tavern', uid: 'loc-1' },
    time: new Date('2025-01-01T12:00:00Z'),
    timeOfDay: 'day',
    nearbyNpcs,
    activeQuests: [],
    recentTimeline: [],
    worldRules: [],
    playerInventory: [],
    relationshipGraph: { nodes: [], edges: [] },
    memory: {},
    weather: 'clear',
  } as unknown as GameContext;
}

describe('runEnrichmentConveyor', () => {
  it('assembles player voice with psychological context (confidence ≥ 0.3)', async () => {
    const { engine } = createEngine();
    const p = createDefaultProfile();
    p.confidence = 0.8;
    p.source = 'text';
    (engine as any).jungianProfile = p;

    const voice = await (engine as any).runEnrichmentConveyor(makeGameContext(), 'success');

    expect(voice).toContain('Player psychological context');
    expect(voice).toContain('Avoid');
  });

  it('includes fact-check notes when skeleton mentions craft/forge', async () => {
    const { engine, llmQueue } = createEngine();
    const p = createDefaultProfile();
    p.confidence = 0.8;
    p.source = 'text';
    (engine as any).jungianProfile = p;

    // Dramaturg LLM-fallback returns a skeleton mentioning forge work
    llmQueue.generateText.mockResolvedValueOnce('Alek forges a blade.');

    const voice = await (engine as any).runEnrichmentConveyor(makeGameContext(), 'success');

    expect(voice).toContain('Fact-check notes:');
    expect(voice).toContain('forges work');
  });
});
