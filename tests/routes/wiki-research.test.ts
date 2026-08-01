import { describe, it, expect } from 'bun:test';
import { WorldCreationProgressManager } from '../../src/services/world-creation-progress';

describe('Wiki Research Routes', () => {
  it('should create progress manager', () => {
    const manager = new WorldCreationProgressManager('test-world');
    expect(manager).toBeDefined();
    expect(manager.getProgress().stage).toBe('idle');
  });

  it('should track progress via manager', () => {
    const manager = new WorldCreationProgressManager('test-world');
    manager.update({
      stage: 'researching',
      current: 5,
      total: 10,
      message: 'Researching...',
    });

    const progress = manager.getProgress();
    expect(progress.stage).toBe('researching');
    expect(progress.current).toBe(5);
  });
});
