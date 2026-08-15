import { describe, test, expect } from 'bun:test';
import { ActorAgent } from './actor';
import { UnifiedEntityStore } from '@/store/entity-store';
import { LLMQueue } from '@/lib/llm-queue';
import type { JungianProfile } from '../jungian-profiler';

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
