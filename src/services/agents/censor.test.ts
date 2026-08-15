import { describe, test, expect } from 'bun:test';
import { CensorAgent } from './censor';
import { LLMQueue } from '@/lib/llm-queue';
import type { GameContext } from '@/services/context-builder';

const ctx = { world: { name: 'Dark Realm', genre: 'fantasy', rules: {} }, location: { name: 'Old Oak' } } as unknown as GameContext;

describe('CensorAgent.clean', () => {
  const agent = new CensorAgent({} as LLMQueue);
  test('removes clichés, no LLM polish', async () => {
    const raw = "The very fabric of the tavern seemed woven with stories. It's worth noting that the stew is fresh. The palpable silence hung in the air.";
    const r = await agent.clean(raw, ctx);
    expect(r.llmPolished).toBe(false);
    expect(r.cleaned).not.toContain('very fabric');
    expect(r.cleaned).not.toContain("It's worth noting");
    expect(r.cleaned).not.toContain('palpable');
  });
  test('empty input → empty cleaned', async () => {
    const r = await agent.clean('', ctx);
    expect(r.cleaned).toBe('');
    expect(r.llmPolished).toBe(false);
  });
});
