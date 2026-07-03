import { describe, test, expect } from "bun:test";
import {
  calculateTaxRate, bribeRisk, checkBetrayalRisk, canBuyFreedom,
  losePowerToSlavery, getNPCRankTitle, getNPCSummary,
  slaveEconomy, processFood, processTreasury, processInheritance,
  createNPCWithEconomy,
} from "./npc-economy";
import { RankType } from "../models/rank";

function makeNPC(rank = RankType.COMMONER, archetype = "farmer") {
  return createNPCWithEconomy("npc1", "Test", rank, archetype, 30, "phlegmatic");
}

describe("calculateTaxRate", () => {
  test("base tax for commoner", () => {
    const rate = calculateTaxRate(0, 0, RankType.COMMONER);
    expect(rate).toBeCloseTo(0.9, 5);
  });

  test("high power reduces tax", () => {
    const rate = calculateTaxRate(5000, 0, RankType.COMMONER);
    expect(rate).toBeLessThan(0.9);
  });

  test("never goes below 0", () => {
    const rate = calculateTaxRate(100000, 100000, RankType.COMMONER);
    expect(rate).toBeGreaterThanOrEqual(0);
  });
});

describe("bribeRisk", () => {
  test("base risk is 0.1", () => {
    const risk = bribeRisk(0, 0, 0, 0);
    expect(risk).toBeCloseTo(0.1, 5);
  });

  test("more witnesses increases risk", () => {
    expect(bribeRisk(0, 0, 0, 5)).toBeGreaterThan(bribeRisk(0, 0, 0, 0));
  });

  test("higher taker intrigue reduces risk", () => {
    expect(bribeRisk(0, 500, 0, 0)).toBeLessThan(bribeRisk(0, 0, 0, 0));
  });

  test("risk capped at 0.95", () => {
    const risk = bribeRisk(0, 0, 100000, 100);
    expect(risk).toBeLessThanOrEqual(0.95);
  });

  test("risk never below 0", () => {
    const risk = bribeRisk(0, 1000, 0, 0);
    expect(risk).toBeGreaterThanOrEqual(0);
  });
});

describe("checkBetrayalRisk", () => {
  test("zero income returns 1", () => {
    expect(checkBetrayalRisk(0.9, 0, 0, 500)).toBe(1);
  });

  test("high loyalty reduces risk", () => {
    const low = checkBetrayalRisk(0.5, 100, 0, 200);
    const high = checkBetrayalRisk(0.5, 100, 0, 900);
    expect(high).toBeLessThan(low);
  });
});

describe("canBuyFreedom", () => {
  test("needs half of next rank's wealthMin", () => {
    expect(canBuyFreedom(0, RankType.SLAVE)).toBe(true);
    expect(canBuyFreedom(0, RankType.COMMONER)).toBe(true);
  });
});

describe("losePowerToSlavery", () => {
  test("sets rank to SLAVE", () => {
    const npc = makeNPC(RankType.BARON);
    const slave = losePowerToSlavery(npc);
    expect(slave.rank).toBe(RankType.SLAVE);
    expect(slave.stats.wealth).toBe(0);
    expect(slave.stats.power).toBe(0);
    expect(slave.taxRate).toBe(1.0);
  });

  test("preserves health and experience", () => {
    const npc = makeNPC(RankType.BARON);
    const slave = losePowerToSlavery(npc);
    expect(slave.stats.health).toBe(npc.stats.health);
    expect(slave.stats.experience).toBe(npc.stats.experience);
  });
});

describe("getNPCRankTitle", () => {
  test("returns Russian titles", () => {
    expect(getNPCRankTitle(RankType.SLAVE)).toBe("Раб");
    expect(getNPCRankTitle(RankType.KING)).toBe("Король");
    expect(getNPCRankTitle(RankType.EMPEROR)).toBe("Император");
  });
});

describe("getNPCSummary", () => {
  test("returns multi-line summary", () => {
    const npc = makeNPC();
    const summary = getNPCSummary(npc);
    expect(summary).toContain("Test");
    expect(summary).toContain("Возраст: 30");
    expect(summary).toContain("Богатство:");
  });
});

describe("slaveEconomy", () => {
  test("production > consumption", () => {
    const npc = makeNPC(RankType.SLAVE);
    const food = slaveEconomy(npc);
    expect(food.consumption).toBe(30);
    expect(food.production).toBeGreaterThanOrEqual(300);
    expect(food.surplus).toBeGreaterThan(0);
  });
});

describe("processFood", () => {
  test("farmer produces food", () => {
    const npc = makeNPC(RankType.COMMONER, "farmer");
    const food = processFood(npc);
    expect(food.production).toBeGreaterThanOrEqual(500);
  });

  test("non-farmer produces 0 food", () => {
    const npc = makeNPC(RankType.COMMONER, "guard");
    const food = processFood(npc);
    expect(food.production).toBe(0);
  });
});

describe("processTreasury", () => {
  test("calculates taxes and tribute", () => {
    const npc = makeNPC(RankType.COMMONER);
    npc.income = 100;
    const t = processTreasury(npc);
    expect(t.taxes).toBeGreaterThanOrEqual(0);
    expect(t.income).toBeGreaterThanOrEqual(0);
  });
});

describe("processInheritance", () => {
  test("creates child NPCs", () => {
    const npc = makeNPC(RankType.BARON);
    npc.children = 2;
    const heirs = processInheritance(npc);
    expect(heirs).toHaveLength(2);
    expect(heirs[0]!.age).toBe(18);
    expect(heirs[0]!.rank).toBe(RankType.BARON);
  });

  test("no children = empty array", () => {
    const npc = makeNPC();
    npc.children = 0;
    expect(processInheritance(npc)).toEqual([]);
  });
});
