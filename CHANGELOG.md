# Changelog

## v0.14.1 (2026-07-04)

### C FFI Kernels & Cross-Compilation

Ported Mojo compute kernels to pure C with Zig cross-compilation for 10 platforms.

**New:**
- 5 C kernel files: probability, vector, vector_full, batch_ops, graph_ops
- Zig cross-compilation for Linux (glibc+musl), macOS, Windows, ARM, RISC-V
- `build.sh` — single script for all targets
- `package.sh` — creates distributable archives
- GitHub Actions CI builds all platforms automatically

**Improved:**
- Windows fully supported via C FFI (no more TypeScript fallback only)
- Release archives include binary + FFI + public/ + .env — extract and run

### Pause/Resume Background Processing

Director loop and LLM queue now pause when user leaves chat view.

**New:**
- `POST /api/system/pause` — pauses director loop and LLM queue
- `POST /api/system/resume` — resumes director loop and LLM queue
- `GET /api/system/status` — returns pause/running state
- Auto-pause on page leave, auto-resume on page load

**Why:** Saves LLM API calls and CPU when user is on settings/models/agents pages.

---

## v0.14.0 (2026-07-03)

### Release Pipeline

- GitHub Actions workflow for automated builds
- 10 platform targets in single CI run
- Release archives with everything included

---

## v0.12.0 (2026-06-28)

### Birth System & Model Catalog

**New:**
- Birth Wizard — full character creation UI in Worlds tab
- Engine Bridge — birth wizard connects to roleplay engine via `/chat/setup`
- Model Catalog — YandexGPT 5 Lite, GigaChat 3.1/20B added
- LLM timeout support: per-call timeout flows through client → queue → provider
- Birth flow uses 600s timeout, global default 300s

**i18n:**
- Full 7-language support for Worlds tab + Birth Wizard

---

## v0.11.4 (2026-06-20)

### Mojo Kernel Expansion

**New:**
- Probability kernel — batch_success_chance, batch_roll
- Vector kernel — 4-dim cosine, L2, dot product
- Full-dimension vector — 768-dim batch cosine similarity
- Batch NPC ops — age decay, vice decay, tax, loyalty checks
- Graph ops — RRF fusion, relationship strength, reputation

**Performance:**
- cosine (768-dim): 3.5x faster than TypeScript
- batch_cosine (100x768): 2.0x faster than TypeScript

---

## v0.11.0 (2026-06-15)

### Social & Political Systems

**New:**
- Feudal hierarchy — 10 ranks, sworn fealty, lords/vassals
- Faction system — 6 types, leaders, influence, treasury
- Political alliances — 5 types, betrayal, reputation
- NPC dialogue — session management, 11 topic categories
- Quest system — 5 types, 7 objective types, rewards, chains
- Inventory — rarity, equipment slots, weight, gold, trading

---

## v0.10.3 (2026-06-10)

### NPC Economy & Intelligence

**New:**
- NPC Economy — feudal hierarchy, taxes, bribes, food, family, vices
- NPC Generator — 34 archetypes, weighted-random selection
- Social Graph — relationships, factions, alliances, feudal hierarchy
- Dialogue Manager — NPC conversation sessions and topics
- Quest System — quest lifecycle, objectives, rewards, chains
- Inventory Manager — item management, equipment, trading
- Item Evaluation — uniqueness and boost evaluation

### SQLite Storage

- Agent prompts stored in SQLite per world + language
- UI translations stored in SQLite per language + page
- Dual-write: SQLite + JSON fallback

### RAG System

- llama.cpp embedding server (BGE-M3)
- SQLite hybrid search: FTS5 + dense vectors + RRF
- Per-agent, per-session memory isolation

### Specialized Agents

- Historian, Cartographer, Merchant, Quest Giver, Lorekeeper

### i18n

- 7 languages: EN, RU, DE, FR, ES, JA, ZH
- Agent prompts, UI strings, settings pages

---

## v0.10.0 (2026-05-15)

### Initial TypeScript Release

- Migrated from Python (BRING) to TypeScript + Bun
- Web server, API, WebSocket, SSE streaming
- Entity store with O(1) lookups
- Graph-first knowledge base
- Self-optimizing memory with cognitive pipeline
- Probability system with dynamic modifiers
- Romance system with probability-driven actions
- Living Director for background narrative
- 14 specialized agents
- Password authentication
- Terminal-style web UI
