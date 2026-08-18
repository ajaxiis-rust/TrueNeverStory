import { describe, it, expect, beforeEach } from 'bun:test';
import { getFeatureFlagManager, resetFeatureFlagManager } from './feature-flags';

describe('Psychotype feature flags (v2-paradigm Vector 1 — activated)', () => {
  beforeEach(() => {
    resetFeatureFlagManager();
  });

  it('jungian-profiler-enabled is enabled at 100%', () => {
    const mgr = getFeatureFlagManager();
    const flag = mgr.get('jungian-profiler-enabled');
    expect(flag).toBeDefined();
    expect(flag!.enabled).toBe(true);
    expect(flag!.percentage).toBe(100);
  });

  it('literary-modulation-enabled is enabled at 100%', () => {
    const mgr = getFeatureFlagManager();
    const flag = mgr.get('literary-modulation-enabled');
    expect(flag).toBeDefined();
    expect(flag!.enabled).toBe(true);
    expect(flag!.percentage).toBe(100);
  });

  it('short-turn-expansion-enabled is enabled at 100%', () => {
    const mgr = getFeatureFlagManager();
    const flag = mgr.get('short-turn-expansion-enabled');
    expect(flag).toBeDefined();
    expect(flag!.enabled).toBe(true);
    expect(flag!.percentage).toBe(100);
  });

  it('deferred-hooks-enabled is enabled at 100%', () => {
    const mgr = getFeatureFlagManager();
    const flag = mgr.get('deferred-hooks-enabled');
    expect(flag).toBeDefined();
    expect(flag!.enabled).toBe(true);
    expect(flag!.percentage).toBe(100);
  });
});
