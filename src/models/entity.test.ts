import { describe, it, expect } from "bun:test";
import {
  EntityNode,
  EntityType,
  entityTypeFromString,
  LayeredProfile,
  WorldFrame,
  Relationship,
} from "./entity";

function makeNode(overrides: Partial<{ uid: string; name: string; entityType: string }> = {}): EntityNode {
  return new EntityNode({
    uid: overrides.uid ?? "char:aragorn",
    name: overrides.name ?? "Aragorn",
    entity_type: overrides.entityType ?? "Character",
    profile: { l1: { summary: "King", tags: ["hero"] }, l2: { personality: "brave" }, l3: {} },
  });
}

describe("EntityType", () => {
  it("has all expected types", () => {
    expect(EntityType.CHARACTER).toBe("Character");
    expect(EntityType.LOCATION).toBe("Location");
    expect(EntityType.ITEM).toBe("Item");
    expect(EntityType.FACTION).toBe("Faction");
    expect(EntityType.WORLD_RULE).toBe("WorldRule");
  });
});

describe("entityTypeFromString", () => {
  it("returns matching type", () => {
    expect(entityTypeFromString("Character")).toBe("Character");
    expect(entityTypeFromString("Location")).toBe("Location");
  });

  it("returns Unknown for unrecognized", () => {
    expect(entityTypeFromString("Spaceship")).toBe("Unknown");
    expect(entityTypeFromString("")).toBe("Unknown");
  });
});

describe("LayeredProfile", () => {
  it("constructs with defaults", () => {
    const p = new LayeredProfile();
    expect(p.l1).toEqual({});
    expect(p.l2).toEqual({});
    expect(p.l3).toEqual({});
  });

  it("constructs with data", () => {
    const p = new LayeredProfile({ name: "test" }, { desc: "a desc" }, { secret: true });
    expect(p.name).toBe("test");
    expect(p.l2.desc).toBe("a desc");
    expect(p.l3.secret).toBe(true);
  });

  it("getLayer returns correct layer", () => {
    const p = new LayeredProfile({ a: 1 }, { b: 2 }, { c: 3 });
    expect(p.getLayer("l1")).toEqual({ a: 1 });
    expect(p.getLayer("l2")).toEqual({ b: 2 });
    expect(p.getLayer("l3")).toEqual({ c: 3 });
    expect(p.getLayer("l4")).toEqual({});
  });

  it("summary defaults to empty string", () => {
    expect(new LayeredProfile().summary).toBe("");
  });

  it("tags defaults to empty array", () => {
    expect(new LayeredProfile().tags).toEqual([]);
  });

  it("relationships lazily initializes", () => {
    const p = new LayeredProfile();
    const rels = p.relationships;
    expect(rels).toEqual([]);
    rels.push({ type: "knows" });
    expect(p.relationships).toHaveLength(1);
  });

  it("getEffectiveData filters empty layers", () => {
    const p = new LayeredProfile({ name: "x" }, {}, {});
    const data = p.getEffectiveData();
    expect(data.l1).toBeDefined();
    expect(data.l2).toBeUndefined();
    expect(data.l3).toBeUndefined();
  });

  it("getEffectiveData with specific layers", () => {
    const p = new LayeredProfile({ a: 1 }, { b: 2 }, { c: 3 });
    const data = p.getEffectiveData(["l1", "l3"]);
    expect(data.l1).toBeDefined();
    expect(data.l2).toBeUndefined();
    expect(data.l3).toBeDefined();
  });

  it("toDict/fromDict roundtrip", () => {
    const p = new LayeredProfile({ a: 1 }, { b: 2 }, {});
    const d = p.toDict();
    const p2 = LayeredProfile.fromDict(d);
    expect(p2.l1).toEqual({ a: 1 });
    expect(p2.l2).toEqual({ b: 2 });
  });
});

describe("EntityNode", () => {
  it("constructs with all fields", () => {
    const node = makeNode();
    expect(node.uid).toBe("char:aragorn");
    expect(node.name).toBe("Aragorn");
    expect(node.entityType).toBe("Character");
    expect(node.profile).toBeInstanceOf(LayeredProfile);
    expect(node.groupId).toBe("");
  });

  it("constructs with optional fields", () => {
    const now = Date.now() / 1000;
    const node = new EntityNode({
      uid: "u1", name: "n1", entity_type: "Location",
      profile: { l1: {}, l2: {}, l3: {} },
      group_id: "g1",
      created_at: now,
      updated_at: now,
    });
    expect(node.groupId).toBe("g1");
    expect(node.createdAt).toBe(now);
  });

  it("etype returns parsed EntityTypeValue", () => {
    expect(makeNode().etype).toBe("Character");
    expect(makeNode({ entityType: "Location" }).etype).toBe("Location");
    expect(makeNode({ entityType: "Bogus" }).etype).toBe("Unknown");
  });

  it("toDict/fromDict roundtrip", () => {
    const node = makeNode();
    const dict = node.toDict();
    expect(dict.uid).toBe("char:aragorn");
    expect(dict.entity_type).toBe("Character");
    const restored = EntityNode.fromDict(dict);
    expect(restored.name).toBe("Aragorn");
    expect(restored.profile.summary).toBe("King");
  });
});

describe("Relationship", () => {
  it("constructs with defaults", () => {
    const r = new Relationship({ source: "a", target: "b", type: "knows" });
    expect(r.sourceUid).toBe("a");
    expect(r.targetUid).toBe("b");
    expect(r.strength).toBe(0);
    expect(r.sourceLayer).toBe("l1");
  });

  it("toDict roundtrip", () => {
    const r = new Relationship({ source: "a", target: "b", type: "loves", strength: 0.8 });
    const d = r.toDict();
    expect(d.type).toBe("loves");
    expect(d.strength).toBe(0.8);
  });
});

describe("WorldFrame", () => {
  it("constructs with defaults", () => {
    const wf = new WorldFrame();
    expect(wf.worldName).toBe("");
    expect(wf.races).toEqual([]);
    expect(wf.worldRules).toEqual([]);
  });

  it("constructs with data", () => {
    const wf = new WorldFrame({
      world_name: "Middle-earth",
      races: [{ name: "Elf" }],
      world_rules: [{ name: "rule1", description: "No magic" }],
    });
    expect(wf.worldName).toBe("Middle-earth");
    expect(wf.races).toHaveLength(1);
  });

  it("getRulesText formats rules", () => {
    const wf = new WorldFrame({
      world_rules: [
        { name: "Magic", description: "Costs mana" },
        { name: "Death", description: "Permanent" },
      ],
    });
    const text = wf.getRulesText();
    expect(text).toContain("- Magic: Costs mana");
    expect(text).toContain("- Death: Permanent");
  });

  it("getEntityNames collects all names", () => {
    const wf = new WorldFrame({
      races: [{ name: "Elf" }],
      characters: [{ name: "Legolas" }],
      locations: [{ name: "Rivendell" }],
    });
    const names = wf.getEntityNames();
    expect(names).toContain("Elf");
    expect(names).toContain("Legolas");
    expect(names).toContain("Rivendell");
  });

  it("toDict/fromDict roundtrip", () => {
    const wf = new WorldFrame({ world_name: "Test" });
    const d = wf.toDict();
    const restored = WorldFrame.fromDict(d);
    expect(restored.worldName).toBe("Test");
  });
});
