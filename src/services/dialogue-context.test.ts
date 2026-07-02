import { describe, it, expect, beforeEach } from "bun:test";
import { DialogueContext } from "./dialogue-context";
import { NPCRuntime } from "./npc-runtime";
import { SocialGraph } from "./social-graph";
import { MemoryEngine } from "./memory-engine";
import { UnifiedEntityStore } from "../store/entity-store";
import { EntityNode, LayeredProfile } from "../models/entity";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `tns-dialog-test-${Date.now()}`);

describe("DialogueContext", () => {
  let context: DialogueContext;
  let runtime: NPCRuntime;
  let social: SocialGraph;
  let memory: MemoryEngine;

  beforeEach(async () => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
    const store = new UnifiedEntityStore(join(TMP, "entities.json"));
    store.add(new EntityNode({
      uid: "Character:Alice",
      name: "Alice",
      entity_type: "Character",
      profile: new LayeredProfile(
        { name: "Alice", type: "Character", group: "characters", summary: "Alice", tags: [], relationships: [] },
        { current_location: "Village" },
        {},
      ).toDict(),
      group_id: "characters",
    }));
    runtime = new NPCRuntime(TMP, store, null as any, null);
    social = new SocialGraph(TMP);
    memory = new MemoryEngine(runtime);
    context = new DialogueContext(runtime, social, memory);
  });

  it("builds context with relationship info", async () => {
    await social.addRelationship("Alice", "Bob", "friend", 0.8);
    
    const ctx = await context.buildContext("Alice", "Bob", "Hello!");
    expect(ctx).toContain("friend");
    expect(ctx).toContain("Bob");
  });

  it("includes recent memories", async () => {
    await runtime.addMemory("Alice", "Met Bob at the market yesterday", "joy", 0.5);
    
    const ctx = await context.buildContext("Alice", "Bob", "Hello!");
    expect(ctx).toContain("market");
  });

  it("includes current mood", async () => {
    await runtime.setMood("Alice", "happy");
    
    const ctx = await context.buildContext("Alice", "Bob", "Hello!");
    expect(ctx).toContain("happy");
  });

  it("includes location context", async () => {
    await runtime.move("Alice", "Dark Forest", new Date());
    
    const ctx = await context.buildContext("Alice", "Stranger", "Hello!");
    expect(ctx).toContain("Dark Forest");
  });

  it("builds faction context", async () => {
    await social.addToFaction("Alice", "guards");
    await social.addToFaction("Bob", "guards");
    
    const ctx = await context.buildContext("Alice", "Bob", "Hello!");
    expect(ctx).toContain("guards");
  });

  it("generates system prompt", async () => {
    await runtime.setMood("Alice", "determined");
    await runtime.addGoal("Alice", "Find the treasure");
    
    const prompt = await context.generateSystemPrompt("Alice");
    expect(prompt).toContain("determined");
    expect(prompt).toContain("treasure");
  });
});
