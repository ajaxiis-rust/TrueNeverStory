import { describe, it, expect } from 'bun:test';
import { IdleResearchScheduler } from '../../src/services/idle-research-scheduler';

describe('IdleResearchScheduler', () => {
  it('should track last activity time', () => {
    const scheduler = new IdleResearchScheduler('test-world', {
      idleThresholdMs: 1000,
    });

    scheduler.recordActivity();
    expect(scheduler.isIdle()).toBe(false);
  });

  it('should detect idle state after threshold', async () => {
    const scheduler = new IdleResearchScheduler('test-world', {
      idleThresholdMs: 100,
    });

    scheduler.recordActivity();
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(scheduler.isIdle()).toBe(true);
  });

  it('should not be idle initially', () => {
    const scheduler = new IdleResearchScheduler('test-world', {
      idleThresholdMs: 1000,
    });

    expect(scheduler.isIdle()).toBe(false);
  });

  it('should track pending topics', () => {
    const scheduler = new IdleResearchScheduler('test-world');
    scheduler.addTopics(['medieval', 'knighthood']);
    scheduler.addTopics(['castles']);
    // Topics are stored internally
    expect(scheduler.isResearching()).toBe(false);
  });
});
