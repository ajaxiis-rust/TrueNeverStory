import { describe, test, expect } from 'bun:test';
import { createDefaultProfile, deriveType, averageRange, axisClarity } from './jungian-profiler';

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
