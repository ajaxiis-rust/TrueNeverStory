/**
 * Cultural Drift tests
 */

import { describe, it, expect } from "bun:test";
import { CulturalDrift } from "./cultural-drift";

describe("CulturalDrift", () => {
  it("initializes world state", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    const state = drift.getState("world1");
    expect(state).toBeDefined();
    expect(state!.currentRule).toBe("feudalism");
    expect(state!.loyalty).toBe(0.8);
  });

  it("checks change acceptance", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    const acceptance = drift.checkChangeAcceptance("world1", "democracy");
    expect(acceptance).toBeGreaterThanOrEqual(0);
    expect(acceptance).toBeLessThanOrEqual(1);
  });

  it("applies accepted change", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    drift.applyChange("world1", "democracy", true);
    const state = drift.getState("world1");
    expect(state!.currentRule).toBe("democracy");
    expect(state!.loyalty).toBe(0.5);
  });

  it("increases loyalty on rejected change", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    const beforeLoyalty = drift.getState("world1")!.loyalty;
    drift.applyChange("world1", "democracy", false);
    const afterLoyalty = drift.getState("world1")!.loyalty;
    expect(afterLoyalty).toBeGreaterThan(beforeLoyalty);
  });

  it("advances turn correctly", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    drift.advanceTurn("world1");
    const state = drift.getState("world1");
    expect(state!.establishedTurns).toBe(1);
  });

  it("returns resistance for known rules", () => {
    const drift = new CulturalDrift();
    expect(drift.getResistance("feudalism")).toBe(0.8);
    expect(drift.getResistance("anarchy")).toBe(0.3);
  });

  it("calculates drift effect", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    const effect = drift.getDriftEffect("world1");
    expect(effect.happinessModifier).toBe(-5); // Transition period
  });
});
