import { describe, test, expect } from 'bun:test';
import { createDefaultProfile, deriveType, averageRange, axisClarity, BLEND_CONFIG, updateAxis, updateAxisConfidence, blendBehavioralSignals } from './jungian-profiler';
import type { AxisSignals } from './metrics-collector';

describe('createDefaultProfile', () => {
  test('all axes 0.5/0.1, confidence 0, source default', () => {
    const p = createDefaultProfile();
    expect(p.extraversion).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.intuition).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.thinking).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.judging).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.confidence).toBe(0);
    expect(p.axisConfidence).toEqual({ extraversion: 0, intuition: 0, thinking: 0, judging: 0 });
    expect(p.source).toBe('default');
  });
});

describe('deriveType', () => {
  test('clear preferences map to MBTI letters', () => {
    const p = createDefaultProfile();
    p.extraversion.preference = 0.3; // I
    p.intuition.preference = 0.8;    // N
    p.thinking.preference = 0.75;    // T
    p.judging.preference = 0.7;      // J
    expect(deriveType(p)).toBe('INTJ');
  });
  test('ambivalent axes map to X', () => {
    expect(deriveType(createDefaultProfile())).toBe('XXXX');
  });
});

describe('averageRange', () => {
  test('averages 4 axes', () => {
    const p = createDefaultProfile();
    p.extraversion.range = 0.2; p.intuition.range = 0.4; p.thinking.range = 0.6; p.judging.range = 0.8;
    expect(averageRange(p)).toBeCloseTo(0.5, 5);
  });
});

describe('axisClarity', () => {
  test('0.5 everywhere → 0', () => {
    expect(axisClarity(createDefaultProfile())).toBe(0);
  });
  test('1.0 everywhere → 1', () => {
    const p = createDefaultProfile();
    p.extraversion.preference = 1; p.intuition.preference = 1; p.thinking.preference = 1; p.judging.preference = 1;
    expect(axisClarity(p)).toBeCloseTo(1, 5);
  });
});

describe('updateAxis — EMA', () => {
  test('converges to constant signal', () => {
    let axis = { preference: 0.0, range: 0.1 };
    for (let i = 0; i < 20; i++) axis = updateAxis(axis, 1.0, []);
    expect(axis.preference).toBeGreaterThan(0.9);
  });
  test('rate limit: one blend-cycle shifts ≤ maxShift', () => {
    const axis = updateAxis({ preference: 0.0, range: 0.1 }, 1.0, []);
    expect(axis.preference).toBeLessThanOrEqual(BLEND_CONFIG.maxShiftPerTurn + 1e-9);
  });
  test('range clamped to [0.05, 0.95]', () => {
    let axis = { preference: 0.5, range: 0.05 };
    for (let i = 0; i < 100; i++) axis = updateAxis(axis, 0.5, []);
    expect(axis.range).toBeGreaterThanOrEqual(0.05);
    expect(axis.range).toBeLessThanOrEqual(0.95);
  });
  test('range grows on strong deviation from rolling avg', () => {
    const recent = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const axis = updateAxis({ preference: 0.5, range: 0.1 }, 0.95, recent);
    expect(axis.range).toBeGreaterThan(0.1);
  });
  test('range decays on stability', () => {
    const recent = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const axis = updateAxis({ preference: 0.5, range: 0.5 }, 0.5, recent);
    expect(axis.range).toBeLessThan(0.5);
  });
});

describe('updateAxisConfidence', () => {
  test('confirmation (< 0.1 diff) → +0.05', () => {
    expect(updateAxisConfidence(0.5, 0.55, 0.55)).toBeCloseTo(0.55, 5);
  });
  test('contradiction (> 0.3 diff) → -0.10, floor 0.30', () => {
    expect(updateAxisConfidence(0.35, 0.9, 0.5)).toBeCloseTo(0.3, 5);
  });
  test('neutral → unchanged', () => {
    expect(updateAxisConfidence(0.5, 0.7, 0.55)).toBe(0.5);
  });
});

describe('blendBehavioralSignals', () => {
  test('updates all 4 axes, confidence = mean axisConfidence', () => {
    const profile = createDefaultProfile();
    const signals: AxisSignals = { extraversion: 0.9, intuition: 0.8, thinking: 0.75, judging: 0.7 };
    const recent = { extraversion: [0.5], intuition: [0.5], thinking: [0.5], judging: [0.5] };
    const blended = blendBehavioralSignals(signals, profile, recent);
    expect(blended.source).toBe('blended');
    expect(blended.confidence).toBeCloseTo(
      (blended.axisConfidence.extraversion + blended.axisConfidence.intuition +
       blended.axisConfidence.thinking + blended.axisConfidence.judging) / 4, 5);
  });
});
