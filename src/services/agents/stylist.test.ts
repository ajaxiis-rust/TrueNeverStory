import { describe, test, expect } from 'bun:test';
import { StylistAgent } from './stylist';
import { TNSServer } from '@/mcp/server';
import { LLMQueue } from '@/lib/llm-queue';

describe('StylistAgent.buildMicroPrompt', () => {
  const agent = new StylistAgent({} as TNSServer, {} as LLMQueue);
  const style = { register: 'medium', pacing: 'medium', sensory: ['visual'], snippets: [], forbidden: [] };
  test('playerVoice passed → present in user prompt', () => {
    const { user } = agent.buildMicroPrompt('Alek seeks Bran.', style, { world: 'Dark Realm', location: 'Old Oak' }, 'success',
      'Player psychological context:\n- Prefers analytical');
    expect(user).toContain('Player psychological context');
    expect(user).toContain('Prefers analytical');
  });
  test('no playerVoice → no voice block', () => {
    const { user } = agent.buildMicroPrompt('Alek seeks Bran.', style, { world: 'Dark Realm', location: 'Old Oak' }, 'success');
    expect(user).not.toContain('Player psychological context');
  });
});
