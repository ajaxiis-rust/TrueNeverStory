import { describe, it, expect, beforeEach } from "bun:test";
import { SocialGraph } from "./social-graph";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `tns-social-test-${Date.now()}`);

describe("SocialGraph", () => {
  let graph: SocialGraph;

  beforeEach(async () => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
    graph = new SocialGraph(TMP);
  });

  it("adds relationship between NPCs", async () => {
    await graph.addRelationship("Alice", "Bob", "friend", 0.8);
    
    const rels = graph.getRelationships("Alice");
    expect(rels.length).toBe(1);
    expect(rels[0]!.target).toBe("Bob");
    expect(rels[0]!.type).toBe("friend");
  });

  it("updates existing relationship", async () => {
    await graph.addRelationship("Alice", "Bob", "neutral", 0.5);
    await graph.addRelationship("Alice", "Bob", "friend", 0.8);
    
    const rels = graph.getRelationships("Alice");
    expect(rels.length).toBe(1);
    expect(rels[0]!.strength).toBe(0.8);
  });

  it("gets reputation score", async () => {
    await graph.addRelationship("Alice", "Bob", "friend", 0.8);
    await graph.addRelationship("Alice", "Charlie", "friend", 0.6);
    await graph.addRelationship("Alice", "Eve", "enemy", 0.9);
    
    const rep = graph.getReputation("Alice");
    expect(rep).toBeGreaterThan(0);
    expect(rep).toBeLessThan(1);
  });

  it("finds mutual friends", async () => {
    await graph.addRelationship("Alice", "Bob", "friend", 0.8);
    await graph.addRelationship("Charlie", "Bob", "friend", 0.7);
    
    const mutual = graph.findMutualFriends("Alice", "Charlie");
    expect(mutual).toContain("Bob");
  });

  it("detects faction membership", async () => {
    await graph.addToFaction("Alice", "guards");
    await graph.addToFaction("Bob", "guards");
    await graph.addToFaction("Charlie", "thieves");
    
    const guards = graph.getFactionMembers("guards");
    expect(guards).toContain("Alice");
    expect(guards).toContain("Bob");
    expect(guards).not.toContain("Charlie");
  });

  it("detects faction conflict", async () => {
    await graph.addToFaction("Alice", "guards");
    await graph.addToFaction("Bob", "thieves");
    await graph.addFactionConflict("guards", "thieves");
    
    const conflicting = graph.getFactionConflicts("guards");
    expect(conflicting).toContain("thieves");
  });
});
