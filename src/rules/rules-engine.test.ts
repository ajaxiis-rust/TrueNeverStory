/**
 * Rules Engine tests
 */

import { describe, it, expect } from "bun:test";
import { RulesEngine } from "./rules-engine";

describe("RulesEngine", () => {
  it("loads feudalism rules", () => {
    const engine = new RulesEngine({ primary: "feudalism" });
    const rules = engine.getRules();
    expect(rules.id).toBe("feudalism");
    expect(rules.social.hierarchy).toEqual(["king", "duke", "lord", "knight", "peasant"]);
    expect(rules.economy.tax_rate).toBe(0.25);
  });

  it("loads democracy rules", () => {
    const engine = new RulesEngine({ primary: "democracy" });
    const rules = engine.getRules();
    expect(rules.id).toBe("democracy");
    expect(rules.social.hierarchy).toEqual(["citizen"]);
    expect(rules.economy.tax_rate).toBe(0.15);
  });

  it("merges modifiers with primary", () => {
    const engine = new RulesEngine({
      primary: "feudalism",
      modifiers: ["capitalism"],
    });
    const rules = engine.getRules();
    // Hierarchy overridden by capitalism modifier
    expect(rules.social.hierarchy).toEqual(["bourgeoisie", "middle_class", "working_class", "poor"]);
    // Economy from capitalism overrides
    expect(rules.economy.tax_rate).toBe(0.10);
    // Combined enforced rules
    expect(rules.enforced_rules.length).toBeGreaterThan(3);
  });

  it("checks hierarchy correctly", () => {
    const engine = new RulesEngine({ primary: "feudalism" });
    expect(engine.canCommand("king", "peasant")).toBe(true);
    expect(engine.canCommand("peasant", "king")).toBe(false);
    expect(engine.canCommand("lord", "knight")).toBe(true);
    expect(engine.canCommand("knight", "lord")).toBe(false);
  });

  it("gets hierarchy level", () => {
    const engine = new RulesEngine({ primary: "feudalism" });
    expect(engine.getHierarchyLevel("king")).toBe(0);
    expect(engine.getHierarchyLevel("peasant")).toBe(4);
    expect(engine.getHierarchyLevel("unknown")).toBe(-1);
  });

  it("checks enforced rules", () => {
    const engine = new RulesEngine({ primary: "feudalism" });
    expect(engine.canAct("peasant_cannot_refuse_lord")).toBe(true);
    expect(engine.getPenalty("peasant_cannot_refuse_lord")).toBe("imprisonment");
  });

  it("gets tax rate", () => {
    const feudal = new RulesEngine({ primary: "feudalism" });
    expect(feudal.getTaxRate()).toBe(0.25);

    const democracy = new RulesEngine({ primary: "democracy" });
    expect(democracy.getTaxRate()).toBe(0.15);
  });

  it("checks trade availability", () => {
    const feudal = new RulesEngine({ primary: "feudalism" });
    expect(feudal.canTrade()).toBe(true);

    const anarchy = new RulesEngine({ primary: "anarchy" });
    expect(anarchy.canTrade()).toBe(true);
  });

  it("throws for unknown rule", () => {
    expect(() => new RulesEngine({ primary: "nonexistent" })).toThrow("Rule not found");
  });

  it("handles anarchy rules", () => {
    const engine = new RulesEngine({ primary: "anarchy" });
    const rules = engine.getRules();
    expect(rules.social.hierarchy).toEqual([]);
    expect(rules.economy.tax_rate).toBe(0);
    expect(rules.politics?.succession).toBe("none");
  });
});

describe("New social rules", () => {
  it("loads mercantilism rules", () => {
    const engine = new RulesEngine({ primary: "mercantilism" });
    const rules = engine.getRules();
    expect(rules.id).toBe("mercantilism");
    expect(rules.social.hierarchy[0]).toBe("merchant_prince");
    expect(rules.economy.trade).toBe("state_controlled");
  });

  it("loads tribalism rules", () => {
    const engine = new RulesEngine({ primary: "tribalism" });
    const rules = engine.getRules();
    expect(rules.id).toBe("tribalism");
    expect(rules.economy.currency).toBe("barter");
    expect(rules.economy.tax_rate).toBe(0);
  });

  it("loads theocracy rules", () => {
    const engine = new RulesEngine({ primary: "theocracy" });
    const rules = engine.getRules();
    expect(rules.id).toBe("theocracy");
    expect(rules.economy.tax_rate).toBe(0.30);
    expect(rules.enforced_rules.length).toBe(5);
  });

  it("loads communism rules", () => {
    const engine = new RulesEngine({ primary: "communism" });
    const rules = engine.getRules();
    expect(rules.id).toBe("communism");
    expect(rules.economy.currency).toBe("none");
    expect(rules.economy.tax_rate).toBe(1.0);
  });

  it("loads silver-economy rules", () => {
    const engine = new RulesEngine({ primary: "silver-economy" });
    const rules = engine.getRules();
    expect(rules.id).toBe("silver-economy");
    expect(rules.economy.currency).toBe("silver");
    expect(rules.economy.inflation).toBe(0.02);
  });

  it("lists all available rules", () => {
    const rules = RulesEngine.listAvailableRules();
    expect(rules).toContain("feudalism");
    expect(rules).toContain("mercantilism");
    expect(rules).toContain("tribalism");
    expect(rules).toContain("theocracy");
    expect(rules).toContain("communism");
    expect(rules).toContain("silver-economy");
    expect(rules.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Synergy Matrix", () => {
  it("loads synergy matrix", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const matrix = readJsonFileSync(join(import.meta.dir, "synergy-matrix.json"));
    expect(matrix.synergies.length).toBeGreaterThan(0);
    expect(matrix.resistances.length).toBeGreaterThan(0);
  });

  it("finds synergy between feudalism and mercantilism", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const matrix = readJsonFileSync(join(import.meta.dir, "synergy-matrix.json"));
    const synergy = matrix.synergies.find(
      (s: any) => s.rules.includes("feudalism") && s.rules.includes("mercantilism")
    );
    expect(synergy).toBeDefined();
    expect(synergy.type).toBe("positive");
  });
});

describe("Tech Dependencies", () => {
  it("loads tech dependencies", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const tech = readJsonFileSync(join(import.meta.dir, "tech-dependency.json"));
    expect(tech.dependencies.feudalism).toBeDefined();
    expect(tech.dependencies.democracy.prerequisites.length).toBeGreaterThan(0);
  });

  it("democracy requires literacy", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const tech = readJsonFileSync(join(import.meta.dir, "tech-dependency.json"));
    expect(tech.dependencies.democracy.prerequisites).toContain("literacy_rate_above_50");
  });
});

describe("Happiness Modifiers", () => {
  it("loads happiness modifiers", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const happiness = readJsonFileSync(join(import.meta.dir, "happiness-modifiers.json"));
    expect(happiness.base_happiness).toBe(50);
    expect(happiness.modifiers.feudalism).toBeDefined();
    expect(happiness.happiness_effects.above_80.productivity).toBe(1.2);
  });

  it("has effects for all social rules", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const happiness = readJsonFileSync(join(import.meta.dir, "happiness-modifiers.json"));
    const socialRules = ["feudalism", "democracy", "anarchy", "theocracy", "communism", "tribalism", "capitalism", "socialism", "mercantilism", "slavery"];
    for (const rule of socialRules) {
      expect(happiness.modifiers[rule]).toBeDefined();
    }
  });
});
