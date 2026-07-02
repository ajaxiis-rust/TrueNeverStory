import { describe, it, expect, beforeEach } from "bun:test";
import { MemoryEngine } from "./memory-engine";
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

describe("MemoryEngine", () => {
  let engine: MemoryEngine;
  let runtime: NPCRuntime;
  let store: UnifiedEntityStore;

  beforeEach(() => {
    testDir = join(tmpdir(), `tns-memeng-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    store = new UnifiedEntityStore(join(testDir, "entities.json"));
    addChar(store, "Alice");
    runtime = new NPCRuntime(testDir, store, null as any, null);
    engine = new MemoryEngine(runtime);
  });

  it("searches memories by keyword", async () => {
    await runtime.addMemory("Alice", "Met a merchant in the market", "neutral", 0.5);
    await runtime.addMemory("Alice", "Fought a dragon in the cave", "fear", 0.8);

    const results = await engine.search("Alice", "merchant");
    expect(results.length).toBe(1);
    expect(results[0]!.description).toContain("merchant");
  });

  it("returns empty for no match", async () => {
    await runtime.addMemory("Alice", "Went to sleep", "neutral", 0.3);

    const results = await engine.search("Alice", "dragon");
    expect(results.length).toBe(0);
  });

  it("searches by emotion", async () => {
    await runtime.addMemory("Alice", "Happy birthday celebration", "joy", 0.6);
    await runtime.addMemory("Alice", "Scary night encounter", "fear", 0.7);

    const results = await engine.searchByEmotion("Alice", "joy");
    expect(results.length).toBe(1);
    expect(results[0]!.emotion).toBe("joy");
  });

  it("searches by location", async () => {
    await runtime.addMemory("Alice", "Met a merchant", "neutral", 0.5, [], "Market");
    await runtime.addMemory("Alice", "Found a treasure", "joy", 0.7, [], "Cave");

    const results = await engine.searchByLocation("Alice", "market");
    expect(results.length).toBe(1);
    expect(results[0]!.location).toBe("Market");
  });

  it("clusters memories by topic", async () => {
    await runtime.addMemory("Alice", "Bought bread at market", "neutral", 0.4);
    await runtime.addMemory("Alice", "Sold gems at market", "joy", 0.5);
    await runtime.addMemory("Alice", "Explored dark forest", "fear", 0.6);

    const clusters = await engine.clusterMemories("Alice");
    expect(clusters.length).toBeGreaterThanOrEqual(2);
  });

  it("gets recent context as formatted string", async () => {
    await runtime.addMemory("Alice", "Met a friend", "joy", 0.5);
    await runtime.addMemory("Alice", "Lost a coin", "sadness", 0.3);

    const ctx = await engine.getRecentContext("Alice", 2);
    expect(ctx).toContain("Met a friend");
    expect(ctx).toContain("joy");
  });
});
