import { describe, test, expect } from "bun:test";
import {
  DEFAULT_NPC_ROLES, UNIQUE_NPC_ROLES, ALL_NPC_ROLES,
  CONTEXT_GROUPS, selectNPCRole, getNPCRoleByName,
} from "./npc-role";

describe("npc-role data", () => {
  test("DEFAULT_NPC_ROLES has entries", () => {
    expect(DEFAULT_NPC_ROLES.length).toBeGreaterThan(5);
  });

  test("UNIQUE_NPC_ROLES are all marked unique", () => {
    for (const a of UNIQUE_NPC_ROLES) {
      expect(a.unique).toBe(true);
    }
  });

  test("ALL_NPC_ROLES is union of default and unique", () => {
    expect(ALL_NPC_ROLES.length).toBe(DEFAULT_NPC_ROLES.length + UNIQUE_NPC_ROLES.length);
  });

  test("CONTEXT_GROUPS has all context types", () => {
    expect(Object.keys(CONTEXT_GROUPS)).toContain("court");
    expect(Object.keys(CONTEXT_GROUPS)).toContain("sea");
  });
});

describe("selectNPCRole", () => {
  test("returns a string role name", () => {
    const result = selectNPCRole(ALL_NPC_ROLES);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("filters by context", () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(selectNPCRole(ALL_NPC_ROLES, "sea"));
    }
    const hasSea = [...results].some((r) => {
      const a = getNPCRoleByName(r);
      return a?.contexts.includes("sea");
    });
    expect(hasSea).toBe(true);
  });

  test("excludes already existing unique roles", () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(selectNPCRole(UNIQUE_NPC_ROLES, undefined, ["king", "emperor"]));
    }
    expect(results.has("king")).toBe(false);
    expect(results.has("emperor")).toBe(false);
  });

  test("returns commoner as fallback for empty list", () => {
    expect(selectNPCRole([])).toBe("commoner");
  });
});

describe("getNPCRoleByName", () => {
  test("finds existing role", () => {
    const a = getNPCRoleByName("farmer");
    expect(a).toBeDefined();
    expect(a?.contexts).toContain("wild");
  });

  test("returns undefined for unknown", () => {
    expect(getNPCRoleByName("nonexistent")).toBeUndefined();
  });
});
