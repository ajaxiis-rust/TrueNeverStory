# TrueNeverStory v0.15.0 – Building Rich Interactive Narrative Games

**TrueNeverStory v0.15.0** is a modern reimplementation of the [BRING](https://github.com/Eva-E1/BRING) fantasy world platform, migrated from Python to a high-performance hybrid stack:

- **TypeScript (Bun + Hono)** – Web server, API, WebSocket, routing, auth, streaming, business logic
- **C FFI Kernels** – Compute kernels for probability calculations and vector operations (compiled via Zig, with TypeScript fallback)

> *"From a single prompt to a living, breathing world – where every NPC remembers, every action has a chance, and the story never stops."*

---

## Features

| Feature | Description |
|---------|-------------|
| **Layered World Building** | Every entity (character, location, item, faction) has three layers: L1 (classification), L2 (details), L3 (secrets) |
| **Graph-First Knowledge** | All relationships in a directed graph with O(1) lookups, BFS traversal, branch management |
| **Self-Optimising Memory** | Vector-accelerated memory with cognitive pipeline (entity extraction, contradiction detection, pain signals) |
| **RAG for All Agents** | Full embedding support via llama.cpp (BGE-M3) + SQLite hybrid search (FTS5 + dense vectors + RRF) |
| **Probability System** | Deterministic outcomes for combat, persuasion, stealth, romance, investigation with dynamic modifiers |
| **Romance System** | Full romantic relationship management with probability-driven actions |
| **Living Director** | Background agent advances story arcs, villain agendas, NPC interactions |
| **Immersive Roleplay** | Third-person narrative, NPC dialogue, scene transitions – LLM never speaks for your character |
| **Quest System** | Dynamic quest generation, objectives, rewards, prerequisites, chains, time limits |
| **Story Planner** | LLM-driven arc planning with compressed context, two-phase generation, adaptive replanning |
| **Researcher Agent** | Fact-checking, realism validation, historical accuracy for recipes, characters, and scenes |
| **NPC Intelligence** | Memory search, autonomous behavior, social relationships, enriched dialogue context |
| **NPC Economy** | Feudal hierarchy (10 ranks), taxes, bribes, food production, family system, vices, 34 archetypes |
| **Social Graph** | Relationships, factions (6 types), political alliances (5 types), feudal hierarchy, inter-faction reputation |
| **Dialogue System** | NPC conversations with session management, topics, greetings/farewells, mood-driven responses |
| **Inventory System** | Items with rarity, stats, equipment slots, weight limits, gold, trading between characters |
| **Item System** | Unique items with permanent stat boosts (1-10%), evaluated by Historian/Researcher agents |
| **14 Specialized Agents** | Narrator, Director, Scene, NPC, Chronicler, Story Planner, Social Sim, Villain, Researcher, Historian, Cartographer, Merchant, Quest Giver, Lorekeeper |
| **WebSocket Real-Time** | Live roleplay streaming and memory event broadcasts |
| **SSE Streaming** | Server-sent events for progressive narrative delivery |
| **i18n (7 languages)** | Full localization: EN, RU, DE, FR, ES, JA, ZH — UI, prompts, agent names |
| **SQLite Storage** | Agent prompts and UI translations stored in SQLite per world + language |
| **Password Auth** | Session-based authentication with HttpOnly cookies |
| **Terminal UI** | Beautiful dark terminal-style web interface |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Terminal UI)                 │
│              WebSocket + REST + SSE                      │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────▼─────────────────────────────────┐
│              TypeScript (Bun + Hono)                     │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ HTTP API │ │WebSocket │ │SSE Stream│ │   Auth     │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬──────┘  │
│       └─────────────┼───────────┼─────────────┘         │
│  ┌──────────────────▼───────────▼─────────────────────┐  │
│  │              Service Layer                          │  │
│  │  RoleplayEngine │ ProbabilityEngine │ RomanceEngine│  │
│  │  QuestManager   │ QuestSystem       │ Director     │  │
│  │  StoryPlanner   │ VillainManager    │ SocialSim    │  │
│  │  ResearcherAgent│ CrafterAgent      │ NPCGenerator │  │
│  │  Chronicler     │ NpcEconomy        │ ItemEval     │  │
│  │  SocialGraph    │ DialogueManager   │ InventoryMgr │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           Memory System (WorldMemory)               │  │
│  │  VectorIndex │ CognitivePipeline │ EntityExtractor │  │
│  │  Scoring     │ Partitions        │ WriteBuffer     │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           Data Layer (EntityStore + JSON)            │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │      C FFI Kernels (compiled via Zig)              │  │
│  │  Probability Kernels │ Vector Operations           │  │
│  │  .so/.dylib/.dll → dlopen() or TypeScript fallback │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP (OpenAI-compatible)
┌───────────────────────▼─────────────────────────────────┐
│              External LLM API (Ollama, OpenAI, etc.)     │
└─────────────────────────────────────────────────────────┘
```

---

## Platform Compatibility

| Платформа | Статус | FFI | Запуск | Заметки |
|-----------|:------:|:---:|--------|---------|
| Linux x86_64 | ✅ Full | ✅ | `./tns-server` | Полная поддержка |
| Linux ARM64 | ✅ Full | ✅ | `./tns-server` | Полная поддержка |
| Linux ARMv7 | ✅ Full | ✅ | `./tns-server` | ARMhf |
| Linux RISC-V | ✅ Full | ✅ | `./tns-server` | RISC-V 64 |
| Linux musl | ✅ Full | ✅ | `./tns-server` | Alpine, static |
| macOS ARM64 | ✅ Full | ✅ | `./tns-server` | Apple Silicon |
| macOS x86_64 | ✅ Full | ✅ | `./tns-server` | Intel Mac |
| Windows x86_64 | ✅ Full | ✅ | `tns-server.exe` | C FFI via Zig |
| Windows ARM64 | ✅ Full | ✅ | `tns-server.exe` | C FFI via Zig |

### C FFI vs TypeScript Backend

Сервер автоматически определяет доступность FFI ядер:

- **C FFI backend** — вычисления через динамическую библиотеку (~10-50x быстрее для векторных операций)
- **TypeScript fallback** — чистый TypeScript (работает везде, медленнее)

Проверить backend: `getBackend()` → `"mojo"` или `"typescript"`

### Cross-Compilation

Ядра компилируются через Zig для всех платформ:

```bash
./mojo/kernels/build.sh aarch64-linux    # ARM64 Linux
./mojo/kernels/build.sh x86_64-linux     # x86_64 Linux
./mojo/kernels/build.sh aarch64-macos    # Apple Silicon
./mojo/kernels/build.sh x86_64-windows   # Windows x64
./mojo/kernels/build.sh list             # Все таргеты
```

См. [COMPILE.md](COMPILE.md) для деталей.

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+ (for development)
- An OpenAI-compatible LLM API (OpenAI, Ollama, vLLM, LM Studio, etc.)

For compiled binary — nothing required, just run.

### 1. Install

```bash
cd TNS
bun install
```

### 2. Configure LLM

Open `http://localhost:8000/settings` and configure your LLM provider:

- **Ollama** (local): `http://localhost:11434/v1`, model: `llama3`
- **OpenAI**: `https://api.openai.com/v1`, model: `gpt-4o-mini`
- **vLLM** (local): `http://localhost:8000/v1`
- **LM Studio**: `http://localhost:1234/v1`

Or edit `conf/settings.json` directly.

### 3. Run

```bash
bun run dev
```

Open `http://localhost:8000` and login with password: **`changeme`**

Change the password in Settings after first login.

### Binary (no dependencies)

```bash
# Download from GitHub Releases, then:
chmod +x tns-server
./tns-server
# Login: http://localhost:8000 — password: changeme
```

---

## Usage Examples

### Running from Binary (No Dependencies)

Download the latest release for your platform and run directly:

```bash
# Linux / macOS
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

No Bun, Node.js, or any runtime required. Just configure `.env` and run.

### Running from Source (Development)

```bash
# Hot reload development mode
bun run dev

# Production mode (no hot reload)
bun run start

# Build bundle only (no binary)
bun run build
```

### Starting with Local LLM (Ollama)

```bash
# 1. Start Ollama with a model
ollama pull llama3
ollama serve

# 2. Configure TNS to use Ollama
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

# 3. Start the server
./tns-server
```

### Starting with OpenAI API

```bash
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

./tns-server
```

### API Usage Examples

```bash
# Login
curl -c cookies.txt -X POST http://localhost:8000/login \
  -d "password=mypassword"

# Start a new game session
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# Send a message and get narrative
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "I draw my sword and face the dragon"}'

# Streaming response (SSE)
curl -b cookies.txt -N http://localhost:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me about this ancient forest"}'

# Search entities
curl -b cookies.txt "http://localhost:8000/api/search?q=dragon"

# Get entity details
curl -b cookies.txt http://localhost:8000/api/entity/uid-character-aragorn

# Get graph neighbors
curl -b cookies.txt "http://localhost:8000/api/neighbors/uid-location-rivendell?depth=2"

# Check probability
curl -b cookies.txt http://localhost:8000/api/probability/aragorn/combat

# List quests
curl -b cookies.txt http://localhost:8000/api/quests
```

### WebSocket Real-Time Roleplay

```javascript
// Connect to roleplay WebSocket
const ws = new WebSocket('ws://localhost:8000/ws/roleplay/session-id');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'message',
    content: 'I enter the tavern and look around'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.narrative); // Real-time narrative stream
};
```

### Docker (Optional)

```bash
# Build image
docker build -t tns .

# Run with Ollama
docker run -p 8000:8000 \
  -e WORLD_LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  -e AUTH_PASSWORD=mypassword \
  tns
```

### Compiling from Source

```bash
# Install Zig (for cross-compiling FFI kernels)
# https://ziglang.org/download/

# Build FFI kernels for current platform
cd mojo/kernels && ./build.sh native

# Build for specific platform
./build.sh aarch64-linux
./build.sh x86_64-windows

# See mojo/kernels/build.sh list for all targets
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/login` | Login page |
| POST | `/login` | Authenticate (form: `password=...`) |
| POST | `/logout` | Clear session |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/setup` | Initialize roleplay session |
| POST | `/api/chat/message` | Send message, get narrative |
| POST | `/api/chat/stream` | SSE streaming response |
| GET | `/api/chat/session` | Current session state |
| GET | `/api/chat/history` | Conversation history |

### Entities & Graph

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/entity/:uid` | Get entity details |
| GET | `/api/neighbors/:uid` | Get neighbors with depth |
| GET | `/api/path` | Find shortest path |
| GET | `/api/search` | Search by name or semantic |
| GET | `/api/graph/summary` | Graph statistics |

### Branches

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/branch/create` | Create branch |
| POST | `/api/branch/switch` | Switch active branch |
| POST | `/api/branch/merge` | Merge into main |
| GET | `/api/branch/list` | List all branches |

### Probability

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/probability/:character/:profile` | Get success chance |
| POST | `/api/probability/modifier` | Apply modifier |
| GET | `/api/probability/modifiers/:entity` | List active modifiers |

### Romance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/romance/:c1/:c2` | Get relationship status |
| POST | `/api/romance/attempt/:action` | Attempt romance action |
| GET | `/api/romance/characters/:char` | List character's romances |

### Quests

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quests` | List all quests |
| GET | `/api/quest/:id` | Get quest details |

### Sessions & Maintenance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | List session histories |
| POST | `/api/maintenance/run` | Run maintenance |
| GET | `/api/maintenance/status` | Maintenance stats |
| POST | `/api/launch` | Start new game |
| POST | `/api/continue` | Resume game |
| GET | `/api/health` | Health check |

### System (Background Processing)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/system/pause` | Pause director loop and LLM queue |
| POST | `/api/system/resume` | Resume director loop and LLM queue |
| GET | `/api/system/status` | Get pause/running status |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agent configs |
| GET | `/api/agents/:id` | Get single agent config |
| PUT | `/api/agents/:id` | Update agent config |
| PUT | `/api/agents/:id/prompts` | Update agent prompts |
| GET | `/api/agents/:id/prompts/:lang` | Get prompts for specific language |
| PUT | `/api/agents/:id/prompts/:lang` | Upsert prompts for specific language |
| POST | `/api/agents/:id/reset` | Reset agent to defaults |
| GET | `/api/agents/providers/options` | Provider/model options |

### i18n Translations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/i18n/translations/:lang/:page` | Get translations for language + page |
| GET | `/api/i18n/translations/:lang` | Get all translations for language |
| PUT | `/api/i18n/translations` | Upsert batch of translations |
| DELETE | `/api/i18n/translations/:lang/:page/:key` | Delete translation key |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Real-time roleplay |
| `ws://host:8000/ws/memory` | Memory event feed |

---

## Project Structure

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod-validated environment config
│   ├── lib/              # LLM client, queue, event bus, history, atomic I/O
│   │   ├── sqlite-store.ts    # SQLite database (entities, embeddings, memories, agent_prompts, ui_translations)
│   │   └── ...
│   ├── memory/           # WorldMemory, FAISS index, cognitive pipeline, scoring
│   ├── middleware/        # Auth, CORS, error handler, logger, rate limiter
│   ├── models/           # Entity, chat, probability, romance, quest, story, memory, archetype, item, npc-stats, rank
│   ├── routes/           # 17 route modules (chat, entities, agents, memory, etc.)
│   │   ├── i18n.ts       # Translation CRUD endpoints
│   │   └── ...
│   ├── services/         # 52 services (roleplay engine, agents, social graph, dialogue, inventory, etc.)
│   │   ├── agent-config.ts   # Agent configuration (SQLite-first + JSON fallback)
│   │   ├── npc-generator.ts  # Intelligent NPC creation with archetypes
│   │   ├── npc-economy.ts    # Feudal economy simulation
│   │   ├── item-evaluation.ts # Item uniqueness and boost evaluation
│   │   ├── social-graph.ts   # Relationships, factions, alliances, feudal hierarchy
│   │   ├── dialogue-manager.ts # NPC conversation sessions and topics
│   │   ├── quest-system.ts   # Quest lifecycle, objectives, rewards, chains
│   │   ├── inventory-manager.ts # Item management, equipment, trading
│   │   └── ...
│   ├── intelligence/     # Graph analyzer, duplicates, recommender, scene generator
│   ├── i18n/             # Language packs (EN, RU, DE, FR, ES, JA, ZH)
│   ├── store/            # EntityStore with O(1) NameIndex
│   ├── utils/            # Logger, hash, time utilities
│   ├── app.ts            # Hono app with middleware chain
│   └── index.ts          # Server entry point
├── mojo/
│   ├── kernels/          # FFI probability + vector kernels
│   └── src/              # 81 Mojo source files (optional performance backend)
├── public/
│   ├── index.html        # Terminal-style web UI
│   ├── agents.html       # Agent configuration (i18n-enabled, fetches from SQLite)
│   ├── providers.html    # LLM provider settings
│   ├── models.html       # Model management
│   └── settings.html     # Global settings (i18n-enabled, fetches from SQLite)
├── worlds/
│   ├── default/          # Active world
│   │   ├── world_frame.json
│   │   ├── entities.json
│   │   ├── agents/       # Per-agent JSON configs (fallback)
│   │   ├── session_history/
│   │   ├── chapters/
│   │   ├── timeline.jsonl
│   │   └── settings.json
├── world_db/             # SQLite database directory
│   ├── tns.db            # Main database (entities, embeddings, memories)
│   └── global/           # Global translations database
│       └── tns.db        # UI translations (agents, settings, agent_names, agent_descs)
├── local-models/         # GGUF models (downloaded locally)
├── tests/
│   ├── entity-store.test.ts
│   ├── probability-engine.test.ts
│   └── integration/
│       └── server.test.ts
├── .env                  # Configuration (git-ignored)
├── .env.example          # Configuration template
├── startgame.sh          # Server + llama-server launcher (with PID cleanup)
├── package.json
├── tsconfig.json
└── plan.md               # Migration plan
```

---

## Configuration

All configuration is via environment variables (`.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `WORLD_LLM_BASE_URL` | – | OpenAI-compatible LLM endpoint |
| `WORLD_LLM_API_KEY` | – | API key |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Model name |
| `WORLD_LLM_TIMEOUT` | `120` | Request timeout (seconds) |
| `WORLD_LLM_MAX_TOKENS` | `4096` | Max tokens per response |
| `WORLD_LLM_TEMPERATURE` | `0.7` | Sampling temperature |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | Max concurrent LLM requests |
| `WORLD_DB_PATH` | `./worlds/default` | Database directory |
| `LOCAL_MODELS_PATH` | `./local-models` | Local GGUF models directory |
| `WORLD_SERVER_HOST` | `0.0.0.0` | Listen address |
| `WORLD_SERVER_PORT` | `8000` | Listen port |
| `AUTH_PASSWORD` | – | Login password (empty = no auth) |
| `MAX_SERVE_URL` | `http://localhost:8000` | Mojo MAX Serve endpoint |

---

## Development

```bash
# Development with hot reload
bun run dev

# Type checking
npx tsc --noEmit

# Run all tests
bun test

# Run specific tests
bun test tests/entity-store.test.ts
bun test tests/probability-engine.test.ts
bun test tests/integration/server.test.ts

# Build for production
bun run build
```

---

## Recent Changes

### Security Hardening (v0.15.0)

Comprehensive security audit and fixes:

| Finding | Fix |
|---------|-----|
| H1: WebSocket auth bypass | Validate session token, not just cookie presence |
| H2: Static file path traversal | Path containment check |
| M2: In-memory sessions | SQLite-backed store with auto-cleanup |
| M3: Missing Secure cookie flag | Added to Set-Cookie |
| M4: Rate limiter IP spoofing | Shared `getClientIp` helper |
| L4: Missing CSRF on login | CSRF token with cookie double-submit |
| L6: World name traversal | Name validation on all routes |

Full report: [security.md](security.md) | Change log: [SECURITY-log.md](SECURITY-log.md)

### C FFI Kernels & Cross-Compilation (v0.14.1)

Ported Mojo compute kernels to C with Zig cross-compilation for 10 platforms:

| Feature | Description |
|---------|-------------|
| **C FFI Kernels** | 5 compute kernels ported from Mojo to pure C (probability, vector, vector_full, batch_ops, graph_ops) |
| **Zig Cross-Compilation** | Single build script compiles for Linux, macOS, Windows, ARM, RISC-V |
| **10 Platform Targets** | aarch64/x86_64 Linux (glibc+musl), macOS, Windows, ARMv7, RISC-V |
| **Distributable Packages** | Each release archive contains binary + FFI .so/.dll + public/ + .env |
| **Pause/Resume** | Director loop and LLM queue pause when user leaves chat view |
| **CI Workflow** | GitHub Actions builds all platforms and creates release automatically |

**New files:**
- `mojo/kernels/c/probability_ffi.c` — Probability kernels (success chance, roll, batch)
- `mojo/kernels/c/vector_ffi.c` — 4-dim vector operations (cosine, L2, dot)
- `mojo/kernels/c/vector_full.c` — Full-dimension vector operations (768-dim)
- `mojo/kernels/c/batch_ops.c` — Batch NPC operations (age decay, vice, tax, loyalty)
- `mojo/kernels/c/graph_ops.c` — Graph traversal, RRF fusion, reputation
- `mojo/kernels/build.sh` — Cross-compilation via Zig
- `mojo/kernels/package.sh` — Creates distributable archives
- `src/routes/system.ts` — Pause/resume API endpoints
- `.github/workflows/build.yaml` — CI build for all platforms

**Modified files:**
- `src/services/director-loop.ts` — Added `pause()`/`resume()` methods
- `src/lib/llm-queue.ts` — Added `pause()`/`resume()` methods
- `src/services/narrative-service.ts` — Added `pause()`/`resume()` delegation
- `public/index.html` — Auto-pause on page leave, auto-resume on page load

### Birth System & Model Catalog (v0.12.0)

Character creation, model catalog expansion, and LLM timeout improvements:

| Feature | Description |
|---------|-------------|
| **Birth Wizard** | Full character creation UI in Worlds tab — hints, age, isekai mode, opening narrative |
| **Engine Bridge** | Birth wizard automatically connects new character to roleplay engine via `/chat/setup` |
| **Model Catalog** | YandexGPT 5 Lite 8B, GigaChat 3.1 10B-A1.8B (MoE), GigaChat 20B-A3B added to downloads |
| **Catalog Always Visible** | Model catalog shows even when backend not installed |
| **LLM Timeout Stack** | Per-call timeout support: `LLMRequestOptions.timeout` flows through client → queue → provider |
| **Birth Timeout 600s** | Birth flow LLM calls use 10-minute timeout (family tree, name, isekai, narrative) |
| **Default Timeout 300s** | Global LLM timeout increased from 120s to 300s for slow local models |
| **i18n Worlds Page** | Full 7-language support (EN/RU/DE/FR/ES/JA/ZH) for Worlds tab + Birth Wizard |

**Modified files:**
- `src/routes/launch.ts` — Returns `initial_location` in launch response
- `src/routes/index.ts` — Wired `initLaunch(narrativeCtx)` (was missing)
- `src/index.ts` — Added `initLaunch` import and call
- `src/services/model-manager.ts` — YandexGPT, GigaChat models in POPULAR_MODELS
- `src/services/birth.ts` — LLM calls use 600s timeout
- `src/lib/llm-client.ts` — Per-call timeout, fallback 300s
- `src/lib/llm-queue.ts` — Timeout propagation through task queue
- `src/lib/providers/llm-provider.ts` — `timeout` field in LLMRequestOptions
- `src/lib/providers/llamacpp-provider.ts` — Uses per-call timeout, default 300s
- `src/lib/providers/openai-provider.ts` — Uses per-call timeout
- `src/lib/providers/google-provider.ts` — Uses per-call timeout
- `src/lib/providers/ollama-provider.ts` — Uses per-call timeout
- `src/lib/providers/anthropic-provider.ts` — Uses per-call timeout
- `src/config/env.ts` — `WORLD_LLM_TIMEOUT` default 120 → 300
- `public/worlds.html` — Birth wizard modal, i18n, NEW GAME buttons
- `public/index.html` — NEW redirects to worlds, session character display

### Mojo Kernel Expansion (v0.11.4)

Major performance expansion of Mojo compute kernels for vector search, NPC batch operations, and graph traversal:

| Feature | Description |
|---------|-------------|
| **Probability Kernel** | Success chance, roll outcome, modifier + batch probability via Mojo FFI |
| **Vector Kernel** | 4-dim cosine similarity, L2 distance, dot product via Mojo FFI |
| **Full-Dimension Vector** | 768-dim BGE-M3 embeddings — batch cosine similarity via Mojo FFI |
| **Batch NPC Operations** | Age decay, vice decay, tax, wealth sum, loyalty checks via Mojo FFI |
| **Graph Operations** | RRF fusion, relationship strength, reputation computation via Mojo FFI |
| **SQLite Acceleration** | searchDense/searchMemoriesDense use batch cosine similarity |

**New files:**
- `mojo/kernels/vector_full.mojo` — Full-dimension vector operations (cosine, L2, dot, batch)
- `mojo/kernels/batch_ops.mojo` — Batch NPC stat operations (age decay, vice, tax, loyalty)
- `mojo/kernels/graph_ops.mojo` — Graph traversal and RRF fusion
- `src/lib/mojo-ffi.test.ts` — 19 tests covering all Mojo FFI bindings

**Modified files:**
- `mojo/kernels/probability_ffi.mojo` — Added batch_success_chance and batch_roll
- `src/lib/mojo-ffi.ts` — 5 kernel bindings with TypeScript fallbacks
- `src/lib/vector-ops.ts` — Uses Mojo-accelerated cosineSimilarity
- `src/lib/sqlite-store.ts` — searchDense/searchMemoriesDense use batchCosineSimilarity
- `build.sh` — Compiles all 5 kernels (probability, vector_4dim, vector_full, batch_ops, graph_ops)

**Performance (ms per 1000 iterations):**

| Operation | Python | NumPy | TS | TS+SQLite | Mojo | Mojo vs TS |
|-----------|--------|-------|-----|-----------|------|------------|
| cosine (768-dim) | 3.6 | 4.8 | 5.2 | - | **1.5** | **3.5x** |
| batch_cosine (100×768) | 35.6 | 6.1 | 27.4 | 105.4 | **14.0** | **2.0x** |
| age_decay (100 NPCs) | 75.6 | 21.5 | 1.8 | - | **1.6** | 1.1x |
| rrf_fusion (100×3) | 706.1 | 10.4 | 2.5 | - | **2.2** | 1.1x |
| reputation (500 rels) | 41.9 | - | 5.1 | - | **3.1** | **1.6x** |

Mojo kernels use `abi("c")` + `UnsafePointer` FFI with TypeScript fallbacks. All functions have zero-overhead TS fallbacks when `.so` is unavailable.

### Social & Political Systems (v0.11.0)

New social simulation, dialogue, quest, and inventory systems:

| Feature | Description |
|---------|-------------|
| **Feudal Hierarchy in SocialGraph** | Sworn fealty, lords/vassals, chain of command, loyalty, rebellion |
| **Faction System** | 6 faction types (military/economic/religious/criminal/noble/neutral), leaders, influence, treasury |
| **Political Alliances** | 5 alliance types (military/trade/defensive/non_aggression/vassal), betrayal, reputation |
| **NPC Dialogue** | Session management, 11 topic categories, contextual greetings/farewells, mood-driven |
| **Quest System** | 5 quest types, 7 objective types, rewards, prerequisites, time limits, chains |
| **Inventory System** | Item rarity (5 tiers), equipment slots, weight/capacity, gold, trading |
| **NPC Relationships** | Friend/enemy/neutral/romantic/rival/mentor with strength tracking |

**New files:**
- `src/services/social-graph.ts` — Relationships, factions, alliances, feudal hierarchy
- `src/services/dialogue-manager.ts` — NPC conversation sessions and topics
- `src/services/quest-system.ts` — Quest lifecycle, objectives, rewards, chains
- `src/services/inventory-manager.ts` — Item management, equipment, trading

### NPC Economy System (v0.10.3)

Full feudal economy simulation with living NPCs:

| Feature | Description |
|---------|-------------|
| **Feudal Hierarchy** | 10 ranks: Slave → Commoner → Baronet → Baron → Viscount → Count → Marquis → Duke → King → Emperor |
| **NPC Stats** | 6 stats: wealth, power, popularity, health, experience, intrigue |
| **Tax System** | Hierarchical taxes: 0% (Emperor) → 90% (Commoner), reduced by power/popularity |
| **Bribe Mechanics** | Risk-based bribes: 10% base + amount/witnesses, betrayal threshold |
| **Food Economy** | Slaves produce 300-1000 food/month, all consume by rank |
| **Family System** | 50% income to wife, 10% to children, inheritance on death |
| **Vices & Degradation** | 8 vices affecting stats, age-based health decay |
| **34 Archetypes** | 22 default + 12 unique, weighted-random selection, context groups |
| **Power Loss** | Rebellion → death/slavery, War → ransom/slavery, Bankruptcy → slavery |
| **Item Boosts** | Unique items give permanent stat boosts (1-10%), evaluated by Historian/Researcher |

**New files:**
- `src/models/npc-stats.ts` — NPCStats, Vices, FamilyExpenses
- `src/models/rank.ts` — Feudal hierarchy (10 ranks)
- `src/models/archetype.ts` — 34 archetypes with weights
- `src/models/item.ts` — Item, ItemBoost
- `src/services/npc-generator.ts` — Intelligent NPC creation with archetype selection
- `src/services/npc-economy.ts` — Core economy logic
- `src/services/npc-economy-runtime.ts` — Turn-based simulation
- `src/services/slave-economy.ts` — Slave trade mechanics
- `src/services/item-evaluation.ts` — Item uniqueness evaluation

### SQLite Storage for Prompts & Translations (v0.10.3)
Agent prompts and UI translations now stored in SQLite per world + language:

- **`agent_prompts` table** — stores `systemPrompt`, `userTemplate`, `outputFormat` per world + language
- **`ui_translations` table** — stores UI strings per language + page (agents, settings, agent_names, agent_descs)
- **Dual-write strategy** — writes go to both SQLite and JSON files for backward compatibility
- **Language-aware prompts** — each world can have its own language setting, affecting which prompts are loaded
- **Auto-seeding** — on first startup, all 7 languages are seeded into `ui_translations`

**Storage hierarchy:**
1. **SQLite** (`tns.db`) — primary storage, per world + language
2. **JSON files** (`worlds/{world}/agents/{agentId}.json`) — fallback during migration
3. **Hardcoded defaults** (`DEFAULT_PROMPTS` in `src/services/agent-config.ts`)

### i18n API Endpoints
New REST API for translation management:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/i18n/translations/:lang/:page` | Get translations for language + page |
| GET | `/api/i18n/translations/:lang` | Get all translations for language |
| PUT | `/api/i18n/translations` | Upsert batch of translations |
| DELETE | `/api/i18n/translations/:lang/:page/:key` | Delete translation key |

**Example request (PUT):**
```json
{
  "language": "ru",
  "page": "agents",
  "entries": {
    "title": "Настройки агентов",
    "savePrompts": "Сохранить промпты"
  }
}
```

### Language-Aware Agent Prompts
Agent prompts now support per-world, per-language storage:

```sql
CREATE TABLE agent_prompts (
  world TEXT NOT NULL DEFAULT 'default',
  agent_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  system_prompt TEXT NOT NULL DEFAULT '',
  user_template TEXT NOT NULL DEFAULT '',
  output_format TEXT NOT NULL DEFAULT '',
  UNIQUE(world, agent_id, language)
);
```

**API endpoints for language-specific prompts:**
- `GET /api/agents/:id/prompts/:lang` — get prompts for specific language
- `PUT /api/agents/:id/prompts/:lang` — upsert prompts for specific language

### Frontend i18n Integration
Frontend pages now fetch translations from SQLite via API:

```javascript
// agents.html
async function loadTranslations(langCode) {
  const res = await fetch(`/api/i18n/translations/${langCode}/agents`);
  const data = await res.json();
  remoteTranslations = data.translations || {};
}

function t(key) {
  if (remoteTranslations[key] !== undefined) return remoteTranslations[key];
  return I18N[lang]?.[key] ?? I18N.en[key] ?? key;
}
```

### New Specialized Agents (v0.10.3)
Five new agents for world enrichment and player interaction:

- **Historian** — recalls and narrates historical events, lore, and chronology
- **Cartographer** — provides information about locations, distances, paths, and geography
- **Merchant** — handles trading, pricing, and NPC inventory management
- **Quest Giver** — generates contextual quests based on world state with objectives and rewards
- **Lorekeeper** — maintains world facts, magic rules, race information, and established canon

Each agent has its own system prompt, user template, and output format configured in `src/services/agent-config.ts`.

### RAG System for All Agents (v0.10.3)
Full embedding support with long-term memory for every agent:

- **llama.cpp Embedding Server** — dedicated BGE-M3 model on port 5002 for vector generation
- **SQLite Hybrid Search** — FTS5 keyword search + dense vector search + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — per-agent, per-session memory isolation via `role` column
- **World-Scoped Memory** — memory is isolated per world to prevent cross-world hallucinations
- **Mojo Graph Operations** — vector operations via Mojo FFI for performance (cosine similarity, L2 distance)

**Architecture:**
```
Agent Request → AgentMemoryStore → SQLite (hybrid search)
                                      ↓
                              ┌───────┴───────┐
                              │ FTS5 (LIKE)   │ Dense Vectors (BGE-M3)
                              │ Keyword Match │ Cosine Similarity
                              └───────┬───────┘
                                      ↓
                              Reciprocal Rank Fusion (RRF)
                                      ↓
                              Context for LLM Prompt
```

**Key files:**
- `src/lib/agent-memory-store.ts` — AgentMemoryStore with embedding integration
- `src/lib/sqlite-store.ts` — SQLiteStore with FTS5 + vector search + RRF
- `src/lib/vector-ops.ts` — Vector operations (cosine, L2, dot product)

### NPC System Overhaul (v0.10.3)
Four new services for smarter NPC behavior:

- **MemoryEngine** — semantic search, emotion/location filtering, memory clustering over NPC episodic memories
- **BehaviorEngine** — autonomous actions, goal evaluation, daily routines, mood adaptation, decision making
- **SocialGraph** — relationship tracking, reputation scores, mutual friends, faction membership and conflicts
- **DialogueContext** — enriched NPC prompts combining relationship, memory, mood, location, faction, goals, and inventory context

**Architecture:** Two parallel tracks — Track 1 (Memory + Behavior) builds the foundation, Track 2 (Social + Dialogue) adds user-facing features.

**Integration:** `NPCAgent.initialize(runtime, statePath)` creates all four components. Falls back to template/PromptBuilder when DialogueContext not initialized.

### ResearcherAgent (v0.10.3)
New agent for fact-checking and realism validation:
- **`verifyRecipe()`** — validates crafter recipes for plausibility
- **`researchTopic()`** — historical/cultural research for world-building
- **`validateCharacter()`** — checks character clothing, food, daily life
- **`enrichScene()`** — adds grounded sensory details to scenes
- **`factCheck()`** — general fact verification

### i18n System
Full localization support for 7 languages (EN, RU, DE, FR, ES, JA, ZH):
- All agent prompts and UI strings
- Agent names and descriptions
- Settings pages (agents, providers, models)
- Server start/stop messages

**Structure** — each language is a separate file under `src/i18n/`:

```
src/i18n/
├── types.ts    # LanguagePack interface + Language type
├── en.ts       # English (base pack — all keys defined here)
├── ru.ts       # Russian (extends EN, overrides translations)
├── de.ts       # German
├── fr.ts       # French
├── es.ts       # Spanish
├── ja.ts       # Japanese
├── zh.ts       # Chinese
└── index.ts    # Barrel export, registry, getLanguagePack()
```

**Adding a new language** (e.g. Korean):

1. Create `src/i18n/ko.ts`:
```ts
import { EN } from "./en";
import type { LanguagePack } from "./types";

export const KO: LanguagePack = {
  ...EN,
  code: "ko",
  name: "Korean",
  nativeName: "한국어",
  systemPrompt: "한국어로만 답변하세요.",
  uiSettings: "설정",
  // ... override other keys
};
```

2. Register in `src/i18n/index.ts`:
```ts
import { KO } from "./ko";
// add to Language type: "ko"
// add to PACKS: ko: KO
// add to LANGUAGES array
```

3. Add `"ko"` to the `Language` union in `src/i18n/types.ts`.

**Usage in code:**
```ts
import { t, getLanguagePack, setLanguage } from "../i18n";

const lang = t();                  // current language pack
const ru = getLanguagePack("ru");  // specific pack
setLanguage("de");                 // switch active language
```

### Server Improvements
- **PID file tracking** (`.server.pid`) — prevents orphaned processes
- **Stale process cleanup** — auto-kills leftovers on restart
- **Graceful shutdown** — 5-second SIGTERM timeout, then SIGKILL fallback

---

## Testing

The test suite includes:

- **Unit tests**: Entity store CRUD, probability engine calculations
- **Integration tests**: Full HTTP API flow, auth, WebSocket

```bash
# Start server (required for integration tests)
bun run dev &

# Run tests
bun test

# Expected output: 355 passing
```

---

## Migration from Python

This project is a TypeScript + Mojo port of [BRING](https://github.com/Eva-E1/BRING) — a Python AI-powered fantasy world platform. Key changes:

| Component | Python | TypeScript |
|-----------|--------|------------|
| Web framework | FastAPI | Hono (Bun) |
| Runtime | Python asyncio | Bun native async |
| Validation | Pydantic | Zod |
| Logging | Python logging | Lightweight logger (pino replacement) |
| Graph | NetworkX | Custom adjacency map |
| Vector search | FAISS (Python) | Mojo FFI + local cosine fallback |
| WebSocket | FastAPI WebSocket | Bun native WebSocket |
| Auth | None | Cookie-based session |
| Streaming | SSE (starlette) | ReadableStream + SSE |

---

## Disclaimer

This project was developed using **vibe coding** — an AI-assisted development approach powered by [MiMo Code](https://github.com/XiaomiMiMo/MiMo). The codebase was generated through human-AI collaboration, which means:

- The code is **functional and tested** — all features work as described
- Some areas may contain **suboptimal patterns** or could benefit from refactoring
- There may be **minor inconsistencies** in code style across different modules
- The architecture and logic are **human-reviewed and validated**

If you find areas for improvement, contributions are welcome.

---

## License

Apache 2.0
