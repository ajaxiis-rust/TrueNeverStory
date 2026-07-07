# TrueNeverStory Migration Plan: Python → TypeScript (Bun + Hono) + Mojo + MAX

## 1. Executive Summary

**TrueNeverStory** is a TypeScript + Mojo port of [BRING](https://github.com/Eva-E1/BRING) — a 5000+ line Python AI-powered fantasy world platform. This plan documents the migration to a hybrid stack:

- **TypeScript (Bun + Hono)** — Web server, API, WebSocket, routing, auth, streaming, business logic, orchestration
- **Mojo + MAX Serve** — Vector search (FAISS replacement), embedding generation, probability engine hot-path, any compute-heavy kernels

The LLM inference is already OpenAI-compatible HTTP calls — no Mojo needed there, just HTTP client from TS.

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                      │
│              Terminal-style Web UI (HTML/CSS/JS)         │
│              WebSocket + REST API calls                  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────▼─────────────────────────────────┐
│              TypeScript (Bun + Hono)                     │
│                                                          │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │  HTTP API    │ │  WebSocket   │ │  SSE Streaming   │  │
│  │  /api/*      │ │  /ws/*       │ │  /chat/stream    │  │
│  └──────┬──────┘ └──────┬───────┘ └────────┬─────────┘  │
│         │               │                   │            │
│  ┌──────▼───────────────▼───────────────────▼─────────┐  │
│  │              Service Layer                          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │  │
│  │  │ Entity   │ │ Narrative│ │ Romance  │           │  │
│  │  │ Service  │ │ Engine   │ │ Engine   │           │  │
│  │  └──────────┘ └──────────┘ └──────────┘           │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │  │
│  │  │ Quest    │ │ Probability│ │ Memory  │           │  │
│  │  │ Manager  │ │ Engine    │ │ Manager │           │  │
│  │  └──────────┘ └──────────┘ └──────────┘           │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │                               │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           Data Layer (SQLite + JSON)                │  │
│  │  EntityStore │ HistoryStore │ SessionStore          │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP (OpenAI-compatible)
┌───────────────────────▼─────────────────────────────────┐
│              Mojo + MAX Serve                            │
│                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐  │
│  │ Vector Search│ │ Embedding    │ │ Custom Kernels  │  │
│  │ (FAISS-alt)  │ │ Generation   │ │ (future)        │  │
│  └──────────────┘ └──────────────┘ └─────────────────┘  │
│  OpenAI-compatible API at :8000                          │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Directory Structure

```
TrueNeverStory/
├── plan.md                          # This file
├── .env.example                     # Environment template
├── package.json                     # Bun project config
├── tsconfig.json                    # Strict TS config
├── bunfig.toml                      # Bun config
│
├── src/
│   ├── index.ts                     # Entry point — server bootstrap
│   ├── app.ts                       # Hono app creation & middleware
│   │
│   ├── config/
│   │   └── env.ts                   # Zod-validated env config (replaces world_config.py)
│   │
│   ├── middleware/
│   │   ├── error-handler.ts         # Centralized error handling
│   │   ├── logger.ts                # Pino request logging
│   │   ├── cors.ts                  # CORS config
│   │   ├── rate-limiter.ts          # Rate limiting
│   │   └── api-rewrite.ts           # /api/* → /* prefix rewrite
│   │
│   ├── lib/
│   │   ├── llm-client.ts            # OpenAI-compatible HTTP client (replaces world_builder/llm.py)
│   │   ├── llm-queue.ts             # Priority queue for LLM calls (replaces world_core/llm_queue.py)
│   │   ├── event-bus.ts             # Async pub/sub (replaces world_core/event_bus.py)
│   │   ├── event-bus-types.ts       # EventTopic enum + Event interface
│   │   ├── history-manager.ts       # Persistent session history (replaces world_core/history_manager.py)
│   │   ├── world-memory.ts          # WorldMemory with MAX-backed vector search
│   │   └── atomic-io.ts             # Atomic file write helpers (replaces world_core/utils.py)
│   │
│   ├── models/
│   │   ├── entity.ts                # EntityNode, LayeredProfile, EntityType (replaces world_core/models.py)
│   │   ├── relationship.ts          # Relationship model
│   │   ├── world-frame.ts           # WorldFrame model
│   │   ├── probability.ts           # ProbabilityProfile, Modifier, Result (replaces world_core/probability/models.py)
│   │   ├── romance.ts               # RomanceStatus, RelationshipMemory (replaces world_core/romance/models.py)
│   │   ├── quest.ts                 # Quest model (replaces world_narrative/quest_manager.py Quest)
│   │   ├── memory.ts                # MemoryEntry, MemoryConfig (replaces world_core/memory/config.py)
│   │   ├── chat.ts                  # ChatMessage, ChatResponse, SessionSetup (replaces Pydantic models)
│   │   └── director.ts              # DirectorTask, StoryArc (replaces world_director/models.py)
│   │
│   ├── store/
│   │   ├── entity-store.ts          # UnifiedEntityStore with NameIndex (replaces world_core/store.py)
│   │   └── name-index.ts            # Name→UID resolution (replaces NameIndex class)
│   │
│   ├── routes/
│   │   ├── index.ts                 # Route aggregator
│   │   ├── chat.ts                  # /chat/* routes (replaces world_explorer/routes/chat.py)
│   │   ├── entities.ts              # /entity/*, /neighbors/*, /search, /graph/* (replaces routes + api.py entity routes)
│   │   ├── memory.ts                # /memory/* routes (replaces world_explorer/routes/memory.py)
│   │   ├── branches.ts              # /branch/* routes (replaces world_explorer/routes/branches.py)
│   │   ├── probability.ts           # /probability/* routes (replaces api.py probability endpoints)
│   │   ├── romance.ts               # /romance/* routes (replaces api.py romance endpoints)
│   │   ├── quests.ts                # /quests/* routes (replaces api.py quest endpoints)
│   │   ├── sessions.ts              # /sessions/* routes (replaces api.py session endpoints)
│   │   ├── maintenance.ts           # /maintenance/* routes (replaces api.py maintenance endpoints)
│   │   ├── launch.ts                # /launch, /continue routes (replaces api.py launch endpoints)
│   │   └── health.ts                # /health, /system-check (replaces api.py health endpoints)
│   │
│   ├── services/
│   │   ├── entity-service.ts        # Entity CRUD + graph queries (replaces navigator.py + graph_manager.py)
│   │   ├── narrative-service.ts     # Narrative context DI container (replaces world_narrative/context.py)
│   │   ├── roleplay-engine.ts       # Main roleplay engine (replaces world_engine/roleplay_engine.py)
│   │   ├── narrator-agent.ts        # Narrator LLM agent (replaces world_engine/agents/)
│   │   ├── npc-agent.ts             # NPC dialogue agent
│   │   ├── scene-agent.ts           # Scene transition agent
│   │   ├── director-agent.ts        # Story beat injection agent
│   │   ├── start-resolver.ts        # Starting point resolver (replaces world_engine/start_resolver.py)
│   │   ├── memory-manager.ts        # In-memory conversation history (replaces world_engine/memory_manager.py)
│   │   ├── chronicler.ts            # Event timeline logger (replaces world_narrative/chronicler.py)
│   │   ├── story-engine.ts          # Event generation & effects (replaces world_narrative/story_engine.py)
│   │   ├── story-planner.ts         # Story beat scheduling (replaces world_narrative/story_planner.py)
│   │   ├── director.ts              # Background director (replaces world_narrative/director.py)
│   │   ├── quest-manager.ts         # Dynamic quest system (replaces world_narrative/quest_manager.py)
│   │   ├── probability-engine.ts    # Probability calculations (replaces world_core/probability/engine.py)
│   │   ├── probability-resolver.ts  # Context resolver (replaces world_core/probability/resolver.py)
│   │   ├── probability-profiles.ts  # Predefined profiles (replaces world_core/probability/profiles.py)
│   │   ├── romance-engine.ts        # Romance system (replaces world_core/romance/engine.py)
│   │   ├── romance-profiles.ts      # Romance probability profiles (replaces world_core/romance/profiles.py)
│   │   ├── world-clock.ts           # In-game time (replaces world_narrative/world_clock.py)
│   │   ├── world-validator.ts       # World consistency (replaces world_narrative/validation.py)
│   │   ├── social-simulator.ts      # NPC social interactions (replaces world_narrative/social_sim.py)
│   │   ├── villain-manager.ts       # Villain progression (replaces world_narrative/villain_manager.py)
│   │   ├── launcher.ts              # Game launcher (replaces world_narrative/launcher.py)
│   │   ├── birth.ts                 # Character creation (replaces world_narrative/birth.py)
│   │   ├── user-agent.ts            # User session agent (replaces world_narrative/user_agent.py)
│   │   ├── graph-store.ts           # GraphStore with boot() (replaces world_explorer/store.py)
│   │   ├── navigator.ts             # Graph query interface (replaces world_explorer/navigator.py)
│   │   ├── graph-builder.ts         # Builds graph from entities (replaces world_explorer/graph_builder.py)
│   │   ├── branch-manager.ts        # Git-like branching (replaces world_explorer/branch_manager.py)
│   │   └── websocket-manager.ts     # WebSocket connection manager
│   │
│   ├── intelligence/
│   │   ├── graph-analyzer.ts        # Centrality, communities (replaces world_intelligence/graph_analyzer.py)
│   │   ├── duplicate-detector.ts    # FAISS-accelerated dedup → calls MAX
│   │   ├── recommender.ts           # Relationship suggestions
│   │   ├── relationship-repairer.ts # Fuzzy relationship fixing
│   │   ├── subgraph-expander.ts     # Enrich subgraph around node
│   │   ├── scene-generator.ts       # Narrative scene from clusters
│   │   ├── pipeline.ts              # Full enrichment pipeline
│   │   └── rule-checker.ts          # LLM-based rule validation
│   │
│   ├── memory/
│   │   ├── cognitive-pipeline.ts    # Entity extraction + contradiction (replaces cognitive_pipeline.py)
│   │   ├── entity-extractor.ts      # Named entity extraction
│   │   ├── contradiction-detector.ts# Belief conflict detection
│   │   ├── pain-signals.ts          # Failure pattern tracking
│   │   ├── clustering.ts            # Cluster merge engine
│   │   ├── partition.ts             # Time-based memory partitioning
│   │   ├── scoring.ts               # Retention scoring
│   │   ├── optimizer.ts             # Background memory lifecycle
│   │   ├── write-buffer.ts          # Write-behind persistence
│   │   ├── embedding-queue.ts       # Batched embedding requests
│   │   └── faiss-index.ts           # Vector index → calls MAX Serve
│   │
│   └── utils/
│       ├── logger.ts                # Pino logger setup
│       ├── hash.ts                  # SHA256 helpers
│       └── time.ts                  # Time utilities
│
├── public/
│   └── index.html                   # Extracted from templates.py — terminal UI
│
├── mojo/                            # Mojo + MAX components
│   ├── server/                      # MAX Serve HTTP server
│   │   ├── main.mojo                # Entry point — serves OpenAI-compatible API
│   │   ├── embedding_server.mojo    # Embedding generation endpoint
│   │   └── vector_search_server.mojo # Vector similarity search endpoint
│   ├── kernels/
│   │   ├── vector_ops.mojo          # Custom vector kernels
│   │   └── embedding_kernels.mojo   # Embedding computation kernels
│   ├── memory/
│   │   ├── faiss_index.mojo         # FAISS-alternative vector index
│   │   ├── cosine_similarity.mojo   # Optimized cosine similarity
│   │   └── batch_embed.mojo         # Batch embedding computation
│   ├── probability/
│   │   └── probability_kernels.mojo # Hot-path probability calculations
│   └── pyproject.toml               # Mojo project config
│
├── tests/
│   ├── entity-store.test.ts
│   ├── roleplay-engine.test.ts
│   ├── probability-engine.test.ts
│   ├── routes/
│   │   ├── chat.test.ts
│   │   └── entities.test.ts
│   └── integration/
│       └── full-flow.test.ts
│
└── docs/
    └── API.md                       # API documentation
```

---

## 4. Module-by-Module Migration Map

### Phase 1: Foundation (Core Models + Store)

| Python Module | TS Target | Notes |
|---|---|---|
| `world_core/models.py` | `src/models/entity.ts`, `relationship.ts`, `world-frame.ts` | Zod schemas + TS interfaces. `LayeredProfile` → interface with `l1`, `l2`, `l3` dicts. `EntityNode` → class or interface. `EntityType` → string enum. |
| `world_core/store.py` | `src/store/entity-store.ts`, `name-index.ts` | `UnifiedEntityStore` → class with Map-based O(1) lookups. `NameIndex` → same strategy. Use Bun's `Bun.file()` for reads, atomic writes via temp+rename. |
| `world_core/utils.py` | `src/lib/atomic-io.ts`, `src/utils/hash.ts` | `atomic_write_json` → Bun file API with temp+rename. SHA256 via `crypto.subtle`. |
| `world_core/event_bus.py` | `src/lib/event-bus.ts`, `event-bus-types.ts` | `EventBus` → class with `Map<string, Handler[]>`. Priority queue via sorted insert. Replay buffer. |
| `world_core/history_manager.py` | `src/lib/history-manager.ts` | `HistoryManager` → class backed by JSON files on disk. Same session/turn model. |
| `world_config.py` | `src/config/env.ts` | Use `zod` + `@t3-oss/env-core` or manual Zod schema. Load from `process.env` + `.env` via `bunfig.toml`. |

### Phase 2: Web Server + Routes

| Python Module | TS Target | Notes |
|---|---|---|
| `world_explorer/api.py` | `src/index.ts`, `src/app.ts`, `src/routes/*` | FastAPI → Hono. Lifespan → `onStart`/`onStop` hooks. Middleware via Hono middleware chain. |
| `world_explorer/routes/chat.py` | `src/routes/chat.ts` | Pydantic models → Zod schemas. WebSocket via Hono's `ws()` helper. |
| `world_explorer/routes/entities.py` | `src/routes/entities.ts` | Direct port of query endpoints. |
| `world_explorer/routes/memory.py` | `src/routes/memory.ts` | Memory management endpoints. |
| `world_explorer/routes/branches.py` | `src/routes/branches.ts` | Branch management endpoints. |
| `world_explorer/templates.py` | `public/index.html` | Extract HTML/CSS/JS to static file. Serve via Hono's `serveStatic()`. |
| `Middleware (CORS, rewrite)` | `src/middleware/*` | Hono middleware pattern. CORS via `@hono/cors`. |

### Phase 3: Business Logic Services

| Python Module | TS Target | Notes |
|---|---|---|
| `world_engine/roleplay_engine.py` | `src/services/roleplay-engine.ts` | Core roleplay logic. All regex patterns → TS RegExp. Async/await throughout. |
| `world_engine/agents/*.py` | `src/services/narrator-agent.ts`, `npc-agent.ts`, etc. | Each agent wraps LLM queue calls with specific prompts. |
| `world_engine/memory_manager.py` | `src/services/memory-manager.ts` | Simple deque-based conversation memory. |
| `world_engine/start_resolver.py` | `src/services/start-resolver.ts` | Natural language start point parsing. |
| `world_narrative/context.py` | `src/services/narrative-service.ts` | DI container. Initialize all services, wire dependencies. |
| `world_narrative/chronicler.py` | `src/services/chronicler.ts` | Timeline event logging to JSONL. |
| `world_narrative/story_engine.py` | `src/services/story-engine.ts` | Event generation & effects. |
| `world_narrative/story_planner.py` | `src/services/story-planner.ts` | Story beat scheduling. |
| `world_narrative/director.py` | `src/services/director.ts` | Background director with async intervals. |
| `world_narrative/quest_manager.py` | `src/services/quest-manager.ts` | Quest CRUD + progress tracking. |
| `world_narrative/world_clock.py` | `src/services/world-clock.ts` | In-game time management. |
| `world_narrative/validation.py` | `src/services/world-validator.ts` | World consistency checks. |
| `world_narrative/social_sim.py` | `src/services/social-simulator.ts` | NPC social interactions. |
| `world_narrative/villain_manager.py` | `src/services/villain-manager.ts` | Villain plot progression. |
| `world_narrative/launcher.py` | `src/services/launcher.ts` | Game launch orchestration. |
| `world_narrative/birth.py` | `src/services/birth.ts` | Character creation. |
| `world_narrative/user_agent.py` | `src/services/user-agent.ts` | User session agent. |
| `world_narrative/memory_optimized.py` | `src/services/memory-manager.ts` | OptimizedMemoryStore → Map-based with async operations. |

### Phase 4: Probability + Romance Systems

| Python Module | TS Target | Notes |
|---|---|---|
| `world_core/probability/engine.py` | `src/services/probability-engine.ts` | Modifier lifecycle, formulas, roll mechanics. Hot path → optionally call Mojo for bulk calculations. |
| `world_core/probability/resolver.py` | `src/services/probability-resolver.ts` | Context building from world state. |
| `world_core/probability/profiles.py` | `src/services/probability-profiles.ts` | Predefined profiles as const objects. |
| `world_core/probability/models.py` | `src/models/probability.ts` | Interfaces + enums. |
| `world_core/probability/expression.py` | Inline in `probability-engine.ts` | Simple safe math eval. |
| `world_core/romance/engine.py` | `src/services/romance-engine.ts` | Romance progression + probability. |
| `world_core/romance/profiles.py` | `src/services/romance-profiles.ts` | Romance probability profiles. |
| `world_core/romance/models.py` | `src/models/romance.ts` | Romance interfaces + enums. |

### Phase 5: Memory System (Mojo Integration)

| Python Module | TS Target | Notes |
|---|---|---|
| `world_core/memory/world_memory.py` | `src/lib/world-memory.ts` | Main memory class. Vector search calls MAX Serve via HTTP. |
| `world_core/memory/faiss_index.py` | `mojo/memory/faiss_index.mojo` + `src/memory/faiss-index.ts` | Mojo implements vector index. TS calls via HTTP API. |
| `world_core/memory/embedding_queue.py` | `src/memory/embedding-queue.ts` + `mojo/memory/batch_embed.mojo` | Batched embeddings via MAX Serve. |
| `world_core/memory/cognitive_pipeline.py` | `src/memory/cognitive-pipeline.ts` | Entity extraction + contradiction detection via LLM. |
| `world_core/memory/entity_extractor.py` | `src/memory/entity-extractor.ts` | NER via LLM prompts. |
| `world_core/memory/contradiction.py` | `src/memory/contradiction-detector.ts` | Belief conflict detection. |
| `world_core/memory/pain_signals.py` | `src/memory/pain-signals.ts` | Failure pattern tracking. |
| `world_core/memory/clustering.py` | `src/memory/clustering.ts` + `mojo/memory/cluster_merge.mojo` | DBSCAN → Mojo for performance. |
| `world_core/memory/partition.py` | `src/memory/partition.ts` | Time-based partitioning. |
| `world_core/memory/scoring.py` | `src/memory/scoring.ts` | Deterministic retention scoring. |
| `world_core/memory/optimizer.py` | `src/memory/optimizer.ts` | Background memory lifecycle via setInterval. |
| `world_core/memory/write_buffer.py` | `src/memory/write-buffer.ts` | Write-behind persistence. |

### Phase 6: Intelligence + Graph

| Python Module | TS Target | Notes |
|---|---|---|
| `world_explorer/store.py` | `src/services/graph-store.ts` | NetworkX replacement → custom graph using adjacency maps. Or use `graphology` npm package. |
| `world_explorer/navigator.py` | `src/services/navigator.ts` | Graph queries. |
| `world_explorer/graph_builder.py` | `src/services/graph-builder.ts` | Build graph from entity store. |
| `world_explorer/branch_manager.py` | `src/services/branch-manager.ts` | Git-like branching with JSON snapshots. |
| `world_intelligence/*.py` | `src/intelligence/*` | Graph analysis, dedup, recommendations. Duplicate detector → MAX for FAISS. |

### Phase 7: LLM Client + Queue

| Python Module | TS Target | Notes |
|---|---|---|
| `world_builder/llm.py` | `src/lib/llm-client.ts` | OpenAI-compatible client using `fetch()` (Bun native). LRU cache via Map. Streaming via ReadableStream. |
| `world_core/llm_queue.py` | `src/lib/llm-queue.ts` | Priority queue wrapping LLM client. Concurrency limiting via semaphore. |

---

## 5. Key TypeScript Patterns

### 5.1 Zod Validation (replaces Pydantic)

```typescript
import { z } from "zod";

export const ChatMessageSchema = z.object({
  content: z.string().min(1),
  character: z.string().optional(),
  location: z.string().optional(),
  session_id: z.string().optional(),
  story_time: z.string().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
```

### 5.2 Hono Route Pattern

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

const app = new Hono();

app.post("/chat/message", zValidator("json", ChatMessageSchema), async (c) => {
  const body = c.req.valid("json");
  const engine = c.get("roleplayEngine");
  const narrative = await engine.processInput(body.content);
  return c.json({ narrative, success: true });
});
```

### 5.3 WebSocket Pattern (Hono)

```typescript
import { createNodeWebSocket } from "@hono/node-ws";

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get("/ws/roleplay/:sessionId", upgradeWebSocket((c) => ({
  onMessage(evt, ws) {
    const data = JSON.parse(evt.data as string);
    // Process and respond
  },
  onClose() {
    // Cleanup
  },
})));
```

### 5.4 SSE Streaming Pattern

```typescript
app.get("/chat/stream", async (c) => {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const chunks = await engine.streamResponse(input);
      for await (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
```

### 5.5 Service Initialization Pattern

```typescript
// src/services/narrative-service.ts
export class NarrativeService {
  private entityStore: EntityStore;
  private probEngine: ProbabilityEngine;
  private llmQueue: LLMQueue;
  private worldMemory: WorldMemory;
  // ... all services

  constructor(dbPath: string) {
    this.entityStore = new EntityStore(join(dbPath, "entities.json"));
    this.llmQueue = new LLMQueue(new LLMClient(), 3);
    // ... initialize all
  }

  async start(): Promise<void> {
    await this.llmQueue.start();
    await this.worldMemory.start();
  }

  async stop(): Promise<void> {
    await this.llmQueue.stop();
    await this.worldMemory.stop();
  }

  createRoleplayEngine(): RoleplayEngine {
    return new RoleplayEngine(this);
  }
}
```

---

## 6. Mojo + MAX Integration

### 6.1 Vector Search Server (replaces FAISS)

```mojo
# mojo/server/main.mojo
from max.serve import HTTPServer, Request, Response

fn main():
    server = HTTPServer()
    server.get("/health", health_handler)
    server.post("/v1/embeddings", embeddings_handler)
    server.post("/v1/search", vector_search_handler)
    server.listen(8000)

fn vector_search_handler(req: Request) -> Response:
    # Accept: { "query_vector": [...], "top_k": 10, "index_id": "default" }
    # Return: { "results": [{ "id": "...", "score": 0.95, "payload": {...} }] }
    pass
```

### 6.2 Embedding Generation

```mojo
# mojo/server/embedding_server.mojo
fn embeddings_handler(req: Request) -> Response:
    # Accept: { "input": "text" or ["text1", "text2"], "model": "default" }
    # Return: { "data": [{ "embedding": [...], "index": 0 }], "model": "..." }
    # Uses Mojo kernel for batch embedding computation
    pass
```

### 6.3 Vector Index Kernel

```mojo
# mojo/memory/faiss_index.mojo
from memory import memset_zero

struct VectorIndex:
    var vectors: Matrix[DType.float32]
    var ids: List[String]
    var size: Int
    var dim: Int

    fn __init__(inout self, capacity: Int, dim: Int):
        self.dim = dim
        self.size = 0
        self.vectors = Matrix[DType.float32](capacity, dim)
        self.ids = List[String]()

    fn add(inout self, id: String, vector: Vector[DType.float32]):
        if self.size < self.vectors.rows():
            for i in range(self.dim):
                self.vectors[self.size, i] = vector[i]
            self.ids.append(id)
            self.size += 1

    fn search(self, query: Vector[DType.float32], top_k: Int) -> List[Tuple[String, Float]]:
        scores = List[Tuple[String, Float]]()
        for i in range(self.size):
            score = cosine_similarity(query, self.vectors.row(i), self.dim)
            scores.append((self.ids[i], score))
        # Sort by score descending, return top_k
        sort_by_score(mut scores)
        return scores[:top_k]
```

### 6.4 TS → MAX Communication

```typescript
// src/memory/faiss-index.ts
export class MAXVectorIndex {
  private baseUrl: string;

  constructor(maxServeUrl = "http://localhost:8000") {
    this.baseUrl = maxServeUrl;
  }

  async search(queryVector: number[], topK: number): Promise<VectorResult[]> {
    const res = await fetch(`${this.baseUrl}/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query_vector: queryVector, top_k: topK }),
    });
    const data = await res.json();
    return data.results;
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text }),
    });
    const data = await res.json();
    return data.data[0].embedding;
  }
}
```

---

## 7. Migration Phases (Execution Order)

### Phase 1: Scaffold + Core (Week 1)
1. Initialize Bun project with tsconfig strict mode
2. Port `world_core/models.py` → TypeScript interfaces + Zod schemas
3. Port `world_core/store.py` → `EntityStore` class
4. Port `world_core/utils.py` → atomic I/O helpers
5. Port `world_core/event_bus.py` → `EventBus` class
6. Port `world_core/history_manager.py` → `HistoryManager` class
7. Port `world_config.py` → Zod-validated env config
8. Write tests for all core modules

### Phase 2: Web Server (Week 2)
1. Set up Hono app with middleware (CORS, logging, error handler, rate limiter)
2. Port all API routes from `world_explorer/api.py`
3. Port WebSocket endpoints
4. Extract and serve UI template as static file
5. Implement SSE streaming for chat

### Phase 3: LLM Integration (Week 2-3)
1. Port `world_builder/llm.py` → TypeScript OpenAI-compatible client
2. Port `world_core/llm_queue.py` → Priority queue
3. Port all LLM agents (narrator, NPC, scene, director)

### Phase 4: Business Logic (Week 3-4)
1. Port `world_narrative/context.py` → `NarrativeService` DI container
2. Port `world_engine/roleplay_engine.py` → TypeScript
3. Port all narrative subsystems (chronicler, story engine, planner, director)
4. Port probability engine + profiles
5. Port romance engine + profiles
6. Port quest manager, world clock, validator

### Phase 5: Memory System (Week 4-5)
1. Port memory subsystem (cognitive pipeline, entity extractor, contradiction detector)
2. Set up Mojo + MAX vector search server
3. Port FAISS index operations to Mojo
4. Connect TS memory layer to MAX Serve via HTTP
5. Port clustering, partitioning, scoring

### Phase 6: Intelligence + Polish (Week 5-6)
1. Port graph operations (navigator, builder, analyzer)
2. Port intelligence pipeline (dedup, recommender, expander)
3. Port branch manager
4. Integration testing
5. Performance tuning
6. Documentation

---

## 8. TypeScript Strict Mode Config

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": false,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## 9. Key Dependencies

### TypeScript
```json
{
  "dependencies": {
    "hono": "^4.x",
    "@hono/zod-validator": "^0.x",
    "@hono/node-ws": "^0.x",
    "zod": "^3.x",
    "pino": "^9.x",
    "pino-pretty": "^11.x"
  },
  "devDependencies": {
    "bun-types": "latest",
    "@types/node": "^22.x",
    "typescript": "^5.x"
  }
}
```

### Mojo
```
# pyproject.toml
[project]
name = "tns-kernels"
requires-python = ">=3.10"

[dependencies]
max-serve = ">=2026.1"
numpy = ">=1.24"
```

---

## 10. Pitfalls & Mitigations

| Pitfall | Mitigation |
|---|---|
| NetworkX dependency | Use `graphology` npm or custom adjacency map. Most graph ops are simple BFS/DFS. |
| FAISS dependency | Replace with Mojo vector index or call MAX Serve. |
| Threading in Python | Bun is single-threaded async — all concurrent ops via async/await. No threads needed. |
| Blocking I/O in async TS | Use `Bun.file()` (non-blocking) or `fs.promises`. Never use `fs.readFileSync`. |
| Memory leaks in WebSocket | Track connections in Set, clean up on close, use `try/finally`. |
| Large context windows | Implement token counting, chunk long contexts, use sliding window. |
| Global state (Python singletons) | Pass dependencies via constructor injection (DI pattern). |
| Python `asyncio.get_event_loop()` | Bun uses native event loop — no equivalent needed. |
| JSON serialization perf | Use `JSON.parse`/`JSON.stringify` (native Bun, very fast). For large objects, consider streaming. |
| Type safety with `any` | Strict mode + Zod validation at boundaries. Internal types fully inferred. |

---

## 11. Testing Strategy

- **Unit tests**: Each service/module has isolated tests using `bun test`
- **Integration tests**: Full flow tests (launch game → send message → get narrative)
- **WebSocket tests**: Mock WS connections for real-time testing
- **Mojo tests**: `mojo test` for kernel correctness
- **Load tests**: `autocannon` or `wrk` for API performance

---

## 12. Deployment

```bash
# Start MAX Serve (Mojo)
cd mojo && mojo server main.mojo --port 8000

# Start TypeScript server
cd TrueNeverStory && bun run src/index.ts
```

---

*Plan created: 2026-06-21*
*Estimated effort: 5-6 weeks for full migration*
