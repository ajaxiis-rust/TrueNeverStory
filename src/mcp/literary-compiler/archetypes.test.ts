import { describe, it, expect } from 'bun:test';
import {
  ARCHETYPES,
  EVERYDAY_LIFE,
  ARCHETYPE_KEYWORDS,
  ARCHETYPE_VARIABLES,
  ARCHETYPE_POSITIONS,
  isValidArchetype,
  type Archetype,
} from './archetypes';

describe('ARCHETYPES', () => {
  it('has exactly 12 entries', () => {
    expect(ARCHETYPES).toHaveLength(12);
  });

  it('contains no duplicates', () => {
    expect(new Set(ARCHETYPES).size).toBe(12);
  });

  it('includes the expected archetype names', () => {
    const expected = [
      'escape_liberation',
      'judgment_trial',
      'loyalty',
      'betrayal',
      'inheritance_return',
      'endurance_suffering',
      'rescue',
      'rise_fall_rise',
      'wisdom_counsel',
      'political_intrigue',
      'quest_journey',
      'temptation_fall',
    ];
    expect(ARCHETYPES).toEqual(expected);
  });
});

describe('Archetype type', () => {
  it('is a string union type (runtime: every value is a string)', () => {
    for (const a of ARCHETYPES) {
      expect(typeof a).toBe('string');
    }
  });
});

describe('ARCHETYPE_KEYWORDS', () => {
  it('has a keywords entry for every archetype', () => {
    for (const archetype of ARCHETYPES) {
      expect(ARCHETYPE_KEYWORDS[archetype]).toBeDefined();
      expect(ARCHETYPE_KEYWORDS[archetype].length).toBeGreaterThan(0);
    }
  });

  it('has no extra keys beyond ARCHETYPES', () => {
    const extra = Object.keys(ARCHETYPE_KEYWORDS).filter(
      (k) => !ARCHETYPES.includes(k as any),
    );
    expect(extra).toEqual([]);
  });
});

describe('ARCHETYPE_VARIABLES', () => {
  it('has a variables entry for every archetype', () => {
    for (const archetype of ARCHETYPES) {
      expect(ARCHETYPE_VARIABLES[archetype]).toBeDefined();
      expect(ARCHETYPE_VARIABLES[archetype].length).toBeGreaterThan(0);
    }
  });

  it('has no extra keys beyond ARCHETYPES', () => {
    const extra = Object.keys(ARCHETYPE_VARIABLES).filter(
      (k) => !ARCHETYPES.includes(k as any),
    );
    expect(extra).toEqual([]);
  });
});

describe('ARCHETYPE_POSITIONS', () => {
  it('has a positions entry for every archetype', () => {
    for (const archetype of ARCHETYPES) {
      expect(ARCHETYPE_POSITIONS[archetype]).toBeDefined();
      expect(ARCHETYPE_POSITIONS[archetype].length).toBeGreaterThan(0);
    }
  });

  it('has no extra keys beyond ARCHETYPES', () => {
    const extra = Object.keys(ARCHETYPE_POSITIONS).filter(
      (k) => !ARCHETYPES.includes(k as any),
    );
    expect(extra).toEqual([]);
  });
});

describe('EVERYDAY_LIFE', () => {
  it('is a non-empty string', () => {
    expect(typeof EVERYDAY_LIFE).toBe('string');
    expect(EVERYDAY_LIFE.length).toBeGreaterThan(0);
  });

  it('is not one of the 12 primary archetypes', () => {
    expect(ARCHETYPES).not.toContain(EVERYDAY_LIFE);
  });
});

describe('isValidArchetype', () => {
  it('returns true for every canonical archetype', () => {
    for (const archetype of ARCHETYPES) {
      expect(isValidArchetype(archetype)).toBe(true);
    }
  });

  it('returns true for EVERYDAY_LIFE', () => {
    expect(isValidArchetype(EVERYDAY_LIFE)).toBe(true);
  });

  it('returns false for unknown strings', () => {
    expect(isValidArchetype('nonexistent')).toBe(false);
    expect(isValidArchetype('')).toBe(false);
  });
});
