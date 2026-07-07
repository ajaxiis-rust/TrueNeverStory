# NPC Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comprehensive NPC improvement across memory, behavior, social connections, and dialogue quality.

**Architecture:** Two parallel tracks - Track 1 (Memory + Behavior) builds the foundation, Track 2 (Social + Dialogue) adds user-facing features. Each track has independent tasks that can be developed in parallel.

**Tech Stack:** TypeScript, Bun, existing LLMQueue and UnifiedEntityStore infrastructure.

---

## Track 1: Memory + Behavior

### Task 1: MemoryEngine - Semantic Search

**Covers:** Memory improvements

**Files:**
- Create: `src/services/memory-engine.ts`
- Create: `src/services/memory-engine.test.ts`
- Modify: `src/services/npc-runtime.ts`

- [ ] **Step 1: Write failing test for MemoryEngine**

```typescript
// src/services/memory-engine.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { MemoryEngine } from "./memory-engine";
import { NPCRuntime } from "./npc-runtime";
import { UnifiedEntityStore } from "../store/entity-store";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `tns-memeng-test-${Date.now()}`);

function addChar(store: UnifiedEntityStore, name: string, loc = "Village") {
  store.add(new (await import("../models/entity")).EntityNode({
    uid: `Character:${name}`,
    name,
    entity_type: "Character",
    profile: new (await import("../models/entity")).LayeredProfile(
      { name, type: "Character", group: "characters", summary: name, tags: [], relationships: [] },
      { current_location: loc },
      {},
    ).toDict(),
    group_id: "characters",
  }));
}

describe("MemoryEngine", () => {
  let engine: MemoryEngine;
  let runtime: NPCRuntime;
  let store: UnifiedEntityStore;

  beforeEach(async () => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
    store = new UnifiedEntityStore(join(TMP, "entities.json"));
    await addChar(store, "Alice");
    runtime = new NPCRuntime(TMP, store, null as any, null);
    engine = new MemoryEngine(runtime);
  });

  it("searches memories by keyword", async () => {
    await runtime.addMemory("Alice", "Met a merchant in the market", "neutral", 0.5);
    await runtime.addMemory("Alice", "Fought a dragon in the cave", "fear", 0.8);
    
    const results = await engine.search("Alice", "merchant");
    expect(results.length).toBe(1);
    expect(results[0]!.description).toContain("merchant");
  });

  it("returns empty for no match", async () => {
    await runtime.addMemory("Alice", "Went to sleep", "neutral", 0.3);
    
    const results = await engine.search("Alice", "dragon");
    expect(results.length).toBe(0);
  });

  it("searches by emotion", async () => {
    await runtime.addMemory("Alice", "Happy birthday celebration", "joy", 0.6);
    await runtime.addMemory("Alice", "Scary night encounter", "fear", 0.7);
    
    const results = await engine.searchByEmotion("Alice", "joy");
    expect(results.length).toBe(1);
    expect(results[0]!.emotion).toBe("joy");
  });

  it("clusters memories by topic", async () => {
    await runtime.addMemory("Alice", "Bought bread at market", "neutral", 0.4);
    await runtime.addMemory("Alice", "Sold gems at market", "joy", 0.5);
    await runtime.addMemory("Alice", "Explored dark forest", "fear", 0.6);
    
    const clusters = await engine.clusterMemories("Alice");
    expect(clusters.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/memory-engine.test.ts`
Expected: FAIL with "Cannot find module" or "MemoryEngine not defined"

- [ ] **Step 3: Implement MemoryEngine**

```typescript
// src/services/memory-engine.ts
import type { NPCRuntime } from "./npc-runtime";
import type { EpisodicMemory } from "../models/npc-state";

export interface MemoryCluster {
  topic: string;
  memories: EpisodicMemory[];
  avgImportance: number;
}

export class MemoryEngine {
  private _runtime: NPCRuntime;

  constructor(runtime: NPCRuntime) {
    this._runtime = runtime;
  }

  async search(name: string, query: string): Promise<EpisodicMemory[]> {
    const memories = await this._runtime.getMemories(name, 100);
    const queryLower = query.toLowerCase();
    return memories.filter(m => 
      m.description.toLowerCase().includes(queryLower)
    );
  }

  async searchByEmotion(name: string, emotion: string): Promise<EpisodicMemory[]> {
    const memories = await this._runtime.getMemories(name, 100);
    return memories.filter(m => m.emotion === emotion);
  }

  async searchByLocation(name: string, location: string): Promise<EpisodicMemory[]> {
    const memories = await this._runtime.getMemories(name, 100);
    return memories.filter(m => 
      m.location.toLowerCase().includes(location.toLowerCase())
    );
  }

  async clusterMemories(name: string): Promise<MemoryCluster[]> {
    const memories = await this._runtime.getMemories(name, 100);
    const clusters = new Map<string, EpisodicMemory[]>();

    for (const mem of memories) {
      const words = mem.description.toLowerCase().split(/\s+/);
      const topic = this._extractTopic(words);
      const existing = clusters.get(topic) ?? [];
      existing.push(mem);
      clusters.set(topic, existing);
    }

    return Array.from(clusters.entries()).map(([topic, mems]) => ({
      topic,
      memories: mems,
      avgImportance: mems.reduce((sum, m) => sum + m.importance, 0) / mems.length,
    }));
  }

  private _extractTopic(words: string[]): string {
    const stopWords = new Set(["the", "a", "an", "in", "at", "to", "for", "of", "with", "on", "and", "or", "but"]);
    const meaningful = words.filter(w => !stopWords.has(w) && w.length > 3);
    return meaningful[0] ?? "general";
  }

  async getRecentContext(name: string, limit = 5): Promise<string> {
    const memories = await this._runtime.getMemories(name, limit);
    return memories.map(m => `${m.description} (${m.emotion})`).join("\n");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/memory-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/memory-engine.ts src/services/memory-engine.test.ts
git commit -m "feat(npc): add MemoryEngine with semantic search and clustering"
```

---

### Task 2: BehaviorEngine - Autonomous Actions

**Covers:** Behavior and AI

**Files:**
- Create: `src/services/behavior-engine.ts`
- Create: `src/services/behavior-engine.test.ts`
- Modify: `src/services/npc-runtime.ts`

- [ ] **Step 1: Write failing test for BehaviorEngine**

```typescript
// src/services/behavior-engine.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { BehaviorEngine } from "./behavior-engine";
import { NPCRuntime } from "./npc-runtime";
import { UnifiedEntityStore } from "../store/entity-store";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `tns-beheng-test-${Date.now()}`);

describe("BehaviorEngine", () => {
  let engine: BehaviorEngine;
  let runtime: NPCRuntime;

  beforeEach(async () => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
    const store = new UnifiedEntityStore(join(TMP, "entities.json"));
    await store.add(new (await import("../models/entity")).EntityNode({
      uid: "Character:Alice",
      name: "Alice",
      entity_type: "Character",
      profile: new (await import("../models/entity")).LayeredProfile(
        { name: "Alice", type: "Character", group: "characters", summary: "Alice", tags: [], relationships: [] },
        { current_location: "Village" },
        {},
      ).toDict(),
      group_id: "characters",
    }));
    runtime = new NPCRuntime(TMP, store, null as any, null);
    engine = new BehaviorEngine(runtime);
  });

  it("evaluates goals and suggests actions", async () => {
    await runtime.addGoal("Alice", "Find the legendary sword");
    
    const actions = await engine.evaluateActions("Alice");
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]!.type).toBeDefined();
  });

  it("creates goal from context", async () => {
    await runtime.addMemory("Alice", "Heard about a treasure in the cave", "curiosity", 0.6);
    
    await engine.processContext("Alice");
    const profile = runtime.get("Alice")!;
    expect(profile.goals.length).toBeGreaterThan(0);
  });

  it("simulates daily routine", async () => {
    const actions = await engine.simulateDay("Alice");
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every(a => a.timestamp)).toBe(true);
  });

  it("adapts mood based on events", async () => {
    await runtime.addMemory("Alice", "Won a great battle", "joy", 0.9);
    
    await engine.adaptMood("Alice");
    const profile = runtime.get("Alice")!;
    expect(["happy", "content", "determined"]).toContain(profile.mood);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/behavior-engine.test.ts`
Expected: FAIL with "Cannot find module" or "BehaviorEngine not defined"

- [ ] **Step 3: Implement BehaviorEngine**

```typescript
// src/services/behavior-engine.ts
import type { NPCRuntime } from "./npc-runtime";
import type { NPCProfile } from "../models/npc-state";
import { MemoryEngine } from "./memory-engine";

export interface NPCAction {
  type: "move" | "interact" | "search" | "rest" | "trade" | "explore";
  target?: string;
  location?: string;
  description: string;
  timestamp: string;
  priority: number;
}

export interface DailyRoutine {
  hour: number;
  action: NPCAction;
}

export class BehaviorEngine {
  private _runtime: NPCRuntime;
  private _memoryEngine: MemoryEngine;

  constructor(runtime: NPCRuntime) {
    this._runtime = runtime;
    this._memoryEngine = new MemoryEngine(runtime);
  }

  async evaluateActions(name: string): Promise<NPCAction[]> {
    const profile = this._runtime.get(name);
    if (!profile) return [];

    const actions: NPCAction[] = [];

    for (const goal of profile.goals) {
      const action = this._goalToAction(profile, goal);
      if (action) actions.push(action);
    }

    if (profile.health < 50) {
      actions.push({
        type: "rest",
        description: "Need to recover health",
        timestamp: new Date().toISOString(),
        priority: 0.8,
      });
    }

    return actions.sort((a, b) => b.priority - a.priority);
  }

  private _goalToAction(profile: NPCProfile, goal: string): NPCAction | null {
    const goalLower = goal.toLowerCase();
    
    if (goalLower.includes("find") || goalLower.includes("search")) {
      return {
        type: "search",
        description: `Searching for: ${goal}`,
        timestamp: new Date().toISOString(),
        priority: 0.6,
      };
    }
    
    if (goalLower.includes("explore") || goalLower.includes("visit")) {
      return {
        type: "explore",
        description: `Exploring to: ${goal}`,
        timestamp: new Date().toISOString(),
        priority: 0.5,
      };
    }

    return null;
  }

  async processContext(name: string): Promise<void> {
    const profile = this._runtime.get(name);
    if (!profile) return;

    const recentMemories = await this._memoryEngine.search(name, "");
    const context = recentMemories.map(m => m.description).join(" ");

    if (context.includes("treasure") && !profile.goals.some(g => g.toLowerCase().includes("treasure"))) {
      await this._runtime.addGoal(name, "Find the treasure");
    }

    if (context.includes("danger") && !profile.goals.some(g => g.toLowerCase().includes("safety"))) {
      await this._runtime.addGoal(name, "Seek safety");
    }
  }

  async simulateDay(name: string): Promise<NPCAction[]> {
    const actions: NPCAction[] = [];
    const profile = this._runtime.get(name);
    if (!profile) return actions;

    const routines: DailyRoutine[] = [
      { hour: 6, action: { type: "rest", description: "Wake up", timestamp: "", priority: 0.3 } },
      { hour: 8, action: { type: "trade", description: "Morning trading", timestamp: "", priority: 0.4 } },
      { hour: 12, action: { type: "rest", description: "Midday break", timestamp: "", priority: 0.2 } },
      { hour: 14, action: { type: "explore", description: "Afternoon exploration", timestamp: "", priority: 0.5 } },
      { hour: 18, action: { type: "rest", description: "Evening rest", timestamp: "", priority: 0.3 } },
    ];

    for (const routine of routines) {
      const timestamp = new Date();
      timestamp.setHours(routine.hour, 0, 0, 0);
      actions.push({
        ...routine.action,
        timestamp: timestamp.toISOString(),
      });
    }

    return actions;
  }

  async adaptMood(name: string): Promise<void> {
    const profile = this._runtime.get(name);
    if (!profile) return;

    const recentMemories = await this._memoryEngine.searchByEmotion(name, "joy");
    const fearMemories = await this._memoryEngine.searchByEmotion(name, "fear");

    if (recentMemories.length > fearMemories.length) {
      await this._runtime.setMood(name, "happy");
    } else if (fearMemories.length > recentMemories.length) {
      await this._runtime.setMood(name, "anxious");
    } else {
      await this._runtime.setMood(name, "content");
    }
  }

  async makeDecision(name: string, situation: string): Promise<string> {
    const profile = this._runtime.get(name);
    if (!profile) return "observe";

    const memories = await this._memoryEngine.search(name, situation);
    
    if (memories.some(m => m.emotion === "fear")) {
      return "avoid";
    }
    
    if (memories.some(m => m.emotion === "joy")) {
      return "approach";
    }

    return "observe";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/behavior-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/behavior-engine.ts src/services/behavior-engine.test.ts
git commit -m "feat(npc): add BehaviorEngine with autonomous actions and daily routines"
```

---

## Track 2: Social + Dialogue

### Task 3: SocialGraph - Relationship System

**Covers:** Social connections

**Files:**
- Create: `src/services/social-graph.ts`
- Create: `src/services/social-graph.test.ts`

- [ ] **Step 1: Write failing test for SocialGraph**

```typescript
// src/services/social-graph.test.ts
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
    
    const conflicting = graph.getFactionConflicts("guards");
    expect(conflicting).toContain("thieves");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/social-graph.test.ts`
Expected: FAIL with "Cannot find module" or "SocialGraph not defined"

- [ ] **Step 3: Implement SocialGraph**

```typescript
// src/services/social-graph.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface Relationship {
  source: string;
  target: string;
  type: "friend" | "enemy" | "neutral" | "romantic" | "rival" | "mentor";
  strength: number;
  updatedAt: string;
}

export interface Faction {
  name: string;
  members: Set<string>;
  enemies: Set<string>;
}

export class SocialGraph {
  private _statePath: string;
  private _relationships: Map<string, Relationship[]> = new Map();
  private _factions: Map<string, Faction> = new Map();

  constructor(statePath: string) {
    this._statePath = statePath;
    const dir = join(statePath, "social");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this._load();
  }

  private _load(): void {
    const path = join(this._statePath, "social", "graph.json");
    if (!existsSync(path)) return;
    
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      if (data.relationships) {
        for (const [key, rels] of Object.entries(data.relationships)) {
          this._relationships.set(key, rels as Relationship[]);
        }
      }
      if (data.factions) {
        for (const [name, faction] of Object.entries(data.factions)) {
          const f = faction as { members: string[]; enemies: string[] };
          this._factions.set(name, {
            name,
            members: new Set(f.members),
            enemies: new Set(f.enemies),
          });
        }
      }
    } catch {
      // ignore corrupt data
    }
  }

  private _save(): void {
    const data = {
      relationships: Object.fromEntries(this._relationships),
      factions: Object.fromEntries(
        Array.from(this._factions.entries()).map(([name, f]) => [
          name,
          { members: Array.from(f.members), enemies: Array.from(f.enemies) },
        ])
      ),
    };
    writeFileSync(join(this._statePath, "social", "graph.json"), JSON.stringify(data, null, 2));
  }

  async addRelationship(source: string, target: string, type: Relationship["type"], strength: number): Promise<void> {
    const existing = this._relationships.get(source) ?? [];
    const idx = existing.findIndex(r => r.target === target);
    
    if (idx >= 0) {
      existing[idx]!.type = type;
      existing[idx]!.strength = strength;
      existing[idx]!.updatedAt = new Date().toISOString();
    } else {
      existing.push({
        source,
        target,
        type,
        strength,
        updatedAt: new Date().toISOString(),
      });
    }
    
    this._relationships.set(source, existing);
    this._save();
  }

  getRelationships(name: string): Relationship[] {
    return this._relationships.get(name) ?? [];
  }

  getRelationship(source: string, target: string): Relationship | undefined {
    const rels = this._relationships.get(source) ?? [];
    return rels.find(r => r.target === target);
  }

  getReputation(name: string): number {
    const rels = this.getRelationships(name);
    if (rels.length === 0) return 0.5;
    
    let score = 0.5;
    for (const rel of rels) {
      if (rel.type === "friend") score += rel.strength * 0.1;
      if (rel.type === "enemy") score -= rel.strength * 0.15;
    }
    
    return Math.max(0, Math.min(1, score));
  }

  findMutualFriends(a: string, b: string): string[] {
    const relsA = this.getRelationships(a).filter(r => r.type === "friend").map(r => r.target);
    const relsB = this.getRelationships(b).filter(r => r.type === "friend").map(r => r.target);
    return relsA.filter(name => relsB.includes(name));
  }

  async addToFaction(name: string, faction: string): Promise<void> {
    if (!this._factions.has(faction)) {
      this._factions.set(faction, { name: faction, members: new Set(), enemies: new Set() });
    }
    this._factions.get(faction)!.members.add(name);
    this._save();
  }

  getFactionMembers(faction: string): string[] {
    return Array.from(this._factions.get(faction)?.members ?? []);
  }

  getFactionConflicts(faction: string): string[] {
    const f = this._factions.get(faction);
    return f ? Array.from(f.enemies) : [];
  }

  async addFactionConflict(faction1: string, faction2: string): Promise<void> {
    if (!this._factions.has(faction1)) {
      this._factions.set(faction1, { name: faction1, members: new Set(), enemies: new Set() });
    }
    if (!this._factions.has(faction2)) {
      this._factions.set(faction2, { name: faction2, members: new Set(), enemies: new Set() });
    }
    this._factions.get(faction1)!.enemies.add(faction2);
    this._factions.get(faction2)!.enemies.add(faction1);
    this._save();
  }

  getRelationshipSummary(name: string): string {
    const rels = this.getRelationships(name);
    if (rels.length === 0) return "No known relationships";
    
    const friends = rels.filter(r => r.type === "friend");
    const enemies = rels.filter(r => r.type === "enemy");
    
    return `Friends: ${friends.length}, Enemies: ${enemies.length}, Total: ${rels.length}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/social-graph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/social-graph.ts src/services/social-graph.test.ts
git commit -m "feat(npc): add SocialGraph with relationships, reputation, and factions"
```

---

### Task 4: DialogueContext - Enriched Prompts

**Covers:** Dialogue quality

**Files:**
- Create: `src/services/dialogue-context.ts`
- Create: `src/services/dialogue-context.test.ts`
- Modify: `src/services/npc-agent.ts`

- [ ] **Step 1: Write failing test for DialogueContext**

```typescript
// src/services/dialogue-context.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { DialogueContext } from "./dialogue-context";
import { NPCRuntime } from "./npc-runtime";
import { SocialGraph } from "./social-graph";
import { MemoryEngine } from "./memory-engine";
import { UnifiedEntityStore } from "../store/entity-store";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `tns-dialog-test-${Date.now()}`);

describe("DialogueContext", () => {
  let context: DialogueContext;
  let runtime: NPCRuntime;
  let social: SocialGraph;
  let memory: MemoryEngine;

  beforeEach(async () => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
    const store = new UnifiedEntityStore(join(TMP, "entities.json"));
    await store.add(new (await import("../models/entity")).EntityNode({
      uid: "Character:Alice",
      name: "Alice",
      entity_type: "Character",
      profile: new (await import("../models/entity")).LayeredProfile(
        { name: "Alice", type: "Character", group: "characters", summary: "Alice", tags: [], relationships: [] },
        { current_location: "Village" },
        {},
      ).toDict(),
      group_id: "characters",
    }));
    runtime = new NPCRuntime(TMP, store, null as any, null);
    social = new SocialGraph(TMP);
    memory = new MemoryEngine(runtime);
    context = new DialogueContext(runtime, social, memory);
  });

  it("builds context with relationship info", async () => {
    await social.addRelationship("Alice", "Bob", "friend", 0.8);
    
    const ctx = await context.buildContext("Alice", "Bob", "Hello!");
    expect(ctx).toContain("friend");
    expect(ctx).toContain("Bob");
  });

  it("includes recent memories", async () => {
    await runtime.addMemory("Alice", "Met Bob at the market yesterday", "joy", 0.5);
    
    const ctx = await context.buildContext("Alice", "Bob", "Hello!");
    expect(ctx).toContain("market");
  });

  it("includes current mood", async () => {
    await runtime.setMood("Alice", "happy");
    
    const ctx = await context.buildContext("Alice", "Bob", "Hello!");
    expect(ctx).toContain("happy");
  });

  it("includes location context", async () => {
    await runtime.move("Alice", "Dark Forest", new Date());
    
    const ctx = await context.buildContext("Alice", "Stranger", "Hello!");
    expect(ctx).toContain("Dark Forest");
  });

  it("builds faction context", async () => {
    await social.addToFaction("Alice", "guards");
    await social.addToFaction("Bob", "guards");
    
    const ctx = await context.buildContext("Alice", "Bob", "Hello!");
    expect(ctx).toContain("guards");
  });

  it("generates system prompt", async () => {
    await runtime.setMood("Alice", "determined");
    await runtime.addGoal("Alice", "Find the treasure");
    
    const prompt = await context.generateSystemPrompt("Alice");
    expect(prompt).toContain("determined");
    expect(prompt).toContain("treasure");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/dialogue-context.test.ts`
Expected: FAIL with "Cannot find module" or "DialogueContext not defined"

- [ ] **Step 3: Implement DialogueContext**

```typescript
// src/services/dialogue-context.ts
import type { NPCRuntime } from "./npc-runtime";
import type { SocialGraph } from "./social-graph";
import type { MemoryEngine } from "./memory-engine";

export class DialogueContext {
  private _runtime: NPCRuntime;
  private _social: SocialGraph;
  private _memory: MemoryEngine;

  constructor(runtime: NPCRuntime, social: SocialGraph, memory: MemoryEngine) {
    this._runtime = runtime;
    this._social = social;
    this._memory = memory;
  }

  async buildContext(npcName: string, playerOrNpc: string, line: string): Promise<string> {
    const profile = this._runtime.get(npcName);
    if (!profile) return "";

    const parts: string[] = [];

    parts.push(`You are ${npcName}.`);
    parts.push(`Current mood: ${profile.mood}`);
    parts.push(`Location: ${profile.location}`);

    const rel = this._social.getRelationship(npcName, playerOrNpc);
    if (rel) {
      parts.push(`Relationship with ${playerOrNpc}: ${rel.type} (strength: ${rel.strength.toFixed(2)})`);
    }

    const faction = this._findFaction(npcName);
    if (faction) {
      parts.push(`Faction: ${faction}`);
    }

    const recentMemories = await this._memory.search(npcName, playerOrNpc);
    if (recentMemories.length > 0) {
      parts.push(`Recent memories with ${playerOrNpc}:`);
      for (const mem of recentMemories.slice(0, 3)) {
        parts.push(`- ${mem.description}`);
      }
    }

    if (profile.goals.length > 0) {
      parts.push(`Current goals: ${profile.goals.join(", ")}`);
    }

    if (profile.inventory.length > 0) {
      parts.push(`Has: ${profile.inventory.join(", ")}`);
    }

    parts.push(`\n${playerOrNpc} says: "${line}"`);
    parts.push(`\nRespond as ${npcName}.`);

    return parts.join("\n");
  }

  private _findFaction(name: string): string | null {
    const factions = ["guards", "thieves", "merchants", "nobles", "peasants"];
    for (const faction of factions) {
      const members = this._social.getFactionMembers(faction);
      if (members.includes(name)) return faction;
    }
    return null;
  }

  async generateSystemPrompt(npcName: string): Promise<string> {
    const profile = this._runtime.get(npcName);
    if (!profile) return "You are an NPC.";

    const parts: string[] = [];
    parts.push(`You are roleplaying as ${npcName}.`);
    parts.push(`Personality based on mood: ${profile.mood}.`);
    parts.push(`Location: ${profile.location}.`);

    const rels = this._social.getRelationships(npcName);
    if (rels.length > 0) {
      parts.push(`Known relationships:`);
      for (const rel of rels.slice(0, 5)) {
        parts.push(`- ${rel.target}: ${rel.type}`);
      }
    }

    const memories = await this._memory.getRecentContext(npcName, 3);
    if (memories) {
      parts.push(`Recent experiences:\n${memories}`);
    }

    if (profile.goals.length > 0) {
      parts.push(`Goals: ${profile.goals.join(", ")}`);
    }

    parts.push(`\nStay in character. Respond naturally in first person.`);
    parts.push(`Include actions in asterisks if appropriate.`);

    return parts.join("\n");
  }

  async getConversationContext(npcName: string, history: string[]): Promise<string> {
    const profile = this._runtime.get(npcName);
    if (!profile) return "";

    const parts: string[] = [];
    parts.push(`Context for ${npcName}:`);
    parts.push(`Mood: ${profile.mood}`);
    parts.push(`Health: ${profile.health}%`);

    if (history.length > 0) {
      parts.push(`Recent conversation:`);
      for (const msg of history.slice(-3)) {
        parts.push(`- ${msg}`);
      }
    }

    return parts.join("\n");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/dialogue-context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/dialogue-context.ts src/services/dialogue-context.test.ts
git commit -m "feat(npc): add DialogueContext for enriched NPC prompts"
```

---

### Task 5: Integration - Update NPCAgent

**Covers:** All improvements integrated

**Files:**
- Modify: `src/services/npc-agent.ts`

- [ ] **Step 1: Update NPCAgent to use new components**

```typescript
// src/services/npc-agent.ts (updated)
import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { PromptBuilder } from "./prompt-builder";
import { resolveTemplate } from "../utils/template-resolver";
import { loadAgentConfig } from "./agent-config";
import type { ServiceMessageContext } from "./roleplay-engine";
import { MemoryEngine } from "./memory-engine";
import { BehaviorEngine } from "./behavior-engine";
import { SocialGraph } from "./social-graph";
import { DialogueContext } from "./dialogue-context";
import type { NPCRuntime } from "./npc-runtime";

export const NPC_AGENT_ID = "npc";

export class NPCAgent {
  readonly name = "NPC Agent";
  private _llmQueue: LLMQueue;
  private _memoryEngine: MemoryEngine | null = null;
  private _behaviorEngine: BehaviorEngine | null = null;
  private _socialGraph: SocialGraph | null = null;
  private _dialogueContext: DialogueContext | null = null;

  constructor(llmQueue: LLMQueue) {
    this._llmQueue = llmQueue;
  }

  initialize(runtime: NPCRuntime, statePath: string): void {
    this._memoryEngine = new MemoryEngine(runtime);
    this._behaviorEngine = new BehaviorEngine(runtime);
    this._socialGraph = new SocialGraph(statePath);
    this._dialogueContext = new DialogueContext(runtime, this._socialGraph, this._memoryEngine);
  }

  async respond(
    npcName: string,
    npcPersonality: string,
    playerCharacter: string,
    location: string,
    playerLine: string,
    recentEvents: string[],
    relationship = "neutral",
  ): Promise<string> {
    const agentCfg = loadAgentConfig(NPC_AGENT_ID);

    let prompt: string;

    if (this._dialogueContext) {
      prompt = await this._dialogueContext.buildContext(npcName, playerCharacter, playerLine);
    } else {
      const template = agentCfg.prompts?.userTemplate;
      if (template) {
        prompt = resolveTemplate(template, {
          npc_name: npcName,
          npc_personality: npcPersonality,
          location,
          player: playerCharacter,
          relationship,
          events: recentEvents.slice(-3).join(", "),
          line: playerLine,
        });
      } else {
        prompt = PromptBuilder.buildNPCPrompt(
          npcName,
          npcPersonality,
          playerCharacter,
          location,
          playerLine,
          recentEvents,
          relationship,
        );
      }
    }

    return this._llmQueue.generateText(prompt, TaskPriority.HIGH, agentCfg.temperature || 0.7, NPC_AGENT_ID);
  }

  async generateServiceMessage(ctx: ServiceMessageContext): Promise<string> {
    let contextInfo = `Location: ${ctx.location}\nCharacter: ${ctx.character}\nNearby NPCs: ${ctx.nearbyNpcs.join(", ") || "None"}`;

    if (this._dialogueContext) {
      const enriched = await this._dialogueContext.getConversationContext(ctx.character, ctx.recentEvents);
      contextInfo = enriched;
    }

    const prompt = `You are the NPC Agent managing character interactions. The user is sending you a private service message.

${contextInfo}

Recent events:
${ctx.recentEvents.slice(-5).map(e => `- ${e}`).join("\n") || "None"}

Private message: "${ctx.message}"

Respond with your expertise on NPC behavior, dialogue suggestions, or character interaction advice. Keep it concise.`;

    const response = await this._llmQueue.generateText(
      prompt, TaskPriority.NORMAL, 0.7, NPC_AGENT_ID,
    );
    return response.trim();
  }

  getMemoryEngine(): MemoryEngine | null {
    return this._memoryEngine;
  }

  getBehaviorEngine(): BehaviorEngine | null {
    return this._behaviorEngine;
  }

  getSocialGraph(): SocialGraph | null {
    return this._socialGraph;
  }
}
```

- [ ] **Step 2: Run all NPC tests**

Run: `bun test src/services/npc-runtime.test.ts src/services/memory-engine.test.ts src/services/behavior-engine.test.ts src/services/social-graph.test.ts src/services/dialogue-context.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit integration**

```bash
git add src/services/npc-agent.ts
git commit -m "feat(npc): integrate all NPC improvements into NPCAgent"
```

---

## Summary

| Task | Component | Status |
|------|-----------|--------|
| 1 | MemoryEngine | [ ] |
| 2 | BehaviorEngine | [ ] |
| 3 | SocialGraph | [ ] |
| 4 | DialogueContext | [ ] |
| 5 | Integration | [ ] |

**Total estimated time:** 2-3 hours

**Dependencies:** Tasks 1-4 are independent and can be parallelized. Task 5 depends on all others.
