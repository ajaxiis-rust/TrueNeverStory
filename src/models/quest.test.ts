import { describe, test, expect } from "bun:test";
import { Quest } from "./quest";

describe("Quest", () => {
  test("creates with defaults", () => {
    const q = new Quest();
    expect(q.id).toBeDefined();
    expect(q.title).toBe("Untitled Quest");
    expect(q.status).toBe("active");
    expect(q.objectives).toEqual([]);
  });

  test("creates with data", () => {
    const q = new Quest({ title: "Find the Dragon", giver: "King", description: "Slay it" });
    expect(q.title).toBe("Find the Dragon");
    expect(q.giver).toBe("King");
    expect(q.description).toBe("Slay it");
  });

  test("progress is 0 with no objectives", () => {
    expect(new Quest().progress).toBe(0);
  });

  test("progress calculates correctly", () => {
    const q = new Quest({
      objectives: [
        { type: "kill", completed: true },
        { type: "collect", completed: false },
        { type: "return", status: "completed" },
      ],
    });
    expect(q.progress).toBeCloseTo(2 / 3, 5);
  });

  test("toDict returns correct shape", () => {
    const q = new Quest({ title: "Test" });
    const d = q.toDict();
    expect(d.id).toBeDefined();
    expect(d.title).toBe("Test");
    expect(d.status).toBe("active");
  });

  test("fromDict roundtrips", () => {
    const original = new Quest({ title: "Test", giver: "NPC" });
    const dict = original.toDict();
    const restored = Quest.fromDict(dict);
    expect(restored.title).toBe("Test");
    expect(restored.giver).toBe("NPC");
    expect(restored.id).toBe(original.id);
  });
});
