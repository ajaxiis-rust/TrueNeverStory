import { describe, test, expect } from "bun:test";
import { createDefaultNPCProfile, serializeNPCProfile, deserializeNPCProfile } from "./npc-state";

describe("createDefaultNPCProfile", () => {
  test("creates profile with defaults", () => {
    const p = createDefaultNPCProfile("Gandalf", "npc:1");
    expect(p.name).toBe("Gandalf");
    expect(p.uid).toBe("npc:1");
    expect(p.health).toBe(100);
    expect(p.mood).toBe("neutral");
    expect(p.location).toBe("unknown");
  });

  test("all skills are 0.5", () => {
    const p = createDefaultNPCProfile("Test", "t:1");
    expect(p.skills.strength).toBe(0.5);
    expect(p.skills.charisma).toBe(0.5);
    expect(p.skills.luck).toBe(0.5);
  });

  test("accepts custom location", () => {
    const p = createDefaultNPCProfile("Test", "t:1", "tavern");
    expect(p.location).toBe("tavern");
  });
});

describe("serialize/deserialize roundtrip", () => {
  test("serializes profile to snake_case", () => {
    const p = createDefaultNPCProfile("Test", "t:1");
    const s = serializeNPCProfile(p);
    expect(s.uid).toBe("t:1");
    expect(s.location).toBe("unknown");
    expect(s.updated_at).toBeDefined();
  });

  test("roundtrip preserves data", () => {
    const original = createDefaultNPCProfile("Test", "t:1", "tavern");
    original.shortTerm.push({
      id: "mem1",
      timestamp: "2026-01-01T00:00:00Z",
      description: "Met a stranger",
      importance: 0.5,
      emotion: "curious",
      involvedEntities: ["npc:2"],
      location: "tavern",
      consolidated: false,
    });
    original.goals = ["find artifact"];
    original.inventory = ["sword"];

    const serialized = serializeNPCProfile(original);
    const deserialized = deserializeNPCProfile("Test", serialized as Record<string, unknown>);

    expect(deserialized.name).toBe("Test");
    expect(deserialized.uid).toBe("t:1");
    expect(deserialized.location).toBe("tavern");
    expect(deserialized.shortTerm).toHaveLength(1);
    expect(deserialized.shortTerm[0]!.description).toBe("Met a stranger");
    expect(deserialized.goals).toEqual(["find artifact"]);
    expect(deserialized.inventory).toEqual(["sword"]);
  });
});
