import { describe, test, expect } from "bun:test";
import {
  RomanceStatus, RomanceProgression,
  RelationshipMemory, RomanceParams, RomanceEvent,
} from "./romance";

describe("RelationshipMemory", () => {
  test("creates with defaults", () => {
    const rm = new RelationshipMemory({
      pair_id: "a|b",
      status: RomanceStatus.STRANGER,
      progression_stage: RomanceProgression.ATTRACTION,
      compatibility: 0.5,
      affection: 0.3,
    });
    expect(rm.pairId).toBe("a|b");
    expect(rm.status).toBe(RomanceStatus.STRANGER);
    expect(rm.compatibility).toBe(0.5);
    expect(rm.affection).toBe(0.3);
  });

  test("clamps compatibility and affection to [0,1]", () => {
    const rm1 = new RelationshipMemory({
      pair_id: "a|b",
      status: RomanceStatus.STRANGER,
      progression_stage: RomanceProgression.ATTRACTION,
      compatibility: 2,
      affection: -1,
    });
    expect(rm1.compatibility).toBe(1);
    expect(rm1.affection).toBe(0);
  });

  test("roundtrip via toDict/fromDict", () => {
    const rm = new RelationshipMemory({
      pair_id: "a|b",
      status: RomanceStatus.DATING,
      progression_stage: RomanceProgression.KISS,
      compatibility: 0.8,
      affection: 0.7,
      notes: "at tavern",
    });
    const dict = rm.toDict();
    const restored = RelationshipMemory.fromDict(dict as unknown as Record<string, unknown>);
    expect(restored.status).toBe(RomanceStatus.DATING);
    expect(restored.progressionStage).toBe(RomanceProgression.KISS);
    expect(restored.compatibility).toBe(0.8);
    expect(restored.notes).toBe("at tavern");
  });
});

describe("RomanceParams", () => {
  test("creates with data", () => {
    const rp = new RomanceParams({
      actor: "Aria",
      target: "Thorin",
      action: RomanceProgression.CONFESSION,
      location: "tavern",
    });
    expect(rp.actor).toBe("Aria");
    expect(rp.action).toBe(RomanceProgression.CONFESSION);
    expect(rp.extra).toEqual({});
  });
});

describe("RomanceEvent", () => {
  test("creates and serializes", () => {
    const re = new RomanceEvent({
      event_type: RomanceProgression.KISS,
      actor: "Aria",
      target: "Thorin",
      success: true,
      timestamp: "2026-01-01T00:00:00Z",
      affection_change: 0.1,
      narrative: "They kissed",
      location: "garden",
    });
    expect(re.success).toBe(true);
    const dict = re.toDict();
    expect(dict.event_type).toBe(RomanceProgression.KISS);
    expect(dict.affection_change).toBe(0.1);
  });
});
