/**
 * Rule Validator tests
 */

import { describe, it, expect } from "bun:test";
import { validateRule, validateRuleFile, validateAllRules } from "./rule-validator";
import { join } from "node:path";

describe("RuleValidator", () => {
  it("validates a valid rule", () => {
    const rule = {
      id: "test",
      name: "Test Rule",
      description: "A test rule",
      social: {
        hierarchy: ["a", "b"],
        mobility: "full",
        education: "universal",
        military_service: "volunteer",
        marriage: "free",
        law: "codified",
      },
      economy: {
        currency: "gold",
        tax_rate: 0.15,
        trade: "free_market",
        property: "private",
        labor: "wage",
      },
      enforced_rules: [
        { rule: "test_rule", penalty: "fine" },
      ],
    };
    const result = validateRule(rule);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("fails for missing required fields", () => {
    const rule = { id: "test" };
    const result = validateRule(rule);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("fails for invalid tax_rate", () => {
    const rule = {
      id: "test",
      name: "Test",
      description: "Test",
      social: { hierarchy: [] },
      economy: { currency: "gold", tax_rate: 1.5, trade: "free", property: "private", labor: "wage" },
      enforced_rules: [],
    };
    const result = validateRule(rule);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "economy.tax_rate")).toBe(true);
  });

  it("validates real feudalism rule file", () => {
    const filePath = join(import.meta.dir, "social", "feudalism.json");
    const result = validateRuleFile(filePath);
    expect(result.valid).toBe(true);
  });

  it("validates all rules in directory", () => {
    const socialDir = join(import.meta.dir, "social");
    const results = validateAllRules(socialDir);
    expect(results.length).toBeGreaterThan(0);
    const invalid = results.filter((r) => !r.result.valid);
    expect(invalid.length).toBe(0);
  });
});
