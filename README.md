# TrueNeverStory v0.22.1

### Write your book just by playing.

TrueNeverStory is an AI-powered interactive narrative engine. Every NPC remembers, every action has a chance, and the story never stops. Play a character, explore a living world, and watch your choices shape the narrative — or let the world evolve on its own.

Built on TypeScript (Bun + Hono) with C FFI compute kernels for performance-critical operations.

**[Русский](README.ru.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Español](README.es.md) | [日本語](README.ja.md) | [中文](README.zh.md)**

---

## Features

| Feature | Description |
|---------|-------------|
| **Living World** | Characters, locations, items, factions — all connected in a knowledge graph with O(1) lookups |
| **14 AI Agents** | Narrator, Director, NPC, Scene, Chronicler, Story Planner, Villain, Researcher, Historian, Cartographer, Merchant, Quest Giver, Lorekeeper, Social Sim |
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
| **Real-Time Streaming** | WebSocket + SSE for live narrative delivery |
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

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x tns-server
./tns-server

# Windows
# Extract tns-windows-x64.zip, then:
tns-server.exe
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
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── plugins/          # Plugin interface and manager
│   ├── routes/           # API routes (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # Social/economic rules engine (14 rules, synergy matrix, tech deps)
│   ├── services/         # 55+ services (roleplay engine, agents, economy, world isolator, cross-world bus)
│   ├── intelligence/     # Graph analyzer, duplicate detector, recommender
│   ├── i18n/             # Language packs (7 languages)
│   ├── store/            # EntityStore with O(1) NameIndex, WorldStore
│   └── utils/            # Logger, hash, sanitize, template resolver
├── mojo/kernels/         # C FFI compute kernels (compiled via Zig)
├── public/               # Web UI (terminal-style dark interface)
├── worlds/               # World data (SQLite DB, entities, sessions)
├── conf/                 # Configuration (settings, agents, providers, registry)
└── tests/                # Test suite
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
| POST | `/api/chat/stream` | SSE streaming response |
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
| `ws://host:8000/ws/roleplay/:sessionId` | Real-time roleplay streaming |

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

### WebSocket Streaming

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/roleplay/session-id');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'message',
    content: 'I enter the tavern and look around'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.narrative);
};
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

### v0.22.1 — Theme Builder

- Standalone theme builder page at `/theme-builder`
- 8 preset themes: Dracula, Nord, Monokai, Solarized, Gruvbox, Tokyo Night, One Dark, Catppuccin
- Color picker controls for 14 CSS variables (backgrounds, borders, text, accents)
- Font selectors for mono, body, and display fonts
- Live preview panel with all UI components
- Export/import themes as JSON files
- Navigation link from settings page

### v0.22.1 — Theme System Fix

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
- Affects `src/routes/rules.ts` and `src/rules/rules-engine.ts`

### v0.20.0 — Architectural Improvements

Complete architectural overhaul with 5 etapes of improvements:

**Etape 1-2:**
- NarrativeService split (Bootstrapper + Facade + Service)
- Unified Agent Model with interface and base class
- Event Sourcing with domain events and snapshots
- Circuit Breaker for LLM with automatic failover
- Agent Registry with 4 source types (builtin, config, api, plugin)
- Structured Logging with trace IDs and correlation

**Etape 3:**
- Social Rules Engine — 14 predefined systems (feudalism, democracy, anarchy, etc.)
- Synergy Matrix, Tech Dependencies, Happiness Modifiers
- Rule Validator and Cultural Drift modeling
- Feature Flags with A/B testing and gradual rollout
- API Versioning (v1/v2) with deprecation headers
- WorldStore — SQLite migration for world data

**Etape 4:**
- Multi-World Isolation with resource monitoring
- Cross-World Communication with portals and events
- Plugin System with manager and lifecycle hooks

**Etape 5:**
- Documentation updates (ARCHITECTURE, API, PLUGIN-GUIDE, MIGRATION)

→ [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | [MIGRATION.md](docs/MIGRATION.md)

### v0.15.0 — Security Hardening

- SQLite-backed sessions (survive restarts)
- WebSocket auth token validation
- Path traversal protection (static files, world names, chapters)
- CSRF protection on login
- Secure cookie flag, hardened CSP
- Error messages sanitized

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

### v0.14.1 — C FFI Kernels & Cross-Compilation

- 5 compute kernels ported from Mojo to pure C
- Zig cross-compilation for 10 platforms
- Pause/resume background processing
- GitHub Actions CI/CD

---

## License

---

🔗 **Project:** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
