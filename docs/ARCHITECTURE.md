# TrueNeverStory — Architecture Document

> A Domain-Driven Design analysis of the TrueNeverStory narrative RPG engine.
> Updated for v0.28.5 — Dual Model LLM Optimization, Translation Batching, MCP Function Calling.

---

## [A1] Architectural Pattern

**Layered Onion Architecture with Event-Driven Extensions + State-First Pipeline**

TrueNeverStory follows a **layered onion (hexagonal) architecture** at its core, wrapped with an **event-driven orchestration layer** for asynchronous narrative processing. As of v0.25.0, the engine uses a **State-First pipeline** where deterministic simulation happens before prose generation.

The pattern fits because:

1. **Domain models are isolated** — `src/models/` contains pure data structures with no infrastructure dependencies. `EntityNode`, `Quest`, `StoryContext`, `NPCProfile`, `ProbabilityModifier`, `Intent`, `SimulationResult` are all framework-agnostic.
2. **Services orchestrate domain logic** — `src/services/` contains application services (`RoleplayEngine`, `StoryEngine`) and domain services (`ProbabilityEngine`, `SocialSimulator`, `RomanceEngine`, `SimulationEngine`).
3. **Infrastructure is pushed to the edges** — `src/lib/` holds persistence (`SQLiteStore`, `AtomicIO`), external integrations (`LLMClient`, `ProviderManager`), and transport (`WebSocketManager`).
4. **Routes are thin adapters** — `src/routes/` maps HTTP to service calls with minimal logic.
5. **MCP integration** — `src/mcp/` provides external knowledge sources (Bible, Gutenberg, Wikipedia) via Model Context Protocol.

The **event bus** (`EventBus` in `src/lib/event-bus.ts`) adds an asynchronous decoupling layer between bounded contexts, enabling the Director Loop to orchestrate narrative events without direct coupling to NPC, Social, or Quest subsystems.

### State-First Pipeline (v0.28.5)

```
Player Input (any language)
  │
  ▼
Translate + Classify Intent (1 LLM call — small model)
  │ translated text + intent
  ▼
Simulation Engine (deterministic — no LLM)
  │ outcome, probability, stateChanges
  ▼
State Mutator (EntityStore L1-L3)
  │
  ▼
Context Builder (shared game state — no LLM)
  │
  ▼
Dramaturg (Bible pattern selection via MCP)
  │
  ▼
Stylist (Gutenberg style rendering via MCP)
  │
  ▼
Censor (AI cliché removal)
  │
  ▼
Translate Response (1 LLM call — small model)
  │
  ▼
Response to User

Total: 2-3 LLM calls (was 4-5 in v0.28.0)
```

### Dual Model Architecture (v0.28.5)

The engine supports two LLM models per agent:

| Model | Purpose | Examples |
|-------|---------|----------|
| **Main model** | Narrative generation, NPC dialogue, story planning | llama-3.1-8b, qwen2.5-14b |
| **Translation model** | Translation, intent classification (fast, small) | phi-3-mini, gemma-2-2b, qwen2.5-3b |

**Configuration** (per agent in `conf/agents.json`):
```json
{
  "agentId": "translation",
  "providerId": "ollama",
  "modelId": "qwen2.5:14b",
  "translationProviderId": "ollama",
  "translationModelId": "phi3:mini"
}
```

**LLMClient** resolves the model via `useTranslationModel` flag:
- `LLMQueue.getAgentClient("translation", { useTranslationModel: true })` → uses `translationModelId`
- `LLMQueue.getAgentClient("narrator")` → uses `modelId`

```
┌─────────────────────────────────────────────────┐
│                   Routes (HTTP/WS)               │  ← Adapter Layer
├─────────────────────────────────────────────────┤
│              Application Services                │  ← Use Cases
│  RoleplayEngine │ NarrativeService │ StoryEngine │
├─────────────────────────────────────────────────┤
│               Domain Services                    │  ← Domain Logic
│  ProbabilityEngine │ SocialSimulator │ NPCRuntime │
├─────────────────────────────────────────────────┤
│               Domain Models                      │  ← Core Entities
│  EntityNode │ Quest │ NPCProfile │ StoryArc      │
├─────────────────────────────────────────────────┤
│              Infrastructure                      │  ← Persistence/External
│  SQLiteStore │ LLMClient │ EventBus │ AtomicIO   │
└─────────────────────────────────────────────────┘
```

---

## [A2] Bounded Contexts

### BC1: World Management

**Purpose:** Multi-world lifecycle — creation, configuration, switching, and persistence of world state.

| Aspect | Detail |
|--------|--------|
| **Key Aggregates** | `World`, `WorldFrame` |
| **Key Entities** | `EntityNode` (Character, Faction, Location, Item, Event, Race, WorldRule) |
| **Value Objects** | `WorldCreateParams`, `WorldSummary`, `LayeredProfile` (L1/L2/L3 layers) |
| **Domain Events** | `WORLD_CREATED`, `WORLD_FRAME_LOADED`, `WORLD_EVOLVED` |
| **Persistence** | `worlds/{name}/world_frame.json`, `worlds/{name}/entities.json` |

**Key files:**
- `src/services/world-manager.ts` — CRUD operations, world switching
- `src/services/world-builder.ts` — LLM-driven layered world construction
- `src/services/world-validator.ts` — Integrity checks
- `src/services/world-evolver.ts` — Adds NPCs/locations/items over time
- `src/routes/worlds.ts` — HTTP adapter

**Domain Rules:**
- World names are slugified and unique
- Each world has its own isolated data directory under `worlds/`
- `WorldFrame` defines the canonical structure (calendar, magic system, races, factions, locations, items, historical events, world rules)
- Entity profiles use a 3-layer system: L1 (identity), L2 (dynamic state), L3 (hidden/secret)

---

### BC2: Entity & Graph

**Purpose:** In-memory graph representation of world entities and their relationships. Provides O(1) lookups and graph traversal.

| Aspect | Detail |
|--------|--------|
| **Key Aggregates** | `GraphStore` (aggregate root for the world graph) |
| **Key Entities** | `EntityNode`, `GraphEdge` |
| **Value Objects** | `Relationship`, `LayeredProfile`, `GraphSummary` |
| **Domain Events** | `ENTITY_ADDED`, `ENTITY_UPDATED`, `ENTITY_REMOVED`, `RELATIONSHIP_ADDED`, `RELATIONSHIP_BROKEN`, `GRAPH_CHANGED` |
| **Persistence** | `worlds/{name}/entities.json` (via `UnifiedEntityStore`), `worlds/{name}/branches.json` |

**Key files:**
- `src/store/entity-store.ts` — `UnifiedEntityStore` with `NameIndex` for O(1) name→UID resolution
- `src/services/graph-store.ts` — Adjacency-map graph with forward/reverse edges
- `src/services/branch-manager.ts` — Git-like branching for story graphs
- `src/intelligence/` — Graph analysis, validation, relationship repair

**Domain Rules:**
- Entities have a unique `uid` and resolve by name, token, or type prefix
- `NameIndex` supports fuzzy resolution (case-insensitive, token-based, type-stripped)
- `BranchManager` supports parent→child branching with additions/deletions per branch
- Graph edges are bidirectional (forward + reverse maps)

---

### BC3: Narrative & Story

**Purpose:** Core narrative generation — the storyteller, scene transitions, story beats, and dramatic orchestration.

| Aspect | Detail |
|--------|--------|
| **Key Aggregates** | `StoryContext`, `StoryArc`, `DirectorTask`, `ChapterData`, `BeatData` |
| **Key Entities** | `StoryBeat`, `ArcPhase`, `ArcTimelineEvent` |
| **Value Objects** | `NarratorOutput`, `NPCDialogue`, `SceneTransition` |
| **Domain Events** | `STORY_EVENT`, `STORY_BEAT`, `VILLAIN_PROGRESS` |
| **Persistence** | `worlds/{name}/director_state.json`, `worlds/{name}/story_arcs.json`, `worlds/{name}/planner_state.json` |

**Key files:**
- `src/services/narrative-service.ts` — **Composition Root** / DI container for all narrative services
- `src/services/roleplay-engine.ts` — Main roleplay processing, agent dispatch
- `src/services/narrator-agent.ts` — LLM-driven narrative generation
- `src/services/scene-agent.ts` — Scene transition narratives
- `src/services/director-agent.ts` — Beat injection into narrative
- `src/services/director-loop.ts` — Background orchestrator (clock→social→villain→chance→beats)
- `src/services/story-engine.ts` — Event generation from story beats + effect application
- `src/services/story-planner.ts` — LLM-driven chapter/beat planning
- `src/services/story-arc-manager.ts` — CRUD for story arcs with phases
- `src/models/story.ts` — `StoryContext`, `NarratorOutput`, `NPCDialogue`, `SceneTransition`
- `src/models/director.ts` — `DirectorTask`, `StoryArc`, `StoryBeat`, `TaskPriority`

**Domain Rules:**
- `DirectorLoop` runs on a configurable tick interval (default 30 minutes)
- Major story beats have a cooldown (default 6 hours)
- `StoryPlanner` uses two-phase planning: chapter outline → beat generation
- `TaskPriority` enum controls LLM queue ordering (CRITICAL > HIGH > NORMAL > LOW)
- Agent prompts resolve from SQLite first, then JSON fallback, then hardcoded defaults

---

### BC4: NPC & Dialogue

**Purpose:** Non-player character state management, episodic memory, dialogue sessions, and NPC generation.

| Aspect | Detail |
|--------|--------|
| **Key Aggregates** | `NPCProfile` (aggregate root per NPC) |
| **Key Entities** | `EpisodicMemory`, `DialogueSession`, `DialogueMessage` |
| **Value Objects** | `NPCSkills`, `NPCDialogue`, `DialogueChoice`, `GreetingTemplate` |
| **Domain Events** | `ENTITY_ADDED` (for generated NPCs), `MEMORY_ADDED`, `MEMORY_CONSOLIDATED` |
| **Persistence** | `worlds/{name}/npc_profiles.json`, `worlds/{name}/npc_profiles/{name}.json` |

**Key files:**
- `src/services/npc-runtime.ts` — `NPCRuntime`: state store with short-term/long-term memory
- `src/services/npc-generator.ts` — LLM-driven NPC creation
- `src/services/npc-agent.ts` — NPC dialogue generation
- `src/services/npc-economy.ts` — NPC wealth, taxes, treasury, food production
- `src/services/dialogue-manager.ts` — Conversation sessions, topics, choices
- `src/services/dialogue-context.ts` — Contextual dialogue state
- `src/models/npc-state.ts` — `NPCProfile`, `EpisodicMemory`, `NPCSkills`

**Domain Rules:**
- NPC profiles have short-term memory (capped at 20) and long-term episodic memory
- Memory consolidation happens when short-term exceeds `_importanceThreshold` (0.4)
- NPCs sync from entity store on boot — missing profiles are auto-created
- Dialogue sessions track state machine: `greeting → active → farewell → idle`
- `TopicCategory` enum constrains valid conversation topics

---

### BC5: Social & Relationships

**Purpose:** Inter-character relationships, faction dynamics, alliances, feudal hierarchies, and romantic relationships.

| Aspect | Detail |
|--------|--------|
| **Key Aggregates** | `SocialGraph` (aggregate root for all social state) |
| **Key Entities** | `Relationship`, `Faction`, `Alliance`, `FeudalRelationship` |
| **Value Objects** | `FactionSummary`, `FeudalSummary`, `RomanceStatus`, `RomanceProgression` |
| **Domain Events** | `RELATIONSHIP_ADDED`, `RELATIONSHIP_REPAIRED`, `RELATIONSHIP_BROKEN` |
| **Persistence** | `worlds/{name}/social/` directory (JSON files per subsystem) |

**Key files:**
- `src/services/social-graph.ts` — `SocialGraph`: relationships, factions, alliances, feudal
- `src/services/social-simulator.ts` — Pair selection, interaction generation
- `src/services/romance-engine.ts` — Romantic relationship progression
- `src/services/romance-profiles.ts` — Probability profiles for romantic events
- `src/models/romance.ts` — `RelationshipMemory`, `RomanceStatus`, `RomanceProgression`

**Domain Rules:**
- `SocialSimulator` selects pairs based on location proximity and faction alignment
- Interaction types are weighted by context: same-location vs same-faction vs different-faction
- Romance uses `ProbabilityEngine` for deterministic outcome resolution
- Feudal relationships track loyalty, tax contribution, military obligation
- Alliances can be betrayed; betrayal has consequences

---

### BC6: Quests

**Purpose:** Quest lifecycle management — generation, objectives, rewards, chains, and dialogue integration.

| Aspect | Detail |
|--------|--------|
| **Key Aggregates** | `Quest`, `QuestDefinition` |
| **Key Entities** | `QuestObjective`, `QuestObjectiveDef` |
| **Value Objects** | `QuestReward`, `QuestPrerequisite` |
| **Domain Events** | `QUEST_ADDED`, `QUEST_UPDATED` |
| **Persistence** | `worlds/{name}/quests.json` |

**Key files:**
- `src/services/quest-manager.ts` — Basic quest CRUD
- `src/services/quest-system.ts` — Full lifecycle with chains, prerequisites, time limits
- `src/services/quest-giver-agent.ts` — LLM-driven contextual quest generation
- `src/models/quest.ts` — `Quest`, `QuestObjective`, `QuestData`

**Domain Rules:**
- Quest types: `main`, `side`, `daily`, `faction`, `chain`
- Quest states: `available → active → completed | failed | abandoned`
- `QuestSystem` enforces prerequisites (min level, faction, completed quests, relationship)
- `Quest.progress` is a computed value (completed objectives / total objectives)
- Chain quests link via `chainNext` field

---

### BC7: Memory & Knowledge

**Purpose:** World memory, agent memory, semantic search, embedding-based retrieval, and memory lifecycle management.

| Aspect | Detail |
|--------|--------|
| **Key Aggregates** | `WorldMemory` (aggregate root), `AgentMemoryStore` (per-agent) |
| **Key Entities** | `WorldMemoryEntry`, `AgentMemoryEntry` |
| **Value Objects** | `MemoryConfig`, `ScoringWeights`, `MemoryMetadata`, `RankedItem` |
| **Domain Events** | `MEMORY_ADDED`, `MEMORY_CONSOLIDATED`, `MEMORY_FORGOTTEN` |
| **Persistence** | `tns.db` (SQLite), `worlds/{name}/memory/` (partitions), FAISS index |

**Key files:**
- `src/memory/world-memory.ts` — `WorldMemory`: scoring, partitioning, embedding, clustering
- `src/lib/agent-memory-store.ts` — `AgentMemoryStore`: per-agent RAG with hybrid search
- `src/lib/sqlite-store.ts` — `SQLiteStore`: FTS5 + vector search + RRF fusion
- `src/lib/vector-ops.ts` — Cosine similarity, L2 distance, dot product
- `src/services/memory-engine.ts` — `MemoryEngine`: semantic search over NPC episodic memories
- `src/services/memory-manager.ts` — `MemoryManager`: conversation history
- `src/memory/` — Scoring, clustering, write buffer, embedding queue, cognitive pipeline

**Domain Rules:**
- Memory scoring uses weighted formula: importance (0.35) + recency (0.25) + access (0.15) + emotion (0.10) + relevance (0.15)
- Memories below `minKeepScore` (0.15) and older than `minKeepDays` (30) are pruned
- Agent memory is isolated by `role` column (agent ID) in SQLite
- Hybrid search: FTS5 keyword + dense vector → Reciprocal Rank Fusion (RRF)
- FAISS index is rebuilt when fragmentation exceeds threshold (200 new entries)
- Write buffer batches embedding generation for efficiency

---

### BC8: LLM Integration

**Purpose:** Multi-provider LLM management, request queuing, rate limiting, per-agent model assignment, and prompt construction.

| Aspect | Detail |
|--------|--------|
| **Key Aggregates** | `ProviderManager` (singleton), `LLMQueue` |
| **Key Entities** | `AgentModelAssignment`, `LLMProvider` |
| **Value Objects** | `AgentConfig`, `AgentPromptConfig`, `LLMClientOptions` |
| **Domain Events** | None (infrastructure layer) |
| **Persistence** | `conf/providers.json`, `conf/agents.json`, `tns.db` (agent_prompts table) |

**Key files:**
- `src/lib/llm-client.ts` — `LLMClient`: per-agent LRU cache, provider dispatch
- `src/lib/llm-queue.ts` — `LLMQueue`: priority queue, concurrency control, rate limiting
- `src/lib/providers/provider-manager.ts` — `ProviderManager`: multi-provider, multi-key support
- `src/lib/providers/` — OpenAI, Anthropic, Google, Ollama, LlamaCpp providers
- `src/services/agent-config.ts` — Agent configuration (global + per-world prompts)
- `src/services/prompt-builder.ts` — Static prompt templates for all agents
- `src/services/model-manager.ts` — Model management

**Domain Rules:**
- `LLMQueue` enforces max concurrency (default 3) and queue cap (default 50)
- Priority eviction: lowest-priority tasks are dropped when queue is full
- Rate limiting via `RateLimiter` (RPM-based with auto-refill)
- Each agent can have its own provider, model, temperature, and max tokens
- Prompt resolution: SQLite (`agent_prompts`) → JSON fallback → hardcoded defaults
- `LLMClient` uses LRU cache (256 entries, 5-minute TTL) for repeated requests

---

### BC9: Probability & Combat

**Purpose:** Deterministic probability calculations for all game mechanics — combat, social actions, crafting, romance.

| Aspect | Detail |
|--------|--------|
| **Key Aggregates** | `ProbabilityEngine` |
| **Key Entities** | `ProbabilityModifier`, `ProbabilityProfile` |
| **Value Objects** | `ProbabilityParameter`, `ProbabilityResult`, `OutcomeQuality` |
| **Domain Events** | None (pure computation) |
| **Persistence** | None (in-memory, derived from NPC state) |

**Key files:**
- `src/services/probability-engine.ts` — Core probability calculations
- `src/services/probability-resolver.ts` — Context resolution (location, relationships, world state)
- `src/services/probability-expression.ts` — Expression parser for dynamic modifiers
- `src/services/probability-profiles.ts` — Predefined probability profiles
- `src/models/probability.ts` — `ProbabilityModifier`, `ProbabilityProfile`, `OutcomeQuality`

**Domain Rules:**
- Modifiers have types: `ADD`, `MULTIPLY`, `REPLACE`
- Stacking rules: `STACK`, `TAKE_HIGHEST`, `TAKE_LOWEST`, `OVERRIDE`
- Modifiers can expire (time-based duration)
- `OutcomeQuality` ranges from `CRITICAL_FAILURE` to `CRITICAL_SUCCESS`
- Context resolver injects dynamic modifiers based on location, relationships, world state
- Mojo FFI kernels (`probability_ffi.mojo`) accelerate batch calculations

---

### BC10: Villain Management

**Purpose:** Antagonist lifecycle management with LLM-driven strategic planning and state machine phases.

| Aspect | Detail |
|--------|--------|
| **Key Aggregates** | `VillainAgendaData` |
| **Key Entities** | `VillainMemoryData` |
| **Value Objects** | Phase (`plotting → preparing → executing → climax`) |
| **Domain Events** | `VILLAIN_PROGRESS` |
| **Persistence** | `worlds/{name}/villain_state.json` |

**Key files:**
- `src/services/villain-manager.ts` — `VillainManager`: phase transitions, strategic planning

**Domain Rules:**
- Villain follows a 4-phase state machine: `plotting → preparing → executing → climax`
- Each phase transition requires completing a set of actions
- LLM generates context-aware villain actions (sabotage, rumour, spy infiltration, etc.)
- Villain actions have success/failure consequences that affect world state
- Minions can be assigned to execute villain plans

---

### BC11: Intelligence & Analysis

**Purpose:** Graph analysis, validation, deduplication, and recommendation engine.

| Aspect | Detail |
|--------|--------|
| **Key Aggregates** | None (service layer) |
| **Key Entities** | None |
| **Value Objects** | Validation results, recommendations |
| **Domain Events** | None |
| **Persistence** | Reads from entity store, writes validation results |

**Key files:**
- `src/intelligence/graph-analyzer.ts` — Graph metrics, centrality, clusters
- `src/intelligence/graph-validator.ts` — Integrity checks
- `src/intelligence/duplicate-detector.ts` — Entity deduplication
- `src/intelligence/relationship-repairer.ts` — Broken relationship repair
- `src/intelligence/recommender.ts` — Content recommendations
- `src/intelligence/scene-generator.ts` — Procedural scene generation
- `src/intelligence/rule-checker.ts` — World rule enforcement
- `src/intelligence/subgraph-expander.ts` — Subgraph expansion

---

## [A3] Aggregates & Entities

### BC1: World Management

| Component | Type | Invariants |
|-----------|------|------------|
| `World` | Aggregate Root | Must have unique slugified name; must have valid `WorldFrame` |
| `WorldFrame` | Value Object | Must define `world_name`; `world_rules` must be non-empty for valid worlds |
| `LayeredProfile` | Value Object | L1 must have `name` and `type`; layers are L1/L2/L3 |
| `EntityNode` | Entity | Must have unique `uid`; `entityType` must be valid `EntityTypeValue` |
| `EntityType` | Value Object (enum) | `CHARACTER`, `FACTION`, `LOCATION`, `ITEM`, `EVENT`, `WORLD_RULE`, `RACE`, `UNKNOWN` |

### BC2: Entity & Graph

| Component | Type | Invariants |
|-----------|------|------------|
| `GraphStore` | Aggregate Root | Must be booted before traversal; edges reference valid UIDs |
| `GraphEdge` | Entity | `source` and `target` must be valid entity UIDs |
| `Relationship` | Value Object | `sourceUid` and `targetUid` must exist; `strength` is 0-1 |
| `BranchManager` | Entity | Branch names must be unique; parent must exist |

### BC3: Narrative & Story

| Component | Type | Invariants |
|-----------|------|------------|
| `StoryContext` | Value Object | Must have `worldName`, `currentTime`, `location` |
| `StoryArc` | Aggregate Root | Must have unique `id`; `beats` array ordered by timing |
| `DirectorTask` | Entity | Must have unique `id`; `priority` in `TaskPriority` range |
| `BeatData` | Entity | Must belong to a valid `chapter_id`; `triggered` is boolean |
| `ChapterData` | Value Object | Must have unique `id`; `beats` array non-null |

### BC4: NPC & Dialogue

| Component | Type | Invariants |
|-----------|------|------------|
| `NPCProfile` | Aggregate Root (per NPC) | Must have unique `name` and `uid`; `health` 0-100; `skills` values 0-1 |
| `EpisodicMemory` | Entity | Must have unique `id`; `importance` 0-1; `emotion` non-empty |
| `DialogueSession` | Entity | Must have unique `id`; `state` in valid enum range |
| `NPCSkills` | Value Object | All skill values must be 0-1 |
| `DialogueMessage` | Value Object | `role` must be `player` or `npc` |

### BC5: Social & Relationships

| Component | Type | Invariants |
|-----------|------|------------|
| `SocialGraph` | Aggregate Root | Must have valid state path; relationships reference valid entities |
| `Relationship` | Entity | `type` in valid enum; `strength` 0-1; `source` ≠ `target` |
| `Faction` | Value Object | Must have unique `name`; members are unique |
| `Alliance` | Value Object | `faction1` ≠ `faction2`; `strength` 0-1 |
| `FeudalRelationship` | Value Object | `vassal` ≠ `liege`; `loyalty` 0-1 |

### BC6: Quests

| Component | Type | Invariants |
|-----------|------|------------|
| `Quest` | Aggregate Root | Must have unique `id`; `status` in valid enum; `progress` computed |
| `QuestDefinition` | Aggregate Root | Must have unique `id`; `objectives` non-empty |
| `QuestObjective` | Entity | `completed` is boolean |
| `QuestReward` | Value Object | `gold`, `experience` ≥ 0 |
| `QuestPrerequisite` | Value Object | At least one prerequisite must be set |

### BC7: Memory & Knowledge

| Component | Type | Invariants |
|-----------|------|------------|
| `WorldMemory` | Aggregate Root | Must have valid storage path; entries scored by weighted formula |
| `WorldMemoryEntry` | Entity | Must have unique `id`; `importance` 0-1; `content` non-empty |
| `AgentMemoryStore` | Aggregate Root | Isolated by `agentId`; uses hybrid FTS5 + vector search |
| `MemoryConfig` | Value Object | All weights ≥ 0; `halfLifeDays` > 0 |
| `ScoringWeights` | Value Object | Weights sum to 1.0 |

---

## [A4] Domain Services

Cross-cutting services that don't belong to a single aggregate:

| Service | File | Purpose |
|---------|------|---------|
| `NarrativeService` | `src/services/narrative-service.ts` | **Composition Root** — instantiates and wires all narrative subsystems |
| `RoleplayEngine` | `src/services/roleplay-engine.ts` | Main entry point for player input → agent dispatch |
| `StoryEngine` | `src/services/story-engine.ts` | Event generation from beats + effect application (NPC moves, relationship changes, quest creation) |
| `DirectorLoop` | `src/services/director-loop.ts` | Background orchestrator: clock tick → social sim → villain → chance events → story beats |
| `SocialSimulator` | `src/services/social-simulator.ts` | NPC pair selection + interaction generation |
| `ProbabilityEngine` | `src/services/probability-engine.ts` | Deterministic outcome resolution with modifier stacking |
| `MemoryEngine` | `src/services/memory-engine.ts` | Semantic search over NPC episodic memories |
| `WorldValidator` | `src/services/world-validator.ts` | World integrity validation |
| `AgentCoordinator` | `src/services/agent-coordinator.ts` | Priority queue for director task execution |
| `StartResolver` | `src/services/start-resolver.ts` | Resolves initial story context from world state |
| `WorldIsolator` | `src/services/world-isolator.ts` | Multi-world isolation with resource monitoring (memory, CPU, tokens) |
| `CrossWorldBus` | `src/services/cross-world-bus.ts` | Cross-world event communication with portals |
| `PluginManager` | `src/plugins/plugin-manager.ts` | Plugin lifecycle management (register, unregister, capabilities) |

---

## [A5] Domain Events

All events are defined in `EventTopic` enum (`src/lib/event-bus.ts`):

| Event | Publisher | Consumers | Description |
|-------|-----------|-----------|-------------|
| `ENTITY_ADDED` | `WorldBuilder`, `NPCGenerator` | `GraphStore`, `WorldMemory` | New entity created |
| `ENTITY_UPDATED` | Various services | `GraphStore`, `WorldMemory` | Entity profile changed |
| `ENTITY_REMOVED` | `GraphStore` | `WorldMemory` | Entity deleted |
| `ENTITY_LAYER_COMPLETED` | `WorldBuilder` | `GraphStore` | L1/L2/L3 build phase done |
| `RELATIONSHIP_ADDED` | `SocialSimulator` | `GraphStore` | New relationship formed |
| `RELATIONSHIP_REPAIRED` | `SocialSimulator` | `GraphStore` | Broken relationship fixed |
| `RELATIONSHIP_BROKEN` | `SocialSimulator` | `GraphStore` | Relationship severed |
| `WORLD_CREATED` | `WorldManager` | All services | New world initialized |
| `WORLD_FRAME_LOADED` | `WorldBuilder` | All services | World frame loaded from disk |
| `WORLD_EVOLVED` | `WorldEvolver` | `Chronicler`, `WebSocketManager` | World state changed |
| `STORY_EVENT` | `StoryEngine` | `Chronicler`, `WebSocketManager` | Story event generated |
| `STORY_BEAT` | `DirectorLoop` | `Chronicler`, `WebSocketManager` | Story beat injected |
| `VILLAIN_PROGRESS` | `VillainManager` | `Chronicler`, `WebSocketManager` | Villain action executed |
| `QUEST_ADDED` | `QuestSystem` | `WebSocketManager` | New quest created |
| `QUEST_UPDATED` | `QuestSystem` | `WebSocketManager` | Quest state changed |
| `MEMORY_ADDED` | `WorldMemory` | `AgentMemoryStore` | New memory stored |
| `MEMORY_CONSOLIDATED` | `WorldMemory` | — | Short→long term promotion |
| `MEMORY_FORGOTTEN` | `WorldMemory` | — | Memory pruned |
| `MAINTENANCE_START` | System | All services | Maintenance cycle begins |
| `MAINTENANCE_DONE` | System | All services | Maintenance cycle complete |
| `GRAPH_CHANGED` | `GraphStore` | `Intelligence` | Graph topology changed |
| `ERROR` | Various | Logging | Error occurred |

**Event Bus Mechanics:**
- Handlers are sorted by `priority` (higher = executed first)
- Replay buffer (default 100 events) for late subscribers
- Async publish with `await` — no fire-and-forget

---

## [A6] Application Layer

### Use Case Flow: Player Message → Narrator Response

```
1. HTTP POST /chat/message
   └─→ routes/chat.ts: Zod validation, input sanitization

2. RoleplayEngine.processInput(sanitizedMessage)
   ├─→ Detect intent: movement, dialogue, @agent mention, or general
   ├─→ If movement: SceneAgent → location update → NarratorAgent
   ├─→ If dialogue: NPCAgent → dialogue context → response
   ├─→ If @agent: dispatch to named agent (researcher, historian, etc.)
   └─→ Otherwise: NarratorAgent.generate(context, memories, facts, history)

3. NarratorAgent.generate()
   ├─→ loadAgentConfig("narrator") → SQLite prompts → JSON fallback → defaults
   ├─→ resolveTemplate(template, vars) with StoryContext fields
   └─→ LLMQueue.generateText(prompt, priority, temperature, agentId)

4. LLMQueue
   ├─→ RateLimiter.check() → concurrency control
   ├─→ ProviderManager.getProvider(agentId) → provider/model
   ├─→ LLMClient.generate() → LRU cache check → HTTP to LLM
   └─→ Return response

5. RoleplayEngine
   ├─→ MemoryManager.addEntry(user, response)
   ├─→ Chronicler.logEvent(...) → WorldMemory.addEvent(...)
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Return { narrative, location, storyTime, activeCharacter }

6. WebSocketManager.broadcast({ type: "narrative", ... })
```

### Use Case Flow: Director Tick → Story Beat

```
1. DirectorLoop (background setInterval, default 30min)
   ├─→ WorldClock.tick(minutes)
   ├─→ SocialSimulator.simulateInteraction()
   ├─→ VillainManager.tick() → phase transitions
   ├─→ ProbabilityEngine.roll() → chance events
   └─→ StoryPlanner.shouldGenerateBeat() → StoryEngine.generateEvent()

2. StoryEngine.generateEvent()
   ├─→ LLMQueue.generateJson(EVENT_PROMPT, ...) → structured event
   ├─→ Apply effects: NPC moves, relationship changes, quest creation
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Chronicler.logEvent(...)

3. DirectorLoop
   ├─→ StoryEngine.generateBeat() → LLM generates narrative beat
   ├─→ RoleplayEngine.injectBeat(beat) → prepend to next response
   └─→ Save director_state.json
```

### Use Case Flow: World Creation

```
1. HTTP POST /api/worlds
   └─→ routes/worlds.ts → world-manager.createWorld(params)

2. WorldManager.createWorld()
   ├─→ mkdir worlds/{slugified-name}/
   ├─→ Write world_frame.json
   ├─→ EventBus.publish(WORLD_CREATED)
   └─→ NarrativeService.reset(dbPath, worldFrame)

3. WorldBuilder (on /api/launch)
   ├─→ createWorld() → LLM generates WorldFrame
   ├─→ buildL1() → identity layer for all entities
   ├─→ buildL2() → dynamic state layer
   ├─→ buildL3() → hidden/secret layer
   ├─→ buildRelationships() → entity relationships
   └─→ EventBus.publish(ENTITY_ADDED) for each entity

4. WebSocketManager.broadcast({ type: "world_created", ... })
```

### Use Case Flow: Agent Memory

```
1. NarratorAgent generates narrative
   └─→ EventBus.publish(MEMORY_ADDED, { content, source: "narrator" })

2. WorldMemory.addEvent()
   ├─→ Create WorldMemoryEntry with scoring metadata
   ├─→ EmbeddingQueue.enqueue(entry) → batch embedding via BGE-M3
   ├─→ VectorIndex.add(embedding, entryId)
   ├─→ WriteBehindBuffer.add(entry)
   └─→ Periodic flush to SQLite + FAISS rebuild

3. AgentMemoryStore.search(agentId, query)
   ├─→ getEmbedding(query) → BGE-M3 endpoint
   ├─→ SQLiteStore.searchMemoriesFTS(query) → keyword matches
   ├─→ SQLiteStore.searchMemoriesDense(vector) → cosine similarity
   ├─→ ReciprocalRankFusion(ftsResults, denseResults)
   └─→ Return top-K results filtered by agentId
```

---

## [A7] Infrastructure

### LLM Integration

```
ProviderManager (singleton)
├── OpenAIProvider    (conf/providers.json)
├── AnthropicProvider
├── GoogleProvider
├── OllamaProvider
└── LlamaCppProvider  (local, port 5002 for embeddings)

LLMClient (per-agent)
├── ProviderManager.getProvider(agentId) → provider/model
├── LRU Cache (256 entries, 5-min TTL)
├── parseJsonWithRetry() for structured output
└── Per-agent config: temperature, maxTokens, model

LLMQueue (global)
├── Priority queue (CRITICAL > HIGH > NORMAL > LOW)
├── RateLimiter (RPM-based, auto-refill)
├── Max concurrency (default 3)
├── Queue cap (default 50) with priority eviction
└── Per-agent LLMClient instances
```

**File:** `src/lib/llm-client.ts`, `src/lib/llm-queue.ts`, `src/lib/providers/provider-manager.ts`

### Persistence

| Store | Technology | Path | Purpose |
|-------|-----------|------|---------|
| `UnifiedEntityStore` | JSON files | `worlds/{name}/entities.json` | Entity CRUD with O(1) name resolution |
| `SQLiteStore` | `bun:sqlite` | `worlds/{name}/tns.db` | FTS5 search, vector embeddings, agent prompts, translations |
| `GraphStore` | In-memory adj. map | `worlds/{name}/entities.json` | Graph traversal, branching |
| `SessionStore` | `bun:sqlite` | `worlds/_sessions/sessions.db` | Auth session tokens |
| `Chronicler` | JSONL files | `worlds/{name}/timeline.jsonl` | Event timeline with rotation |
| `WorldClock` | JSON file | `worlds/{name}/clock_state.json` | Game time, scheduled events |
| `NPCRuntime` | JSON files | `worlds/{name}/npc_profiles.json` | NPC state + episodic memory |
| `SocialGraph` | JSON files | `worlds/{name}/social/*.json` | Relationships, factions, alliances |
| `StoryPlanner` | JSON file | `worlds/{name}/planner_state.json` | Chapters, beats |
| `DirectorLoop` | JSON file | `worlds/{name}/director_state.json` | Director state |
| `VillainManager` | JSON file | `worlds/{name}/villain_state.json` | Villain agendas |
| `WorldMemory` | SQLite + FAISS | `worlds/{name}/memory/` | Semantic memory with embeddings |
| `AgentMemoryStore` | SQLite | `tns.db` | Per-agent RAG |
| `settings.json` | JSON file | `conf/settings.json` | App-wide settings |
| `providers.json` | JSON file | `conf/providers.json` | LLM provider configs |
| `agents.json` | JSON file | `conf/agents.json` | Agent model assignments |

**Persistence Pattern:** All JSON writes use `atomicWriteJson()` (write-to-temp + rename) for crash safety. SQLite uses WAL mode with `PRAGMA synchronous = NORMAL`.

### WebSocket Real-time

**File:** `src/services/websocket-manager.ts`

- `WebSocketManager` manages connected clients with unique IDs
- `broadcast(message)` sends to all connected clients (dead connection cleanup)
- `sendTo(id, message)` for targeted delivery
- Events from `EventBus` are forwarded to WebSocket clients

### Authentication

**File:** `src/middleware/auth.ts`, `src/lib/session-store.ts`

- Token-based session auth (32-byte random hex)
- Sessions stored in SQLite (`worlds/_sessions/sessions.db`)
- 24-hour TTL with hourly cleanup
- `authMiddleware` gates all `/api/*` routes except `/login`
- Login/logout via POST endpoints

---

## [A8] Data Flow Diagrams

### 1. User Message → Narrator Response

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│  Browser  │────▶│ routes/chat  │────▶│  RoleplayEngine  │
│           │◀────│   (Hono)     │◀────│                  │
└──────────┘     └──────────────┘     └────────┬─────────┘
                                               │
                    ┌──────────────────────────┤
                    ▼                          ▼
          ┌─────────────────┐      ┌──────────────────┐
          │  NarratorAgent   │      │  MemoryManager   │
          │  (LLM prompt)    │      │  (history save)  │
          └────────┬─────────┘      └──────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │    LLMQueue      │
          │  (priority, rate │
          │   limit, cache)  │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐
          │  ProviderManager │
          │  (OpenAI/Anth/   │
          │   Google/Ollama) │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐     ┌──────────────────┐
          │   External LLM   │────▶│  Chronicler.log   │
          │   API            │     │  EventBus.publish │
          └─────────────────┘     └──────────────────┘
```

### 2. Director Tick → Story Beat Generation

```
┌─────────────────┐
│  DirectorLoop    │  (setInterval, every 30min)
│  ┌─────────────┐│
│  │ WorldClock  ││──▶ tick(minutes) → advance time → fire scheduled events
│  └─────────────┘│
│  ┌─────────────┐│
│  │SocialSim    ││──▶ simulateInteraction() → pair selection → event generation
│  └─────────────┘│
│  ┌─────────────┐│
│  │VillainMgr   ││──▶ tick() → phase transition → LLM strategic action
│  └─────────────┘│
│  ┌─────────────┐│
│  │ProbEngine   ││──▶ roll() → chance events (weather, accidents, discoveries)
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryPlanner ││──▶ shouldGenerateBeat() → generateNextBeat() → LLM
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryEngine  ││──▶ generateEvent() → LLM → apply effects → publish event
│  └─────────────┘│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  EventBus        │────▶│  WebSocketManager │
│  (STORY_BEAT)    │     │  (broadcast)      │
└─────────────────┘     └──────────────────┘
```

### 3. World Creation Flow

```
┌──────────┐     ┌──────────────────┐     ┌────────────────┐
│  Browser  │────▶│  POST /worlds     │────▶│  WorldManager   │
│           │     │  (routes/worlds)  │     │  createWorld()  │
└──────────┘     └──────────────────┘     └───────┬────────┘
                                                   │
                    ┌──────────────────────────────┤
                    ▼                              ▼
          ┌─────────────────┐            ┌────────────────┐
          │  mkdir worlds/   │            │ EventBus.publish│
          │  {name}/         │            │ (WORLD_CREATED) │
          └─────────────────┘            └────────────────┘
                                                   │
                                                   ▼
                                          ┌────────────────┐
                                          │NarrativeService │
                                          │    .reset()     │
                                          └────────────────┘

POST /api/launch:
┌─────────────────┐
│  WorldBuilder    │
│  ├─ createWorld()│──▶ LLM → WorldFrame JSON
│  ├─ buildL1()    │──▶ LLM → L1 identity for each entity
│  ├─ buildL2()    │──▶ LLM → L2 dynamic state
│  ├─ buildL3()    │──▶ LLM → L3 hidden/secret
│  └─ buildRels()  │──▶ LLM → relationships
└─────────────────┘
          │
          ▼
┌─────────────────┐
│ EventBus.publish │
│ (ENTITY_ADDED    │
│  × N entities)   │
└─────────────────┘
```

### 4. Agent Memory Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  NarratorAgent   │────▶│ EventBus.publish  │────▶│  WorldMemory    │
│  (generates      │     │ (MEMORY_ADDED)    │     │  .addEvent()    │
│   narrative)     │     └──────────────────┘     └───────┬────────┘
└─────────────────┘                                       │
                                                    ┌─────┴──────┐
                                                    ▼            ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │EmbeddingQueue │ │ WriteBehind  │
                                            │ (batch BGE-M3)│ │   Buffer     │
                                            └──────┬───────┘ └──────┬───────┘
                                                   │                │
                                                   ▼                ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │ VectorIndex   │ │ SQLiteStore  │
                                            │ (FAISS)       │ │ (tns.db)     │
                                            └──────────────┘ └──────────────┘

Query flow:
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│ AgentMemory   │────▶│ SQLiteStore       │────▶│ FTS5 (keyword)  │
│ .search()     │     │ .searchMemories   │     │ + Dense vectors │
│               │     │                   │     │ → RRF fusion    │
└──────────────┘     └──────────────────┘     └────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │ ReciprocalRank    │
                    │ Fusion (RRF)      │
                    └──────────────────┘
```

---

## [A9] Cross-Context Dependencies

```
                    ┌─────────────────────┐
                    │  World Management    │
                    │  (BC1)               │
                    └──────────┬──────────┘
                               │ creates/loads
                               ▼
┌──────────────┐    ┌─────────────────────┐    ┌──────────────┐
│ Entity &     │◀──▶│  Narrative & Story   │◀──▶│  NPC &       │
│ Graph (BC2)  │    │  (BC3)               │    │  Dialogue    │
└──────┬───────┘    └──────────┬──────────┘    │  (BC4)       │
       │                       │                └──────┬───────┘
       │                       │                       │
       │                       ▼                       │
       │              ┌─────────────────────┐          │
       │              │  LLM Integration     │          │
       │              │  (BC8)               │◀─────────┘
       │              └──────────┬──────────┘
       │                         │
       │    ┌────────────────────┼────────────────────┐
       │    ▼                    ▼                    ▼
       │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │ │  Social &     │ │  Quests      │ │  Villain     │
       │ │  Relationships│ │  (BC6)       │ │  (BC10)      │
       │ │  (BC5)        │ └──────┬───────┘ └──────────────┘
       │ └──────┬───────┘        │
       │        │                │
       │        ▼                ▼
       │ ┌─────────────────────────────┐
       │ │  Probability & Combat       │
       │ │  (BC9)                      │
       │ └─────────────────────────────┘
       │
       ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Memory & Knowledge  │◀──▶│  Intelligence        │
│  (BC7)               │    │  (BC11)              │
└─────────────────────┘    └─────────────────────┘
```

**Key Dependencies:**

| Source BC | Target BC | Coupling Mechanism |
|-----------|-----------|-------------------|
| BC1 (World) | BC2 (Entity) | `UnifiedEntityStore` shared instance |
| BC1 (World) | BC3 (Narrative) | `NarrativeService.reset()` |
| BC3 (Narrative) | BC4 (NPC) | `NPCRuntime` injected into `RoleplayEngine` |
| BC3 (Narrative) | BC5 (Social) | `SocialSimulator` injected into `DirectorLoop` |
| BC3 (Narrative) | BC6 (Quest) | `QuestManager` injected into `StoryEngine` |
| BC3 (Narrative) | BC10 (Villain) | `VillainManager` injected into `DirectorLoop` |
| BC3 (Narrative) | BC9 (Probability) | `ProbabilityEngine` in `RoleplayEngine` |
| BC4 (NPC) | BC7 (Memory) | `NPCRuntime` uses `EpisodicMemory` |
| BC5 (Social) | BC2 (Entity) | `SocialGraph` reads from `UnifiedEntityStore` |
| BC8 (LLM) | All BCs | `LLMQueue` is shared across all agents |
| BC7 (Memory) | BC8 (LLM) | `EmbeddingQueue` calls `LLMClient` for embeddings |
| BC11 (Intelligence) | BC2 (Entity) | Graph analysis reads `GraphStore` |

---

## [A10] Key Design Decisions

### D1: Composition Root Pattern

**Decision:** `NarrativeService` (`src/services/narrative-service.ts`) acts as the composition root, instantiating all services and wiring dependencies manually.

**Trade-off:** Explicit DI without a framework. All dependencies are visible in one constructor, making the system debuggable but verbose. The alternative (IoC container) would add runtime magic.

### D2: JSON Files as Primary Store (with SQLite for Search)

**Decision:** Entity state, NPC profiles, and social relationships are stored as JSON files. SQLite is used only for search (FTS5), embeddings (vector), sessions, and agent prompts.

**Trade-off:** Simple reads/writes with atomic file operations, but no transactional guarantees across entities. The `atomicWriteJson()` pattern (write-temp + rename) provides crash safety for individual writes but not multi-file consistency. SQLite provides full ACID for search and embeddings.

### D3: Event Bus for Cross-Context Communication

**Decision:** `EventBus` with priority-sorted handlers and replay buffer connects bounded contexts asynchronously.

**Trade-off:** Decouples contexts (NPC doesn't know about Memory, Memory doesn't know about NPC) but adds indirection. The replay buffer (100 events) ensures late subscribers don't miss recent events, at the cost of memory.

### D4: Per-Agent Model Assignment

**Decision:** Each agent (narrator, NPC, director, researcher, etc.) can have its own LLM provider, model, temperature, and max tokens.

**Trade-off:** Maximum flexibility (use cheap models for chronicler, powerful models for narrator) but requires configuration management. ProviderManager handles this with `conf/providers.json` and `conf/agents.json`.

### D5: Three-Layer Entity Profile (L1/L2/L3)

**Decision:** Entity profiles use three layers: L1 (identity/name), L2 (dynamic state/location), L3 (hidden/secret).

**Trade-off:** Enables progressive revelation and DM-controlled secrets. L1 is always visible, L2 updates during play, L3 is hidden from players. The cost is additional complexity in profile resolution.

### D6: Background Director Loop

**Decision:** `DirectorLoop` runs as a background interval, orchestrating clock ticks, social simulation, villain actions, and story beats independently of player input.

**Trade-off:** Creates a living world that evolves even when players are offline. The trade-off is complexity in state management (paused/running states, major beat cooldowns) and potential for events that players miss.

### D7: Hybrid Search (FTS5 + Vector + RRF)

**Decision:** Memory search uses both keyword (FTS5) and semantic (dense vector) search, combined via Reciprocal Rank Fusion.

**Trade-off:** Best of both worlds — exact keyword matches and semantic similarity. The cost is maintaining both indices and the embedding pipeline (BGE-M3 via llama.cpp server on port 5002).

### D8: Git-Like Branching for Story Graphs

**Decision:** `BranchManager` supports branching the entity graph, allowing alternative story paths.

**Trade-off:** Enables "what if" scenarios and parallel timelines without duplicating the entire world state. Each branch stores only additions and deletions relative to the parent.

### D9: Template-Based Agent Prompts with SQLite Fallback

**Decision:** Agent prompts are stored in SQLite (`agent_prompts`) with per-world and per-language isolation, falling back to JSON files and then hardcoded defaults.

**Trade-off:** Supports i18n and per-world customization without code changes. The three-tier fallback ensures the system works even without a database.

### D10: Mojo FFI for Performance-Critical Computations

**Decision:** Probability calculations and vector operations can use Mojo FFI kernels (`probability_ffi.mojo`, `vector_ffi.mojo`) with TypeScript fallbacks.

**Trade-off:** Significant performance gains for batch operations (probability rolls, cosine similarity) but adds build complexity and platform dependency. TypeScript fallbacks ensure portability.

---

## Appendix: File Reference

| Directory | Files | Purpose |
|-----------|-------|---------|
| `src/models/` | 12 files | Domain models (Entity, Quest, Story, Director, NPC, Romance, Probability, Memory, Item, Rank, Archetype) |
| `src/services/` | 45+ files | Application + domain services |
| `src/routes/` | 18 files | HTTP adapters (Hono routers) |
| `src/lib/` | 15+ files | Infrastructure (LLM, SQLite, EventBus, Vector ops, Providers) |
| `src/memory/` | 12 files | Memory subsystem (scoring, clustering, embedding, cognitive pipeline) |
| `src/intelligence/` | 10 files | Graph analysis and validation |
| `src/store/` | 1 file | Unified entity store with NameIndex |
| `src/config/` | env.ts | Environment configuration |
| `src/i18n/` | Internationalization | Multilingual support (7 languages) |
| `src/middleware/` | auth, rate-limiter, etc. | HTTP middleware |
| `src/utils/` | logger, sanitize, etc. | Shared utilities |
