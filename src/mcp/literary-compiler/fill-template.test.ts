import { describe, it, expect } from 'bun:test';
import { fillTemplate } from './fill-template';

describe('fillTemplate', () => {
  it('replaces placeholders with context values', () => {
    const skeleton = '[current_leader] oppressed the people under [oppressor] rule.';
    const context = { current_leader: 'King Marcus', oppressor: 'Iron Legion' };
    const result = fillTemplate(skeleton, context);

    expect(result).toBe('King Marcus oppressed the people under Iron Legion rule.');
  });

  it('leaves unreplaced placeholders as-is', () => {
    const skeleton = '[current_leader] faced [unknown_var] in the battle.';
    const context = { current_leader: 'King Marcus' };
    const result = fillTemplate(skeleton, context);

    expect(result).toBe('King Marcus faced [unknown_var] in the battle.');
  });

  it('returns filled skeleton under 200 words', () => {
    const skeleton = '[hero] stood before [oppressor], knowing that [obstacle] stood in the way of [goal].';
    const context = {
      hero: 'Marcus',
      oppressor: 'The Iron Legion',
      obstacle: 'The Great Wall',
      goal: 'freedom',
    };
    const result = fillTemplate(skeleton, context);

    expect(result).toBe(
      'Marcus stood before The Iron Legion, knowing that The Great Wall stood in the way of freedom.'
    );
    expect(result.split(/\s+/).length).toBeLessThanOrEqual(200);
  });

  it('handles empty skeleton', () => {
    const result = fillTemplate('', { foo: 'bar' });
    expect(result).toBe('');
  });

  it('handles empty context', () => {
    const skeleton = '[a] and [b]';
    const result = fillTemplate(skeleton, {});
    expect(result).toBe('[a] and [b]');
  });

  it('replaces multiple occurrences of same placeholder', () => {
    const skeleton = '[leader] spoke to [leader] again.';
    const context = { leader: 'Marcus' };
    const result = fillTemplate(skeleton, context);
    expect(result).toBe('Marcus spoke to Marcus again.');
  });
});
