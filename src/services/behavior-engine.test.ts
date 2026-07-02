import { describe, it, expect, beforeEach } from "bun:test";
import { BehaviorEngine } from "./behavior-engine";
import { NPCRuntime } from "./npc-runtime";
import { UnifiedEntityStore } from "../store/entity-store";
import { EntityNode, LayeredProfile } from "../models/entity";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testDir: string;

function addChar(store: UnifiedEntityStore, name: string, loc = "Village") {
  store.add(new EntityNode({
    uid: `Character:${name}`,
    name,
    entity_type: "Character",
    profile: new LayeredProfile(
      { name, type: "Character", group: "characters", summary: name, tags: [], relationships: [] },
      { current_location: loc },
      {},
    ).toDict(),
    group_id: "characters",
  }));
}

describe("BehaviorEngine", () => {
  let engine: BehaviorEngine;
  let runtime: NPCRuntime;
  let store: UnifiedEntityStore;

  beforeEach(() => {
    testDir = join(tmpdir(), `tns-beheng-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    store = new UnifiedEntityStore(join(testDir, "entities.json"));
    addChar(store, "Alice");
    runtime = new NPCRuntime(testDir, store, null as any, null);
    engine = new BehaviorEngine(runtime);
  });

  it("evaluates goals and suggests actions", async () => {
    await runtime.addGoal("Alice", "Find the legendary sword");

    const actions = await engine.evaluateActions("Alice");
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]!.type).toBeDefined();
  });

  it("creates goal from context", async () => {
    await runtime.addMemory("Alice", "Heard about a treasure in the cave", "curiosity", 0.6);

    await engine.processContext("Alice");
    const profile = runtime.get("Alice")!;
    expect(profile.goals.length).toBeGreaterThan(0);
  });

  it("simulates daily routine", async () => {
    const actions = await engine.simulateDay("Alice");
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every(a => a.timestamp)).toBe(true);
  });

  it("adapts mood based on events", async () => {
    await runtime.addMemory("Alice", "Won a great battle", "joy", 0.9);

    await engine.adaptMood("Alice");
    const profile = runtime.get("Alice")!;
    expect(["happy", "content", "determined"]).toContain(profile.mood);
  });
});
