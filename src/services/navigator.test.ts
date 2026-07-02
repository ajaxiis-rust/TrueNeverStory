import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Navigator } from "./navigator";
import { UnifiedEntityStore } from "../store/entity-store";
import { EntityNode } from "../models/entity";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync } from "node:fs";

const TEST_DIR = join(tmpdir(), "hibring-test-navigator");
const TEST_FILE = join(TEST_DIR, "entities.json");

function makeNode(uid: string, name: string, type: string, rels: Array<{ target: string; type: string }> = []): EntityNode {
  return new EntityNode({
    uid,
    name,
    entity_type: type,
    profile: {
      l1: { summary: name, tags: [], relationships: rels },
      l2: { current_location: "Rivendell" },
      l3: {},
    },
  });
}

let store: UnifiedEntityStore;
let nav: Navigator;

beforeEach(() => {
  try { unlinkSync(TEST_FILE); } catch {}
  store = new UnifiedEntityStore(TEST_FILE, false);
  nav = new Navigator(store);
});

afterEach(() => {
  try { unlinkSync(TEST_FILE); } catch {}
});

describe("Navigator", () => {
  describe("getEntity", () => {
    it("returns entity data", () => {
      store.add(makeNode("c1", "Aragorn", "Character"));
      const result = nav.getEntity("c1") as Record<string, unknown>;
      expect(result.uid).toBe("c1");
      expect(result.name).toBe("Aragorn");
    });

    it("returns null for unknown", () => {
      expect(nav.getEntity("unknown")).toBeNull();
    });

    it("includes profile layers when requested", () => {
      store.add(makeNode("c1", "Aragorn", "Character"));
      const result = nav.getEntity("c1", ["l1"]) as Record<string, unknown>;
      expect(result.profile).toBeDefined();
    });
  });

  describe("getNeighbors", () => {
    it("returns outgoing neighbors", () => {
      store.add(makeNode("c1", "Aragorn", "Character", [{ target: "c2", type: "knows" }]));
      store.add(makeNode("c2", "Gandalf", "Character"));
      const result = nav.getNeighbors("c1", 1, "out") as { neighbors: unknown[] };
      expect(result.neighbors).toHaveLength(1);
    });

    it("returns incoming neighbors", () => {
      store.add(makeNode("c1", "Aragorn", "Character"));
      store.add(makeNode("c2", "Gandalf", "Character", [{ target: "c1", type: "knows" }]));
      const result = nav.getNeighbors("c1", 1, "in") as { neighbors: unknown[] };
      expect(result.neighbors).toHaveLength(1);
    });

    it("returns empty for unknown entity", () => {
      const result = nav.getNeighbors("unknown") as { neighbors: unknown[] };
      expect(result.neighbors).toHaveLength(0);
    });
  });

  describe("findPath", () => {
    it("finds direct path (outgoing)", () => {
      store.add(makeNode("c1", "Aragorn", "Character", [{ target: "c2", type: "knows" }]));
      store.add(makeNode("c2", "Gandalf", "Character"));
      const result = nav.findPath("Aragorn", "Gandalf") as { path: string[]; length: number };
      expect(result.path).toEqual(["c1", "c2"]);
      expect(result.length).toBe(1);
    });

    it("finds path via incoming edges (bidirectional)", () => {
      store.add(makeNode("c1", "Aragorn", "Character"));
      store.add(makeNode("c2", "Gandalf", "Character", [{ target: "c1", type: "follows" }]));
      const result = nav.findPath("Aragorn", "Gandalf") as { path: string[]; length: number };
      expect(result.path).toEqual(["c1", "c2"]);
      expect(result.length).toBe(1);
    });

    it("finds multi-hop path", () => {
      store.add(makeNode("c1", "Aragorn", "Character", [{ target: "c2", type: "knows" }]));
      store.add(makeNode("c2", "Gandalf", "Character", [{ target: "c3", type: "knows" }]));
      store.add(makeNode("c3", "Frodo", "Character"));
      const result = nav.findPath("Aragorn", "Frodo") as { path: string[]; length: number };
      expect(result.path).toEqual(["c1", "c2", "c3"]);
      expect(result.length).toBe(2);
    });

    it("returns length 0 for same entity", () => {
      store.add(makeNode("c1", "Aragorn", "Character"));
      const result = nav.findPath("Aragorn", "Aragorn") as { path: string[]; length: number };
      expect(result.path).toEqual(["c1"]);
      expect(result.length).toBe(0);
    });

    it("returns error for unknown entity", () => {
      const result = nav.findPath("Unknown1", "Unknown2") as { error: string };
      expect(result.error).toBe("Entity not found");
    });

    it("returns error when no path", () => {
      store.add(makeNode("c1", "Aragorn", "Character"));
      store.add(makeNode("c2", "Gandalf", "Character"));
      const result = nav.findPath("Aragorn", "Gandalf") as { error: string; length: number };
      expect(result.length).toBe(-1);
      expect(result.error).toBe("No path found");
    });

    it("finds bidirectional path through graph", () => {
      // A -> B <- C -> D
      // Path from A to D should go A -> B <- C -> D (bidirectional)
      store.add(makeNode("a", "A", "Character", [{ target: "b", type: "knows" }]));
      store.add(makeNode("b", "B", "Character"));
      store.add(makeNode("c", "C", "Character", [{ target: "b", type: "knows" }, { target: "d", type: "knows" }]));
      store.add(makeNode("d", "D", "Character"));
      const result = nav.findPath("A", "D") as { path: string[]; length: number };
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.path[0]).toBe("a");
      expect(result.path[result.path.length - 1]).toBe("d");
    });
  });

  describe("searchByName", () => {
    it("finds by name", () => {
      store.add(makeNode("c1", "Aragorn", "Character"));
      store.add(makeNode("c2", "Gandalf", "Character"));
      const results = nav.searchByName("aragorn") as Array<{ uid: string }>;
      expect(results).toHaveLength(1);
      expect(results[0]!.uid).toBe("c1");
    });

    it("filters by type", () => {
      store.add(makeNode("c1", "Aragorn", "Character"));
      store.add(makeNode("l1", "Aragorn", "Location"));
      const results = nav.searchByName("aragorn", "Location") as Array<{ uid: string }>;
      expect(results).toHaveLength(1);
      expect(results[0]!.uid).toBe("l1");
    });
  });

  describe("semanticSearch", () => {
    it("falls back to text search", () => {
      store.add(makeNode("c1", "Aragorn", "Character"));
      const results = nav.semanticSearch("aragorn") as Array<{ uid: string }>;
      expect(results).toHaveLength(1);
    });
  });
});
