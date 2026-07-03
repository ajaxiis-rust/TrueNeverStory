import { describe, test, expect } from "bun:test";
import {
  createDefaultStats, createDefaultVices, createDefaultFamilyExpenses,
  childrenCount, ageDecay, viceDecay, createInheritance,
} from "./npc-stats";

describe("createDefaultStats", () => {
  test("returns stats for known rank", () => {
    const s = createDefaultStats("king");
    expect(s.wealth).toBe(2000000000);
    expect(s.power).toBe(50000);
    expect(s.health).toBe(600);
  });

  test("returns commoner defaults for unknown rank", () => {
    const s = createDefaultStats("unknown");
    expect(s.wealth).toBe(100);
    expect(s.power).toBe(10);
  });

  test("slave has zero wealth", () => {
    const s = createDefaultStats("slave");
    expect(s.wealth).toBe(0);
    expect(s.power).toBe(0);
  });
});

describe("createDefaultVices", () => {
  test("all vices are zero", () => {
    const v = createDefaultVices();
    expect(v.gluttony).toBe(0);
    expect(v.wrath).toBe(0);
    expect(v.greed).toBe(0);
    expect(v.sloth).toBe(0);
  });
});

describe("createDefaultFamilyExpenses", () => {
  test("calculates based on income", () => {
    const f = createDefaultFamilyExpenses(1000);
    expect(f.wife).toBe(500);
    expect(f.children).toBe(100);
  });
});

describe("childrenCount", () => {
  test("young characters have no children", () => {
    expect(childrenCount(20, "phlegmatic")).toBe(0);
  });

  test("prime age characters have children", () => {
    const count = childrenCount(35, "sanguine");
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("choleric temperament adds 1", () => {
    expect(childrenCount(35, "choleric")).toBeGreaterThanOrEqual(childrenCount(35, "phlegmatic"));
  });

  test("melancholic subtracts 1", () => {
    expect(childrenCount(35, "melancholic")).toBeLessThanOrEqual(childrenCount(35, "choleric"));
  });

  test("elderly have no children", () => {
    expect(childrenCount(70, "sanguine")).toBe(0);
  });

  test("never goes below 0", () => {
    expect(childrenCount(20, "melancholic")).toBeGreaterThanOrEqual(0);
  });
});

describe("ageDecay", () => {
  test("increases during growth phase", () => {
    const young = ageDecay(100, 15, 1);
    const adult = ageDecay(100, 35, 1);
    expect(young).toBeGreaterThan(100);
    expect(adult).toBeGreaterThanOrEqual(100);
  });

  test("decreases in old age", () => {
    const old = ageDecay(100, 70, 1);
    expect(old).toBeLessThan(100);
  });

  test("very old characters have very low stats", () => {
    const ancient = ageDecay(100, 100, 1);
    expect(ancient).toBeLessThan(0);
  });
});

describe("viceDecay", () => {
  test("no vices means no decay", () => {
    const v = createDefaultVices();
    expect(viceDecay(100, v)).toBe(100);
  });

  test("wrath has highest decay factor", () => {
    const base = { ...createDefaultVices(), wrath: 1 };
    const greed = { ...createDefaultVices(), greed: 1 };
    expect(viceDecay(100, base)).toBeLessThan(viceDecay(100, greed));
  });

  test("never goes below 0", () => {
    const heavy = { ...createDefaultVices(), wrath: 10, gluttony: 10 };
    expect(viceDecay(10, heavy)).toBe(0);
  });
});

describe("createInheritance", () => {
  test("inherits partial wealth", () => {
    const parent = {
      stats: { wealth: 1000, power: 0, popularity: 0, health: 0, experience: 0, intrigue: 0 },
      vices: createDefaultVices(),
    } as any;
    const inh = createInheritance(parent);
    expect(inh.wealth).toBeGreaterThan(0);
    expect(inh.wealth).toBeLessThanOrEqual(1000);
  });

  test("vices are reduced to 30%", () => {
    const parent = {
      stats: { wealth: 100, power: 0, popularity: 0, health: 0, experience: 0, intrigue: 0 },
      vices: { ...createDefaultVices(), wrath: 1.0 },
    } as any;
    const inh = createInheritance(parent);
    expect(inh.vices.wrath).toBeCloseTo(0.3, 5);
  });
});
