import { describe, test, expect } from 'bun:test';
import { ActorAgent } from './actor';
import { UnifiedEntityStore } from '@/store/entity-store';
import { LLMQueue } from '@/lib/llm-queue';
import { createDefaultProfile, assignNpcPsychotype, type JungianProfile } from '../jungian-profiler';

const istp: JungianProfile = {
  extraversion: { preference: 0.3, range: 0.1 }, intuition: { preference: 0.3, range: 0.1 },
  thinking: { preference: 0.8, range: 0.1 }, judging: { preference: 0.4, range: 0.1 },
  confidence: 0.8, axisConfidence: { extraversion: 0.8, intuition: 0.8, thinking: 0.8, judging: 0.8 }, source: 'default',
};

describe('ActorAgent.enrichNpcs', () => {
  const agent = new ActorAgent({} as UnifiedEntityStore, {} as LLMQueue);
  test('analytical infoStyle + ISTP → practical/blunt hint', () => {
    const out = agent.enrichNpcs([{ value: 'analytical', weight: 1 }], [{ id: 'n1', name: 'Bran', psychotype: istp }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Bran');
    expect(out[0]!.hint.toLowerCase()).toContain('practical');
  });
  test('no psychotype → neutral hint (still returns entry)', () => {
    const out = agent.enrichNpcs([{ value: 'analytical', weight: 1 }], [{ id: 'n2', name: 'Marta' }]);
    expect(out[0]!.hint.length).toBeGreaterThan(0);
  });
  test('empty NPC list → empty array', () => {
    expect(agent.enrichNpcs([{ value: 'analytical', weight: 1 }], [])).toEqual([]);
  });
});

describe('ActorAgent.recordInteraction', () => {
  const agent = new ActorAgent({} as UnifiedEntityStore, {} as LLMQueue);

  type PerceptionRow = {
    perceived: JungianProfile;
    interactionCount: number;
    interactionHistory: Array<{ ts: number; type: string; tension: number }>;
  };

  function makeStore() {
    const rows = new Map<string, PerceptionRow>();
    return {
      getNpcPerception(npcId: string, playerId: string): PerceptionRow | null {
        return rows.get(`${npcId}:${playerId}`) ?? null;
      },
      upsertNpcPerception(npcId: string, playerId: string, perceived: JungianProfile, interactionCount: number, interactionHistory: PerceptionRow['interactionHistory']): void {
        rows.set(`${npcId}:${playerId}`, { perceived, interactionCount, interactionHistory });
      },
    };
  }

  test('recomputes perceivedPlayerType after 3 interactions', () => {
    const player = createDefaultProfile();
    player.thinking.preference = 0.5;
    const npc = assignNpcPsychotype('craftsman'); // T-high
    const store = makeStore();

    for (let i = 0; i < 3; i++) {
      agent.recordInteraction('npc1', 'player1', player, npc, { type: 'dialogue', tension: 0.5 }, store);
    }

    const got = store.getNpcPerception('npc1', 'player1')!;
    expect(got.interactionCount).toBe(3);
    expect(got.interactionHistory).toHaveLength(3);
    // T-high NPC shifts perceived thinking upward from player baseline.
    expect(got.perceived.thinking.preference).toBeGreaterThan(player.thinking.preference);
  });

  test('perceived persists unchanged between recomputes (interaction 2)', () => {
    const player = createDefaultProfile();
    player.thinking.preference = 0.5;
    const npc = assignNpcPsychotype('craftsman');
    const store = makeStore();

    agent.recordInteraction('npc1', 'player1', player, npc, { type: 'dialogue', tension: 0.5 }, store);
    const first = store.getNpcPerception('npc1', 'player1')!.perceived.thinking.preference;
    agent.recordInteraction('npc1', 'player1', player, npc, { type: 'dialogue', tension: 0.5 }, store);
    const second = store.getNpcPerception('npc1', 'player1')!;

    expect(second.interactionCount).toBe(2);
    expect(second.perceived.thinking.preference).toBeCloseTo(first, 5);
  });
});
