import { describe, it, expect, beforeEach } from "bun:test";
import { BirthScenario, type BirthDeps, type BirthParameters } from "./birth";
import type { UnifiedEntityStore } from "../store/entity-store";
import type { GraphStore } from "./graph-store";
import type { LLMQueue } from "../lib/llm-queue";
import type { NPCRuntime } from "./npc-runtime";
import type { Chronicler } from "./chronicler";
import type { WorldClock } from "./world-clock";
import type { EntityNode } from "../models/entity";

/**
 * Tests for the BirthScenario flow.
 *
 * Verifies that:
 * 1. Birth completes gracefully when LLM returns garbage (fallback to minimal family)
 * 2. Birth produces valid parameters when LLM returns valid JSON
 * 3. Entity store and graph store receive correct data
 */

function createMockEntityStore(): any {
  const nodes = new Map<string, EntityNode>();
  return {
    add: (node: EntityNode) => {
      nodes.set(node.uid, node);
      return node;
    },
    get: (uid: string) => nodes.get(uid),
    getByName: (name: string) => {
      for (const n of nodes.values()) {
        if (n.name === name) return n;
      }
      return undefined;
    },
    getByNameAndType: (name: string, entityType: string) => {
      for (const n of nodes.values()) {
        if (n.name === name && n.entityType === entityType) return n;
      }
      return undefined;
    },
    allNodes: () => Array.from(nodes.values()),
    save: () => {},
  };
}

function createMockGraphStore(): any {
  const edges: Array<{ source: string; target: string; type: string }> = [];
  return {
    addEdge: (source: string, target: string, type: string) => {
      edges.push({ source, target, type });
    },
    getEdges: () => edges,
  };
}

function createMockLLMQueue(jsonResponses: Array<Record<string, unknown> | string>): any {
  let callIndex = 0;
  return {
    generateJson: async () => {
      const resp = jsonResponses[callIndex] ?? jsonResponses[jsonResponses.length - 1]!;
      callIndex++;
      if (typeof resp === "string") return JSON.parse(resp) as Record<string, unknown>;
      return resp;
    },
    generateText: async () => {
      const resp = jsonResponses[callIndex] ?? jsonResponses[jsonResponses.length - 1]!;
      callIndex++;
      if (typeof resp === "object") return JSON.stringify(resp);
      return resp;
    },
  };
}

function createFailingLLMQueue(): any {
  return {
    generateJson: async () => {
      throw new Error("Failed to parse JSON from Ollama response");
    },
    generateText: async () => {
      throw new Error("Ollama API error");
    },
  };
}

function createMockNPCRuntime(): any {
  const memories: Array<{ name: string; text: string }> = [];
  return {
    register: async () => {},
    get: () => ({
      health: 0,
      mood: "neutral",
      goals: [] as string[],
    }),
    addMemory: async (name: string, text: string) => {
      memories.push({ name, text });
    },
    getMemories: () => memories,
  };
}

function createMockChronicler(): any {
  const events: string[] = [];
  return {
    logEvent: async (desc: string) => {
      events.push(desc);
    },
    getEvents: () => events,
  };
}

function createMockClock(): any {
  return {
    currentTime: new Date("2026-01-01"),
    scheduleEvent: async () => {},
  };
}

const SAMPLE_WORLD_FRAME: Record<string, unknown> = {
  world_name: "Aethermoor",
  races: [
    { name: "Human", weight: 0.4 },
    { name: "Elf", weight: 0.2 },
    { name: "Dwarf", weight: 0.2 },
    { name: "Halfling", weight: 0.2 },
  ],
  factions: [
    { name: "Kingdom of Light" },
    { name: "Shadow Council" },
  ],
  birthplaces: [
    { name: "Crystalvale", type: "city" },
    { name: "Ironhold", type: "city" },
  ],
};

const VALID_FAMILY_TREE_JSON = {
  father: {
    name: "Thorin Stonehand",
    relation: "father",
    age: 35,
    occupation: "blacksmith",
    personality: "stern but fair",
    alive: true,
  },
  mother: {
    name: "Elara Moonwhisper",
    relation: "mother",
    age: 32,
    occupation: "healer",
    personality: "gentle and wise",
    alive: true,
  },
  paternal_grandparents: [],
  maternal_grandparents: [],
  siblings: [],
  aunts_uncles: [],
  family_head: "Thorin Stonehand",
  family_motto: "By hammer and heart",
  heirloom: {
    name: "Ancestral Hammer",
    description: "A ancient dwarven hammer passed down through generations",
  },
  family_secret: "The family has ancient ties to a forgotten magic",
};

describe("BirthScenario", () => {
  let mockEntityStore: ReturnType<typeof createMockEntityStore>;
  let mockGraphStore: ReturnType<typeof createMockGraphStore>;
  let mockNPCRuntime: ReturnType<typeof createMockNPCRuntime>;
  let mockChronicler: ReturnType<typeof createMockChronicler>;
  let mockClock: ReturnType<typeof createMockClock>;

  beforeEach(() => {
    mockEntityStore = createMockEntityStore();
    mockGraphStore = createMockGraphStore();
    mockNPCRuntime = createMockNPCRuntime();
    mockChronicler = createMockChronicler();
    mockClock = createMockClock();
  });

  it("completes birth with fallback when LLM fails entirely", async () => {
    const deps: BirthDeps = {
      entityStore: mockEntityStore as unknown as UnifiedEntityStore,
      graphStore: mockGraphStore as unknown as GraphStore,
      llmQueue: createFailingLLMQueue(),
      npcRuntime: mockNPCRuntime as unknown as NPCRuntime,
      chronicler: mockChronicler as unknown as Chronicler,
      clock: mockClock as unknown as WorldClock,
      worldFrame: SAMPLE_WORLD_FRAME,
    };

    const scenario = new BirthScenario(deps);
    const result = await scenario.generateAndApply("", false, 5);

    expect(result).toBeDefined();
    expect(result.params).toBeDefined();
    expect(result.openingNarrative).toBeTruthy();
    expect(result.params.character_name).toBeTruthy();
    expect(result.params.race).toBeTruthy();
    expect(result.params.social_class).toBeTruthy();
    expect(result.params.birthplace).toBeTruthy();

    // Fallback family should have generic names
    expect(result.params.family.father?.name).toBe("Unknown Father");
    expect(result.params.family.mother?.name).toBe("Unknown Mother");
  });

  it("creates character entity in store", async () => {
    const deps: BirthDeps = {
      entityStore: mockEntityStore as unknown as UnifiedEntityStore,
      graphStore: mockGraphStore as unknown as GraphStore,
      llmQueue: createFailingLLMQueue(),
      npcRuntime: mockNPCRuntime as unknown as NPCRuntime,
      chronicler: mockChronicler as unknown as Chronicler,
      clock: mockClock as unknown as WorldClock,
      worldFrame: SAMPLE_WORLD_FRAME,
    };

    const scenario = new BirthScenario(deps);
    const result = await scenario.generateAndApply("male", false, 5);

    const charNode = mockEntityStore.get(`Character:${result.params.character_name}`);
    expect(charNode).toBeDefined();
    expect(charNode!.name).toBe(result.params.character_name);
    expect(charNode!.entityType).toBe("Character");
  });

  it("creates family member entities", async () => {
    const deps: BirthDeps = {
      entityStore: mockEntityStore as unknown as UnifiedEntityStore,
      graphStore: mockGraphStore as unknown as GraphStore,
      llmQueue: createFailingLLMQueue(),
      npcRuntime: mockNPCRuntime as unknown as NPCRuntime,
      chronicler: mockChronicler as unknown as Chronicler,
      clock: mockClock as unknown as WorldClock,
      worldFrame: SAMPLE_WORLD_FRAME,
    };

    const scenario = new BirthScenario(deps);
    const result = await scenario.generateAndApply("", false, 5);

    // Father and mother should be created (even with generic names from fallback)
    const father = mockEntityStore.get("Character:Unknown Father");
    const mother = mockEntityStore.get("Character:Unknown Mother");
    expect(father).toBeDefined();
    expect(mother).toBeDefined();
  });

  it("creates graph edges for family relationships", async () => {
    const deps: BirthDeps = {
      entityStore: mockEntityStore as unknown as UnifiedEntityStore,
      graphStore: mockGraphStore as unknown as GraphStore,
      llmQueue: createFailingLLMQueue(),
      npcRuntime: mockNPCRuntime as unknown as NPCRuntime,
      chronicler: mockChronicler as unknown as Chronicler,
      clock: mockClock as unknown as WorldClock,
      worldFrame: SAMPLE_WORLD_FRAME,
    };

    const scenario = new BirthScenario(deps);
    const result = await scenario.generateAndApply("", false, 5);

    const charUid = `Character:${result.params.character_name}`;
    const edges = mockGraphStore.getEdges();

    // Should have child_of and father/mother relation edges
    const childOfEdges = edges.filter((e: any) => e.type === "child_of" && e.source !== charUid);
    expect(childOfEdges.length).toBeGreaterThanOrEqual(2); // father and mother
  });

  it("registers NPC and initializes memories", async () => {
    const deps: BirthDeps = {
      entityStore: mockEntityStore as unknown as UnifiedEntityStore,
      graphStore: mockGraphStore as unknown as GraphStore,
      llmQueue: createFailingLLMQueue(),
      npcRuntime: mockNPCRuntime as unknown as NPCRuntime,
      chronicler: mockChronicler as unknown as Chronicler,
      clock: mockClock as unknown as WorldClock,
      worldFrame: SAMPLE_WORLD_FRAME,
    };

    const scenario = new BirthScenario(deps);
    const result = await scenario.generateAndApply("", false, 5);

    const memories = mockNPCRuntime.getMemories();
    expect(memories.length).toBeGreaterThanOrEqual(1);
    expect(memories[0]!.name).toBe(result.params.character_name);
    expect(memories[0]!.text).toContain("Born in");
  });

  it("logs birth event to chronicler", async () => {
    const deps: BirthDeps = {
      entityStore: mockEntityStore as unknown as UnifiedEntityStore,
      graphStore: mockGraphStore as unknown as GraphStore,
      llmQueue: createFailingLLMQueue(),
      npcRuntime: mockNPCRuntime as unknown as NPCRuntime,
      chronicler: mockChronicler as unknown as Chronicler,
      clock: mockClock as unknown as WorldClock,
      worldFrame: SAMPLE_WORLD_FRAME,
    };

    const scenario = new BirthScenario(deps);
    const result = await scenario.generateAndApply("", false, 5);

    const events = mockChronicler.getEvents();
    expect(events.length).toBe(1);
    expect(events[0]).toContain(result.params.character_name);
    expect(events[0]).toContain("was born");
  });

  it("uses valid LLM family tree when available", async () => {
    const mockQueue = createMockLLMQueue([
      VALID_FAMILY_TREE_JSON,
      "Newborn",
      "A child was born in the kingdom.",
    ]);

    const deps: BirthDeps = {
      entityStore: mockEntityStore as unknown as UnifiedEntityStore,
      graphStore: mockGraphStore as unknown as GraphStore,
      llmQueue: mockQueue,
      npcRuntime: mockNPCRuntime as unknown as NPCRuntime,
      chronicler: mockChronicler as unknown as Chronicler,
      clock: mockClock as unknown as WorldClock,
      worldFrame: SAMPLE_WORLD_FRAME,
    };

    const scenario = new BirthScenario(deps);
    const result = await scenario.generateAndApply("", false, 5);

    // Should use LLM-generated family names
    expect(result.params.family.father?.name).toBe("Thorin Stonehand");
    expect(result.params.family.mother?.name).toBe("Elara Moonwhisper");
    expect(result.params.family.family_head).toBe("Thorin Stonehand");
    expect(result.params.family.heirloom_name).toBe("Ancestral Hammer");
  });

  it("produces valid probability rolls", async () => {
    const deps: BirthDeps = {
      entityStore: mockEntityStore as unknown as UnifiedEntityStore,
      graphStore: mockGraphStore as unknown as GraphStore,
      llmQueue: createFailingLLMQueue(),
      npcRuntime: mockNPCRuntime as unknown as NPCRuntime,
      chronicler: mockChronicler as unknown as Chronicler,
      clock: mockClock as unknown as WorldClock,
      worldFrame: SAMPLE_WORLD_FRAME,
    };

    const scenario = new BirthScenario(deps);
    const result = await scenario.generateAndApply("", false, 5);

    expect(result.params.probability_rolls).toBeDefined();
    expect(result.params.probability_rolls.length).toBeGreaterThanOrEqual(2);
    for (const roll of result.params.probability_rolls) {
      expect(roll.attribute).toBeTruthy();
      expect(roll.probability).toBeGreaterThanOrEqual(0);
      expect(roll.probability).toBeLessThanOrEqual(1);
      expect(roll.roll_result).toBeGreaterThanOrEqual(0);
      expect(roll.roll_result).toBeLessThanOrEqual(1);
    }
  });

  it("respects gender hint", async () => {
    const deps: BirthDeps = {
      entityStore: mockEntityStore as unknown as UnifiedEntityStore,
      graphStore: mockGraphStore as unknown as GraphStore,
      llmQueue: createFailingLLMQueue(),
      npcRuntime: mockNPCRuntime as unknown as NPCRuntime,
      chronicler: mockChronicler as unknown as Chronicler,
      clock: mockClock as unknown as WorldClock,
      worldFrame: SAMPLE_WORLD_FRAME,
    };

    const scenario = new BirthScenario(deps);
    const result = await scenario.generateAndApply("female", false, 5);

    expect(result.params.gender).toBe("female");
  });

  it("generates innate skills", async () => {
    const deps: BirthDeps = {
      entityStore: mockEntityStore as unknown as UnifiedEntityStore,
      graphStore: mockGraphStore as unknown as GraphStore,
      llmQueue: createFailingLLMQueue(),
      npcRuntime: mockNPCRuntime as unknown as NPCRuntime,
      chronicler: mockChronicler as unknown as Chronicler,
      clock: mockClock as unknown as WorldClock,
      worldFrame: SAMPLE_WORLD_FRAME,
    };

    const scenario = new BirthScenario(deps);
    const result = await scenario.generateAndApply("", false, 5);

    expect(result.params.innate_skills).toBeDefined();
    expect(result.params.innate_skills.length).toBeGreaterThan(0);
    for (const skill of result.params.innate_skills) {
      expect(skill.name).toBeTruthy();
      expect(skill.base_value).toBeGreaterThan(0);
      expect(skill.cap).toBeGreaterThan(0);
    }
  });
});
