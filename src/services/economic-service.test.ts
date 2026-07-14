import { describe, test, expect, beforeEach } from "bun:test";
import { EconomicService } from "./economic-service";
import { EconomicDB } from "../mcp/literary-compiler/economic-schema";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

describe("EconomicService", () => {
  let db: EconomicDB;
  let service: EconomicService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "econ-test-"));
    db = new EconomicDB(join(tmpDir, "test.db"));
    service = new EconomicService(db);
  });

  // ─── Economic Cycles ─────────────────────────────────────────────

  test("checkTick returns null transition when no active cycle", () => {
    const result = service.checkTick("world-1");
    expect(result.cycle_transition).toBe(false);
    expect(result.transition).toBeNull();
    expect(result.messages).toHaveLength(0);
  });

  test("startCycle creates active cycle in abundance phase", () => {
    service.startCycle("world-1", 1000);
    const phase = service.getCurrentPhase("world-1");
    expect(phase).not.toBeNull();
    expect(phase!.phase).toBe("abundance");
    expect(phase!.reserve).toBe(1000);
  });

  test("getPriceModifier returns 1.0 when no cycle", () => {
    expect(service.getPriceModifier("world-1")).toBe(1.0);
  });

  test("getPriceModifier returns abundance modifier when cycle active", () => {
    service.startCycle("world-1", 1000);
    expect(service.getPriceModifier("world-1")).toBe(0.8);
  });

  test("calculatePrice applies price modifier", () => {
    service.startCycle("world-1", 1000);
    // abundance phase: modifier = 0.8
    expect(service.calculatePrice("world-1", 100)).toBe(80);
  });

  test("addToReserve increases reserve", () => {
    service.startCycle("world-1", 1000);
    service.addToReserve("world-1", 500);
    const phase = service.getCurrentPhase("world-1");
    expect(phase!.reserve).toBe(1500);
  });

  test("withdrawFromReserve decreases reserve when sufficient", () => {
    service.startCycle("world-1", 1000);
    const ok = service.withdrawFromReserve("world-1", 300);
    expect(ok).toBe(true);
    const phase = service.getCurrentPhase("world-1");
    expect(phase!.reserve).toBe(700);
  });

  test("withdrawFromReserve returns false when insufficient", () => {
    service.startCycle("world-1", 100);
    const ok = service.withdrawFromReserve("world-1", 200);
    expect(ok).toBe(false);
  });

  // ─── Faction Labor Rules ─────────────────────────────────────────

  test("calculateWage uses labor rules when available (fixed)", () => {
    service.setLaborRule("blacksmiths", true, 50, 0);
    const result = service.calculateWage("blacksmiths", 10, 8, 1.0);
    expect(result.wage).toBe(50);
    expect(result.is_fixed).toBe(true);
    expect(result.faction).toBe("blacksmiths");
  });

  test("calculateWage uses base wage when no rule", () => {
    const result = service.calculateWage("unknown-faction", 10, 8, 1.0);
    expect(result.wage).toBe(80); // 10 * 8 * 1.0
    expect(result.is_fixed).toBe(false);
    expect(result.loyalty_modifier).toBe(0);
  });

  test("calculateWage with proportional wages", () => {
    service.setLaborRule("merchants", false, 15, 0.05);
    const result = service.calculateWage("merchants", 10, 8, 1.0);
    expect(result.wage).toBe(120); // 15 * 8 * 1.0
    expect(result.is_fixed).toBe(false);
    expect(result.loyalty_modifier).toBe(0.05);
  });

  test("getLaborRule returns rule when set", () => {
    service.setLaborRule("farmers", true, 30, 0.1);
    const rule = service.getLaborRule("farmers");
    expect(rule).not.toBeNull();
    expect(rule!.fixed_wages).toBe(true);
    expect(rule!.wage_amount).toBe(30);
  });

  test("getLaborRule returns null when not set", () => {
    expect(service.getLaborRule("nonexistent")).toBeNull();
  });

  test("checkLoyaltyConflict detects fixed-wage disparity", () => {
    service.setLaborRule("workers", true, 50, 0);
    const conflicts = service.checkLoyaltyConflict([
      { name: "Alice", faction: "workers", hours_worked: 4 },
      { name: "Bob", faction: "workers", hours_worked: 12 },
    ]);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]!.conflict).toBe(true);
  });

  // ─── Faction Tax Dilemma ─────────────────────────────────────────

  test("generateDilemma creates dilemma or null (chance-based)", () => {
    // Run multiple times to account for random chance
    let generated = false;
    for (let i = 0; i < 20; i++) {
      const result = service.generateDilemma("world-1", "Blacksmiths", "Farmers");
      if (result) {
        generated = true;
        expect(result.dilemma.faction_a).toBe("Blacksmiths");
        expect(result.dilemma.faction_b).toBe("Farmers");
        expect(result.choices).toHaveLength(3);
        break;
      }
    }
    // With 0.3 chance and 20 attempts, probability of at least one = 1 - 0.7^20 ≈ 0.9999
    expect(generated).toBe(true);
  });

  test("getUnresolvedDilemmas returns empty when none exist", () => {
    expect(service.getUnresolvedDilemmas("world-1")).toHaveLength(0);
  });

  // ─── Jubilee Manager ─────────────────────────────────────────────

  test("checkJubilee returns false before cycle years", () => {
    expect(service.checkJubilee("world-1", 49)).toBe(false);
  });

  test("checkJubilee returns true at cycle years", () => {
    expect(service.checkJubilee("world-1", 50)).toBe(true);
  });

  test("checkJubilee returns true after multiple cycles", () => {
    expect(service.checkJubilee("world-1", 100)).toBe(true);
    expect(service.checkJubilee("world-1", 150)).toBe(true);
  });

  test("triggerJubilee resets debts and lands", () => {
    const result = service.triggerJubilee("world-1", 50, {
      debts: new Map([["npc1", 100], ["npc2", 200]]),
      lands: new Map([["npc1", "farm"]]),
      npcs: ["npc1", "npc2"],
    });
    expect(result.event.debts_reset).toBe(2);
    expect(result.event.lands_returned).toBe(1);
    expect(result.affected_npcs).toEqual(["npc1", "npc2"]);
    expect(result.message).toContain("Jubilee");
  });

  test("getNextJubileeInfo returns years until next", () => {
    const info = service.getNextJubileeInfo("world-1", 30);
    expect(info.years_until).toBe(20);
    expect(info.next_year).toBe(50);
    expect(info.last_year).toBeNull();
  });

  test("getNextJubileeInfo after first jubilee", () => {
    service.triggerJubilee("world-1", 50, {
      debts: new Map(),
      lands: new Map(),
      npcs: [],
    });
    const info = service.getNextJubileeInfo("world-1", 70);
    expect(info.years_until).toBe(30);
    expect(info.next_year).toBe(100);
    expect(info.last_year).toBe(50);
  });

  // ─── Integration ─────────────────────────────────────────────────

  test("full economic cycle simulation", () => {
    service.startCycle("world-1", 1000);

    // Simulate multiple ticks
    for (let i = 0; i < 10; i++) {
      service.checkTick("world-1");
    }

    const phase = service.getCurrentPhase("world-1");
    expect(phase).not.toBeNull();
    // After 10 ticks (each 10 minutes in-game), cycle should still be active
  });

  test("labor rules and cycles work together", () => {
    service.startCycle("world-1", 1000);
    service.setLaborRule("workers", true, 50, 0.1);

    const wage = service.calculateWage("workers", 10, 8, 1.0);
    const price = service.calculatePrice("world-1", 100);

    expect(wage.wage).toBe(50); // Fixed wage unaffected by cycle
    expect(price).toBe(80); // Price affected by abundance modifier (0.8)
  });
});
