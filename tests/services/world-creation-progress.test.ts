import { describe, it, expect } from 'bun:test';
import { WorldCreationProgressManager } from '../../src/services/world-creation-progress';

describe('WorldCreationProgressManager', () => {
  it('should track progress updates', () => {
    const manager = new WorldCreationProgressManager('test-world');
    manager.update({
      stage: 'researching',
      current: 5,
      total: 10,
      message: 'Researching medieval knighthood...',
    });

    const progress = manager.getProgress();
    expect(progress.stage).toBe('researching');
    expect(progress.current).toBe(5);
    expect(progress.total).toBe(10);
    expect(progress.isPaused).toBe(false);
  });

  it('should support pause and resume', () => {
    const manager = new WorldCreationProgressManager('test-world');
    manager.update({ stage: 'researching', current: 0, total: 10, message: 'Starting...' });

    manager.pause();
    expect(manager.getProgress().isPaused).toBe(true);

    manager.resume();
    expect(manager.getProgress().isPaused).toBe(false);
  });

  it('should notify subscribers', () => {
    const manager = new WorldCreationProgressManager('test-world');
    const received: any[] = [];

    manager.subscribe((progress) => {
      received.push(progress);
    });

    manager.update({ stage: 'generating', current: 0, total: 1, message: 'Generating world...' });
    manager.update({ stage: 'researching', current: 0, total: 10, message: 'Starting research...' });

    expect(received.length).toBe(2);
    expect(received[0].stage).toBe('generating');
    expect(received[1].stage).toBe('researching');
  });

  it('should track errors', () => {
    const manager = new WorldCreationProgressManager('test-world');
    manager.update({
      stage: 'researching',
      current: 5,
      total: 10,
      message: 'Researching...',
      errors: ['Failed to fetch article X'],
    });

    const progress = manager.getProgress();
    expect(progress.errors).toContain('Failed to fetch article X');
  });
});
