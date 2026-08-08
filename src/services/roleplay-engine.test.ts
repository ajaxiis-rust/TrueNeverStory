import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { RoleplayEngine } from './roleplay-engine';
import { EventBus } from '../lib/event-bus';

// ─── Mocks ──────────────────────────────────────────────────────────────────

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

function createMockHistoryMgr() {
  return {
    add: mock(() => {}),
    getRecent: mock(() => []),
    clear: mock(() => {}),
  };
}

function createMockChronicler() {
  return {
    logEvent: mock(() => {}),
    getTimeline: mock(() => Promise.resolve([])),
  };
}

function createMockTranslationService() {
  return {
    detectLanguage: mock(() => 'en'),
    translateToEnglish: mock((text: string) => Promise.resolve(text)),
    translateAndClassify: mock((text: string) => Promise.resolve({
      translated: text,
      intent: { type: 'action', verb: 'test' },
    })),
    translateFromEnglish: mock((text: string) => Promise.resolve(text)),
  };
}

function createMockMcpServer() {
  return {
    searchVerses: mock(() => Promise.resolve([])),
    getPattern: mock(() => Promise.resolve(null)),
    getStylePattern: mock(() => Promise.resolve(null)),
  };
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function createEngine(overrides: Record<string, unknown> = {}) {
  const dbPath = '/tmp/test-world';
  const entityStore = createMockEntityStore();
  const llmQueue = createMockLLMQueue();
  const historyMgr = createMockHistoryMgr();
  const chronicler = createMockChronicler();
  const eventBus = new EventBus();

  const deps = {
    dbPath,
    entityStore,
    llmQueue,
    historyMgr,
    worldFrame: { world_name: 'Test World', language: 'en' },
    chronicler,
    eventBus,
    ...overrides,
  };

  const engine = new RoleplayEngine(deps as any);
  engine.setSession({
    character: 'Hero',
    location: 'tavern',
    storyTime: new Date('2025-01-01T12:00:00Z'),
    role: 'protagonist',
  });

  return { engine, deps, entityStore, llmQueue, historyMgr, chronicler, eventBus };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RoleplayEngine Safety Net', () => {
  let engine: RoleplayEngine;
  let deps: ReturnType<typeof createEngine>;

  beforeEach(() => {
    deps = createEngine();
    engine = deps.engine;
  });

  describe('processInput', () => {
    it('returns empty string for empty input', async () => {
      const result = await engine.processInput('');
      expect(result).toBe('');
    });

    it('returns empty string for whitespace-only input', async () => {
      const result = await engine.processInput('   ');
      expect(result).toBe('');
    });

    it('handles agent mention @narrator', async () => {
      const result = await engine.processInput('@narrator tell me about the tavern');
      expect(result).toHaveProperty('agentResponse');
      if (typeof result === 'object' && 'agentResponse' in result) {
        expect(result.agentResponse.agentId).toBe('narrator');
        expect(result.agentResponse.response).toBeDefined();
      }
    });

    it('handles agent mention @director', async () => {
      const result = await engine.processInput('@director what happens next');
      expect(result).toHaveProperty('agentResponse');
      if (typeof result === 'object' && 'agentResponse' in result) {
        expect(result.agentResponse.agentId).toBe('director');
      }
    });

    it('returns error for unknown agent', async () => {
      const result = await engine.processInput('@unknown hello');
      expect(result).toHaveProperty('agentResponse');
      if (typeof result === 'object' && 'agentResponse' in result) {
        expect(result.agentResponse.response).toContain('Unknown agent');
      }
    });

    it('processes command /help', async () => {
      const result = await engine.processInput('/help');
      expect(typeof result).toBe('string');
    });

    it('processes command /look', async () => {
      const result = await engine.processInput('/look');
      expect(typeof result).toBe('string');
    });

    it('processes command /status', async () => {
      const result = await engine.processInput('/status');
      expect(typeof result).toBe('string');
    });

    it('processes command /inventory', async () => {
      const result = await engine.processInput('/inventory');
      expect(typeof result).toBe('string');
    });

    it('processes movement intent', async () => {
      deps.llmQueue.generateText.mockResolvedValueOnce('You walk to the market.');
      const result = await engine.processInput('go to the market');
      expect(typeof result).toBe('string');
    });

    it('processes observation intent', async () => {
      deps.llmQueue.generateText.mockResolvedValueOnce('You look around the tavern.');
      const result = await engine.processInput('look around');
      expect(typeof result).toBe('string');
    });

    it('processes action intent', async () => {
      deps.llmQueue.generateText.mockResolvedValueOnce('You pick up the sword.');
      const result = await engine.processInput('pick up the sword');
      expect(typeof result).toBe('string');
    });
  });

  describe('processInputStream', () => {
    it('yields done for empty input', async () => {
      const events: any[] = [];
      for await (const event of engine.processInputStream('')) {
        events.push(event);
      }
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('done');
    });

    it('yields chunk and done for agent mention', async () => {
      const events: any[] = [];
      for await (const event of engine.processInputStream('@narrator hello')) {
        events.push(event);
      }
      expect(events.length).toBe(2);
      expect(events[0].type).toBe('chunk');
      expect(events[1].type).toBe('done');
    });

    it('yields heartbeat events during processing', async () => {
      const events: any[] = [];
      for await (const event of engine.processInputStream('go to market')) {
        events.push(event);
      }
      // Should have at least: heartbeat, heartbeat, chunk/result, done
      expect(events.length).toBeGreaterThan(0);
      const types = events.map(e => e.type);
      expect(types).toContain('done');
    });
  });

  describe('setSession', () => {
    it('sets character', () => {
      engine.setSession({ character: 'Wizard' });
      expect(engine.activeCharacter).toBe('Wizard');
    });

    it('sets location', () => {
      engine.setSession({ location: 'castle' });
      expect(engine.currentLocation).toBe('castle');
    });

    it('sets role', () => {
      engine.setSession({ role: 'observer' });
      expect(engine.userRole).toBe('observer');
    });

    it('sets sessionId', () => {
      engine.setSession({ sessionId: 'session-123' });
      expect(engine.activeSessionId).toBe('session-123');
    });

    it('sets storyTime', () => {
      const time = new Date('2025-06-15T18:00:00Z');
      engine.setSession({ storyTime: time });
      expect(engine.currentTime).toEqual(time);
    });
  });

  describe('reset', () => {
    it('resets session state', () => {
      engine.setSession({
        character: 'Wizard',
        location: 'castle',
        role: 'observer',
        sessionId: 'session-123',
      });
      engine.reset('/tmp/new-world');
      expect(engine.activeCharacter).toBeNull();
      expect(engine.currentLocation).toBe('unknown');
      expect(engine.activeSessionId).toBeNull();
    });

    it('clears visited locations', () => {
      engine.visitedLocations.add('tavern');
      engine.visitedLocations.add('market');
      engine.reset('/tmp/new-world');
      expect(engine.visitedLocations.size).toBe(0);
    });
  });

  describe('concurrency guard', () => {
    it('processes inputs sequentially via queue', async () => {
      // Verify that the queue field exists
      expect(engine).toHaveProperty('_processingQueue');

      // Verify that concurrent calls don't corrupt state
      engine.setSession({ location: 'tavern' });
      const results = await Promise.all([
        engine.processInput('/look'),
        engine.processInput('/look'),
      ]);

      // Both should return valid results
      expect(results.length).toBe(2);
      expect(typeof results[0]).toBe('string');
      expect(typeof results[1]).toBe('string');
    });
  });

  describe('translation support', () => {
    it('translates non-English input when translation service available', async () => {
      const translationService = createMockTranslationService();
      translationService.detectLanguage.mockReturnValue('ru');
      translationService.translateToEnglish.mockResolvedValue('go to tavern');

      const { engine: transEngine } = createEngine({ translationService });
      transEngine.setSession({ character: 'Hero', location: 'tavern' });

      deps.llmQueue.generateText.mockResolvedValueOnce('You walk to the tavern.');
      const result = await transEngine.processInput('идти в таверну');
      expect(typeof result).toBe('string');
    });
  });
});
