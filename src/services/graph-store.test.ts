import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GraphStore } from "./graph-store";
import { UnifiedEntityStore } from "../store/entity-store";
import { EntityNode } from "../models/entity";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, mkdirSync } from "node:fs";

const TEST_DIR = join(tmpdir(), "hibring-test-graph");
const TEST_FILE = join(TEST_DIR, "entities.json");

function makeNode(uid: string, name: string, type: string, rels: Array<{ target: string; type: string }> = []): EntityNode {
  return new EntityNode({
    uid,
    name,
    entity_type: type,
    profile: {
      l1: { summary: name, tags: [], relationships: rels },
      l2: {},
      l3: {},
    },
  });
}

let store: UnifiedEntityStore;
let graph: GraphStore;

beforeEach(() => {
  try { unlinkSync(TEST_FILE); } catch {}
  try { mkdirSync(TEST_DIR, { recursive: true }); } catch {}
  store = new UnifiedEntityStore(TEST_FILE, false);
  graph = new GraphStore(store, TEST_DIR);
});

afterEach(() => {
  try { unlinkSync(TEST_FILE); } catch {}
});

describe("GraphStore", () => {
  it("boots from entity relationships", async () => {
    store.add(makeNode("c1", "Aragorn", "Character", [{ target: "c2", type: "knows" }]));
    store.add(makeNode("c2", "Gandalf", "Character"));
    await graph.boot();
    expect(graph.nodeCount).toBe(2);
    expect(graph.edgeCount).toBe(1);
  });

  it("getNeighbors returns neighbors", async () => {
    store.add(makeNode("c1", "Aragorn", "Character", [{ target: "c2", type: "knows" }]));
    store.add(makeNode("c2", "Gandalf", "Character"));
    await graph.boot();
    const neighbors = graph.getNeighbors("c1", 1, "out");
    expect(neighbors.size).toBe(1);
    expect(neighbors.has("c2")).toBe(true);
  });

  it("getNeighbors bidirectional", async () => {
    store.add(makeNode("c1", "Aragorn", "Character"));
    store.add(makeNode("c2", "Gandalf", "Character", [{ target: "c1", type: "follows" }]));
    await graph.boot();
    const neighbors = graph.getNeighbors("c1", 1, "both");
    expect(neighbors.size).toBe(1);
    expect(neighbors.has("c2")).toBe(true);
  });

  it("findPath finds shortest path", async () => {
    store.add(makeNode("a", "A", "Character", [{ target: "b", type: "knows" }]));
    store.add(makeNode("b", "B", "Character", [{ target: "c", type: "knows" }]));
    store.add(makeNode("c", "C", "Character"));
    await graph.boot();
    const path = graph.findPath("a", "c");
    expect(path).toEqual(["a", "b", "c"]);
  });

  it("findPath bidirectional", async () => {
    store.add(makeNode("a", "A", "Character"));
    store.add(makeNode("b", "B", "Character", [{ target: "a", type: "follows" }]));
    store.add(makeNode("c", "C", "Character", [{ target: "b", type: "follows" }]));
    await graph.boot();
    const path = graph.findPath("a", "c");
    expect(path).toEqual(["a", "b", "c"]);
  });

  it("findPath returns null when no path", async () => {
    store.add(makeNode("a", "A", "Character"));
    store.add(makeNode("b", "B", "Character"));
    await graph.boot();
    const path = graph.findPath("a", "b");
    expect(path).toBeNull();
  });

  it("findPath returns [source] for same node", async () => {
    store.add(makeNode("a", "A", "Character"));
    await graph.boot();
    const path = graph.findPath("a", "a");
    expect(path).toEqual(["a"]);
  });

  it("addEdge adds edge", async () => {
    store.add(makeNode("a", "A", "Character"));
    store.add(makeNode("b", "B", "Character"));
    await graph.boot();
    graph.addEdge("a", "b", "knows");
    expect(graph.edgeCount).toBe(1);
  });

  it("removeEdge removes edge", async () => {
    store.add(makeNode("a", "A", "Character", [{ target: "b", type: "knows" }]));
    store.add(makeNode("b", "B", "Character"));
    await graph.boot();
    expect(graph.edgeCount).toBe(1);
    graph.removeEdge("a", "b");
    expect(graph.edgeCount).toBe(0);
  });

  it("getSummary returns stats", async () => {
    store.add(makeNode("c1", "Aragorn", "Character"));
    store.add(makeNode("l1", "Rivendell", "Location"));
    await graph.boot();
    const summary = graph.getSummary();
    expect(summary.nodes).toBe(2);
    expect(summary.edges).toBe(0);
    expect(summary.nodeTypes.Character).toBe(1);
    expect(summary.nodeTypes.Location).toBe(1);
  });

  it("getNodeTypes returns counts", async () => {
    store.add(makeNode("c1", "Aragorn", "Character"));
    store.add(makeNode("c2", "Gandalf", "Character"));
    store.add(makeNode("l1", "Rivendell", "Location"));
    await graph.boot();
    const types = graph.getNodeTypes();
    expect(types.Character).toBe(2);
    expect(types.Location).toBe(1);
  });

  it("entityStore accessor works", () => {
    expect(graph.entityStore).toBe(store);
  });

  it("branches accessor works", () => {
    expect(graph.branches).toBeDefined();
    expect(graph.branches.active).toBe("main");
  });

  it("multi-hop neighbors", async () => {
    store.add(makeNode("a", "A", "Character", [{ target: "b", type: "knows" }]));
    store.add(makeNode("b", "B", "Character", [{ target: "c", type: "knows" }]));
    store.add(makeNode("c", "C", "Character"));
    await graph.boot();
    const neighbors = graph.getNeighbors("a", 2, "out");
    expect(neighbors.size).toBe(2);
    expect(neighbors.get("b")).toBe(1);
    expect(neighbors.get("c")).toBe(2);
  });
});
