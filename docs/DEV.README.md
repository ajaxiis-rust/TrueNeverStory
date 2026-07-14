# TrueNeverStory — Developer Guide

Technical documentation for contributors and developers.

---

## Architecture Overview

TrueNeverStory is a multi-agent AI roleplay engine with State-First architecture. A player sends messages, which are processed through a deterministic pipeline: intent parsing, simulation, state mutation, context building, and specialized agent rendering.

```
Player Input
    ↓
Intent Parser → Simulation Engine → State Mutator → Context Builder
    ↓
Dramaturg (MCP) → Stylist (MCP) → Censor → Translation Service
    ↓
Narrative Response
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun (not Node.js) |
| Web framework | Hono |
| Database | SQLite via `bun:sqlite` (WAL mode) |
| Validation | Zod |
| Logging | Pino |
| LLM | OpenAI-compatible API (via HTTP) |
| WebSocket | `@hono/node-ws` |
| Compute kernels | C FFI (compiled via Zig) + TypeScript fallback |

---

## Project Structure

```
src/
├── index.ts                    # Server entry point (Bun.serve)
├── app.ts                      # Hono app — middleware chain + route mounting
│
├── config/
│   ├── env.ts                  # Zod-validated env config (.env + process.env)
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # LLM HTTP client with LRU cache
│   ├── llm-queue.ts            # Concurrent request queue with pause/resume
│   ├── llm-types.ts            # LLM type definitions
│   ├── sqlite-store.ts         # SQLite (FTS5 + vectors + agent prompts + translations)
│   ├── vector-ops.ts           # Cosine, L2, dot product
│   ├── mojo-ffi.ts             # FFI bindings (C/Mojo) + TS fallbacks
│   ├── session-store.ts        # SQLite-backed session storage
│   ├── event-bus.ts            # Pub/sub event system
│   ├── history-manager.ts      # Conversation history persistence
│   ├── atomic-io.ts            # Safe JSON read/write (atomic rename)
│   └── providers/
│       ├── index.ts            # Provider registry
│       ├── llm-provider.ts     # Abstract provider interface
│       ├── provider-manager.ts # Multi-provider routing
│       ├── openai-provider.ts
│       ├── ollama-provider.ts
│       ├── anthropic-provider.ts
│       ├── google-provider.ts
│       └── llamacpp-provider.ts
│
├── middleware/
│   ├── auth.ts                 # Cookie-based auth (PBKDF2, CSRF, rate limiting)
│   ├── rate-limiter.ts         # Token bucket per IP
│   ├── security-headers.ts     # CSP, X-Frame-Options, etc.
│   ├── error-handler.ts        # Global error handler
│   └── logger.ts               # Request logging
│
├── models/                     # Data models (25 files)
│   ├── entity.ts               # Core entity (uid, name, profile with L1/L2/L3 layers)
│   ├── chat.ts                 # ChatMessageSchema, SessionSetupSchema (Zod)
│   ├── director.ts             # DirectorTask, TaskPriority
│   ├── intent.ts               # Intent, IntentType
│   ├── simulation.ts           # SimulationResult, SimulationState
│   ├── heartbeat.ts            # HeartbeatPayload
│   ├── memory.ts               # MemoryEntry
│   ├── probability.ts          # ProbabilityProfile, Modifier
│   ├── romance.ts              # RomanceState
│   ├── story.ts                # StoryContext
│   ├── quest.ts                # Quest, Objective, Reward
│   ├── item.ts                 # Item, ItemBoost
│   ├── rank.ts                 # Feudal hierarchy (10 ranks)
│   ├── archetype.ts            # 34 NPC archetypes
│   ├── npc-state.ts            # NPC runtime state
│   └── npc-stats.ts            # NPCStats, Vices, FamilyExpenses
│
├── routes/                     # API routes (18 modules)
│   ├── index.ts                # Route aggregator — mounts all modules under /api
│   ├── chat.ts                 # POST /chat/setup, /message, /stream (SSE), /agent
│   ├── entities.ts             # GET /entity/:uid, /neighbors, /path, /search, /graph/*
│   ├── agents.ts               # CRUD agent configs + prompts per language
│   ├── i18n.ts                 # Translation CRUD (7 languages)
│   ├── settings.ts             # GET/PUT settings, LLM server management
│   ├── worlds.ts               # Multi-world CRUD, switch, chapter generation
│   ├── memory.ts               # Memory endpoints
│   ├── branches.ts             # Story branch management
│   ├── probability.ts          # Probability queries
│   ├── romance.ts              # Romance system endpoints
│   ├── quests.ts               # Quest endpoints
│   ├── sessions.ts             # Session history
│   ├── maintenance.ts          # Graph maintenance
│   ├── launch.ts               # New game / resume
│   ├── health.ts               # Health check
│   ├── models.ts               # Model catalog
│   ├── providers.ts            # LLM provider management
│   └── system.ts               # Pause/resume background processing
│
├── services/                   # Business logic (60+ services)
│   │
│   │  ── Core Engine ──
│   ├── narrative-service.ts    # DI container — instantiates ALL services
│   ├── roleplay-engine.ts      # Main processing pipeline (processInput)
│   ├── story-engine.ts         # Story event generation
│   ├── director-loop.ts        # Background story progression (setInterval)
│   ├── agent-coordinator.ts    # Priority task queue for director
│   │
│   │  ── Agents (Big Six) ──
│   ├── agents/
│   │   ├── dramaturg.ts       # Narrative pattern selection (MCP)
│   │   ├── validator.ts       # Fact-checking via Wikipedia (MCP)
│   │   ├── stylist.ts         # Prose rendering (MCP)
│   │   ├── actor.ts           # NPC dialogue + interactions
│   │   ├── censor.ts          # AI cliché removal
│   │   └── chronicler.ts      # Timeline + memory updates
│   ├── agent-registry-v2.ts   # Agent registration + lookup
│   └── agent-v2.ts            # AgentV2 interface + base class
│
│   │  ── State Pipeline ──
│   ├── intent-parser.ts       # User intent classification
│   ├── simulation-engine.ts   # Deterministic world simulation
│   ├── state-mutator.ts       # World state updates
│   ├── context-builder.ts     # Prompt context assembly
│   ├── heartbeat.ts           # Background world heartbeat
│   └── translation-service.ts # Multi-language response translation
│   │
│   │  ── World Systems ──
│   ├── story-planner.ts        # LLM-driven arc planning
│   ├── story-arc-manager.ts    # Arc lifecycle
│   ├── branch-manager.ts       # Story branches
│   ├── world-builder.ts        # World entity creation
│   ├── world-clock.ts          # In-world time
│   ├── world-evolver.ts        # Auto-add NPCs/locations/items
│   ├── world-manager.ts        # Multi-world CRUD
│   ├── world-validator.ts      # World frame validation
│   ├── birth.ts                # Character creation wizard
│   ├── start-resolver.ts       # Game start resolution
│   │
│   │  ── NPC Systems ──
│   ├── npc-runtime.ts          # NPC state management
│   ├── npc-generator.ts        # Intelligent NPC creation
│   ├── npc-economy.ts          # Feudal economy core
│   ├── npc-economy-runtime.ts  # Turn-based simulation
│   ├── slave-economy.ts        # Slave trade mechanics
│   ├── memory-engine.ts        # NPC episodic memory
│   ├── memory-manager.ts       # Memory search + context
│   ├── behavior-engine.ts      # Autonomous NPC actions
│   ├── dialogue-manager.ts     # NPC conversation sessions
│   ├── dialogue-context.ts     # Enriched NPC prompts
│   ├── social-graph.ts         # Relationships, factions, alliances
│   │
│   │  ── Game Mechanics ──
│   ├── probability-engine.ts   # Deterministic outcomes
│   ├── probability-profiles.ts # Profile definitions
│   ├── probability-expression.ts # Safe math evaluator (recursive descent)
│   ├── probability-resolver.ts # Context resolution
│   ├── romance-engine.ts       # Romantic relationships
│   ├── romance-profiles.ts     # Romance action definitions
│   ├── quest-system.ts         # Quest lifecycle, objectives, chains
│   ├── quest-manager.ts        # Quest persistence
│   ├── inventory-manager.ts    # Items, equipment, trading
│   ├── item-evaluation.ts      # Item uniqueness + boost eval
│   ├── navigator.ts            # Graph pathfinding (BFS)
│   │
│   │  ── Infrastructure ──
│   ├── agent-config.ts         # Agent config (SQLite-first + JSON fallback)
│   ├── prompt-builder.ts       # Prompt construction
│   ├── model-manager.ts        # Model catalog + downloads
│   ├── settings.ts             # Settings persistence
│   └── websocket-manager.ts    # WebSocket connection pool
│
├── intelligence/               # Graph intelligence
│   ├── graph-analyzer.ts       # Graph statistics
│   ├── graph-validator.ts      # Self-healing graph repairs
│   ├── duplicate-detector.ts   # Entity deduplication
│   ├── recommender.ts          # Relationship suggestions
│   ├── relationship-repairer.ts
│   ├── rule-checker.ts         # World rule validation
│   ├── scene-generator.ts      # Scene descriptions
│   ├── subgraph-expander.ts    # Context expansion
│   └── pipeline.ts             # Intelligence pipeline orchestration
│
├── memory/                     # Memory subsystem
│   ├── world-memory.ts         # Main memory class
│   ├── cognitive-pipeline.ts   # Entity extraction → contradiction → pain signals
│   ├── entity-extractor.ts     # Extract entities from text
│   ├── contradiction-detector.ts
│   ├── pain-signals.ts         # Important moment detection
│   ├── scoring.ts              # Memory importance scoring
│   ├── clustering.ts           # Memory clustering
│   ├── partition.ts            # Memory partitioning
│   ├── faiss-index.ts          # Vector index (FAISS-compatible)
│   ├── embedding-queue.ts      # Async embedding generation
│   ├── optimizer.ts            # Memory optimization
│   └── write-buffer.ts         # Batch write buffer
│
├── mcp/                        # MCP server — Bible/Gutenberg parsers, Wikipedia tools
│
├── i18n/                       # Internationalization (7 languages)
│   ├── types.ts                # LanguagePack interface
│   ├── index.ts                # Registry, getLanguagePack(), setLanguage()
│   ├── en.ts                   # English (base)
│   ├── ru.ts                   # Russian
│   ├── de.ts                   # German
│   ├── fr.ts                   # French
│   ├── es.ts                   # Spanish
│   ├── ja.ts                   # Japanese
│   └── zh.ts                   # Chinese
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — O(1) access + NameIndex
│
└── utils/
    ├── logger.ts               # Pino logger
    ├── hash.ts                 # SHA-256 utilities
    ├── time.ts                 # Time formatting
    ├── sanitize.ts             # Prompt injection defense
    └── template-resolver.ts    # Agent template {variable} resolution

mojo/
├── kernels/                    # C FFI compute kernels
│   ├── c/
│   │   ├── probability_ffi.c   # Success chance, roll, batch probability
│   │   ├── vector_ffi.c        # 4-dim vector ops (cosine, L2, dot)
│   │   ├── vector_full.c       # 768-dim batch cosine (BGE-M3)
│   │   ├── batch_ops.c         # Batch NPC ops (age decay, vice, tax)
│   │   └── graph_ops.c         # Graph traversal, RRF, reputation
│   ├── build.sh                # Cross-compilation via Zig
│   └── dist/                   # Compiled .so/.dylib/.dll
└── src/                        # 81 Mojo source files (optional perf backend)

public/                         # Frontend (static HTML)
├── index.html                  # Main chat/roleplay UI
├── agents.html                 # Agent config (i18n)
├── graph.html                  # Knowledge graph viewer (D3.js)
├── models.html                 # Model management
├── providers.html              # LLM provider settings
├── settings.html               # Global settings (i18n)
├── worlds.html                 # World management + birth wizard
└── static/
    ├── fonts/                  # Custom fonts
    └── vendor/                 # d3.v7.min.js, purify.min.js

conf/                           # Runtime configuration (gitignored)
├── settings.json               # App settings (LLM, auth, server)
├── agents.json                 # Global agent model assignments
├── providers.json              # Provider registry
└── llm-config.json             # LLM provider config

worlds/                         # World data (gitignored)
└── default/
    ├── tns.db                  # SQLite (entities, embeddings, memories, prompts, translations)
    ├── entities.json           # Entity graph (JSON)
    ├── world_frame.json        # World definition
    ├── session_history/        # Per-session conversation logs
    ├── chapters/               # Generated literary chapters
    ├── npc_profiles/           # NPC state files
    ├── timeline.jsonl          # Event timeline
    ├── story_planner.json      # Story planner state
    ├── villains.json           # Villain state
    └── world_clock.json        # In-world time

worlds/_sessions/
    └── sessions.db             # SQLite session storage
```

---

## Dependency Injection — NarrativeService

`NarrativeService` (`src/services/narrative-service.ts`) is the central DI container. It instantiates all 30+ services and wires their dependencies.

```
NarrativeService
├── entityStore (UnifiedEntityStore) — O(1) entity access
├── graphStore (GraphStore) — adjacency map + pathfinding
├── eventBus (EventBus) — pub/sub events
├── historyMgr (HistoryManager) — conversation persistence
├── llm (LLMClient) — HTTP client for LLM APIs
├── llmQueue (LLMQueue) — concurrent request queue (max 3)
├── sqliteStore (SQLiteStore) — FTS5 + vectors + agent_prompts + translations
├── chronicler (Chronicler) — timeline.jsonl writer
├── validator (WorldValidator) — world frame validation
├── questMgr (QuestManager) — quest persistence
├── clock (WorldClock) — in-world time
├── probEngine (ProbabilityEngine) — deterministic outcomes
├── probResolver (ProbabilityContextResolver) — context for probability
├── storyPlanner (StoryPlanner) — LLM-driven arc planning
├── villainManager (VillainManager) — antagonist actions
├── socialSim (SocialSimulator) — NPC social dynamics
├── npcRuntime (NPCRuntime) — NPC state management
├── storyEngine (StoryEngine) — story event generation
├── director (DirectorLoop) — background story progression
├── worldBuilder (WorldBuilder) — entity creation
├── agentCoordinator (AgentCoordinator) — priority task queue
├── storyArcManager (StoryArcManager) — arc lifecycle
├── userAgent (UserAgent) — party + combat
├── npcGenerator (NPCGenerator) — intelligent NPC creation
├── worldEvolver (WorldEvolver) — auto world expansion
├── graphValidator (GraphValidator) — self-healing graph
├── intentParser (IntentParser) — user intent classification
├── simEngine (SimulationEngine) — deterministic world simulation
├── stateMutator (StateMutator) — world state updates
├── contextBuilder (ContextBuilder) — prompt context assembly
├── heartbeatService (HeartbeatService) — background world heartbeat
├── tnsServer (TNSServer) — MCP server (Bible/Gutenberg/Wikipedia)
├── translationService (TranslationService) — multi-language translation
└── agentRegistry (AgentRegistryV2) — agent registration + lookup
```

**Lifecycle:**
1. `new NarrativeService({dbPath, worldFrame})` — constructor wires everything
2. `start()` — boots LLM queue, syncs entities to SQLite, auto-builds heuristic relationships (if entities exist but have no connections), starts director loop
3. `stop()` — stops director + LLM queue
4. `pause()` / `resume()` — for when user leaves chat view
5. `reset(newDbPath, worldFrame)` — hot-swap to a different world
6. `shutdown()` — clean shutdown

---

## Request Lifecycle

### REST API (POST /api/chat/message)

```
1. Hono middleware chain:
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. Route handler (chat.ts):
   - Zod validation (ChatMessageSchema)
   - sanitizeInput() — strip prompt injection patterns
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput():
   - Intent Parser → classify user intent
   - Simulation Engine → deterministic world simulation
   - State Mutator → update world state
   - Context Builder → assemble prompt context
   - Dramaturg (MCP) → select narrative pattern
   - Stylist (MCP) → render prose
   - Censor → remove AI clichés
   - Translation Service → multi-language response
   - Return narrative string

4. Response: JSON { narrative, location, story_time, ... }
```

### SSE Streaming (POST /api/chat/stream)

Same as REST, but wraps `engine.processInputStream()` in a `ReadableStream` with keepalive pings.

### WebSocket (ws://host/ws/...)

```
1. Upgrade: check session cookie (bring_session)
2. On message: JSON parse → route to engine
3. On response: JSON stringify → ws.send()
```

---

## Agent System

Each agent implements the `AgentV2` interface with a `process()` method that receives intent, simulation results, and game context.

### The Big Six

| Agent | Role | MCP Tools |
|-------|------|-----------|
| Dramaturg | Narrative pattern selection | search_verses, get_pattern, get_archetype |
| Validator | Fact-checking via Wikipedia | verify_fact, get_context |
| Stylist | Prose rendering | get_style_pattern, apply_style |
| Actor | NPC dialogue + interactions | — |
| Censor | AI cliché removal | — |
| Chronicler | Timeline + memory updates | — |

### AgentV2 Interface

```typescript
interface AgentV2 {
  readonly id: AgentId;
  readonly name: string;
  readonly description: string;
  readonly mcpTools: string[];
  process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput>;
}
```

**Note:** Legacy 14-agent system is deprecated but still functional for backward compatibility. Old agent IDs (`@narrator`, `@director`, etc.) route to the new agents internally.

### Prompt Resolution

Agent prompts are resolved in this order:
1. SQLite `agent_prompts` table (per world + language)
2. JSON fallback (`worlds/{world}/agents/{agentId}.json`)
3. Hardcoded defaults (`DEFAULT_PROMPTS` in `agent-config.ts`)

Templates use `{variable}` placeholders resolved by `resolveTemplate()`.

---

## MCP Integration (v0.25.0)

TNSServer (`src/mcp/tns-server.ts`) provides MCP tools for external data access.

| Tool | Source | Description |
|------|--------|-------------|
| search_verses | Bible | Search biblical verses by text, book, or reference |
| get_pattern | Bible | Get narrative patterns by archetype, mood, or function |
| get_archetype | Bible | Get archetype details by name |
| get_style_pattern | Gutenberg | Search styles by mood, tags, or description |
| apply_style | Gutenberg | Apply style to text (delexify and return suggestions) |
| verify_fact | Wikipedia | Verify a factual claim |
| get_context | Wikipedia | Get Wikipedia context for a topic |

---

## Data Layer

### EntityStore (JSON)

- `entities.json` — adjacency map of all entities
- O(1) access by UID via `Map<string, EntityNode>`
- O(1) name lookup via `NameIndex` (case-insensitive)
- Mutation tracking via `onMutation()` callback → syncs to SQLite

### SQLiteStore

Tables:
- `entities` — FTS5 full-text search
- `embeddings` — vector blobs (BGE-M3, 1024-dim)
- `memories` — roleplay memories with FTS5
- `agent_prompts` — per world + language prompt storage
- `ui_translations` — UI strings per language + page

Hybrid search: FTS5 keyword + dense vector + Reciprocal Rank Fusion.

### FFI Kernels

5 C kernels compiled via Zig for cross-platform distribution:

| Kernel | Functions | Fallback |
|--------|-----------|----------|
| `probability_ffi` | success_chance, roll, batch | Pure TS |
| `vector_ffi` | cosine_4d, l2_4d, dot_4d | Pure TS |
| `vector_full` | batch_cosine_768d | Pure TS |
| `batch_ops` | age_decay, vice_decay, tax, loyalty | Pure TS |
| `graph_ops` | rrf_fusion, reputation | Pure TS |

Detection: `dlopen()` in `mojo-ffi.ts`, fallback on failure.

---

## Configuration

### Environment Variables (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `WORLD_LLM_BASE_URL` | – | OpenAI-compatible endpoint |
| `WORLD_LLM_API_KEY` | – | API key |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Model name |
| `WORLD_LLM_TIMEOUT` | `300` | Request timeout (seconds) |
| `WORLD_LLM_MAX_TOKENS` | `4096` | Max tokens per response |
| `WORLD_LLM_TEMPERATURE` | `0.7` | Sampling temperature |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | Max concurrent LLM requests |
| `WORLD_DB_PATH` | `./world_db` | Database directory (legacy) |
| `WORLDS_ROOT` | `./worlds` | Worlds root directory |
| `WORLD_SERVER_HOST` | `127.0.0.1` | Listen address |
| `WORLD_SERVER_PORT` | `8000` | Listen port |
| `AUTH_PASSWORD` | – | Login password (empty = no auth) |
| `AUTH_PASSWORD_HASH` | – | PBKDF2 hash (salt:hash) |

### Settings (conf/settings.json)

Loaded via `loadSettings()`. Priority: settings.json > .env > defaults.

Contains: LLM params, embedding config, server config, auth password, memory settings, probability luck, world selection, language.

---

## Middleware Chain

Order matters — applied in `app.ts`:

```
1. errorHandler     — catch-all error handler
2. requestLogger    — Pino request logging
3. rateLimiter      — 100 req/min per IP
4. securityHeaders  — CSP, X-Frame-Options, etc.
5. CORS             — localhost:8000 origins
6. authMiddleware   — session cookie validation (protects /api/*, /ws/*)
```

---

## Testing

```bash
bun test                              # Run all tests
bun test tests/entity-store.test.ts   # Entity store tests
bun test tests/probability-engine.test.ts  # Probability tests
bun test tests/integration/server.test.ts  # Integration tests (requires running server)
```

Test files use `*.test.ts` convention alongside source files.

---

## Adding a New Agent

1. Create `src/services/my-agent.ts`:
```typescript
export class MyAgent {
  constructor(deps: { llmQueue: LLMQueue; entityStore: UnifiedEntityStore }) {}
  
  async generateResponse(ctx: AgentContext): Promise<string> {
    const prompt = buildPrompt(ctx);
    return await this.deps.llmQueue.enqueue({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4o-mini",
    });
  }
}
```

2. Register in `roleplay-engine.ts` constructor
3. Add routing logic in `processInput()`
4. Add system prompt in `agent-config.ts` or SQLite `agent_prompts` table

---

## Adding a New Route

1. Create `src/routes/my-route.ts`:
```typescript
import { Hono } from "hono";
const myRoute = new Hono();
myRoute.get("/my-endpoint", async (c) => c.json({ ok: true }));
export { myRoute as myRouteRouter };
```

2. Mount in `src/routes/index.ts`:
```typescript
import { myRouteRouter } from "./my-route";
routes.route("/", myRouteRouter);
```

---

## World Management

Multiple isolated worlds under `worlds/`:

```
worlds/
├── default/           # Active world
│   ├── tns.db         # SQLite database
│   ├── entities.json  # Entity graph
│   └── ...
├── levant/            # Another world
└── _sessions/         # Global session store
```

Switch worlds via `POST /api/worlds/:name/switch`. Hot-swaps the DI container.

World statistics available via `GET /api/worlds/:name/detail` — returns entity counts by type, character/location/faction/item lists, session/event/chapter/villain counts, and world rules.

---

## Key Patterns

- **Dual-write**: Settings writes go to both SQLite and JSON (backward compatibility)
- **Template resolution**: Agent prompts use `{variable}` placeholders resolved at runtime
- **Safe expression evaluation**: Probability formulas use recursive descent parser (no eval)
- **Prompt injection defense**: `sanitizeInput()` strips common injection patterns before LLM
- **Atomic JSON writes**: `atomicWriteJson()` uses temp file + rename for crash safety
- **Event-driven**: `EventBus` decouples services (entity creation, memory events, etc.)
- **Language instruction injection**: Language directives are baked into agent prompts at world creation via `seedWorldAgents()`, and also appended at runtime by `getLanguageInstruction()` for dynamic NPC dialogue
