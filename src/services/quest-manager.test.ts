import { describe, it, expect, beforeEach } from "bun:test";
import { QuestManager } from "./quest-manager";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `tns-quest-test-${Date.now()}`);

function makeQuest(id: string, title: string, objectives: string[] = []) {
  return {
    id,
    title,
    description: `Desc for ${title}`,
    giver: "NPC",
    objectives: objectives.map((o) => ({ type: "custom", description: o, completed: false })),
    status: "active",
    created_at: new Date().toISOString(),
  };
}

describe("QuestManager", () => {
  let qm: QuestManager;

  beforeEach(() => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
    qm = new QuestManager(join(TMP, "quests.json"));
  });

  it("adds and retrieves a quest", () => {
    qm.addQuest(makeQuest("q1", "Find the Sword", ["Find clues"]));
    const quest = qm.getQuest("q1");
    expect(quest).toBeTruthy();
    expect(quest!.title).toBe("Find the Sword");
    expect(quest!.status).toBe("active");
  });

  it("lists all quests", () => {
    qm.addQuest(makeQuest("q1", "Quest A"));
    qm.addQuest(makeQuest("q2", "Quest B"));
    expect(qm.getAllQuests()).toHaveLength(2);
  });

  it("completes an objective", () => {
    qm.addQuest(makeQuest("q1", "Test", ["Step 1", "Step 2"]));
    qm.completeObjective("q1", 0);
    const quest = qm.getQuest("q1")!;
    expect(quest.objectives[0]!.completed).toBe(true);
    expect(quest.objectives[1]!.completed).toBe(false);
    expect(quest.status).toBe("active");
  });

  it("auto-completes quest when all objectives done", () => {
    qm.addQuest(makeQuest("q1", "Test", ["Step 1"]));
    qm.completeObjective("q1", 0);
    expect(qm.getQuest("q1")!.status).toBe("completed");
  });

  it("updates quest", () => {
    qm.addQuest(makeQuest("q1", "Old Title"));
    qm.updateQuest("q1", { title: "New Title" });
    expect(qm.getQuest("q1")!.title).toBe("New Title");
  });

  it("removes a quest", () => {
    qm.addQuest(makeQuest("q1", "ToDelete"));
    expect(qm.removeQuest("q1")).toBe(true);
    expect(qm.getQuest("q1")).toBeUndefined();
  });

  it("returns false for nonexistent operations", () => {
    expect(qm.completeObjective("nope", 0)).toBe(false);
    expect(qm.updateQuest("nope", {})).toBe(false);
    expect(qm.removeQuest("nope")).toBe(false);
  });
});
