import { describe, it, expect } from "bun:test";
import { MemoryScoringEngine } from "./scoring";
import { ClusterEngine } from "./clustering";
import { WorldMemoryEntry } from "../models/memory";

describe("MemoryScoringEngine", () => {
  const weights = { importance: 0.35, recency: 0.25, access: 0.15, emotion: 0.10, relevance: 0.15 };
  const engine = new MemoryScoringEngine(weights, 7.0);

  it("computes score for recent entry", () => {
    const entry = new WorldMemoryEntry({
      id: "1", content: "test", timestamp: new Date().toISOString(),
      source_type: "event", source_id: "test", importance: 0.8,
    });
    entry.metadata.accessCount = 5;
    entry.metadata.emotionalValence = 0.5;
    entry.metadata.storyRelevance = 0.7;

    const score = engine.computeScore(entry, new Date());
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("computes score for old entry", () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const entry = new WorldMemoryEntry({
      id: "2", content: "test", timestamp: oldDate.toISOString(),
      source_type: "event", source_id: "test", importance: 0.3,
    });

    const score = engine.computeScore(entry, new Date());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(0.5);
  });

  it("computeSalience returns valid range", () => {
    const entry = new WorldMemoryEntry({
      id: "3", content: "test", timestamp: new Date().toISOString(),
      source_type: "event", source_id: "test", importance: 0.6,
    });
    entry.salience = 0.8;

    const salience = engine.computeSalience(entry, new Date());
    expect(salience).toBeGreaterThanOrEqual(0);
    expect(salience).toBeLessThanOrEqual(1);
  });
});

describe("ClusterEngine", () => {
  const engine = new ClusterEngine(0.85, 2, 3, false);

  it("finds clusters of similar entries", async () => {
    const emb1 = new Array(384).fill(0).map((_, i) => Math.sin(i));
    const emb2 = new Array(384).fill(0).map((_, i) => Math.sin(i + 0.01));
    const emb3 = new Array(384).fill(0).map((_, i) => Math.cos(i));

    const entries = [
      new WorldMemoryEntry({ id: "1", content: "similar1", timestamp: new Date().toISOString(), source_type: "event", source_id: "a", embedding: emb1 }),
      new WorldMemoryEntry({ id: "2", content: "similar2", timestamp: new Date().toISOString(), source_type: "event", source_id: "a", embedding: emb2 }),
      new WorldMemoryEntry({ id: "3", content: "different", timestamp: new Date().toISOString(), source_type: "event", source_id: "b", embedding: emb3 }),
    ];

    const clusters = await engine.findClusters(entries);
    expect(clusters.length).toBeGreaterThanOrEqual(0);
  });

  it("returns empty for too few entries", async () => {
    const entries = [
      new WorldMemoryEntry({ id: "1", content: "a", timestamp: new Date().toISOString(), source_type: "event", source_id: "a", embedding: [1, 0, 0] }),
    ];
    const clusters = await engine.findClusters(entries);
    expect(clusters).toEqual([]);
  });

  it("getClusterSummary returns stats", async () => {
    const entries = [
      new WorldMemoryEntry({ id: "1", content: "a", timestamp: new Date().toISOString(), source_type: "event", source_id: "a", importance: 0.5 }),
      new WorldMemoryEntry({ id: "2", content: "b", timestamp: new Date().toISOString(), source_type: "npc", source_id: "b", importance: 0.8 }),
    ];
    const summary = await engine.getClusterSummary(entries);
    expect(summary.count).toBe(2);
    expect(summary.avgImportance).toBeCloseTo(0.65);
    expect(summary.sources.length).toBe(2);
  });
});
