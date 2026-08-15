import { describe, test, expect } from 'bun:test';
import { ValidatorAgent } from './validator';
import { TNSServer } from '@/mcp/server';
import type { GameContext } from '@/services/context-builder';

const ctx = (npcs: string[]): GameContext =>
  ({ nearbyNpcs: npcs.map(name => ({ name })), location: { name: 'Old Oak' } }) as unknown as GameContext;

describe('ValidatorAgent.buildWorldConsistency', () => {
  const agent = new ValidatorAgent({} as TNSServer);
  test('NPC mentioned in skeleton AND present → npcInLocation true', () => {
    expect(agent.buildWorldConsistency(ctx(['Bran']), 'Alek looks for Bran the smith.').npcInLocation).toBe(true);
  });
  test('NPC NOT in nearby list → npcInLocation false', () => {
    expect(agent.buildWorldConsistency(ctx(['Marta']), 'Alek looks for Bran the smith.').npcInLocation).toBe(false);
  });
  test('no NPCs mentioned → npcInLocation true (vacuous)', () => {
    expect(agent.buildWorldConsistency(ctx([]), 'Alek enters the tavern.').npcInLocation).toBe(true);
  });
});

describe('ValidatorAgent.verify', () => {
  test('returns VerificationResult with worldConsistency + notes', async () => {
    const mcp = { handleToolCall: async () => ({ verified: false, confidence: 'unknown', evidence: [] }) } as unknown as TNSServer;
    const agent = new ValidatorAgent(mcp);
    const r = await agent.verify(ctx(['Bran']), 'Alek forges a blade. Bran is in the tavern.');
    expect(r.worldConsistency.npcInLocation).toBe(true);
    expect(Array.isArray(r.claims)).toBe(true);
    expect(Array.isArray(r.notes)).toBe(true);
  });
});
