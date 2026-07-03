import { describe, test, expect } from "bun:test";
import { WorldValidator } from "./world-validator";

function makeValidator(rules: Array<Record<string, unknown>> = []) {
  const entityStore = {
    getByNameAndType: (name: string, type: string) => {
      if (type === "Character" && name === "Hero") {
        return { uid: "char:hero", name: "Hero", entityType: "Character" };
      }
      return null;
    },
  };
  return new WorldValidator(entityStore as any, { world_rules: rules });
}

describe("WorldValidator", () => {
  test("allows valid action", async () => {
    const v = makeValidator([]);
    const result = await v.validateAction("Hero", "walk", "tavern");
    expect(result.isValid).toBe(true);
    expect(result.message).toBe("ok");
  });

  test("rejects unknown actor", async () => {
    const v = makeValidator([]);
    const result = await v.validateAction("Unknown", "walk");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("not a known character");
  });

  test("blocks magic when no-magic rule exists", async () => {
    const v = makeValidator([{ name: "No Magic", description: "no magic in the temple" }]);
    const result = await v.validateAction("Hero", "cast_magic", "the temple");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("No Magic");
    expect(result.forcedEffects.length).toBeGreaterThan(0);
  });

  test("allows magic in non-restricted areas", async () => {
    const v = makeValidator([{ name: "No Magic", description: "no magic in the temple" }]);
    const result = await v.validateAction("Hero", "cast_magic", "the forest");
    expect(result.isValid).toBe(true);
  });

  test("blocks combat in no-combat zones", async () => {
    const v = makeValidator([{ name: "Peace", description: "no combat in the market" }]);
    const result = await v.validateAction("Hero", "attack", "the market");
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("Peace");
  });
});
