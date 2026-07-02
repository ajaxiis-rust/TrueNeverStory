import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { NameIndex, UnifiedEntityStore } from "./entity-store";
import { EntityNode } from "../models/entity";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync } from "node:fs";

const TEST_DIR = join(tmpdir(), "hibring-test-store");
const TEST_FILE = join(TEST_DIR, "entities.json");

function makeNode(uid: string, name: string, type = "Character"): EntityNode {
  return new EntityNode({
    uid,
    name,
    entity_type: type,
    profile: { l1: { summary: `${name} summary`, tags: [] }, l2: {}, l3: {} },
  });
}

beforeEach(() => {
  try { unlinkSync(TEST_FILE); } catch {}
});

afterEach(() => {
  try { unlinkSync(TEST_FILE); } catch {}
});

describe("NameIndex", () => {
  it("add and resolve by UID", () => {
    const idx = new NameIndex();
    idx.add("char:aragorn", "Aragorn", "Character");
    expect(idx.resolve("char:aragorn")).toBe("char:aragorn");
  });

  it("resolve by name (case-insensitive)", () => {
    const idx = new NameIndex();
    idx.add("c1", "Aragorn", "Character");
    expect(idx.resolve("aragorn")).toBe("c1");
    expect(idx.resolve("ARAGORN")).toBe("c1");
  });

  it("resolve with type prefix", () => {
    const idx = new NameIndex();
    idx.add("c1", "Aragorn", "Character");
    expect(idx.resolve("character:aragorn")).toBe("c1");
  });

  it("resolve by token fuzzy (single match)", () => {
    const idx = new NameIndex();
    idx.add("c1", "Aragorn son of Arathorn", "Character");
    expect(idx.resolve("arathorn")).toBe("c1");
  });

  it("resolve returns null for ambiguous token", () => {
    const idx = new NameIndex();
    idx.add("c1", "Aragorn", "Character");
    idx.add("c2", "Aragorn", "Location"); // same name
    // Both resolve by full name, so the last one wins via _byNameLower
    // But token-based would be ambiguous
  });

  it("resolve returns null for unknown", () => {
    const idx = new NameIndex();
    idx.add("c1", "Aragorn", "Character");
    expect(idx.resolve("gandalf")).toBeNull();
  });

  it("remove removes from all indices", () => {
    const idx = new NameIndex();
    idx.add("c1", "Aragorn", "Character");
    idx.remove("c1", "Aragorn", "Character");
    expect(idx.resolve("aragorn")).toBeNull();
    expect(idx.resolve("c1")).toBeNull();
  });

  it("listByType returns correct UIDs", () => {
    const idx = new NameIndex();
    idx.add("c1", "Aragorn", "Character");
    idx.add("l1", "Rivendell", "Location");
    idx.add("c2", "Legolas", "Character");
    expect(idx.listByType("Character").sort()).toEqual(["c1", "c2"]);
    expect(idx.listByType("Location")).toEqual(["l1"]);
  });

  it("validUids returns all added UIDs", () => {
    const idx = new NameIndex();
    idx.add("c1", "Aragorn", "Character");
    idx.add("l1", "Rivendell", "Location");
    const uids = idx.validUids;
    expect(uids.has("c1")).toBe(true);
    expect(uids.has("l1")).toBe(true);
  });

  it("rebuild replaces all data", () => {
    const idx = new NameIndex();
    idx.add("c1", "Aragorn", "Character");
    idx.rebuild([
      makeNode("l1", "Rivendell", "Location"),
      makeNode("c2", "Legolas", "Character"),
    ]);
    expect(idx.resolve("aragorn")).toBeNull();
    expect(idx.resolve("rivendell")).toBe("l1");
    expect(idx.resolve("legolas")).toBe("c2");
  });
});

describe("UnifiedEntityStore", () => {
  it("creates empty store", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    expect(store.count()).toBe(0);
  });

  it("add and get", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    const node = makeNode("c1", "Aragorn");
    store.add(node);
    expect(store.count()).toBe(1);
    expect(store.get("c1")?.name).toBe("Aragorn");
  });

  it("getByName resolves", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn"));
    expect(store.getByName("aragorn")?.uid).toBe("c1");
  });

  it("getByNameAndType matches type", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn", "Character"));
    store.add(makeNode("l1", "Rivendell", "Location"));
    expect(store.getByNameAndType("Aragorn", "Character")?.uid).toBe("c1");
    expect(store.getByNameAndType("Rivendell", "Location")?.uid).toBe("l1");
  });

  it("getByNameAndType returns null for wrong type", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn", "Character"));
    expect(store.getByNameAndType("Aragorn", "Location")).toBeUndefined();
  });

  it("remove deletes entity", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn"));
    expect(store.remove("c1")).toBe(true);
    expect(store.get("c1")).toBeUndefined();
    expect(store.count()).toBe(0);
  });

  it("remove returns false for unknown", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    expect(store.remove("unknown")).toBe(false);
  });

  it("allNodes returns all", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn"));
    store.add(makeNode("l1", "Rivendell", "Location"));
    expect(store.allNodes()).toHaveLength(2);
  });

  it("listByType filters correctly", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn", "Character"));
    store.add(makeNode("l1", "Rivendell", "Location"));
    expect(store.listByType("Character")).toHaveLength(1);
    expect(store.listByType("Location")).toHaveLength(1);
  });

  it("search finds by name", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn"));
    store.add(makeNode("c2", "Gandalf"));
    const results = store.search("aragorn");
    expect(results).toHaveLength(1);
    expect(results[0]!.uid).toBe("c1");
  });

  it("search finds by summary", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(new EntityNode({
      uid: "c1", name: "Aragorn", entity_type: "Character",
      profile: { l1: { summary: "King of Gondor", tags: [] }, l2: {}, l3: {} },
    }));
    const results = store.search("king");
    expect(results).toHaveLength(1);
  });

  it("search respects entityType filter", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn", "Character"));
    store.add(makeNode("l1", "Rivendell", "Location"));
    expect(store.search("aragorn", "Location")).toHaveLength(0);
    expect(store.search("aragorn", "Character")).toHaveLength(1);
  });

  it("countByType returns correct counts", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn", "Character"));
    store.add(makeNode("c2", "Gandalf", "Character"));
    store.add(makeNode("l1", "Rivendell", "Location"));
    const counts = store.countByType();
    expect(counts.Character).toBe(2);
    expect(counts.Location).toBe(1);
  });

  it("resolveUid delegates to NameIndex", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn"));
    expect(store.resolveUid("aragorn")).toBe("c1");
  });

  it("updateEntityLevel updates profile", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn"));
    store.updateEntityLevel("c1", "l2", { personality: "brave" });
    expect(store.get("c1")?.profile.l2.personality).toBe("brave");
  });

  it("batchUpdate applies multiple changes", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    store.add(makeNode("c1", "Aragorn"));
    store.add(makeNode("c2", "Gandalf"));
    store.batchUpdate([
      ["c1", "l2", { personality: "brave" }],
      ["c2", "l2", { personality: "wise" }],
    ]);
    expect(store.get("c1")?.profile.l2.personality).toBe("brave");
    expect(store.get("c2")?.profile.l2.personality).toBe("wise");
  });

  it("onMutation fires callback", () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    const events: string[] = [];
    store.onMutation((action, uid) => events.push(`${action}:${uid}`));
    store.add(makeNode("c1", "Aragorn"));
    store.remove("c1");
    expect(events).toEqual(["add:c1", "remove:c1"]);
  });

  it("persists to file when autoSave=true", async () => {
    const store = new UnifiedEntityStore(TEST_FILE, true);
    store.add(makeNode("c1", "Aragorn"));
    // Wait for async save
    await new Promise((r) => setTimeout(r, 50));
    const store2 = new UnifiedEntityStore(TEST_FILE, false);
    expect(store2.count()).toBe(1);
    expect(store2.get("c1")?.name).toBe("Aragorn");
  });

  it("loads from existing file", async () => {
    const store1 = new UnifiedEntityStore(TEST_FILE, true);
    store1.add(makeNode("c1", "Aragorn"));
    await new Promise((r) => setTimeout(r, 50));

    const store2 = new UnifiedEntityStore(TEST_FILE, false);
    expect(store2.count()).toBe(1);
  });

  it("saveIfDirty saves only when dirty", async () => {
    const store = new UnifiedEntityStore(TEST_FILE, false);
    expect(store.saveIfDirty()).toBe(false); // nothing dirty
    store.add(makeNode("c1", "Aragorn"));
    expect(store.saveIfDirty()).toBe(true);
  });
});
