import { describe, it, expect, beforeEach } from "bun:test";
import { DialogueManager } from "./dialogue-manager";
import { NPCRuntime } from "./npc-runtime";
import { SocialGraph } from "./social-graph";
import { DialogueContext } from "./dialogue-context";
import { MemoryEngine } from "./memory-engine";
import { UnifiedEntityStore } from "../store/entity-store";
import { EntityNode, LayeredProfile } from "../models/entity";
import { existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP_BASE = join(tmpdir(), `tns-dlg-mgr-${Date.now()}`);

function freshTmp(): string {
  const p = join(TMP_BASE, `t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(p, { recursive: true });
  return p;
}

function addNPC(store: UnifiedEntityStore, name: string, location: string) {
  store.add(new EntityNode({
    uid: `Character:${name}`,
    name,
    entity_type: "Character",
    profile: new LayeredProfile(
      { name, type: "Character", group: "characters", summary: name, tags: [], relationships: [] },
      { current_location: location },
      {},
    ).toDict(),
    group_id: "characters",
  }));
}

describe("DialogueManager", () => {
  let tmp: string;
  let manager: DialogueManager;
  let runtime: NPCRuntime;
  let social: SocialGraph;
  let memory: MemoryEngine;
  let context: DialogueContext;
  let store: UnifiedEntityStore;

  beforeEach(async () => {
    tmp = freshTmp();
    store = new UnifiedEntityStore(join(tmp, "entities.json"));
    addNPC(store, "Guard", "Gate");
    addNPC(store, "Merchant", "Market");
    addNPC(store, "Rival", "Tavern");

    runtime = new NPCRuntime(tmp, store, null as any, null);
    await runtime.setMood("Guard", "determined");
    await runtime.setMood("Merchant", "happy");
    await runtime.setMood("Rival", "neutral");

    social = new SocialGraph(tmp);
    memory = new MemoryEngine(runtime);
    context = new DialogueContext(runtime, social, memory);
    manager = new DialogueManager(tmp, runtime, social, context);
  });

  it("starts a session", () => {
    const session = manager.startSession("Guard", "Player");
    expect(session.npcName).toBe("Guard");
    expect(session.playerCharacter).toBe("Player");
    expect(session.state).toBe("greeting");
    expect(session.turnCount).toBe(0);
  });

  it("returns existing active session", () => {
    const s1 = manager.startSession("Guard", "Player");
    const s2 = manager.startSession("Guard", "Player");
    expect(s1.id).toBe(s2.id);
  });

  it("generates greeting based on mood", async () => {
    const greeting = await manager.getGreeting("Merchant", "Player");
    expect(greeting).toContain("Player");
    expect(greeting.length).toBeGreaterThan(5);
  });

  it("generates contextual greeting for friends", async () => {
    await social.addRelationship("Guard", "Player", "friend", 0.9);
    const greeting = await manager.getGreeting("Guard", "Player");
    expect(greeting).toContain("Player");
  });

  it("generates hostile greeting for enemies", async () => {
    await social.addRelationship("Rival", "Player", "enemy", 0.8);
    const greeting = await manager.getGreeting("Rival", "Player");
    expect(greeting).toContain("Player");
  });

  it("greets vassals with fealty context", async () => {
    await social.swearFealty("Player", "Guard", 100, 50);
    const greeting = await manager.getGreeting("Guard", "Player");
    expect(greeting.toLowerCase()).toContain("vassal");
  });

  it("greets liege with fealty context", async () => {
    await social.swearFealty("Guard", "Player", 100, 50);
    const greeting = await manager.getGreeting("Guard", "Player");
    expect(greeting.toLowerCase()).toContain("lord");
  });

  it("generates farewell", async () => {
    manager.startSession("Guard", "Player");
    const farewell = await manager.getFarewell("Guard", "Player");
    expect(farewell.length).toBeGreaterThan(5);
  });

  it("ends session", async () => {
    manager.startSession("Guard", "Player");
    manager.endSession("Guard", "Player");
    const session = manager.getSession("Guard", "Player");
    expect(session?.state).toBe("idle");
  });

  it("starts new session after idle", async () => {
    manager.startSession("Guard", "Player");
    manager.endSession("Guard", "Player");
    const s2 = manager.startSession("Guard", "Player");
    expect(s2.state).toBe("greeting");
  });

  it("tracks conversation history", async () => {
    manager.startSession("Guard", "Player");
    await manager.addMessage("Guard", "Player", "player", "Hello there!");
    await manager.addMessage("Guard", "Player", "npc", "Greetings, traveler.");
    await manager.addMessage("Guard", "Player", "player", "What's happening?");

    const history = manager.getHistory("Guard", "Player");
    expect(history.length).toBe(3);
    expect(history[0]!.role).toBe("player");
    expect(history[1]!.role).toBe("npc");
  });

  it("returns available topics", async () => {
    await social.addToFaction("Guard", "guards");
    await social.swearFealty("Guard", "Player", 100, 50);

    const topics = manager.getAvailableTopics("Guard", "Player");
    const cats = topics.map(t => t.category);
    expect(cats).toContain("personal");
    expect(cats).toContain("weather");
    expect(cats).toContain("location");
    expect(cats).toContain("faction");
    expect(cats).toContain("feudal");
  });

  it("hides quest topic for enemies", async () => {
    await social.addRelationship("Rival", "Player", "enemy", 0.8);
    const topics = manager.getAvailableTopics("Rival", "Player");
    const cats = topics.map(t => t.category);
    expect(cats).not.toContain("quest");
  });

  it("shows combat topic for enemies", async () => {
    await social.addRelationship("Rival", "Player", "enemy", 0.8);
    const topics = manager.getAvailableTopics("Rival", "Player");
    const cats = topics.map(t => t.category);
    expect(cats).toContain("combat");
  });

  it("returns choices from topics", async () => {
    const choices = manager.getChoices("Guard", "Player");
    expect(choices.length).toBeGreaterThan(0);
    expect(choices[0]!.text).toBeDefined();
    expect(choices[0]!.topic).toBeDefined();
  });

  it("records dialogue memory", async () => {
    manager.startSession("Guard", "Player");
    await manager.addMessage("Guard", "Player", "player", "Tell me about the guards");
    await manager.recordDialogueMemory("Guard", "Player", "Discussed guard duties", 0.6);

    const memories = await runtime.getMemories("Guard");
    const dlgMem = memories.find(m => m.description.includes("Conversation with Player"));
    expect(dlgMem).toBeDefined();
  });

  it("returns session stats", async () => {
    manager.startSession("Guard", "Player");
    await manager.addMessage("Guard", "Player", "player", "Hi", "personal");
    await manager.addMessage("Guard", "Player", "npc", "Hello", "personal");
    await manager.addMessage("Guard", "Player", "player", "Weather is nice", "weather");

    const stats = manager.getSessionStats("Guard", "Player");
    expect(stats).not.toBeNull();
    expect(stats!.totalTurns).toBe(3);
    expect(stats!.playerMessages).toBe(2);
    expect(stats!.npcMessages).toBe(1);
    expect(stats!.topicsDiscussed).toContain("personal");
  });

  it("returns null stats for no session", () => {
    expect(manager.getSessionStats("Guard", "Nonexistent")).toBeNull();
  });

  it("persists sessions across reload", async () => {
    manager.startSession("Guard", "Player");
    await manager.addMessage("Guard", "Player", "player", "Persistent message");

    const manager2 = new DialogueManager(tmp, runtime, social, context);
    const history = manager2.getHistory("Guard", "Player");
    expect(history.length).toBe(1);
    expect(history[0]!.content).toBe("Persistent message");
  });

  it("builds dialogue prompt via context", async () => {
    const prompt = await manager.buildDialoguePrompt("Guard", "Player", "Hello!");
    expect(prompt).toContain("Guard");
    expect(prompt).toContain("Player");
  });
});
