/**
 * Unit tests for entity store.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { UnifiedEntityStore } from "../src/store/entity-store";
import { EntityNode } from "../src/models/entity";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const TEST_DB = join(import.meta.dir, "../.test_entities.json");

beforeEach(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

function makeEntity(uid: string, name: string, type: string): EntityNode {
  return new EntityNode({
    uid,
    name,
    entity_type: type,
    profile: {
      l1: { name, type, summary: `${name} summary`, tags: [] },
      l2: { description: `${name} description` },
      l3: {},
    },
  });
}

describe("UnifiedEntityStore", () => {
  it("should add and retrieve entities", () => {
    const store = new UnifiedEntityStore(TEST_DB);
    const node = makeEntity("Character:Alice", "Alice", "Character");
    store.add(node);

    expect(store.count()).toBe(1);
    expect(store.get("Character:Alice")?.name).toBe("Alice");
  });

  it("should search by name", () => {
    const store = new UnifiedEntityStore(TEST_DB);
    store.add(makeEntity("Character:Alice", "Alice", "Character"));
    store.add(makeEntity("Character:Bob", "Bob", "Character"));

    const results = store.search("ali");
    expect(results.length).toBe(1);
    expect(results[0]?.name).toBe("Alice");
  });

  it("should list by type", () => {
    const store = new UnifiedEntityStore(TEST_DB);
    store.add(makeEntity("Character:Alice", "Alice", "Character"));
    store.add(makeEntity("Location:Tavern", "Tavern", "Location"));

    const chars = store.listByType("Character");
    expect(chars.length).toBe(1);
    expect(chars[0]?.name).toBe("Alice");
  });

  it("should remove entities", () => {
    const store = new UnifiedEntityStore(TEST_DB);
    store.add(makeEntity("Character:Alice", "Alice", "Character"));
    expect(store.remove("Character:Alice")).toBe(true);
    expect(store.count()).toBe(0);
  });

  it("should resolve UIDs via name index", () => {
    const store = new UnifiedEntityStore(TEST_DB);
    store.add(makeEntity("Character:Alice", "Alice", "Character"));
    expect(store.resolveUid("Alice")).toBe("Character:Alice");
    expect(store.resolveUid("alice")).toBe("Character:Alice");
  });
});
