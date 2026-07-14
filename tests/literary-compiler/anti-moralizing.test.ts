import { describe, it, expect } from 'bun:test';
import { buildAntiMoralizingPrompt } from '../../src/services/agents/stylist';

describe('Anti-moralizing prompt', () => {
  it('should include anti-moralizing instructions', () => {
    const prompt = buildAntiMoralizingPrompt();

    expect(prompt).toContain('NO religious references');
    expect(prompt).toContain('NO moral commentary');
    expect(prompt).toContain('and so we learn');
    expect(prompt).toContain('the moral is');
  });

  it('should include focus instructions', () => {
    const prompt = buildAntiMoralizingPrompt();

    expect(prompt).toContain('actions');
    expect(prompt).toContain('emotions');
    expect(prompt).toContain('dialogue');
    expect(prompt).toContain('sensory details');
  });

  it('should be concise and clear', () => {
    const prompt = buildAntiMoralizingPrompt();

    expect(prompt.split(/\s+/).length).toBeLessThanOrEqual(500);
  });
});
