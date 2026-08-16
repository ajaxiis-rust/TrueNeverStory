import { describe, it, expect, beforeEach } from 'bun:test';
import { getFeatureFlagManager, resetFeatureFlagManager } from './feature-flags';

describe('Literary Modulation feature flags', () => {
  beforeEach(() => {
    resetFeatureFlagManager();
  });

  it('literary-modulation-enabled exists and defaults to off', () => {
    const mgr = getFeatureFlagManager();
    const flag = mgr.get('literary-modulation-enabled');
    expect(flag).toBeDefined();
    expect(flag!.enabled).toBe(false);
    expect(flag!.percentage).toBe(0);
  });

  it('short-turn-expansion-enabled exists and defaults to off', () => {
    const mgr = getFeatureFlagManager();
    const flag = mgr.get('short-turn-expansion-enabled');
    expect(flag).toBeDefined();
    expect(flag!.enabled).toBe(false);
  });

  it('deferred-hooks-enabled exists and defaults to off', () => {
    const mgr = getFeatureFlagManager();
    const flag = mgr.get('deferred-hooks-enabled');
    expect(flag).toBeDefined();
    expect(flag!.enabled).toBe(false);
  });
});
