import { describe, test, expect, beforeEach } from "bun:test";
import { createEconomyState, addNPCToEconomy, processTurn, processTurnWithEconomy } from "./npc-economy-runtime";
import { EconomicService } from "./economic-service";
import { EconomicDB } from "../mcp/literary-compiler/economic-schema";
import { RankType } from "../models/rank";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

describe("npc-economy-runtime", () => {
  let db: EconomicDB;
  let service: EconomicService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "npc-econ-test-"));
    db = new EconomicDB(join(tmpDir, "test.db"));
    service = new EconomicService(db);
  });

  test("processTurn without economic service works as before", () => {
    const state = createEconomyState();
    const stateWithNpc = addNPCToEconomy(state, "npc1", "Test", RankType.COMMONER, "farmer", 30, "phlegmatic");
    const result = processTurn(stateWithNpc);
    expect(result.turn).toBe(1);
    expect(result.npcs.size).toBe(1);
  });

  test("processTurnWithEconomy applies fixed labor rules", () => {
    // Use BARONET (baseTaxRate=0.3) to avoid bankruptcy
    const state = createEconomyState();
    const stateWithNpc = addNPCToEconomy(state, "npc1", "Test", RankType.BARONET, "farmer", 30, "phlegmatic");

    // Set fixed wage of 5000 for BARONET faction
    service.setLaborRule(RankType.BARONET, true, 5000, 0);

    const result = processTurnWithEconomy(stateWithNpc, service);
    const npc = result.npcs.get("npc1");
    expect(npc).toBeDefined();
    expect(npc!.income).toBe(5000); // Fixed wage overrides base income
  });

  test("processTurnWithEconomy with proportional labor rule", () => {
    // Use BARONET (baseTaxRate=0.3) to avoid bankruptcy
    const state = createEconomyState();
    const stateWithNpc = addNPCToEconomy(state, "npc1", "Test", RankType.BARONET, "farmer", 30, "phlegmatic");

    // Set proportional wage: 1000 * 8 hours * 1.0 productivity = 8000
    service.setLaborRule(RankType.BARONET, false, 1000, 0);

    const result = processTurnWithEconomy(stateWithNpc, service);
    const npc = result.npcs.get("npc1");
    expect(npc!.income).toBe(8000); // 1000 * 8 * 1.0
  });

  test("processTurnWithEconomy without labor rule keeps original income", () => {
    const state = createEconomyState();
    const stateWithNpc = addNPCToEconomy(state, "npc1", "Test", RankType.BARONET, "farmer", 30, "phlegmatic");
    const originalIncome = stateWithNpc.npcs.get("npc1")!.income;

    const result = processTurnWithEconomy(stateWithNpc, service);
    const npc = result.npcs.get("npc1");
    // Without a labor rule, income stays as original
    expect(npc!.income).toBe(originalIncome);
  });

  test("processTurnWithEconomy applies loyalty modifier", () => {
    // Use BARONET (baseTaxRate=0.3) to avoid bankruptcy
    const state = createEconomyState();
    const stateWithNpc = addNPCToEconomy(state, "npc1", "Test", RankType.BARONET, "farmer", 30, "phlegmatic");
    const initialLoyalty = stateWithNpc.npcs.get("npc1")!.loyalty;

    // Set labor rule with loyalty modifier of 0.1 (10% boost)
    service.setLaborRule(RankType.BARONET, false, 1000, 0.1);

    const result = processTurnWithEconomy(stateWithNpc, service);
    const npc = result.npcs.get("npc1");
    // Loyalty should increase by 0.1 * 100 = 10
    expect(npc!.loyalty).toBe(initialLoyalty + 10);
  });

  test("processTurnWithEconomy preserves NPC count", () => {
    let state = createEconomyState();
    state = addNPCToEconomy(state, "npc1", "Alice", RankType.BARONET, "farmer", 25, "sanguine");
    state = addNPCToEconomy(state, "npc2", "Bob", RankType.BARON, "noble", 40, "choleric");

    service.setLaborRule(RankType.BARONET, true, 5000, 0);
    service.setLaborRule(RankType.BARON, false, 1000, 0.05);

    const result = processTurnWithEconomy(state, service);
    expect(result.npcs.size).toBe(2);
    expect(result.turn).toBe(1);
  });

  test("processTurnWithEconomy different ranks get different wages", () => {
    let state = createEconomyState();
    state = addNPCToEconomy(state, "npc1", "Worker", RankType.BARONET, "laborer", 25, "phlegmatic");
    state = addNPCToEconomy(state, "npc2", "Lord", RankType.BARON, "noble", 45, "choleric");

    service.setLaborRule(RankType.BARONET, true, 5000, 0);
    service.setLaborRule(RankType.BARON, true, 20000, 0);

    const result = processTurnWithEconomy(state, service);
    expect(result.npcs.get("npc1")!.income).toBe(5000);
    expect(result.npcs.get("npc2")!.income).toBe(20000);
  });
});
