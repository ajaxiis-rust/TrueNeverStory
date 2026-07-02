import { describe, it, expect, beforeEach } from "bun:test";
import { QuestSystem } from "./quest-system";
import { QuestManager } from "./quest-manager";
import { SocialGraph } from "./social-graph";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP_BASE = join(tmpdir(), `tns-quest-sys-${Date.now()}`);

function freshTmp(): string {
  const p = join(TMP_BASE, `t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(p, { recursive: true });
  return p;
}

describe("QuestSystem", () => {
  let tmp: string;
  let qs: QuestSystem;
  let qm: QuestManager;
  let social: SocialGraph;

  beforeEach(() => {
    tmp = freshTmp();
    qm = new QuestManager(join(tmp, "quests.json"));
    social = new SocialGraph(tmp);
    qs = new QuestSystem(tmp, qm, null, social);
  });

  it("creates a quest", () => {
    const quest = qs.createQuest(
      "Find the Sword",
      "A legendary sword is lost in the forest",
      "main",
      "Guard",
      [{ type: "go_to", target: "forest", description: "Go to the forest", count: 1 }],
      { gold: 100, experience: 50, items: [], reputation: {} },
    );

    expect(quest.id).toBeDefined();
    expect(quest.title).toBe("Find the Sword");
    expect(quest.state).toBe("available");
    expect(quest.type).toBe("main");
  });

  it("accepts a quest", () => {
    const quest = qs.createQuest(
      "Test", "Desc", "side", "NPC",
      [{ type: "collect", target: "herbs", description: "Collect herbs", count: 5 }],
      { gold: 50, experience: 20, items: [], reputation: {} },
    );

    const ok = qs.acceptQuest(quest.id);
    expect(ok).toBe(true);
    expect(qs.getQuest(quest.id)!.state).toBe("active");
    expect(qs.getQuest(quest.id)!.acceptedAt).not.toBeNull();
  });

  it("cannot accept already active quest", () => {
    const quest = qs.createQuest(
      "Test", "Desc", "side", "NPC",
      [{ type: "talk", target: "Elder", description: "Talk to Elder", count: 1 }],
      { gold: 0, experience: 0, items: [], reputation: {} },
    );

    qs.acceptQuest(quest.id);
    expect(qs.acceptQuest(quest.id)).toBe(false);
  });

  it("progresses objectives", () => {
    const quest = qs.createQuest(
      "Gather", "Collect resources", "side", "Merchant",
      [{ type: "collect", target: "wood", description: "Collect wood", count: 10 }],
      { gold: 30, experience: 10, items: [], reputation: {} },
    );

    qs.acceptQuest(quest.id);
    qs.progressObjective(quest.id, 0, 3);

    const obj = qs.getQuest(quest.id)!.objectives[0]!;
    expect(obj.current).toBe(3);
    expect(obj.completed).toBe(false);
  });

  it("completes objective when count reached", () => {
    const quest = qs.createQuest(
      "Gather", "Collect resources", "side", "Merchant",
      [{ type: "collect", target: "wood", description: "Collect wood", count: 5 }],
      { gold: 30, experience: 10, items: [], reputation: {} },
    );

    qs.acceptQuest(quest.id);
    qs.progressObjective(quest.id, 0, 5);

    const obj = qs.getQuest(quest.id)!.objectives[0]!;
    expect(obj.completed).toBe(true);
    expect(qs.getQuest(quest.id)!.state).toBe("completed");
  });

  it("completes quest by objective type and target", () => {
    const quest = qs.createQuest(
      "Hunt", "Hunt wolves", "side", "Guard",
      [
        { type: "kill", target: "wolf", description: "Kill wolves", count: 3 },
        { type: "collect", target: "pelt", description: "Collect pelts", count: 3 },
      ],
      { gold: 100, experience: 50, items: ["silver_ring"], reputation: { guards: 10 } },
    );

    qs.acceptQuest(quest.id);
    qs.completeObjectiveByType(quest.id, "kill", "wolf", 2);
    expect(qs.getQuest(quest.id)!.objectives[0]!.current).toBe(2);
    expect(qs.getQuest(quest.id)!.state).toBe("active");

    qs.completeObjectiveByType(quest.id, "kill", "wolf", 1);
    expect(qs.getQuest(quest.id)!.objectives[0]!.completed).toBe(true);

    qs.completeObjectiveByType(quest.id, "collect", "pelt", 3);
    expect(qs.getQuest(quest.id)!.state).toBe("completed");
  });

  it("abandons a quest", () => {
    const quest = qs.createQuest(
      "Test", "Desc", "side", "NPC",
      [{ type: "go_to", target: "tower", description: "Reach the tower", count: 1 }],
      { gold: 0, experience: 0, items: [], reputation: {} },
    );

    qs.acceptQuest(quest.id);
    expect(qs.abandonQuest(quest.id)).toBe(true);
    expect(qs.getQuest(quest.id)!.state).toBe("abandoned");
  });

  it("checks prerequisites — level", () => {
    const quest = qs.createQuest(
      "Dragon", "Slay the dragon", "main", "King",
      [{ type: "kill", target: "dragon", description: "Kill dragon", count: 1 }],
      { gold: 1000, experience: 500, items: ["dragon_scale"], reputation: {} },
      { prerequisites: { minLevel: 10 } },
    );

    expect(qs.meetsPrerequisites(quest.id, 5, null, [])).toBe(false);
    expect(qs.meetsPrerequisites(quest.id, 10, null, [])).toBe(true);
  });

  it("checks prerequisites — faction", () => {
    const quest = qs.createQuest(
      "Guild Task", "Do guild work", "faction", "Merchant",
      [{ type: "talk", target: "Supplier", description: "Talk to Supplier", count: 1 }],
      { gold: 50, experience: 20, items: [], reputation: { merchants: 20 } },
      { prerequisites: { faction: "merchants" } },
    );

    expect(qs.meetsPrerequisites(quest.id, 1, "guards", [])).toBe(false);
    expect(qs.meetsPrerequisites(quest.id, 1, "merchants", [])).toBe(true);
  });

  it("checks prerequisites — completed quests", () => {
    const quest = qs.createQuest(
      " sequel", "Follow-up quest", "chain", "Sage",
      [{ type: "go_to", target: "cave", description: "Enter the cave", count: 1 }],
      { gold: 200, experience: 100, items: [], reputation: {} },
      { prerequisites: { completedQuests: ["quest_prereq"] } },
    );

    expect(qs.meetsPrerequisites(quest.id, 1, null, ["quest_other"])).toBe(false);
    expect(qs.meetsPrerequisites(quest.id, 1, null, ["quest_prereq"])).toBe(true);
  });

  it("checks prerequisites — relationship", () => {
    const quest = qs.createQuest(
      "Personal", "Help a friend", "side", "Alice",
      [{ type: "collect", target: "medicine", description: "Get medicine", count: 1 }],
      { gold: 30, experience: 15, items: [], reputation: {} },
      { prerequisites: { minRelationship: { npc: "Alice", value: 0.5 } } },
    );

    expect(qs.meetsPrerequisites(quest.id, 1, null, [])).toBe(false);

    social.addRelationship("Alice", "Player", "friend", 0.8);
    expect(qs.meetsPrerequisites(quest.id, 1, null, [])).toBe(true);
  });

  it("lists quests by state", () => {
    qs.createQuest("A", "Desc", "side", "NPC", [{ type: "talk", target: "X", description: "Talk", count: 1 }], { gold: 0, experience: 0, items: [], reputation: {} });
    const b = qs.createQuest("B", "Desc", "side", "NPC", [{ type: "talk", target: "Y", description: "Talk", count: 1 }], { gold: 0, experience: 0, items: [], reputation: {} });
    qs.createQuest("C", "Desc", "side", "NPC", [{ type: "talk", target: "Z", description: "Talk", count: 1 }], { gold: 0, experience: 0, items: [], reputation: {} });

    qs.acceptQuest(b.id);

    expect(qs.getAvailableQuests()).toHaveLength(2);
    expect(qs.getActiveQuests()).toHaveLength(1);
  });

  it("lists quests by giver", () => {
    qs.createQuest("A", "Desc", "side", "Guard", [{ type: "talk", target: "X", description: "Talk", count: 1 }], { gold: 0, experience: 0, items: [], reputation: {} });
    qs.createQuest("B", "Desc", "side", "Merchant", [{ type: "talk", target: "Y", description: "Talk", count: 1 }], { gold: 0, experience: 0, items: [], reputation: {} });

    expect(qs.getQuestsByGiver("Guard")).toHaveLength(1);
    expect(qs.getQuestsByGiver("Merchant")).toHaveLength(1);
  });

  it("returns quest progress", () => {
    const quest = qs.createQuest(
      "Multi", "Multi-objective", "main", "King",
      [
        { type: "kill", target: "orc", description: "Kill orcs", count: 5 },
        { type: "collect", target: "gold", description: "Collect gold", count: 100 },
      ],
      { gold: 500, experience: 200, items: [], reputation: {} },
    );

    qs.acceptQuest(quest.id);
    qs.progressObjective(quest.id, 0, 3);
    qs.progressObjective(quest.id, 1, 50);

    const progress = qs.getQuestProgress(quest.id)!;
    expect(progress.overallProgress).toBeCloseTo(0.505, 2);
    expect(progress.objectives[0]!.progress).toBe(3);
    expect(progress.objectives[1]!.progress).toBe(50);
  });

  it("returns all progress", () => {
    qs.createQuest("A", "Desc", "side", "NPC", [{ type: "talk", target: "X", description: "Talk", count: 1 }], { gold: 0, experience: 0, items: [], reputation: {} });
    qs.createQuest("B", "Desc", "side", "NPC", [{ type: "talk", target: "Y", description: "Talk", count: 1 }], { gold: 0, experience: 0, items: [], reputation: {} });

    expect(qs.getAllProgress()).toHaveLength(2);
  });

  it("grants rewards", () => {
    const quest = qs.createQuest(
      "Rich", "Get rich", "side", "Merchant",
      [{ type: "collect", target: "gem", description: "Find gem", count: 1 }],
      { gold: 500, experience: 100, items: ["ruby"], reputation: { merchants: 50 } },
    );

    qs.acceptQuest(quest.id);
    qs.progressObjective(quest.id, 0, 1);

    const rewards = qs.grantRewards(quest.id)!;
    expect(rewards.gold).toBe(500);
    expect(rewards.items).toContain("ruby");
  });

  it("returns null rewards for non-completed quest", () => {
    const quest = qs.createQuest(
      "Active", "Still going", "side", "NPC",
      [{ type: "talk", target: "X", description: "Talk", count: 1 }],
      { gold: 100, experience: 50, items: [], reputation: {} },
    );

    qs.acceptQuest(quest.id);
    expect(qs.grantRewards(quest.id)).toBeNull();
  });

  it("dialogue offer prioritizes active quests", () => {
    const q1 = qs.createQuest("A", "Desc", "side", "Guard", [{ type: "talk", target: "X", description: "Talk", count: 1 }], { gold: 0, experience: 0, items: [], reputation: {} });
    qs.createQuest("B", "Desc", "side", "Guard", [{ type: "talk", target: "Y", description: "Talk", count: 1 }], { gold: 0, experience: 0, items: [], reputation: {} });

    qs.acceptQuest(q1.id);

    const offer = qs.getDialogueOffer("Guard", 1, null, [])!;
    expect(offer.id).toBe(q1.id);
  });

  it("dialogue offer returns available when no active", () => {
    qs.createQuest("A", "Desc", "side", "Guard", [{ type: "talk", target: "X", description: "Talk", count: 1 }], { gold: 0, experience: 0, items: [], reputation: {} });

    const offer = qs.getDialogueOffer("Guard", 1, null, [])!;
    expect(offer.giver).toBe("Guard");
  });

  it("dialogue offer respects prerequisites", () => {
    qs.createQuest("High", "High level", "main", "King",
      [{ type: "kill", target: "dragon", description: "Kill dragon", count: 1 }],
      { gold: 1000, experience: 500, items: [], reputation: {} },
      { prerequisites: { minLevel: 10 } },
    );

    expect(qs.getDialogueOffer("King", 5, null, [])).toBeNull();
    expect(qs.getDialogueOffer("King", 10, null, [])).not.toBeNull();
  });

  it("formats quest summary", () => {
    const quest = qs.createQuest(
      "Epic", "An epic quest", "main", "King",
      [{ type: "kill", target: "boss", description: "Defeat the boss", count: 1 }],
      { gold: 1000, experience: 500, items: ["crown"], reputation: {} },
    );
    qs.acceptQuest(quest.id);

    const summary = qs.getQuestSummary(quest.id);
    expect(summary).toContain("Epic");
    expect(summary).toContain("active");
    expect(summary).toContain("Defeat the boss");
  });

  it("time-limited quest expires", () => {
    const quest = qs.createQuest(
      "Urgent", "Hurry!", "side", "Guard",
      [{ type: "go_to", target: "gate", description: "Reach the gate", count: 1 }],
      { gold: 50, experience: 20, items: [], reputation: {} },
      { timeLimit: -1 },
    );

    qs.acceptQuest(quest.id);
    const failed = qs.checkTimeLimits();
    expect(failed).toContain(quest.id);
    expect(qs.getQuest(quest.id)!.state).toBe("failed");
  });

  it("no expiration for quests without time limit", () => {
    const quest = qs.createQuest(
      "Eternal", "Take your time", "side", "NPC",
      [{ type: "talk", target: "X", description: "Talk", count: 1 }],
      { gold: 0, experience: 0, items: [], reputation: {} },
    );

    qs.acceptQuest(quest.id);
    const failed = qs.checkTimeLimits();
    expect(failed).toHaveLength(0);
  });

  it("persists across reload", () => {
    const quest = qs.createQuest(
      "Persistent", "Save me", "side", "NPC",
      [{ type: "collect", target: "item", description: "Get item", count: 3 }],
      { gold: 10, experience: 5, items: [], reputation: {} },
    );
    qs.acceptQuest(quest.id);
    qs.progressObjective(quest.id, 0, 2);

    const qs2 = new QuestSystem(tmp, qm, null, social);
    const q = qs2.getQuest(quest.id)!;
    expect(q.state).toBe("active");
    expect(q.objectives[0]!.current).toBe(2);
  });
});
