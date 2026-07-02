import { describe, it, expect, beforeEach } from "bun:test";
import {
  ProbabilityEngine,
  type INpcSkillsManager,
} from "./probability-engine";
import {
  ProbabilityProfile,
  ProbabilityModifier,
  ProbabilityParameter,
  ModifierType,
  OutcomeQuality,
  ParameterType,
  StackingRule,
} from "../models/probability";
import { COMBAT, PERSUASION, STEALTH, GENERIC, BIRTH_RACE } from "./probability-profiles";

function makeProfile(overrides?: Partial<{ formula: string; difficultyModifier: number }>): ProbabilityProfile {
  return new ProbabilityProfile({
    name: "test",
    parameters: {
      skill: { name: "skill", base_value: 0.5, weight: 1.0, param_type: ParameterType.STATIC },
    },
    formula: overrides?.formula ?? "sum_weighted",
    difficulty_modifier: overrides?.difficultyModifier ?? 1.0,
  });
}

describe("ProbabilityEngine", () => {
  let engine: ProbabilityEngine;

  beforeEach(() => {
    engine = new ProbabilityEngine(0.5);
  });

  describe("modifier management", () => {
    it("applies and retrieves modifiers", () => {
      const mod = new ProbabilityModifier({
        parameter_name: "skill",
        value: 0.2,
        modifier_type: ModifierType.ADD,
        source: "test",
      });
      engine.applyModifier("e1", mod);
      const active = engine.getActiveModifiers("e1", "skill");
      expect(active.length).toBe(1);
      expect(active[0]!.value).toBe(0.2);
    });

    it("removes modifier by parameter name", () => {
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "skill", value: 0.2, modifier_type: ModifierType.ADD, source: "a",
      }));
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "health", value: 0.3, modifier_type: ModifierType.ADD, source: "b",
      }));
      const removed = engine.removeModifier("e1", "skill");
      expect(removed).toBe(true);
      expect(engine.getActiveModifiers("e1", "skill").length).toBe(0);
      expect(engine.getActiveModifiers("e1", "health").length).toBe(1);
    });

    it("removes modifier by source", () => {
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "skill", value: 0.2, modifier_type: ModifierType.ADD, source: "buff_a",
      }));
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "skill", value: 0.3, modifier_type: ModifierType.ADD, source: "buff_b",
      }));
      engine.removeModifier("e1", "skill", "buff_a");
      const active = engine.getActiveModifiers("e1", "skill");
      expect(active.length).toBe(1);
      expect(active[0]!.source).toBe("buff_b");
    });

    it("removes expired modifiers", () => {
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "skill", value: 0.2, modifier_type: ModifierType.ADD, source: "test",
        expires_at: Date.now() / 1000 - 1,
      }));
      engine.removeExpiredModifiers("e1");
      expect(engine.getActiveModifiers("e1", "skill").length).toBe(0);
    });

    it("handles stacking rules", () => {
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "skill", value: 0.2, modifier_type: ModifierType.ADD, source: "a",
        stacking_rule: StackingRule.TAKE_HIGHEST,
      }));
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "skill", value: 0.5, modifier_type: ModifierType.ADD, source: "b",
        stacking_rule: StackingRule.TAKE_HIGHEST,
      }));
      const active = engine.getActiveModifiers("e1", "skill");
      expect(active.length).toBe(1);
      expect(active[0]!.value).toBe(0.5);
    });

    it("clears all modifiers", () => {
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "skill", value: 0.2, modifier_type: ModifierType.ADD, source: "a",
      }));
      engine.clearAllModifiers("e1");
      expect(engine.getAllModifiers("e1").length).toBe(0);
    });
  });

  describe("parameter computation", () => {
    it("computes static parameter", () => {
      const param = new ProbabilityParameter({
        name: "test", base_value: 0.7, weight: 1.0, param_type: ParameterType.STATIC,
      });
      const val = engine.computeParameterValue(param, {}, "e1");
      expect(val).toBe(0.7);
    });

    it("computes dynamic parameter from context", () => {
      const param = new ProbabilityParameter({
        name: "test", base_value: 0.5, weight: 1.0, param_type: ParameterType.DYNAMIC,
        dynamic_source: "actor_health",
      });
      const val = engine.computeParameterValue(param, { actor_health: 0.8 }, "e1");
      expect(val).toBe(0.8);
    });

    it("computes relationship parameter", () => {
      const param = new ProbabilityParameter({
        name: "test", base_value: 0.5, weight: 1.0, param_type: ParameterType.RELATIONSHIP,
      });
      const val = engine.computeParameterValue(param, { relationship_strength: 0.9 }, "e1");
      expect(val).toBe(0.9);
    });

    it("applies add modifiers", () => {
      const param = new ProbabilityParameter({
        name: "test", base_value: 0.5, weight: 1.0, param_type: ParameterType.STATIC,
      });
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "test", value: 0.2, modifier_type: ModifierType.ADD, source: "buff",
      }));
      const val = engine.computeParameterValue(param, {}, "e1");
      expect(val).toBe(0.7);
    });

    it("applies multiply modifiers", () => {
      const param = new ProbabilityParameter({
        name: "test", base_value: 0.5, weight: 1.0, param_type: ParameterType.STATIC,
      });
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "test", value: 2.0, modifier_type: ModifierType.MULTIPLY, source: "buff",
      }));
      const val = engine.computeParameterValue(param, {}, "e1");
      expect(val).toBe(1.0);
    });

    it("applies replace modifier", () => {
      const param = new ProbabilityParameter({
        name: "test", base_value: 0.5, weight: 1.0, param_type: ParameterType.STATIC,
      });
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "test", value: 0.9, modifier_type: ModifierType.REPLACE, source: "override",
      }));
      const val = engine.computeParameterValue(param, {}, "e1");
      expect(val).toBe(0.9);
    });

    it("clamps to min/max", () => {
      const param = new ProbabilityParameter({
        name: "test", base_value: 0.5, weight: 1.0, param_type: ParameterType.STATIC,
        min_value: 0.2, max_value: 0.8,
      });
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "test", value: 0.5, modifier_type: ModifierType.ADD, source: "buff",
      }));
      const val = engine.computeParameterValue(param, {}, "e1");
      expect(val).toBe(0.8);
    });
  });

  describe("probability computation", () => {
    it("computes with sum_weighted formula", () => {
      const profile = makeProfile({ formula: "sum_weighted" });
      const prob = engine.compute(profile, {});
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    });

    it("computes with product formula", () => {
      const profile = makeProfile({ formula: "product" });
      const prob = engine.compute(profile, {});
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    });

    it("computes with logistic formula", () => {
      const profile = makeProfile({ formula: "logistic" });
      const prob = engine.compute(profile, {});
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    });

    it("applies difficulty modifier", () => {
      const easy = makeProfile({ difficultyModifier: 0.5 });
      const hard = makeProfile({ difficultyModifier: 1.5 });
      const probEasy = engine.compute(easy, {});
      const probHard = engine.compute(hard, {});
      expect(probEasy).toBeLessThan(probHard);
    });

    it("applies global luck", () => {
      const engineLucky = new ProbabilityEngine(0.8);
      const engineUnlucky = new ProbabilityEngine(0.2);
      const probLucky = engineLucky.compute(GENERIC, {});
      const probUnlucky = engineUnlucky.compute(GENERIC, {});
      expect(probLucky).toBeGreaterThan(probUnlucky);
    });
  });

  describe("roll", () => {
    it("returns success when roll < probability", () => {
      const result = engine.roll(GENERIC, {}, undefined, 0.1);
      expect(result.success).toBe(true);
      expect(result.quality).not.toBe(OutcomeQuality.FAILURE);
    });

    it("returns failure when roll >= probability", () => {
      const result = engine.roll(GENERIC, {}, undefined, 0.99);
      expect(result.success).toBe(false);
    });

    it("uses explicit roll", () => {
      const result = engine.roll(GENERIC, {}, undefined, 0.5);
      expect(result.roll).toBe(0.5);
    });

    it("determines critical success", () => {
      const profile = makeProfile();
      const result = engine.roll(profile, {}, undefined, 0.01);
      expect(result.success).toBe(true);
    });

    it("determines critical failure", () => {
      const profile = makeProfile();
      const result = engine.roll(profile, {}, undefined, 0.99);
      expect(result.success).toBe(false);
    });
  });

  describe("profiles", () => {
    it("combat profile has expected parameters", () => {
      expect(COMBAT.getParamNames()).toContain("combat_skill");
      expect(COMBAT.getParamNames()).toContain("health_factor");
      expect(COMBAT.getParamNames()).toContain("target_defense");
    });

    it("persuasion profile uses logistic formula", () => {
      expect(PERSUASION.formula).toBe("logistic");
    });

    it("stealth profile uses product formula", () => {
      expect(STEALTH.formula).toBe("product");
    });

    it("birth race profile exists", () => {
      expect(BIRTH_RACE.getParamNames()).toContain("world_rarity");
      expect(BIRTH_RACE.getParamNames()).toContain("user_hint");
    });
  });

  describe("serialization", () => {
    it("serializes and deserializes modifiers", () => {
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "skill", value: 0.3, modifier_type: ModifierType.ADD, source: "test",
      }));
      const data = engine.serializeModifiers();
      const engine2 = new ProbabilityEngine();
      engine2.deserializeModifiers(data);
      const mods = engine2.getAllModifiers("e1");
      expect(mods.length).toBe(1);
      expect(mods[0]!.value).toBe(0.3);
    });
  });

  describe("skill progression", () => {
    it("improves skill with diminishing returns", () => {
      const stored = new Map<string, Record<string, number>>();
      stored.set("e1", { strength: 0.5 });
      const mockSkills: INpcSkillsManager = {
        get: (uid) => ({ skills: stored.get(uid) }),
        setSkills: (uid, skills) => stored.set(uid, { ...skills }),
        save: () => {},
      };
      engine.setNpcSkills(mockSkills);
      engine.improveSkill("e1", "strength", 0.1);
      expect(engine.getSkill("e1", "strength")).toBeCloseTo(0.55);
    });

    it("returns 0.5 when no skills manager", () => {
      expect(engine.getSkill("e1", "strength")).toBe(0.5);
    });
  });

  describe("modifier summary", () => {
    it("returns summary grouped by parameter", () => {
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "skill", value: 0.2, modifier_type: ModifierType.ADD, source: "a",
      }));
      engine.applyModifier("e1", new ProbabilityModifier({
        parameter_name: "health", value: 0.3, modifier_type: ModifierType.ADD, source: "b",
      }));
      const summary = engine.getModifierSummary("e1") as { totalModifiers: number; byParameter: Record<string, unknown[]> };
      expect(summary.totalModifiers).toBe(2);
      expect(summary.byParameter["skill"]!.length).toBe(1);
      expect(summary.byParameter["health"]!.length).toBe(1);
    });
  });
});
