import { describe, test, expect, beforeEach } from "bun:test";
import { EconomicMCPTools } from "./economic";
import { EconomicService } from "@/services/economic-service";
import { EconomicDB } from "../literary-compiler/economic-schema";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

describe("EconomicMCPTools", () => {
  let db: EconomicDB;
  let service: EconomicService;
  let tools: EconomicMCPTools;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "econ-mcp-test-"));
    db = new EconomicDB(join(tmpDir, "test.db"));
    service = new EconomicService(db);
    tools = new EconomicMCPTools(service);
  });

  // ─── getEconomicPhase ────────────────────────────────────────────

  test("getEconomicPhase returns null when no cycle", async () => {
    const result = await tools.getEconomicPhase({ worldId: "world-1" });
    expect(result.phase).toBeNull();
    expect(result.reserve).toBe(0);
    expect(result.priceModifier).toBe(1.0);
  });

  test("getEconomicPhase returns abundance when cycle active", async () => {
    service.startCycle("world-1", 1000);
    const result = await tools.getEconomicPhase({ worldId: "world-1" });
    expect(result.phase).toBe("abundance");
    expect(result.reserve).toBe(1000);
    expect(result.priceModifier).toBe(0.8);
  });

  // ─── getPriceModifier ───────────────────────────────────────────

  test("getPriceModifier returns 1.0 when no cycle", async () => {
    const result = await tools.getPriceModifier({ worldId: "world-1" });
    expect(result.modifier).toBe(1.0);
  });

  test("getPriceModifier returns abundance modifier", async () => {
    service.startCycle("world-1", 1000);
    const result = await tools.getPriceModifier({ worldId: "world-1" });
    expect(result.modifier).toBe(0.8);
  });

  // ─── calculatePrice ─────────────────────────────────────────────

  test("calculatePrice applies modifier", async () => {
    service.startCycle("world-1", 1000);
    const result = await tools.calculatePrice({ worldId: "world-1", basePrice: 100 });
    expect(result.basePrice).toBe(100);
    expect(result.modifier).toBe(0.8);
    expect(result.finalPrice).toBe(80);
  });

  // ─── getWage ────────────────────────────────────────────────────

  test("getWage with no rule returns standard wage", async () => {
    const result = await tools.getWage({
      faction: "unknown",
      baseWage: 10,
      workedHours: 8,
    });
    expect(result.faction).toBe("unknown");
    expect(result.wage).toBe(80); // 10 * 8 * 1.0
    expect(result.isFixed).toBe(false);
  });

  test("getWage with fixed rule", async () => {
    service.setLaborRule("blacksmiths", true, 50, 0);
    const result = await tools.getWage({
      faction: "blacksmiths",
      baseWage: 10,
      workedHours: 8,
    });
    expect(result.wage).toBe(50);
    expect(result.isFixed).toBe(true);
  });

  // ─── generateDilemma ────────────────────────────────────────────

  test("generateDilemma may return null (chance-based)", async () => {
    let generated = false;
    for (let i = 0; i < 20; i++) {
      const result = await tools.generateDilemma({
        worldId: "world-1",
        factionA: "Blacksmiths",
        factionB: "Farmers",
      });
      if (result.generated) {
        generated = true;
        expect(result.dilemmaId).not.toBeNull();
        expect(result.message).not.toBeNull();
        expect(result.choices).toHaveLength(3);
        break;
      }
    }
    expect(generated).toBe(true);
  });

  // ─── checkJubilee ───────────────────────────────────────────────

  test("checkJubilee returns false before cycle", async () => {
    const result = await tools.checkJubilee({ worldId: "world-1", currentYear: 30 });
    expect(result.shouldTrigger).toBe(false);
    expect(result.yearsUntil).toBe(20);
    expect(result.nextYear).toBe(50);
  });

  test("checkJubilee returns true at cycle year", async () => {
    const result = await tools.checkJubilee({ worldId: "world-1", currentYear: 50 });
    expect(result.shouldTrigger).toBe(true);
  });

  // ─── getJubileeInfo ─────────────────────────────────────────────

  test("getJubileeInfo returns cycle info", async () => {
    const result = await tools.getJubileeInfo({ worldId: "world-1", currentYear: 30 });
    expect(result.yearsUntil).toBe(20);
    expect(result.nextYear).toBe(50);
    expect(result.lastYear).toBeNull();
    expect(result.config.cycleYears).toBe(50);
    expect(result.config.resetDebts).toBe(true);
  });
});
