import { describe, test, expect } from "bun:test";
import { createItem, applyItemBoost, canAddBoost, formatItemWithBoost } from "./item";

describe("createItem", () => {
  test("creates item with given params", () => {
    const item = createItem("i1", "Magic Sword", "A glowing blade", "weapon");
    expect(item.id).toBe("i1");
    expect(item.name).toBe("Magic Sword");
    expect(item.isUnique).toBe(false);
    expect(item.category).toBe("weapon");
  });
});

describe("applyItemBoost", () => {
  test("applies percentage boost", () => {
    expect(applyItemBoost(100, { stat: "power", multiplier: 0.1, reason: "test" })).toBe(110);
    expect(applyItemBoost(100, { stat: "power", multiplier: 0.05, reason: "test" })).toBe(105);
  });

  test("floors result", () => {
    expect(applyItemBoost(103, { stat: "power", multiplier: 0.1, reason: "test" })).toBe(113);
  });
});

describe("canAddBoost", () => {
  test("allows adding under max", () => {
    expect(canAddBoost(5, 10)).toBe(true);
    expect(canAddBoost(0)).toBe(true);
  });

  test("blocks at max", () => {
    expect(canAddBoost(10, 10)).toBe(false);
    expect(canAddBoost(11, 10)).toBe(false);
  });
});

describe("formatItemWithBoost", () => {
  test("formats item without boost", () => {
    expect(formatItemWithBoost(createItem("i1", "Sword", "desc"))).toBe("Sword");
  });

  test("formats item with boost", () => {
    const item = createItem("i1", "Sword", "desc");
    item.boost = { stat: "power", multiplier: 0.05, reason: "enchanted" };
    const result = formatItemWithBoost(item);
    expect(result).toContain("Sword");
    expect(result).toContain("УНИКАЛЬНЫЙ");
    expect(result).toContain("5%");
  });
});
