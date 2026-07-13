import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { SimulationEngine } from './simulation-engine';
import { OutcomeQuality } from '@/models/simulation';
import { EventBus } from '@/lib/event-bus';

describe('SimulationEngine', () => {
  let engine: SimulationEngine;
  let mockEntityStore: { getByNameAndType: ReturnType<typeof mock> };
  let eventBus: EventBus;

  beforeEach(() => {
    mockEntityStore = { getByNameAndType: mock(() => null) };
    eventBus = new EventBus();
    engine = new SimulationEngine(mockEntityStore as any, eventBus);
  });

  const defaultContext = {
    characterLevel: 5,
    characterStats: {},
    locationDanger: 0,
    timeOfDay: 'day' as const,
    weather: 'clear',
    activeBuffs: [],
    activeDebuffs: [],
  };

  describe('simulate', () => {
    it('returns neutral for observation intents', async () => {
      const result = await engine.simulate(
        { type: 'observation', detail_level: 'brief' },
        defaultContext
      );
      expect(result.outcome).toBe(OutcomeQuality.NEUTRAL);
      expect(result.requiresRoll).toBe(false);
    });

    it('returns neutral for command intents', async () => {
      const result = await engine.simulate(
        { type: 'command', command: 'look' },
        defaultContext
      );
      expect(result.outcome).toBe(OutcomeQuality.NEUTRAL);
      expect(result.requiresRoll).toBe(false);
    });

    it('rolls for action intents', async () => {
      const result = await engine.simulate(
        { type: 'action', verb: 'attack', risk_level: 'dangerous' },
        defaultContext
      );
      expect(result.requiresRoll).toBe(true);
      expect(result.probability).toBeGreaterThan(0);
      expect(result.probability).toBeLessThan(1);
    });

    it('applies risk level modifiers', async () => {
      const safeResult = await engine.simulate(
        { type: 'action', verb: 'inspect', risk_level: 'safe' },
        defaultContext
      );
      const deadlyResult = await engine.simulate(
        { type: 'action', verb: 'attack', risk_level: 'deadly' },
        defaultContext
      );
      expect(safeResult.probability).toBeGreaterThan(deadlyResult.probability);
    });

    it('applies time of day modifiers', async () => {
      const dayResult = await engine.simulate(
        { type: 'action', verb: 'sneak' },
        { ...defaultContext, timeOfDay: 'day' }
      );
      const nightResult = await engine.simulate(
        { type: 'action', verb: 'sneak' },
        { ...defaultContext, timeOfDay: 'night' }
      );
      expect(nightResult.probability).toBeLessThan(dayResult.probability);
    });

    it('simulates dialogue with NPC', async () => {
      mockEntityStore.getByNameAndType.mockReturnValueOnce({
        uid: 'Character:Merchant',
        name: 'Merchant',
        profile: { l1: {}, l2: { personality: 'friendly' }, l3: {} },
      });

      const result = await engine.simulate(
        { type: 'dialogue', target: 'Merchant', content: 'Hello' },
        defaultContext
      );
      expect(result.outcome).toBe(OutcomeQuality.NEUTRAL);
      expect(result.requiresRoll).toBe(false);
    });
  });

  describe('outcomeFromProbability', () => {
    it('maps probabilities to outcomes correctly', () => {
      const { outcomeFromProbability } = require('@/models/simulation');
      expect(outcomeFromProbability(0.01)).toBe(OutcomeQuality.CRITICAL_FAILURE);
      expect(outcomeFromProbability(0.2)).toBe(OutcomeQuality.FAILURE);
      expect(outcomeFromProbability(0.5)).toBe(OutcomeQuality.PARTIAL_SUCCESS);
      expect(outcomeFromProbability(0.8)).toBe(OutcomeQuality.SUCCESS);
      expect(outcomeFromProbability(0.95)).toBe(OutcomeQuality.CRITICAL_SUCCESS);
    });
  });
});
