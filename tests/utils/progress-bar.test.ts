import { describe, it, expect } from 'bun:test';
import { CLIProgressBar } from '../../src/utils/progress-bar';
import type { WorldCreationProgress } from '../../src/services/world-creation-progress';

describe('CLIProgressBar', () => {
  it('should format progress bar correctly', () => {
    const bar = new CLIProgressBar();
    const formatted = bar.format({
      stage: 'researching',
      current: 5,
      total: 10,
      message: 'Researching medieval knighthood...',
      currentArticle: 'Knight',
      errors: [],
      isPaused: false,
    });

    expect(formatted).toContain('50%');
    expect(formatted).toContain('5/10');
    expect(formatted).toContain('Researching');
  });

  it('should show 100% when complete', () => {
    const bar = new CLIProgressBar();
    const formatted = bar.format({
      stage: 'complete',
      current: 10,
      total: 10,
      message: 'Complete',
      errors: [],
      isPaused: false,
    });

    expect(formatted).toContain('100%');
  });

  it('should show pause indicator', () => {
    const bar = new CLIProgressBar();
    const formatted = bar.format({
      stage: 'researching',
      current: 5,
      total: 10,
      message: 'Researching...',
      errors: [],
      isPaused: true,
    });

    expect(formatted).toContain('PAUSED');
  });

  it('should show error count', () => {
    const bar = new CLIProgressBar();
    const formatted = bar.format({
      stage: 'researching',
      current: 5,
      total: 10,
      message: 'Researching...',
      errors: ['Error 1', 'Error 2'],
      isPaused: false,
    });

    expect(formatted).toContain('Errors: 2');
  });
});
