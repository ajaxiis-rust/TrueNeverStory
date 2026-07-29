import { describe, it, expect } from 'bun:test';
import {
  validateExtractResult,
  buildExtractPrompt,
  EXTRACTOR_SYSTEM_PROMPT,
  type ExtractResult,
  type RoleMapping,
} from './extractor';

describe('EXTRACTOR_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof EXTRACTOR_SYSTEM_PROMPT).toBe('string');
    expect(EXTRACTOR_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});

describe('buildExtractPrompt', () => {
  it('returns a string containing the chunk text', () => {
    const text = 'The king fled into the wilderness.';
    const prompt = buildExtractPrompt(text);
    expect(prompt).toContain(text);
  });

  it('returns a string with JSON instruction', () => {
    const prompt = buildExtractPrompt('Some text');
    expect(prompt.toLowerCase()).toContain('json');
  });
});

describe('validateExtractResult', () => {
  function validResult(overrides?: Partial<ExtractResult>): ExtractResult {
    return {
      archetype_primary: 'escape_liberation',
      archetype_secondary: null,
      roles: [{ span: 'the king', role: 'leader' }],
      variables: ['current_hero', 'obstacle'],
      skeleton: 'A hero must overcome an obstacle and escape.',
      mood: 'dark',
      sensory: { visual: 'dark forest', auditory: 'wind', tactile: 'cold iron' },
      pacing: 'fast',
      register: 'formal',
      snippets: ['He fled into the night'],
      confidence: 0.85,
      ...overrides,
    };
  }

  it('accepts a valid result', () => {
    expect(validateExtractResult(validResult())).toBe(true);
  });

  it('rejects empty skeleton', () => {
    expect(validateExtractResult(validResult({ skeleton: '' }))).toBe(false);
  });

  it('rejects skeleton shorter than 10 chars', () => {
    expect(validateExtractResult(validResult({ skeleton: 'short' }))).toBe(false);
  });

  it('rejects invalid archetype_primary', () => {
    expect(validateExtractResult(validResult({ archetype_primary: 'nonexistent_arch' }))).toBe(false);
  });

  it('accepts everyday_life as archetype_primary', () => {
    expect(validateExtractResult(validResult({ archetype_primary: 'everyday_life' }))).toBe(true);
  });

  it('rejects empty variables array', () => {
    expect(validateExtractResult(validResult({ variables: [] }))).toBe(false);
  });

  it('rejects non-string mood', () => {
    expect(validateExtractResult(validResult({ mood: 123 as any }))).toBe(false);
  });

  it('rejects negative confidence', () => {
    expect(validateExtractResult(validResult({ confidence: -0.1 }))).toBe(false);
  });

  it('rejects confidence greater than 1', () => {
    expect(validateExtractResult(validResult({ confidence: 1.5 }))).toBe(false);
  });

  it('rejects null input', () => {
    expect(validateExtractResult(null)).toBe(false);
  });

  it('rejects missing required fields', () => {
    const incomplete = { archetype_primary: 'escape_liberation' } as any;
    expect(validateExtractResult(incomplete)).toBe(false);
  });
});
