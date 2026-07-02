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

  describe("Feudal hierarchy", () => {
    it("swears fealty and tracks lord", async () => {
      await graph.swearFealty("Vassal1", "Lord1", 100, 50);

      expect(graph.getFeudalLord("Vassal1")).toBe("Lord1");
      expect(graph.isFeudalVassal("Vassal1", "Lord1")).toBe(true);
      expect(graph.getOathStatus("Vassal1")).toBe(true);
    });

    it("lists vassals of a lord", async () => {
      await graph.swearFealty("Vassal1", "Lord1", 100, 50);
      await graph.swearFealty("Vassal2", "Lord1", 200, 100);
      await graph.swearFealty("Vassal3", "Lord2", 150, 75);

      const vassals = graph.getFeudalVassals("Lord1");
      expect(vassals).toContain("Vassal1");
      expect(vassals).toContain("Vassal2");
      expect(vassals).not.toContain("Vassal3");
    });

    it("builds chain of command", async () => {
      await graph.swearFealty("Vassal1", "Lord1", 100, 50);
      await graph.swearFealty("Lord1", "King1", 500, 200);

      const chain = graph.getFeudalChain("Vassal1");
      expect(chain).toEqual(["Lord1", "King1"]);
    });

    it("detects circular chain safely", async () => {
      await graph.swearFealty("A", "B", 10, 5);
      await graph.swearFealty("B", "A", 10, 5);

      const chain = graph.getFeudalChain("A");
      expect(chain.length).toBeLessThanOrEqual(2);
    });

    it("computes feudal tax and military", async () => {
      await graph.swearFealty("Vassal1", "Lord1", 100, 50);

      expect(graph.computeFeudalTax("Vassal1")).toBe(100);
      expect(graph.computeFeudalMilitary("Vassal1")).toBe(50);
    });

    it("returns summary with totals", async () => {
      await graph.swearFealty("V1", "Lord", 100, 50);
      await graph.swearFealty("V2", "Lord", 200, 100);

      const summary = graph.getFeudalSummary("Lord");
      expect(summary.lord).toBeNull();
      expect(summary.vassals).toContain("V1");
      expect(summary.vassals).toContain("V2");
      expect(summary.totalTaxFlow).toBe(300);
      expect(summary.totalMilitarySupport).toBe(150);
    });

    it("updates loyalty", async () => {
      await graph.swearFealty("Vassal1", "Lord1", 100, 50);
      const initial = graph.getFeudalLoyalty("Vassal1");
      expect(initial).toBe(750);

      graph.updateFeudalLoyalty("Vassal1", -200);
      expect(graph.getFeudalLoyalty("Vassal1")).toBe(550);

      graph.updateFeudalLoyalty("Vassal1", -600);
      expect(graph.getFeudalLoyalty("Vassal1")).toBe(0);
    });

    it("handles rebellion", async () => {
      await graph.swearFealty("Vassal1", "Lord1", 100, 50);
      expect(graph.isFeudalVassal("Vassal1", "Lord1")).toBe(true);

      graph.rebel("Vassal1");
      expect(graph.isFeudalVassal("Vassal1", "Lord1")).toBe(false);
      expect(graph.getOathStatus("Vassal1")).toBe(false);
      expect(graph.getFeudalLoyalty("Vassal1")).toBe(0);
    });

    it("persists feudal data across reload", async () => {
      await graph.swearFealty("Vassal1", "Lord1", 100, 50);

      const graph2 = new SocialGraph(TMP);
      expect(graph2.getFeudalLord("Vassal1")).toBe("Lord1");
      expect(graph2.computeFeudalTax("Vassal1")).toBe(100);
    });

    it("returns defaults for unknown NPC", () => {
      expect(graph.getFeudalLord("Unknown")).toBeNull();
      expect(graph.getFeudalVassals("Unknown")).toEqual([]);
      expect(graph.computeFeudalTax("Unknown")).toBe(0);
      expect(graph.getFeudalLoyalty("Unknown")).toBe(0);
    });
  });

  describe("Faction system", () => {
    it("creates faction with leader and type", async () => {
      await graph.createFaction("Royal Guard", "military", "Commander", "Elite protectors");
      const details = graph.getFactionDetails("Royal Guard");

      expect(details).not.toBeNull();
      expect(details!.type).toBe("military");
      expect(details!.leader).toBe("Commander");
      expect(details!.members).toContain("Commander");
      expect(details!.influence).toBe(100);
    });

    it("updates faction leader", async () => {
      await graph.createFaction("Guild", "economic", "Alice", "Trade guild");
      graph.setFactionLeader("Guild", "Bob");

      const details = graph.getFactionDetails("Guild");
      expect(details!.leader).toBe("Bob");
      expect(graph.getFactionMembers("Guild")).toContain("Bob");
    });

    it("updates influence and treasury", async () => {
      await graph.createFaction("Cult", "religious", "Leader", "Dark faith");
      graph.updateFactionInfluence("Cult", 200);
      graph.updateFactionTreasury("Cult", 5000);

      const d = graph.getFactionDetails("Cult")!;
      expect(d.influence).toBe(300);
      expect(d.treasury).toBe(5000);
    });

    it("clamps influence to 0-1000", async () => {
      await graph.createFaction("Tiny", "neutral", null, "");
      graph.updateFactionInfluence("Tiny", -200);
      expect(graph.getFactionDetails("Tiny")!.influence).toBe(0);

      graph.updateFactionInfluence("Tiny", 2000);
      expect(graph.getFactionDetails("Tiny")!.influence).toBe(1000);
    });

    it("expels member from faction", async () => {
      await graph.createFaction("Crew", "criminal", "Boss", "Thieves");
      await graph.addToFaction("Mole", "Crew");
      await graph.expelFromFaction("Mole", "Crew");

      expect(graph.getFactionMembers("Crew")).not.toContain("Mole");
    });

    it("returns null for unknown faction", () => {
      expect(graph.getFactionDetails("Nope")).toBeNull();
      expect(graph.getFactionType("Nope")).toBeNull();
    });
  });

  describe("Inter-faction relations", () => {
    it("sets and gets reputation between factions", async () => {
      await graph.setInterFactionRelation("Guard", "Thieves", -500);
      const rel = graph.getInterFactionRelation("Guard", "Thieves");

      expect(rel).not.toBeNull();
      expect(rel!.reputation).toBe(-500);
    });

    it("reputation is symmetric", async () => {
      await graph.setInterFactionRelation("A", "B", 300);
      expect(graph.getInterFactionRelation("B", "A")!.reputation).toBe(300);
    });

    it("clamps reputation to -1000..1000", async () => {
      await graph.setInterFactionRelation("A", "B", 2000);
      expect(graph.getInterFactionRelation("A", "B")!.reputation).toBe(1000);

      await graph.setInterFactionRelation("A", "B", -2000);
      expect(graph.getInterFactionRelation("A", "B")!.reputation).toBe(-1000);
    });

    it("detects enemies by low reputation", async () => {
      await graph.setInterFactionRelation("Guard", "Thieves", -600);
      expect(graph.areEnemies("Guard", "Thieves")).toBe(true);
    });

    it("not enemies at moderate reputation", async () => {
      await graph.setInterFactionRelation("A", "B", -200);
      expect(graph.areEnemies("A", "B")).toBe(false);
    });
  });

  describe("Alliances", () => {
    beforeEach(async () => {
      await graph.createFaction("Kingdom", "noble", "King", "The realm");
      await graph.createFaction("Church", "religious", "Pope", "Faith");
      await graph.createFaction("Guild", "economic", "Mayor", "Trade");
    });

    it("forms and retrieves alliance", async () => {
      await graph.formAlliance("Kingdom", "Church", "defensive", 500);
      const a = graph.getAlliance("Kingdom", "Church");

      expect(a).not.toBeNull();
      expect(a!.type).toBe("defensive");
      expect(a!.active).toBe(true);
    });

    it("alliance is symmetric", async () => {
      await graph.formAlliance("Kingdom", "Guild", "trade", 400);
      expect(graph.getAlliance("Guild", "Kingdom")).not.toBeNull();
    });

    it("lists active alliances for a faction", async () => {
      await graph.formAlliance("Kingdom", "Church", "defensive", 500);
      await graph.formAlliance("Kingdom", "Guild", "trade", 400);

      const allies = graph.getActiveAlliances("Kingdom");
      expect(allies.length).toBe(2);
    });

    it("dissolves alliance", async () => {
      await graph.formAlliance("Kingdom", "Church", "defensive", 500);
      graph.dissolveAlliance("Kingdom", "Church");

      expect(graph.isAllied("Kingdom", "Church")).toBe(false);
    });

    it("betrays alliance and becomes enemies", async () => {
      await graph.formAlliance("Kingdom", "Church", "military", 800);
      graph.betrayAlliance("Kingdom", "Church");

      const a = graph.getAlliance("Kingdom", "Church");
      expect(a!.active).toBe(false);
      expect(a!.betrayed).toBe(true);
      expect(graph.areEnemies("Kingdom", "Church")).toBe(true);
    });

    it("strengthens alliance", async () => {
      await graph.formAlliance("Kingdom", "Guild", "trade", 300);
      graph.strengthenAlliance("Kingdom", "Guild", 200);

      const a = graph.getAlliance("Kingdom", "Guild")!;
      expect(a.strength).toBe(500);
    });

    it("checks alliance by type", async () => {
      await graph.formAlliance("Kingdom", "Church", "defensive", 500);

      expect(graph.isAllied("Kingdom", "Church", "defensive")).toBe(true);
      expect(graph.isAllied("Kingdom", "Church", "trade")).toBe(false);
    });

    it("alliance with duration expires", async () => {
      await graph.formAlliance("Kingdom", "Guild", "trade", 400, -1);
      expect(graph.isAllied("Kingdom", "Guild")).toBe(false);
    });

    it("returns null for no alliance", () => {
      expect(graph.getAlliance("Kingdom", "UnknownFaction")).toBeNull();
    });

    it("betrayal damages inter-faction reputation", async () => {
      await graph.setInterFactionRelation("Kingdom", "Church", 200);
      await graph.formAlliance("Kingdom", "Church", "military", 500);
      graph.betrayAlliance("Kingdom", "Church");

      const rel = graph.getInterFactionRelation("Kingdom", "Church")!;
      expect(rel.reputation).toBeLessThan(200);
    });
  });

  describe("Faction summary", () => {
    it("builds summary with allies and enemies", async () => {
      await graph.createFaction("A", "military", "Leader1", "");
      await graph.createFaction("B", "economic", "Leader2", "");
      await graph.createFaction("C", "criminal", "Leader3", "");
      await graph.formAlliance("A", "B", "defensive", 500);
      await graph.addFactionConflict("A", "C");

      const summary = graph.getFactionSummary("A");
      expect(summary.type).toBe("military");
      expect(summary.allies).toContain("B");
      expect(summary.enemies).toContain("C");
    });
  });
});
