import { describe, test, expect } from "bun:test";
import {
  DEFAULT_ARCHETYPES, UNIQUE_ARCHETYPES, ALL_ARCHETYPES,
  CONTEXT_GROUPS, selectArchetype, getArchetypeByName,
} from "./archetype";

describe("archetype data", () => {
  test("DEFAULT_ARCHETYPES has entries", () => {
    expect(DEFAULT_ARCHETYPES.length).toBeGreaterThan(5);
  });

  test("UNIQUE_ARCHETYPES are all marked unique", () => {
    for (const a of UNIQUE_ARCHETYPES) {
      expect(a.unique).toBe(true);
    }
  });

  test("ALL_ARCHETYPES is union of default and unique", () => {
    expect(ALL_ARCHETYPES.length).toBe(DEFAULT_ARCHETYPES.length + UNIQUE_ARCHETYPES.length);
  });

  test("CONTEXT_GROUPS has all context types", () => {
    expect(Object.keys(CONTEXT_GROUPS)).toContain("court");
    expect(Object.keys(CONTEXT_GROUPS)).toContain("sea");
  });
});

describe("selectArchetype", () => {
  test("returns a string archetype name", () => {
    const result = selectArchetype(ALL_ARCHETYPES);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("filters by context", () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(selectArchetype(ALL_ARCHETYPES, "sea"));
    }
    const hasSea = [...results].some((r) => {
      const a = getArchetypeByName(r);
      return a?.contexts.includes("sea");
    });
    expect(hasSea).toBe(true);
  });

  test("excludes already existing unique archetypes", () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(selectArchetype(UNIQUE_ARCHETYPES, undefined, ["king", "emperor"]));
    }
    expect(results.has("king")).toBe(false);
    expect(results.has("emperor")).toBe(false);
  });

  test("returns commoner as fallback for empty list", () => {
    expect(selectArchetype([])).toBe("commoner");
  });
});

describe("getArchetypeByName", () => {
  test("finds existing archetype", () => {
    const a = getArchetypeByName("farmer");
    expect(a).toBeDefined();
    expect(a?.contexts).toContain("wild");
  });

  test("returns undefined for unknown", () => {
    expect(getArchetypeByName("nonexistent")).toBeUndefined();
  });
});
