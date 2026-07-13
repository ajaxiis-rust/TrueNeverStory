# TrueNeverStory v0.25.0

### Write your book just by playing.

TrueNeverStory is an AI-powered interactive narrative engine with **State-First architecture**. Every NPC remembers, every action has a deterministic outcome, and the story never stops. Play a character, explore a living world, and watch your choices shape the narrative — or let the world evolve on its own.

Built on TypeScript (Bun + Hono) with C FFI compute kernels for performance-critical operations.

**[Русский](README.ru.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Español](README.es.md) | [日本語](README.ja.md) | [中文](README.zh.md)**

---

## What's New in v0.25.0

### State-First Pipeline
The engine now processes actions **deterministically before generating text**:
1. **Intent Parser** — Zod-validated structured intents replace regex routing
2. **Simulation Engine** — Mojo FFI computes outcomes before prose generation
3. **State Mutator** — EntityStore updates immediately after logic
4. **Context Builder** — Shared game context for all agents
5. **Prose Generation** — LLM generates text constrained by simulation results

### MCP Integration (Literature-as-Code)
- **Bible as stdlib** — Biblical patterns as narrative archetypes (SQLite + MCP)
- **Gutenberg as Style CSS** — Delexified stylistic patterns for prose rendering
- **Wikipedia as Validator** — Historical fact-checking via external knowledge

### The Big Six Agents
Consolidated 14 agents into 6 specialized roles:

| Agent | Role | Description |
|-------|------|-------------|
| **Dramaturg** | The Architect | Selects narrative patterns from Bible archetypes |
| **Validator** | The Fact-Checker | Verifies facts via Wikipedia MCP |
| **Stylist** | The Narrator | Renders prose using Gutenberg style patterns |
| **Actor** | NPC Ensemble | Manages NPC dialogue with L3 hidden motivations |
| **Censor** | Linter | Removes AI clichés and enforces style consistency |
| **Chronicler** | World Memory | Updates timeline and world state |

### System Heartbeat
Real-time progress indicators in chat UI:
- "Understanding your input..."
- "Rolling dice..."
- "Outcome: Success (73%)"
- "Weaving narrative..."
- "Complete"

### Interlingua (English as Internal Language)
All agent-to-agent and agent-to-MCP operations use English for token efficiency and accuracy. Translation happens at the output boundary.

---

## Features

| Feature | Description |
|---------|-------------|
| **State-First Pipeline** | Deterministic simulation → state mutation → constrained prose generation |
| **6 AI Agents** | Dramaturg, Validator, Stylist, Actor, Censor, Chronicler |
| **MCP Integration** | Bible patterns, Gutenberg styles, Wikipedia validation |
| **Living World** | Characters, locations, items, factions — all connected in a knowledge graph with O(1) lookups |
| **Memory & RAG** | Vector-accelerated memory with semantic search (BGE-M3 + SQLite hybrid FTS5/dense/RRF) |
| **Probability System** | Deterministic outcomes for combat, persuasion, stealth, romance — dynamic modifiers, critical hits |
| **Romance & Social** | Full relationship management, factions, alliances, feudal hierarchy, NPC dialogue |
| **Quest System** | Dynamic quest generation, objectives, rewards, chains, time limits |
| **Inventory & Trading** | Items with rarity, stats, equipment, gold, NPC trading |
| **NPC Economy** | Feudal hierarchy (10 ranks), taxes, food production, family system, 34 archetypes |
| **Rules Engine** | 14 predefined social/economic systems (feudalism, democracy, anarchy, etc.) with synergy matrix |
| **Multi-World** | Isolated world execution with resource monitoring (memory, CPU, tokens) |
| **Cross-World** | Event communication between worlds with portals and shared memory |
| **Plugin System** | Extensible architecture with plugin manager, lifecycle hooks, and API |
| **Feature Flags** | A/B testing, gradual rollout, hash-based percentage targeting |
| **API Versioning** | v1/v2 endpoints with deprecation headers |
| **Real-Time Streaming** | WebSocket + SSE for live narrative delivery with heartbeat progress |
| **i18n (7 languages)** | EN, RU, DE, FR, ES, JA, ZH — UI, prompts, agent names |
| **Password Auth** | Session-based with HttpOnly cookies, CSRF protection, SQLite-backed sessions |
| **SQLite Storage** | Entities, embeddings, memories, prompts, translations — all in SQLite |
| **Circuit Breaker** | Automatic LLM provider failover with fallback chain |
| **Structured Logging** | Trace IDs, correlation IDs, metrics for debugging multi-agent workflows |

---

## Supported Platforms

| Platform | Status | Notes |
|----------|:------:|-------|
| Linux x86_64 | ✅ | Full support, FFI kernels |
| Linux ARM64 | ✅ | Full support, FFI kernels |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

Server automatically detects FFI kernels — falls back to pure TypeScript if unavailable.

---

## Quick Start

**No Bun, Node.js, or any runtime required.** Just download and run.

### 1. Download

Get the latest release for your platform from [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Platform | File |
|----------|------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Run

The launcher auto-detects your LLM provider (Ollama, LM Studio, OpenAI, llama.cpp), configures `.env`, and starts the server.

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x startgame.sh
./startgame.sh

# Windows (PowerShell)
# Extract tns-windows-x64.zip, then:
.\startgame.ps1
```

**Launch options:**
```bash
./startgame.sh --local    # CORS=localhost only (safe for dev)
./startgame.sh --remote   # CORS=* (default, allows external access)
```

**From source (requires Bun):**
```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
./startgame.sh            # Linux/macOS
.\startgame.ps1           # Windows PowerShell
```

### 3. Open

Go to **http://localhost:8000** — password: **`changeme`**

Change the password in Settings after first login.

That's it. No database setup, no package installation, no configuration files to edit.

---

## Configure LLM

Open **Settings** page or edit `.env`:

### Ollama (local, free)

```bash
ollama pull llama3
ollama serve
```

```
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
```

### OpenAI

```
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
```

### LM Studio

```
WORLD_LLM_BASE_URL=http://localhost:1234/v1
WORLD_LLM_API_KEY=lm-studio
WORLD_LLM_MODEL=your-model
```

Also works with vLLM, Anthropic, Google, and any OpenAI-compatible API.

---

## Project Structure

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod-validated environment config
│   ├── lib/              # LLM client, SQLite store, vector ops, session store, circuit breaker, feature flags
│   ├── memory/           # WorldMemory, cognitive pipeline, entity extraction
│   ├── middleware/        # Auth, rate limiter, security headers, CORS, logger
│   ├── models/           # Entity, chat, probability, romance, quest, item, intent, simulation, heartbeat
│   ├── mcp/              # MCP server, Bible/Gutenberg parsers, Wikipedia tools
│   ├── plugins/          # Plugin interface and manager
│   ├── routes/           # API routes (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # Social/economic rules engine (14 rules, synergy matrix, tech deps)
│   ├── services/         # 60+ services (roleplay engine, agents, economy, world isolator, cross-world bus)
│   │   ├── agents/       # v0.25.0 new agents (Dramaturg, Validator, Stylist, Actor, Censor, Chronicler)
│   │   └── ...
│   ├── intelligence/     # Graph analyzer, duplicate detector, recommender
│   ├── i18n/             # Language packs (7 languages)
│   ├── store/            # EntityStore with O(1) NameIndex, WorldStore
│   └── utils/            # Logger, hash, sanitize, template resolver
├── mojo/kernels/         # C FFI compute kernels (compiled via Zig)
├── public/               # Web UI (terminal-style dark interface with heartbeat progress)
├── worlds/               # World data (SQLite DB, entities, sessions)
├── conf/                 # Configuration (settings, agents, providers, registry)
└── tests/                # Test suite
```

---

## Architecture: State-First Pipeline

```
Player Input
  │
  ▼
Intent Parser (Zod validation)
  │
  ▼
Simulation Engine (Mojo FFI)
  │ outcome, probability, stateChanges
  ▼
State Mutator (EntityStore L1-L3)
  │
  ▼
Context Builder (shared game state)
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
Translation Service (English → user language)
  │
  ▼
Response to User
```

---

## API Overview

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/login` | Login page |
| POST | `/login` | Authenticate (`password=...`) |
| POST | `/logout` | Clear session |

### Chat & Roleplay

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/setup` | Initialize session (character, location, role) |
| POST | `/api/chat/message` | Send message, get narrative |
| POST | `/api/chat/stream` | SSE streaming response with heartbeat |
| GET | `/api/chat/session` | Current session state |
| GET | `/api/chat/history` | Conversation history |

### Entities & Graph

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/entity/:uid` | Get entity details |
| GET | `/api/neighbors/:uid` | Neighbors with depth traversal |
| GET | `/api/path?source=&target=` | Shortest path between entities |
| GET | `/api/search?q=` | Search by name or semantic |
| GET | `/api/graph/summary` | Graph statistics |

### Agents & i18n

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List agent configs |
| PUT | `/api/agents/:id` | Update agent config |
| PUT | `/api/agents/:id/prompts/:lang` | Update agent prompts per language |
| GET | `/api/i18n/translations/:lang/:page` | Get UI translations |
| PUT | `/api/i18n/translations` | Upsert translations |

### Rules Engine

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rules` | List available rules |
| GET | `/api/rules/:id` | Get rule details |
| POST | `/api/rules/validate` | Validate rule JSON |

### Cross-World

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cross-world/status` | Cross-world communication status |
| POST | `/api/cross-world/enable` | Enable cross-world |
| POST | `/api/cross-world/disable` | Disable cross-world |
| GET | `/api/cross-world/portals` | List portals |
| POST | `/api/cross-world/portals` | Create portal |
| DELETE | `/api/cross-world/portals/:id` | Destroy portal |
| GET | `/api/cross-world/events` | Event log |

### Plugins

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plugins` | List registered plugins |
| GET | `/api/plugins/:id` | Get plugin details |
| GET | `/api/plugins/:id/capabilities` | Get plugin capabilities |

### Feature Flags

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/feature-flags` | List feature flags |
| PUT | `/api/feature-flags/:id` | Update feature flag |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/system/pause` | Pause background processing |
| POST | `/api/system/resume` | Resume background processing |
| GET | `/api/health` | Health check |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://host:8000/ws/roleplay/:sessionId` | Real-time roleplay streaming with heartbeat |

---

## Examples

### API Usage

```bash
# Login
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# Setup session
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# Send message
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "I draw my sword and face the dragon"}'

# Search entities
curl -b cookies.txt "http://localhost:8000/api/search?q=dragon"

# List available rules
curl -b cookies.txt "http://localhost:8000/api/rules"

# Create cross-world portal
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

### SSE Streaming with Heartbeat

```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: 'I explore the ancient ruins' }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));
    
    if (event.type === 'heartbeat') {
      console.log(`Progress: ${event.message} (${event.progress * 100}%)`);
    } else if (event.type === 'chunk') {
      process.stdout.write(event.content);
    }
  }
}
```

---

## For Developers

Full architecture docs, DI container reference, and contribution guide: [DEV.README.md](docs/DEV.README.md)

### Prerequisites

- [Bun](https://bun.sh) v1.0+

### Setup

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

Open http://localhost:8000

### Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Development with hot reload |
| `bun run start` | Production mode |
| `bun run lint` | Type checking |
| `bun test` | Run test suite |
| `bun run build` | Build bundle |

---

## Building Binary Releases

Cross-compilation via Zig for all platforms:

```bash
cd mojo/kernels
./build.sh native           # Current platform
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # All targets
```

Compile server binary:

```bash
bun build --compile --outfile tns-server src/index.ts
```

See [COMPILE.md](docs/COMPILE.md) for details. GitHub Actions builds all platforms automatically on tag push.

---

## Recent Changes

### v0.25.0 — State-First Architecture

**Core Engine Refactoring:**
- Intent Parser with Zod schemas (6 intent types: movement, dialogue, action, command, observation, meta)
- Simulation Engine with Mojo FFI deterministic outcomes
- State Mutator for immediate EntityStore updates
- Context Builder for shared game state
- Refactored RoleplayEngine as thin orchestrator

**MCP Integration:**
- TNS MCP Server with Bible, Gutenberg, and Wikipedia tools
- Bible Parser for external SQLite databases with FTS search
- Gutenberg Parser with style extraction and delexification
- Wikipedia Validator for historical fact-checking

**Agent Consolidation:**
- 14 agents → 6 specialized roles (Dramaturg, Validator, Stylist, Actor, Censor, Chronicler)
- AgentRegistryV2 for lifecycle management
- MCP tools integration for each agent

**System Heartbeat:**
- Real-time progress indicators via SSE
- HeartbeatUI frontend component
- Progress bar with stage messages

**Interlingua:**
- English as internal language for all operations
- TranslationService at output boundary

**Bug Fixes:**
- Fixed all TypeScript errors (0 errors)
- Fixed SQLite query parameter types
- Fixed LLMQueue signature mismatches

### v0.22.2 — Theme Builder

- Standalone theme builder page at `/theme-builder`
- 8 preset themes: Dracula, Nord, Monokai, Solarized, Gruvbox, Tokyo Night, One Dark, Catppuccin
- Color picker controls for 14 CSS variables (backgrounds, borders, text, accents)
- Font selectors for mono, body, and display fonts
- Live preview panel with all UI components
- Export/import themes as JSON files
- Navigation link from settings page

### v0.22.2 — Theme System Fix

- Fixed `theme-custom.css` — corrected CSS variable syntax (was using `var()` instead of `--name: value`)
- Added missing `--accent-subtle`, `--success-subtle`, `--warning-subtle`, `--interactive-subtle` variables to custom theme
- All 5 themes (Dark, Light, Terminal, Cyberpunk, Custom) now work correctly via selector buttons

### v0.20.4 — World Graph Fix + Statistics Modal + Language Injection + Themes

- Fixed dead `buildRelationships()` — auto-builds heuristic relationships at startup
- Added `GET /api/worlds/:name/detail` endpoint for world statistics
- New world statistics modal with entity lists, rules, and character details
- Language instruction injection — LLM responses match UI language (7 languages)
- Theme system — 5 built-in themes (Dark, Light, Terminal, Cyberpunk, Custom) + constructor

### v0.20.1 — Rules Engine Binary Fix

- Fixed `/api/rules` endpoint crash in compiled Bun binary
- Changed `import.meta.dir` to `process.cwd()` for rules directory resolution
- Resolves ENOENT error (`/$bunfs/root/../rules/social`) in compiled binary

---

## License

MIT
