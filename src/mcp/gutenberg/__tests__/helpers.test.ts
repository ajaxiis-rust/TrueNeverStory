import { describe, it, expect } from 'bun:test';
import { inferEra, inferLiteraryPeriod, sampleExcerpts } from '../helpers';

describe('inferEra', () => {
  it('returns 18th_century for mid < 1790', () => { expect(inferEra(1660, 1730)).toBe('18th_century'); });
  it('returns 19th_century for mid 1790-1899', () => { expect(inferEra(1810, 1870)).toBe('19th_century'); });
  it('returns early_20th_century for mid >= 1900', () => { expect(inferEra(1880, 1940)).toBe('early_20th_century'); });
  it('uses defaults when no years given', () => { expect(inferEra()).toBe('19th_century'); });
});

describe('inferLiteraryPeriod', () => {
  it('returns enlightenment for mid < 1790', () => { expect(inferLiteraryPeriod(1660, 1730)).toBe('enlightenment'); });
  it('returns romanticism for mid 1790-1859', () => { expect(inferLiteraryPeriod(1790, 1850)).toBe('romanticism'); });
  it('returns victorian for mid 1860-1899', () => { expect(inferLiteraryPeriod(1830, 1890)).toBe('victorian'); });
  it('returns modernism for mid >= 1900', () => { expect(inferLiteraryPeriod(1880, 1940)).toBe('modernism'); });
});

describe('sampleExcerpts', () => {
  it('returns requested number of excerpts', () => {
    const text = 'a'.repeat(10000);
    const result = sampleExcerpts(text, 3, 200);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(200);
  });
  it('handles text shorter than requested total', () => {
    const result = sampleExcerpts('short text', 3, 200);
    expect(result.length).toBeLessThanOrEqual(3);
  });
  it('returns excerpts from different positions', () => {
    const text = 'A'.repeat(5000) + 'B'.repeat(5000);
    const result = sampleExcerpts(text, 2, 100);
    expect(result[0]).toContain('A');
    expect(result[1]).toContain('B');
  });
});
