/**
 * Unit tests for probability engine.
 */
import { describe, it, expect } from "bun:test";
import { ProbabilityEngine } from "../src/services/probability-engine";
import { getProfile } from "../src/services/probability-profiles";
import { ProbabilityModifier, ModifierType } from "../src/models/probability";

describe("ProbabilityEngine", () => {
  it("should compute probability with default context", () => {
    const engine = new ProbabilityEngine(0.5);
    const profile = getProfile("combat");
    const context = { actor: "Hero", target: "Goblin" };
    const prob = engine.compute(profile, context);
    expect(prob).toBeGreaterThanOrEqual(0);
    expect(prob).toBeLessThanOrEqual(1);
  });

  it("should apply modifiers", () => {
    const engine = new ProbabilityEngine(0.5);
    const profile = getProfile("combat");

    const mod = new ProbabilityModifier({
      parameter_name: "combat_skill",
      value: 0.3,
      modifier_type: ModifierType.ADD,
      source: "buff",
    });
    engine.applyModifier("Character:Hero", mod);

    const context = { actor: "Hero" };
    const probWithMod = engine.compute(profile, context, "Character:Hero");
    const probWithoutMod = engine.compute(profile, context);

    expect(probWithMod).toBeGreaterThan(probWithoutMod);
  });

  it("should get and remove modifiers", () => {
    const engine = new ProbabilityEngine(0.5);
    const mod = new ProbabilityModifier({
      parameter_name: "luck",
      value: 0.5,
      modifier_type: ModifierType.ADD,
      source: "test",
    });
    engine.applyModifier("Character:Hero", mod);

    expect(engine.getAllModifiers("Character:Hero").length).toBe(1);
    engine.removeModifier("Character:Hero", "luck");
    expect(engine.getAllModifiers("Character:Hero").length).toBe(0);
  });

  it("should roll and determine outcome", () => {
    const engine = new ProbabilityEngine(0.5);
    const profile = getProfile("combat");
    const result = engine.roll(profile, { actor: "Hero" });

    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(1);
    expect(result.roll).toBeGreaterThanOrEqual(0);
    expect(result.roll).toBeLessThanOrEqual(1);
    expect(result.quality).toBeDefined();
  });

  it("should return known profiles", () => {
    expect(getProfile("combat").name).toBe("combat");
    expect(getProfile("persuasion").name).toBe("persuasion");
    expect(getProfile("stealth").name).toBe("stealth");
    expect(getProfile("romance").name).toBe("romance");
    expect(getProfile("unknown")).toBeDefined(); // falls back to generic
  });
});
