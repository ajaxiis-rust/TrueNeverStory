import { describe, it, expect } from 'bun:test';
import { shouldExpand } from './short-turn-expander';
import type { Intent } from '../models/intent';

function makeIntent(type: string): Intent {
  return { type, verb: 'test' } as Intent;
}

describe('shouldExpand', () => {
  it('returns true for short actionable turn (≤50 words)', () => {
    const input = 'I walked down the street and noticed a boy. He was begging.';
    expect(shouldExpand(input, makeIntent('action'))).toBe(true);
  });

  it('returns false for long turn (>50 words)', () => {
    const input = 'word '.repeat(51).trim();
    expect(shouldExpand(input, makeIntent('action'))).toBe(false);
  });

  it('returns false for pure dialogue', () => {
    const input = 'Hello, how are you?';
    expect(shouldExpand(input, makeIntent('dialogue'))).toBe(false);
  });

  it('returns false for command intent', () => {
    const input = '/look around';
    expect(shouldExpand(input, makeIntent('command'))).toBe(false);
  });

  it('returns true for short non-dialogue turn', () => {
    const input = 'I looked around the room.';
    expect(shouldExpand(input, makeIntent('action'))).toBe(true);
  });

  it('returns false for empty input', () => {
    expect(shouldExpand('', makeIntent('action'))).toBe(false);
  });
});
