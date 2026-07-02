import { describe, it, expect, beforeEach } from "bun:test";
import {
  MemoryConfig,
  MemoryMetadata,
  WorldMemoryEntry,
  SessionDeltaTracker,
  SpeculativeCache,
  DEFAULT_CONFIG,
} from "../models/memory";

describe("MemoryConfig", () => {
  it("creates with defaults", () => {
    const config = new MemoryConfig();
    expect(config.retentionMonths).toBe(6);
    expect(config.activePartitionsCount).toBe(3);
    expect(config.batchEmbedSize).toBe(50);
    expect(config.halfLifeDays).toBe(7.0);
    expect(config.minKeepScore).toBe(0.15);
    expect(config.clusterSimilarityThreshold).toBe(0.85);
    expect(config.embeddingDimension).toBe(384);
  });

  it("creates with overrides", () => {
    const config = new MemoryConfig({ retention_months: 12, half_life_days: 14 });
    expect(config.retentionMonths).toBe(12);
    expect(config.halfLifeDays).toBe(14);
  });

  it("DEFAULT_CONFIG is singleton", () => {
    expect(DEFAULT_CONFIG).toBeInstanceOf(MemoryConfig);
  });
});

describe("MemoryMetadata", () => {
  it("creates with defaults", () => {
    const m = new MemoryMetadata();
    expect(m.accessCount).toBe(0);
    expect(m.emotionalValence).toBe(0);
    expect(m.storyRelevance).toBe(0.5);
    expect(m.immutable).toBe(false);
  });

  it("serializes and deserializes", () => {
    const m = new MemoryMetadata({
      access_count: 5,
      emotional_valence: 0.8,
      story_relevance: 0.9,
      immutable: true,
    });
    const dict = m.toDict();
    const restored = MemoryMetadata.fromDict(dict as Record<string, unknown>);
    expect(restored.accessCount).toBe(5);
    expect(restored.emotionalValence).toBe(0.8);
    expect(restored.immutable).toBe(true);
  });

  it("get() returns attribute", () => {
    const m = new MemoryMetadata({ importance: 0.7 });
    expect(m.get("importance")).toBe(0.7);
    expect(m.get("nonexistent")).toBeUndefined();
  });
});

describe("WorldMemoryEntry", () => {
  it("creates with defaults", () => {
    const e = new WorldMemoryEntry({
      id: "test-1",
      content: "Hello world",
      timestamp: "2026-01-01T00:00:00Z",
      source_type: "episodic",
      source_id: "test",
    });
    expect(e.id).toBe("test-1");
    expect(e.content).toBe("Hello world");
    expect(e.memoryType).toBe("episodic");
    expect(e.importance).toBe(0.5);
    expect(e.needsClustering).toBe(true);
    expect(e.embedding).toBeNull();
  });

  it("creates with cognitive fields", () => {
    const e = new WorldMemoryEntry({
      id: "test-2",
      content: "Entity fact",
      timestamp: "2026-01-01T00:00:00Z",
      source_type: "entity",
      source_id: "char1",
      memory_type: "entity",
      entity_uid: "Character:Alice",
      linked_entity_uids: ["Character:Bob"],
      pain_keywords: ["death", "betrayal"],
      salience: 0.8,
    });
    expect(e.memoryType).toBe("entity");
    expect(e.entityUid).toBe("Character:Alice");
    expect(e.linkedEntityUids).toEqual(["Character:Bob"]);
    expect(e.painKeywords).toEqual(["death", "betrayal"]);
    expect(e.salience).toBe(0.8);
  });

  it("serializes and deserializes", () => {
    const e = new WorldMemoryEntry({
      id: "test-3",
      content: "Test entry",
      timestamp: "2026-06-01T12:00:00Z",
      source_type: "event",
      source_id: "narrative",
      importance: 0.7,
      tags: ["combat", "victory"],
      memory_type: "semantic",
      entity_uid: "Character:Alice",
      metadata: { access_count: 3, emotional_valence: 0.5 },
    });
    const dict = e.toDict();
    const restored = WorldMemoryEntry.fromDict(dict as unknown as Record<string, unknown>);
    expect(restored.id).toBe("test-3");
    expect(restored.memoryType).toBe("semantic");
    expect(restored.entityUid).toBe("Character:Alice");
    expect(restored.metadata.accessCount).toBe(3);
    expect(restored.tags).toEqual(["combat", "victory"]);
  });
});

describe("SessionDeltaTracker", () => {
  it("tracks last seen and delta", () => {
    const tracker = new SessionDeltaTracker();
    const t1 = new Date("2026-01-01T00:00:00Z");

    tracker.update("s1", new Set(["a", "b", "c"]), t1);
    expect(tracker.getLastSeen("s1")).toEqual(t1);

    const delta = tracker.getDelta("s1", new Set(["b", "c", "d"]));
    expect(delta.newIds).toEqual(new Set(["d"]));
    expect(delta.removedIds).toEqual(new Set(["a"]));
  });

  it("returns undefined for unknown session", () => {
    const tracker = new SessionDeltaTracker();
    expect(tracker.getLastSeen("unknown")).toBeUndefined();
  });
});

describe("SpeculativeCache", () => {
  it("stores and retrieves", () => {
    const cache = new SpeculativeCache(10, 60);
    cache.set("key1", [{ id: "1", content: "hello" }]);
    const result = cache.get("key1");
    expect(result).toEqual([{ id: "1", content: "hello" }]);
  });

  it("returns null for expired entries", () => {
    const cache = new SpeculativeCache(10, 0);
    cache.set("key1", [{ id: "1" }]);
    // TTL is 0 seconds, so it's immediately expired
    const result = cache.get("key1");
    expect(result).toBeNull();
  });

  it("invalidates entries", () => {
    const cache = new SpeculativeCache(10, 60);
    cache.set("key1", [{ id: "1" }]);
    cache.invalidate("key1");
    expect(cache.get("key1")).toBeNull();
  });

  it("evicts oldest when full", () => {
    const cache = new SpeculativeCache(2, 60);
    cache.set("a", [{ id: "1" }]);
    cache.set("b", [{ id: "2" }]);
    cache.set("c", [{ id: "3" }]);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toEqual([{ id: "2" }]);
    expect(cache.get("c")).toEqual([{ id: "3" }]);
  });
});
