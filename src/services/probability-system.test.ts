import { describe, it, expect, beforeEach } from "bun:test";
import {
  ProbabilityEngine,
} from "./probability-engine";
import {
  ProbabilityProfile,
  ProbabilityParameter,
  ProbabilityModifier,
  ModifierType,
  ParameterType,
  StackingRule,
} from "../models/probability";
import { ProbabilityContextResolver } from "./probability-resolver";
import { UnifiedEntityStore } from "../store/entity-store";
import { COMBAT, PERSUASION, STEALTH, GENERIC, BIRTH_RACE, BIRTH_SOCIAL_CLASS } from "./probability-profiles";
import { ROMANCE_ATTRACTION, ROMANCE_CONFESSION, ROMANCE_DATE, ROMANCE_KISS, ROMANCE_PROPOSAL, ROMANCE_BREAKUP, getRomanceProfile } from "./romance-profiles";

describe("ProbabilityResolver", () => {
  it("builds context with defaults", async () => {
    const store = new UnifiedEntityStore("/tmp/test-prob-resolver.json");
    const resolver = new ProbabilityContextResolver(store, null);
    const ctx = await resolver.buildContext("Alice", null, "combat", null);
    expect(ctx.actor).toBe("Alice");
    expect(ctx.actor_health).toBe(0.5);
    expect(ctx.actor_mood_factor).toBe(0.5);
    expect(ctx.relationship_strength).toBe(0.5);
  });

  it("fills missing defaults", async () => {
    const store = new UnifiedEntityStore("/tmp/test-prob-resolver2.json");
    const resolver = new ProbabilityContextResolver(store, null);
    const ctx = await resolver.buildContext("Alice");
    expect(ctx.environment_light).toBe(0.5);
    expect(ctx.environment_noise).toBe(0.5);
    expect(ctx.environment_modifier).toBe(0);
    expect(ctx.environment_terrain_mod).toBe(0);
    expect(ctx.target_defense).toBe(0.5);
  });

  it("resolves target stats for combat action", async () => {
    const store = {
      getByNameAndType: (name: string, type: string) => {
        if (name === "Bob" && type === "Character") return { uid: "c1", profile: { l2: { armor_class: 0.8, hit_points: 80 } } };
        return undefined;
      },
    };
    const npcState = { health: 80, mood: "anger" };
    const npcMgr = { get: (_name: string) => npcState, listAll: () => ({ Bob: npcState }) };
    const resolver = new ProbabilityContextResolver(store as any, npcMgr as any);
    const ctx = await resolver.buildContext("Alice", "Bob", "combat", null);
    expect(ctx.target_defense).toBe(0.8);
    expect(ctx.target_health).toBe(0.8);
    expect(ctx.target_mood_factor).toBe(0.2);
  });

  it("resolves target stats for persuasion action", async () => {
    const store = {
      getByNameAndType: (name: string, type: string) => {
        if (name === "Bob" && type === "Character") return { uid: "c1", profile: { l2: { wisdom: 0.9 } } };
        return undefined;
      },
    };
    const resolver = new ProbabilityContextResolver(store as any, null);
    const ctx = await resolver.buildContext("Alice", "Bob", "persuasion", null);
    expect(ctx.target_resistance).toBe(0.9);
    expect(ctx.target_mood_factor).toBe(0.5);
  });

  it("resolves relationship strength via graph", async () => {
    const store = {
      getByNameAndType: (name: string) => ({ uid: `c:${name}`, profile: {} }),
    };
    const graph = {
      getEdgesBetween: () => [{ source: "c:Alice", target: "c:Bob", type: "ally_of", strength: 0.9 }],
      getOutgoingEdges: () => [],
    };
    const resolver = new ProbabilityContextResolver(store as any, null, graph as any);
    const ctx = await resolver.buildContext("Alice", "Bob", "generic", null);
    expect(ctx.relationship_strength).toBe(0.9);
  });

  it("resolves faction reputation via graph", async () => {
    const store = {
      getByNameAndType: (name: string, type: string) => {
        if (type === "Character") return { uid: "c1", profile: {} };
        if (type === "Faction") return { uid: "f1", profile: { l2: { reputation: 0.7 } } };
        return undefined;
      },
      get: (uid: string) => {
        if (uid === "f1") return { uid: "f1", profile: { l2: { reputation: 0.7 } } };
        return undefined;
      },
    };
    const graph = {
      getEdgesBetween: () => [],
      getOutgoingEdges: () => [{ source: "c1", target: "f1", type: "member_of" }],
    };
    const resolver = new ProbabilityContextResolver(store as any, null, graph as any);
    const ctx = await resolver.buildContext("Alice", null, "generic", null);
    expect(ctx.faction_reputation).toBe(0.7);
  });

  it("resolves environment modifiers from location", async () => {
    const store = {
      getByNameAndType: (name: string, type: string) => {
        if (name === "Cave" && type === "Location") return { uid: "l1", profile: { l2: { light_level: 0.2, noise_level: 0.1, terrain: "difficult" } } };
        return undefined;
      },
    };
    const resolver = new ProbabilityContextResolver(store as any, null);
    const ctx = await resolver.buildContext("Alice", null, "generic", "Cave");
    expect(ctx.environment_light).toBe(0.2);
    expect(ctx.environment_noise).toBe(0.1);
    expect(ctx.environment_terrain_mod).toBe(-0.2);
  });

  it("applies world rules for combat in combat_law zone", async () => {
    const store = {
      getByNameAndType: (name: string, type: string) => {
        if (name === "Arena" && type === "Location") return { uid: "l1", profile: { l2: { active_rules: ["arena_rules"] } } };
        return undefined;
      },
    };
    const worldFrame = { world_rules: [{ name: "arena_rules", category: "combat_law" }] };
    const resolver = new ProbabilityContextResolver(store as any, null, null, null, worldFrame);
    const ctx = await resolver.buildContext("Alice", null, "combat", "Arena");
    expect(ctx.rule_penalty).toBe(-0.2);
  });

  it("applies world rules for magic in magic_law zone", async () => {
    const store = {
      getByNameAndType: (name: string, type: string) => {
        if (name === "Tower" && type === "Location") return { uid: "l1", profile: { l2: { active_rules: ["no_magic"] } } };
        return undefined;
      },
    };
    const worldFrame = { world_rules: [{ name: "no_magic", category: "magic_law" }] };
    const resolver = new ProbabilityContextResolver(store as any, null, null, null, worldFrame);
    const ctx = await resolver.buildContext("Alice", null, "cast_spell", "Tower");
    expect(ctx.rule_penalty).toBe(-0.3);
  });

  it("adds world memory context", async () => {
    const store = { getByNameAndType: () => undefined };
    const worldMemory = {
      retrieve: async () => [{ content: "Alice failure to pick the lock" }, { content: "Alice succeeded in combat" }],
    };
    const resolver = new ProbabilityContextResolver(store as any, null, null, worldMemory as any);
    const ctx = await resolver.buildContext("Alice", null, "generic", null);
    expect(ctx.actor_recent_memories).toBe(2);
    expect(ctx.actor_recent_failures).toBe(0.5);
  });

  it("merges extra context fields", async () => {
    const store = { getByNameAndType: () => undefined };
    const resolver = new ProbabilityContextResolver(store as any, null);
    const ctx = await resolver.buildContext("Alice", null, "generic", null, { custom_flag: true, mood_boost: 0.3 });
    expect(ctx.extra_custom_flag).toBe(true);
    expect(ctx.extra_mood_boost).toBe(0.3);
  });
});

describe("RomanceProfiles", () => {
  it("has all romance profiles", () => {
    expect(ROMANCE_ATTRACTION.name).toBe("romance_attraction");
    expect(ROMANCE_CONFESSION.name).toBe("romance_confession");
    expect(ROMANCE_DATE.name).toBe("romance_date");
    expect(ROMANCE_KISS.name).toBe("romance_kiss");
    expect(ROMANCE_PROPOSAL.name).toBe("romance_proposal");
    expect(ROMANCE_BREAKUP.name).toBe("romance_breakup");
  });

  it("getRomanceProfile resolves by name", () => {
    expect(getRomanceProfile("attraction")).toBe(ROMANCE_ATTRACTION);
    expect(getRomanceProfile("confess")).toBe(ROMANCE_CONFESSION);
    expect(getRomanceProfile("date")).toBe(ROMANCE_DATE);
    expect(getRomanceProfile("kiss")).toBe(ROMANCE_KISS);
    expect(getRomanceProfile("propose")).toBe(ROMANCE_PROPOSAL);
    expect(getRomanceProfile("breakup")).toBe(ROMANCE_BREAKUP);
  });

  it("confession uses logistic formula", () => {
    expect(ROMANCE_CONFESSION.formula).toBe("logistic");
  });

  it("breakup has inverted thresholds", () => {
    expect(ROMANCE_BREAKUP.criticalSuccessThreshold).toBe(0.75);
    expect(ROMANCE_BREAKUP.criticalFailureThreshold).toBe(0.25);
  });
});

describe("ProbabilityEngine with real profiles", () => {
  let engine: ProbabilityEngine;

  beforeEach(() => {
    engine = new ProbabilityEngine(0.5);
  });

  it("computes combat probability", () => {
    const ctx = {
      actor_combat_skill: 0.7,
      actor_health: 0.8,
      actor_weapon_proficiency: 0.6,
      target_defense: 0.4,
      environment_terrain_mod: 0.0,
    };
    const prob = engine.compute(COMBAT, ctx);
    expect(prob).toBeGreaterThan(0);
    expect(prob).toBeLessThan(1);
  });

  it("rolls combat with explicit value", () => {
    const ctx = {
      actor_combat_skill: 0.7,
      actor_health: 0.8,
      actor_weapon_proficiency: 0.6,
      target_defense: 0.4,
      environment_terrain_mod: 0.0,
    };
    const result = engine.roll(COMBAT, ctx, undefined, 0.3);
    expect(result.probability).toBeGreaterThan(0);
    expect(typeof result.success).toBe("boolean");
  });

  it("computes persuasion probability", () => {
    const ctx = {
      actor_charisma: 0.8,
      relationship_strength: 0.7,
      extra_argument_quality: 0.6,
      target_mood_factor: 0.5,
      target_resistance: 0.4,
    };
    const prob = engine.compute(PERSUASION, ctx);
    expect(prob).toBeGreaterThan(0);
    expect(prob).toBeLessThan(1);
  });

  it("computes romance probability", () => {
    const ctx = {
      actor_charisma: 0.7,
      relationship_strength: 0.6,
      environment_modifier: 0.1,
      actor_mood_factor: 0.6,
      target_mood_factor: 0.5,
    };
    const profile = getRomanceProfile("attraction")!;
    const prob = engine.compute(profile, ctx);
    expect(prob).toBeGreaterThan(0);
    expect(prob).toBeLessThan(1);
  });
});

describe("BirthProfiles", () => {
  let engine: ProbabilityEngine;

  beforeEach(() => {
    engine = new ProbabilityEngine(0.5);
  });

  it("computes birth race probability", () => {
    const ctx = {
      race_rarity: 0.3,
      hint_weight: 0.5,
      race_demographic: 0.4,
    };
    const prob = engine.compute(BIRTH_RACE, ctx);
    expect(prob).toBeGreaterThan(0);
    expect(prob).toBeLessThan(1);
  });

  it("computes birth social class probability", () => {
    const ctx = {
      class_demographic: 0.3,
      parent_class: 0.5,
      hint_weight: 0.0,
    };
    const prob = engine.compute(BIRTH_SOCIAL_CLASS, ctx);
    expect(prob).toBeGreaterThan(0);
    expect(prob).toBeLessThan(1);
  });
});
