import { describe, test, expect } from 'bun:test';
import {
  MetricsCollector,
  inferFromMetrics,
  deriveMetrics,
  type AxisSignals,
} from './metrics-collector';
import type { Intent } from '@/models/intent';
import { OutcomeQuality, type SimulationResult } from '@/models/simulation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIntent(overrides: Partial<Intent> = {}): Intent {
  return { type: 'action', verb: 'wait', ...overrides } as Intent;
}

function makeSim(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    outcome: OutcomeQuality.SUCCESS,
    probability: 0.5,
    rawRoll: 10,
    modifiers: [],
    stateChanges: [],
    narrativeHints: [],
    requiresRoll: true,
    ...overrides,
  };
}

// ─── MetricsCollector ─────────────────────────────────────────────────────────

describe('MetricsCollector', () => {
  describe('recordInput', () => {
    test('counts total characters', () => {
      const mc = new MetricsCollector();
      mc.recordInput('hello world');
      mc.recordInput('foo');
      expect(mc.getAggregates().inputTotalChars).toBe(14);
    });
  });

  describe('recordIntent — dialogue', () => {
    test('increments dialogueCount and word count', () => {
      const mc = new MetricsCollector();
      mc.recordIntent(makeIntent({ type: 'dialogue', target: 'npc', content: 'hello there friend' }), 'hello there friend');
      const agg = mc.getAggregates();
      expect(agg.dialogueCount).toBe(1);
      expect(agg.dialogueTotalWords).toBe(3);
    });

    test('increments dialogueInitiated when flag is true', () => {
      const mc = new MetricsCollector();
      mc.recordIntent(makeIntent({ type: 'dialogue', target: 'npc', content: 'hi' }), 'hi', true);
      expect(mc.getAggregates().dialogueInitiated).toBe(1);
    });

    test('does not increment dialogueInitiated when flag is false (NPC initiated)', () => {
      const mc = new MetricsCollector();
      mc.recordIntent(makeIntent({ type: 'dialogue', target: 'npc', content: 'hi' }), 'hi', false);
      expect(mc.getAggregates().dialogueInitiated).toBe(0);
    });
  });

  describe('recordIntent — action', () => {
    test('detects attack verbs', () => {
      const mc = new MetricsCollector();
      mc.recordIntent(makeIntent({ verb: 'attack' }), 'attack the goblin');
      mc.recordIntent(makeIntent({ verb: 'slash' }), 'slash at him');
      mc.recordIntent(makeIntent({ verb: 'poke' }), 'poke it');
      expect(mc.getAggregates().combatInitiated).toBe(2);
    });

    test('detects expressive verbs', () => {
      const mc = new MetricsCollector();
      mc.recordIntent(makeIntent({ verb: 'hug' }), 'hug the npc');
      mc.recordIntent(makeIntent({ verb: 'cry' }), 'cry softly');
      mc.recordIntent(makeIntent({ verb: 'punch' }), 'punch the wall');
      expect(mc.getAggregates().expressiveActions).toBe(2);
    });
  });

  describe('recordIntent — observation', () => {
    test('increments explorationActions', () => {
      const mc = new MetricsCollector();
      mc.recordIntent(makeIntent({ type: 'observation', detail_level: 'brief' }), 'look around');
      expect(mc.getAggregates().explorationActions).toBe(1);
    });
  });

  describe('recordSimulation', () => {
    test('counts risk when risk_level is dangerous', () => {
      const mc = new MetricsCollector();
      mc.recordSimulation(makeIntent({ type: 'action', risk_level: 'dangerous' }), makeSim());
      expect(mc.getAggregates().riskTakingActions).toBe(1);
    });

    test('counts risk when CRITICAL_SUCCESS', () => {
      const mc = new MetricsCollector();
      mc.recordSimulation(makeIntent({ type: 'action' }), makeSim({ outcome: OutcomeQuality.CRITICAL_SUCCESS }));
      expect(mc.getAggregates().riskTakingActions).toBe(1);
    });

    test('counts risk when CRITICAL_FAILURE', () => {
      const mc = new MetricsCollector();
      mc.recordSimulation(makeIntent({ type: 'action' }), makeSim({ outcome: OutcomeQuality.CRITICAL_FAILURE }));
      expect(mc.getAggregates().riskTakingActions).toBe(1);
    });

    test('does NOT count risk for safe actions with normal outcome', () => {
      const mc = new MetricsCollector();
      mc.recordSimulation(makeIntent({ type: 'action', risk_level: 'safe' }), makeSim());
      expect(mc.getAggregates().riskTakingActions).toBe(0);
    });

    test('does NOT count risk for non-action intents', () => {
      const mc = new MetricsCollector();
      mc.recordSimulation(makeIntent({ type: 'dialogue', target: 'npc', content: 'hi' }), makeSim({ outcome: OutcomeQuality.CRITICAL_SUCCESS }));
      expect(mc.getAggregates().riskTakingActions).toBe(0);
    });

    test('counts planning verbs', () => {
      const mc = new MetricsCollector();
      mc.recordSimulation(makeIntent({ type: 'action', verb: 'craft' }), makeSim());
      mc.recordSimulation(makeIntent({ type: 'action', verb: 'trade' }), makeSim());
      mc.recordSimulation(makeIntent({ type: 'action', verb: 'wait' }), makeSim());
      expect(mc.getAggregates().planningActions).toBe(2);
    });

    test('counts planning command-type intents via command field', () => {
      const mc = new MetricsCollector();
      mc.recordSimulation(makeIntent({ type: 'command', command: 'craft' }), makeSim());
      mc.recordSimulation(makeIntent({ type: 'command', command: 'quests' }), makeSim());
      mc.recordSimulation(makeIntent({ type: 'command', command: 'look' }), makeSim());
      // only 'craft' matches isPlanningVerb; 'quests'/'look' не входят в regex
      expect(mc.getAggregates().planningActions).toBe(1);
    });
  });

  describe('turn tracking', () => {
    test('increments turn count on each recordInput', () => {
      const mc = new MetricsCollector();
      mc.recordInput('a');
      mc.recordInput('b');
      mc.recordInput('c');
      expect(mc.getTurnCount()).toBe(3);
    });
  });

  describe('decay', () => {
    test('multiplies all numeric aggregates by 0.9', () => {
      const mc = new MetricsCollector();
      mc.recordInput('hello world'); // 11 chars
      mc.recordIntent(makeIntent({ type: 'dialogue', target: 'npc', content: 'hi there' }), 'hi there', true);
      const attackIntent = makeIntent({ type: 'action', verb: 'attack', risk_level: 'dangerous' });
      mc.recordIntent(attackIntent, 'attack the goblin');
      mc.recordSimulation(attackIntent, makeSim());
      mc.decay();
      const agg = mc.getAggregates();
      expect(agg.inputTotalChars).toBeCloseTo(11 * 0.9, 5);
      expect(agg.dialogueCount).toBeCloseTo(1 * 0.9, 5);
      expect(agg.combatInitiated).toBeCloseTo(1 * 0.9, 5);
      expect(agg.riskTakingActions).toBeCloseTo(1 * 0.9, 5);
    });

    test('decay does NOT affect turn count', () => {
      const mc = new MetricsCollector();
      mc.recordInput('a');
      mc.recordInput('b');
      mc.decay();
      expect(mc.getTurnCount()).toBe(2);
    });
  });

  describe('avoidedDialogues', () => {
    test('incremented via recordAvoidedDialogue', () => {
      const mc = new MetricsCollector();
      mc.recordAvoidedDialogue();
      mc.recordAvoidedDialogue();
      expect(mc.getAggregates().avoidedDialogues).toBe(2);
    });
  });
});

// ─── deriveMetrics ────────────────────────────────────────────────────────────

describe('deriveMetrics', () => {
  test('dialogueAvgLength = totalWords / count', () => {
    const agg = {
      dialogueInitiated: 2,
      dialogueCount: 3,
      dialogueTotalWords: 30,
      avoidedDialogues: 0,
      explorationActions: 0,
      riskTakingActions: 0,
      planningActions: 0,
      combatInitiated: 0,
      inputTotalChars: 100,
      expressiveActions: 0,
    };
    const derived = deriveMetrics(agg, 10, 5);
    expect(derived.dialogueAvgLength).toBe(10);
  });

  test('inputLengthAvg = totalChars / totalTurns', () => {
    const agg = {
      dialogueInitiated: 0,
      dialogueCount: 0,
      dialogueTotalWords: 0,
      avoidedDialogues: 0,
      explorationActions: 0,
      riskTakingActions: 0,
      planningActions: 0,
      combatInitiated: 0,
      inputTotalChars: 500,
      expressiveActions: 0,
    };
    const derived = deriveMetrics(agg, 10, 3);
    expect(derived.inputLengthAvg).toBe(50);
  });

  test('dialogueAvgLength defaults to 0 when no dialogues', () => {
    const agg = {
      dialogueInitiated: 0,
      dialogueCount: 0,
      dialogueTotalWords: 0,
      avoidedDialogues: 0,
      explorationActions: 0,
      riskTakingActions: 0,
      planningActions: 0,
      combatInitiated: 0,
      inputTotalChars: 0,
      expressiveActions: 0,
    };
    const derived = deriveMetrics(agg, 0, 0);
    expect(derived.dialogueAvgLength).toBe(0);
  });
});

// ─── inferFromMetrics ─────────────────────────────────────────────────────────

describe('inferFromMetrics', () => {
  test('returns 0.5 default for all-zero aggregates', () => {
    const m = {
      dialogueInitiated: 0,
      dialogueAvgLength: 0,
      avoidedDialogues: 0,
      explorationActions: 0,
      riskTakingActions: 0,
      planningActions: 0,
      combatInitiated: 0,
      expressiveActions: 0,
      inputLengthAvg: 0,
      uniqueLocationsVisited: 0,
    };
    const signals = inferFromMetrics(m);
    expect(signals.extraversion).toBeCloseTo(0.5, 2);
    expect(signals.intuition).toBeCloseTo(0.5, 2);
    expect(signals.thinking).toBeCloseTo(0.5, 2);
    expect(signals.judging).toBeCloseTo(0.5, 2);
  });

  test('high social activity → high extraversion', () => {
    const m = {
      dialogueInitiated: 10,
      dialogueAvgLength: 25,
      avoidedDialogues: 0,
      explorationActions: 2,
      riskTakingActions: 1,
      planningActions: 1,
      combatInitiated: 0,
      expressiveActions: 5,
      inputLengthAvg: 120,
      uniqueLocationsVisited: 3,
    };
    const signals = inferFromMetrics(m);
    expect(signals.extraversion).toBeGreaterThan(0.6);
  });

  test('high exploration + planning → high intuition', () => {
    const m = {
      dialogueInitiated: 0,
      dialogueAvgLength: 0,
      avoidedDialogues: 0,
      explorationActions: 15,
      riskTakingActions: 0,
      planningActions: 10,
      combatInitiated: 0,
      expressiveActions: 0,
      inputLengthAvg: 200,
      uniqueLocationsVisited: 15,
    };
    const signals = inferFromMetrics(m);
    expect(signals.intuition).toBeGreaterThan(0.6);
  });

  test('high combat + risk, low expressive → high thinking', () => {
    const m = {
      dialogueInitiated: 0,
      dialogueAvgLength: 0,
      avoidedDialogues: 0,
      explorationActions: 0,
      riskTakingActions: 10,
      planningActions: 5,
      combatInitiated: 10,
      expressiveActions: 0,
      inputLengthAvg: 50,
      uniqueLocationsVisited: 2,
    };
    const signals = inferFromMetrics(m);
    expect(signals.thinking).toBeGreaterThan(0.6);
  });

  test('high expressive + no combat → low thinking', () => {
    const m = {
      dialogueInitiated: 0,
      dialogueAvgLength: 0,
      avoidedDialogues: 0,
      explorationActions: 0,
      riskTakingActions: 0,
      planningActions: 0,
      combatInitiated: 0,
      expressiveActions: 10,
      inputLengthAvg: 50,
      uniqueLocationsVisited: 2,
    };
    const signals = inferFromMetrics(m);
    expect(signals.thinking).toBeLessThan(0.4);
  });

  test('signals are clamped to [0, 1]', () => {
    const m = {
      dialogueInitiated: 1000,
      dialogueAvgLength: 500,
      avoidedDialogues: 100,
      explorationActions: 1000,
      riskTakingActions: 1000,
      planningActions: 1000,
      combatInitiated: 1000,
      expressiveActions: 1000,
      inputLengthAvg: 10000,
      uniqueLocationsVisited: 1000,
    };
    const signals = inferFromMetrics(m);
    for (const v of Object.values(signals)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Integration: record → derive → infer ─────────────────────────────────────

describe('integration: full pipeline', () => {
  test('social player → high extraversion signal', () => {
    const mc = new MetricsCollector();
    // Simulate 10 dialogue turns initiated by player
    for (let i = 0; i < 10; i++) {
      mc.recordInput(`hello there npc ${i}`);
      mc.recordIntent(
        makeIntent({ type: 'dialogue', target: 'npc', content: `hello there npc ${i}` }),
        `hello there npc ${i}`,
        true,
      );
    }
    const derived = deriveMetrics(mc.getAggregates(), mc.getTurnCount(), 1);
    const signals = inferFromMetrics(derived);
    expect(signals.extraversion).toBeGreaterThan(0.6);
  });

  test('combat player → high thinking signal', () => {
    const mc = new MetricsCollector();
    for (let i = 0; i < 10; i++) {
      mc.recordInput('attack');
      mc.recordIntent(makeIntent({ verb: 'attack' }), 'attack');
      mc.recordSimulation(
        makeIntent({ type: 'action', verb: 'attack', risk_level: 'dangerous' }),
        makeSim({ outcome: OutcomeQuality.CRITICAL_SUCCESS }),
      );
    }
    const derived = deriveMetrics(mc.getAggregates(), mc.getTurnCount(), 1);
    const signals = inferFromMetrics(derived);
    expect(signals.thinking).toBeGreaterThan(0.5);
  });
});
