import { describe, it, expect } from 'bun:test';
import { shouldExpand, analyzeCharge, expand, RefusalTracker } from './short-turn-expander';
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

describe('analyzeCharge', () => {
  it('returns high when NPC is mentioned and contact breaks off', () => {
    const input = 'I noticed the boy and ignored him.';
    const simResult = { outcome: 'success', probability: 0.8 } as any;
    const gameContext = { nearbyNpcs: [{ name: 'boy', uid: 'npc1' }] } as any;
    expect(analyzeCharge(input, simResult, gameContext)).toBe('high');
  });

  it('returns low for generic action with no NPC mention', () => {
    const input = 'I walked on.';
    const simResult = { outcome: 'success', probability: 0.8 } as any;
    const gameContext = { nearbyNpcs: [] } as any;
    expect(analyzeCharge(input, simResult, gameContext)).toBe('low');
  });

  it('returns medium when NPC present but no explicit refusal', () => {
    const input = 'I entered the tavern.';
    const simResult = { outcome: 'success', probability: 0.8 } as any;
    const gameContext = { nearbyNpcs: [{ name: 'innkeeper', uid: 'npc2' }] } as any;
    expect(analyzeCharge(input, simResult, gameContext)).toBe('medium');
  });

  it('returns none for empty input', () => {
    expect(analyzeCharge('', {} as any, {} as any)).toBe('none');
  });
});

describe('expand', () => {
  it('preserves player turn verbatim and appends LLM continuation', async () => {
    const mockLLM = {
      generateText: (async (prompt: string) => {
        expect(prompt).toContain('I walked down the street and noticed a boy');
        return 'But a thin hand grabbed my sleeve.';
      }) as any,
    };
    const result = await expand(
      'I walked down the street and noticed a boy.',
      { outcome: 'success', probability: 0.8, narrativeHints: [] } as any,
      { character: { name: 'Hero' }, location: { name: 'street' }, nearbyNpcs: [] } as any,
      undefined,
      undefined,
      mockLLM as any,
    );
    // Player decision preserved verbatim at the start
    expect(result.startsWith('I walked down the street and noticed a boy.')).toBe(true);
    expect(result).toContain('But a thin hand grabbed my sleeve.');
  });

  it('includes playerVoice and authorPhrases in prompt', async () => {
    let capturedPrompt = '';
    const mockLLM = {
      generateText: (async (prompt: string) => {
        capturedPrompt = prompt;
        return 'continuation';
      }) as any,
    };
    await expand(
      'test input',
      { outcome: 'success', narrativeHints: [] } as any,
      { nearbyNpcs: [] } as any,
      'Player prefers concrete info',
      ['Author phrase one.'],
      mockLLM as any,
    );
    expect(capturedPrompt).toContain('Player prefers concrete info');
    expect(capturedPrompt).toContain('Author phrase one');
  });
});

describe('RefusalTracker', () => {
  it('allows expansion on first refusal', () => {
    const tracker = new RefusalTracker();
    expect(tracker.shouldSuppress('scene1')).toBe(false);
  });

  it('suppresses expansion after second refusal in same scene', () => {
    const tracker = new RefusalTracker();
    tracker.recordRefusal('scene1');
    tracker.recordRefusal('scene1');
    expect(tracker.shouldSuppress('scene1')).toBe(true);
  });

  it('tracks scenes independently', () => {
    const tracker = new RefusalTracker();
    tracker.recordRefusal('scene1');
    tracker.recordRefusal('scene1');
    expect(tracker.shouldSuppress('scene1')).toBe(true);
    expect(tracker.shouldSuppress('scene2')).toBe(false);
  });

  it('resets scene on new scene', () => {
    const tracker = new RefusalTracker();
    tracker.recordRefusal('scene1');
    tracker.recordRefusal('scene1');
    tracker.resetScene('scene1');
    expect(tracker.shouldSuppress('scene1')).toBe(false);
  });
});
