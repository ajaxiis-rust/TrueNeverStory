# Changelog

## v0.22.2 (2026-07-08)

### Birth Tab in World Config

New "Birth" tab in `/worlds/:name/config` page with full birth wizard form: Character Name, Hints, Starting Age, Isekai Mode. Creates hero directly from the world config page.

### Cross-Platform Launch Scripts

- `startgame.ps1` — new PowerShell launcher for Windows with auto-detection of Ollama/LM Studio/vLLM/OpenAI
- `startgame.sh` updated for macOS (sysctl, lsof, ipconfig fallbacks)
- Release archives now contain platform-specific scripts: `.sh` for Linux/macOS, `.ps1` for Windows

### CI Fix

- `build.yaml`: platform-specific launch script packaging (startgame.sh for Linux/macOS, startgame.ps1 for Windows)
- `build.yml`: added startgame.ps1 to Windows package

---

## v0.22.1 (2026-07-08)

### World Agent Isolation — Seed Prompts on Creation

Agent prompts are now copied from defaults when creating a new world, with language-appropriate translations. Previously all worlds fell back to shared hardcoded defaults, breaking per-world isolation.

**Changes:**
- New `seedWorldAgents(worldName)` function seeds all 14 agents into SQLite on world creation
- `DEFAULT_AGENTS` exported for reuse
- `createWorld()` calls `seedWorldAgents()` after writing `world_frame.json`

**Files:** `src/services/agent-config.ts`, `src/services/world-manager.ts`

---

### Language Instruction Deduplication

Removed redundant `+ getLanguageInstruction()` appends from 4 agent files and replaced the private `LANG_HINT` map in `dialogue-context.ts` with the shared `getLanguageInstruction()`. Prompts now contain the language instruction baked in at seed time.

**Files:** `src/services/narrator-agent.ts`, `src/services/npc-agent.ts`, `src/services/scene-agent.ts`, `src/services/director-agent.ts`, `src/services/dialogue-context.ts`

---

### World-Aware Agent API

All agent config endpoints now accept `?world=` query param to read/write prompts for a specific world without switching the active world.

**Endpoints updated:**
- `GET /api/agents?world=X`
- `GET /api/agents/:id?world=X`
- `PUT /api/agents/:id?world=X`
- `PUT /api/agents/:id/prompts?world=X`
- `POST /api/agents/:id/reset?world=X`

**`loadAllAgentConfigs(world?, lang?)`** now accepts optional world/lang params.

**Files:** `src/routes/agents.ts`, `src/services/agent-config.ts`

---

### JSON Fallback Language Fix

`loadWorldPrompts()` tier 2 (JSON fallback) now skips when a non-active world is requested, preventing cross-world prompt contamination. SQLite is the source of truth for seeded worlds.

**File:** `src/services/agent-config.ts`

---

### Per-World Config UI — `/worlds/:name/config`

New 5-tab configuration page for each world:

| Tab | Content |
|-----|---------|
| Description | Edit world title, description, language, genres, rules, magic system |
| Agents | 14 agent tabs with settings + per-world prompts (scoped via `?world=`) |
| Statistics | Entity counts, character/location/faction/item lists, session/event/chapter counts |
| Graph | D3 entity graph visualization (iframe) |
| Audit | Coming soon — world consistency checking via external God agent |

World cards in `/worlds` now navigate to the config page on click.

**Files:** `public/world-config.html` (new), `src/app.ts`, `public/worlds.html`

---

### Birth Wizard — Character Name Field

Dedicated "Character Name" input field in the birth wizard form. Previously name had to be embedded in hints as `name: Aria`. The regex for hint-based names was also fixed to support non-Latin characters (Cyrillic, accented, etc.) via `/name[:\s]+([\p{L}]+)/iu`.

**Backend:** `POST /launch` now accepts `name` field, passed through `BirthScenario.generateAndApply()` → `generateBirthParams()` → `generateName()`.

**Files:** `src/routes/launch.ts`, `src/services/birth.ts`, `public/worlds.html`

---

## v0.22.0 (2026-07-07)

### Per-Provider Rate Limiting

Rate limiting for each LLM provider individually with round-robin API key rotation.

**Features:**
- `ProviderRateLimiter` — per-provider rate limiting with RPM counters and min interval
- Round-robin rotation across multiple API keys for the same provider
- Automatic fallback to local model (Ollama) when external provider fails
- WebSocket notifications for rate limit events
- Frontend popup with model switching capability
- Hot-reloadable config via `conf/provider-rate-limits.json`

**Config:**
```json
{
  "providers": {
    "gemini": { "keys": ["key1", "key2"], "rpm": 50, "minIntervalMs": 3000 },
    "openai": { "keys": ["sk-..."], "rpm": 60, "minIntervalMs": 1000 },
    "ollama": { "keys": [], "rpm": 999, "minIntervalMs": 0 }
  },
  "fallbackProvider": "ollama"
}
```

**API Endpoints:**
- `GET /api/providers/rate-limit/status` — current counters per provider
- `POST /api/providers/rate-limit/reset` — reset counters
- `POST /api/providers/rate-limit/switch` — manual model switching

**Files changed:**
- `src/lib/provider-rate-limiter.ts` — New rate limiter class
- `src/lib/llm-queue.ts` — Per-provider rate limiting in queue
- `src/lib/providers/google-provider.ts` — Rate limiter integration
- `src/lib/providers/openai-provider.ts` — Rate limiter integration
- `src/lib/providers/anthropic-provider.ts` — Rate limiter integration
- `src/lib/providers/provider-manager.ts` — Rate limiter distribution
- `src/services/narrative-bootstrapper.ts` — Rate limiter initialization
- `src/services/narrative-service.ts` — Expose rate limiter
- `src/routes/providers.ts` — Rate limit API endpoints
- `src/index.ts` — WebSocket notification wiring
- `conf/provider-rate-limits.json` — New config file
- `public/static/rate-limit-popup.css` — Popup styles
- `public/static/rate-limit-popup.js` — Popup logic

---

### Agent ID Propagation

All services now pass `agentId` to LLM calls so each reads its own model/provider config.

**Services updated:**
- `StoryEngine` — agentId: "director"
- `VillainManager` — agentId: "villain"
- `StoryPlanner` — agentId: "story-planner"
- `NPCGenerator` — agentId: "npc"
- `WorldBuilder` — agentId: "director"
- `UserAgent` — agentId: "npc"
- `StartResolver` — agentId: "director"
- `RoleplayEngine` — service message agents pass their own agentId

**Impact:** Each agent now uses its individually assigned model/provider instead of the default.

---

### Rate Limiter Improvements

- Rate limiter scoped to `/api/*` only (not global)
- Gradual token refill instead of full reset per minute
- Static assets served with proper MIME types

---

## v0.21.0 (2026-07-07)

### Theme Builder

- Standalone theme builder page at `/theme-builder`
- 8 preset themes: Dracula, Nord, Monokai, Solarized, Gruvbox, Tokyo Night, One Dark, Catppuccin
- Color picker controls for 14 CSS variables (backgrounds, borders, text, accents)
- Font selectors for mono, body, and display fonts
- Live preview panel with typography, buttons, input, badges, color palette, and narrative sample
- Export/import themes as JSON files
- Reset and clear actions
- Navigation link from settings page

**Files changed:**
- `public/theme-builder.html` — New theme builder page
- `public/static/theme-builder.js` — Builder logic (528 lines)
- `public/static/theme-builder.css` — Builder styles (724 lines)
- `public/settings.html` — Added Builder link
- `src/app.ts` — Added /theme-builder route

---

## v0.21.0 (2026-07-07)

### World Graph Fix + Statistics Modal

#### Bug Fix: World Graph Not Building

The world relationship graph was always empty — entities existed but no edges appeared.

**Root cause:** `buildRelationships()` in `world-builder.ts` was dead code — never called from any route, service, or startup flow. Additionally, it never called `entityStore.save()` after mutating profiles, so even if called, relationships were lost on restart.

**Fix:**
- Added `await this._entityStore.save()` after the relationship push loop in `buildRelationships()`
- Added `buildRelationshipsHeuristic()` — deterministic LLM-free relationship builder using race links, faction membership by tag match, character-to-character fallback, and location proximity
- `NarrativeFacade.start()` now auto-builds heuristic relationships when entities exist but have no connections, then re-boots the graph store

**Files changed:**
- `src/services/world-builder.ts` — Added save() call + `buildRelationshipsHeuristic()` method
- `src/services/narrative-facade.ts` — Auto-build heuristic relationships at startup

---

#### Feature: World Statistics Modal

New modal on the Worlds page showing world details, entity counts, character/location/faction/item lists, session/event/chapter/villain counts, and world rules.

**API:**
- `GET /api/worlds/:name/detail` — Returns entity counts by type, character/location/faction/item lists with details, session/event/chapter/villain counts, world rules

**UI:**
- World card click opens statistics modal with stat grid, entity cards with colored dots, and world rules section
- Full i18n support (en, ru, de, fr, es, ja, zh)

**Files changed:**
- `src/routes/worlds.ts` — Added `GET /worlds/:name/detail` endpoint
- `public/worlds.html` — Added detail-modal CSS/HTML/JS + i18n

---

#### Feature: Language Instruction Injection

LLM responses now automatically match the selected UI language. A `getLanguageInstruction()` function appends a language directive to all agent prompts, ensuring the narrator, director, scene generator, and NPC agent respond in the correct language.

**Files changed:**
- `src/services/agent-config.ts` — Added `getLanguageInstruction()` + `LANG_INSTRUCTION` map
- `src/services/narrator-agent.ts` — Appended language instruction to prompts
- `src/services/director-agent.ts` — Appended language instruction to prompts
- `src/services/scene-agent.ts` — Appended language instruction to prompts
- `src/services/npc-agent.ts` — Appended language instruction to prompts
- `src/services/dialogue-context.ts` — Appended language instruction to prompts

---

#### Feature: Theme System

5 built-in themes (Dark, Light, Terminal, Cyberpunk, Custom) with a custom theme constructor in Settings. Theme selector on all HTML pages with persistent selection.

**Files changed:**
- `public/static/theme.css` — Base theme variables + theme switching logic
- `public/static/theme-dark.css` — Dark theme (default)
- `public/static/theme-light.css` — Light theme
- `public/static/theme-terminal.css` — Terminal/green-on-black theme
- `public/static/theme-cyberpunk.css` — Neon cyberpunk theme
- `public/static/theme-custom.css` — User-defined custom theme
- `public/static/theme.js` — Theme initialization + persistence
- `public/settings.html` — Theme selector UI + custom theme constructor panel
- `public/index.html`, `public/agents.html`, `public/dashboard.html`, `public/graph.html`, `public/models.html`, `public/providers.html` — Theme CSS includes + language selector

---

## v0.20.1 (2026-07-05)

### Bug Fix: Rules Engine Binary Path Resolution

Fixed `/api/rules` endpoint crash when running as compiled Bun binary.

**Problem:**
- `import.meta.dir` resolves to `/$bunfs/root/...` in compiled Bun binary
- Rules directory path `/$bunfs/root/../rules/social` does not exist
- Caused ENOENT error on `/api/rules` endpoint

**Solution:**
- Changed `import.meta.dir` to `process.cwd()` for rules directory resolution
- Added `existsSync()` checks for graceful handling when directories are missing

**Files changed:**
- `src/routes/rules.ts` — Lines 15-26: Fixed directory path resolution
- `src/rules/rules-engine.ts` — Lines 53-54: Fixed RULES_DIR and ECONOMY_DIR paths

---

## v0.20.0 (2026-07-05)

### Architectural Improvements — Complete Overhaul

Full architectural refactoring across 5 etapes, adding 12 new components and 809 tests.

---

#### Etape 1-2: Core Architecture

**NarrativeService Split:**
- `src/services/narrative-bootstrapper.ts` — Composition root, instantiates all services
- `src/services/narrative-facade.ts` — Lifecycle management (reset, dispose)
- `src/services/narrative-service.ts` — Backward-compatible wrapper

**Unified Agent Model:**
- `src/services/agent-interface.ts` — `Agent` interface, `BaseAgent` abstract class, `AGENT_CONFIGS` registry
- Two agent generations identified: Gen 1 (template-based) and Gen 2 (inline prompts)

**Event Sourcing:**
- `src/lib/event-store.ts` — EventStore with replay and snapshot support
- `src/services/event-sourcing-chronicler.ts` — Wraps Chronicler with domain events + snapshots
- Domain events stored in `domain_events.jsonl`, snapshots in `snapshot.json`

**Circuit Breaker for LLM:**
- `src/lib/circuit-breaker.ts` — CircuitBreaker class (CLOSED→OPEN→HALF_OPEN states)
- Failure threshold: 5, recovery timeout: 30s, half-open max attempts: 3
- Each LLM provider gets its own circuit breaker

**FallbackChain:**
- `src/lib/fallback-chain.ts` — Tries providers by priority order, automatic failover
- Falls back to direct API if all chain providers fail

**Agent Registry:**
- `src/services/agent-registry.ts` — AgentRegistry with 4 source types (builtin, config, api, plugin)
- API endpoints: GET/POST/PUT/DELETE `/api/agents`
- Persists to `conf/registry.json`

**Structured Logging:**
- `src/utils/logger.ts` — TraceContext (traceId, spanId, parentSpanId, baggage)
- CorrelationID via `setCorrelationId()`, `withTrace()` creates child logger
- Middleware in `src/middleware/logger.ts` propagates correlation ID

---

#### Etape 3: Rules, Flags, Versioning, Storage

**Social Rules Engine:**
- `src/rules/rules-engine.ts` — RulesEngine class loads primary rules + modifiers
- **14 predefined rules**: 10 social (feudalism, democracy, anarchy, capitalism, socialism, slavery, mercantilism, tribalism, theocracy, communism) + 4 economy (gold-standard, silver-economy, barter, command-economy)
- API: GET/POST `/api/rules`

**Rule Validator:**
- `src/rules/rule-validator.ts` — validateRule(), validateRuleFile(), validateAllRules()
- Checks required fields, type constraints, value ranges

**Cultural Drift:**
- `src/rules/cultural-drift.ts` — CulturalDrift class models resistance to rule change
- Per-rule resistance coefficients (feudalism=0.8, theocracy=0.9, anarchy=0.3)

**Synergy Matrix:**
- `src/rules/synergy-matrix.json` — 8 synergies + 2 resistances between rule combinations

**Tech Dependencies:**
- `src/rules/tech-dependency.json` — 10 rule prerequisites + 16-node technology tree

**Happiness Modifiers:**
- `src/rules/happiness-modifiers.json` — Happiness per system with class-based modifiers

**Feature Flags:**
- `src/lib/feature-flags.ts` — FeatureFlagManager with hash-based percentage rollout
- Condition evaluation (eq/neq/gt/lt/contains), variant weight distribution
- API: GET/PUT `/api/feature-flags`

**API Versioning:**
- `src/routes/v1/index.ts` — Wraps existing routes
- `src/routes/v2/index.ts` — Enhanced endpoints
- Legacy routes get deprecation headers (`Deprecation: true`, `Sunset: 2026-12-31`)

**WorldStore (JSON → SQLite Migration):**
- `src/store/world-store.ts` — WorldStore class with CRUD operations
- Transaction support (beginTransaction, commit, rollback)
- API: GET/POST/PUT/DELETE `/api/world-store/entities`

---

#### Etape 4: Multi-World, Cross-World, Plugins

**Multi-World Isolation:**
- `src/services/world-isolator.ts` — WorldIsolator class with resource monitoring
- Configurable memory limits, CPU percentages, token budgets
- Tracks usage and enforces limits

**Cross-World Communication:**
- `src/services/cross-world-bus.ts` — CrossWorldBus class with portal routing
- Publish, broadcast, and portal-based delivery
- Configurable isolation levels (full, portals_only, read_only, disabled)
- API: GET/POST/DELETE `/api/cross-world/*`

**Plugin System:**
- `src/plugins/plugin-interface.ts` — Plugin type definitions
- `src/plugins/plugin-manager.ts` — Plugin lifecycle management (register, unregister, capabilities)
- API: GET `/api/plugins/*`

---

#### Etape 5: Documentation

**New documentation:**
- `docs/PLUGIN-GUIDE.md` — Plugin development guide
- `docs/MIGRATION.md` — JSON to SQLite migration guide
- `docs/ARCHITECTURE.md` — Updated with new components
- `docs/API.md` — Updated with new endpoints
- All 7 README files updated to v0.20.0

---

**New files:**
- `src/services/narrative-bootstrapper.ts`
- `src/services/narrative-facade.ts`
- `src/services/agent-interface.ts`
- `src/lib/event-store.ts`
- `src/services/event-sourcing-chronicler.ts`
- `src/lib/circuit-breaker.ts`
- `src/lib/fallback-chain.ts`
- `src/services/agent-registry.ts`
- `src/rules/rules-engine.ts`
- `src/rules/rule-validator.ts`
- `src/rules/cultural-drift.ts`
- `src/rules/synergy-matrix.json`
- `src/rules/tech-dependency.json`
- `src/rules/happiness-modifiers.json`
- `src/rules/social/*.json` (10 files)
- `src/rules/economy/*.json` (4 files)
- `src/lib/feature-flags.ts`
- `src/routes/v1/index.ts`
- `src/routes/v2/index.ts`
- `src/store/world-store.ts`
- `src/services/world-isolator.ts`
- `src/services/cross-world-bus.ts`
- `src/plugins/plugin-interface.ts`
- `src/plugins/plugin-manager.ts`
- `src/routes/cross-world.ts`
- `src/routes/plugins.ts`
- `docs/PLUGIN-GUIDE.md`
- `docs/MIGRATION.md`

**Tests:** 809 total (24 new for rules, 26 new for Etape 4)

---

## v0.16.3 (2026-07-04)

### Fix: Ollama Streaming Response Parsing

Character creation (birth) fails with "Failed to parse JSON" when using Ollama.

**Root cause:** `OllamaProvider` used the `/api/generate` endpoint without `stream: false`. Ollama returns streaming NDJSON by default, and `response.json()` on a stream throws `SyntaxError: Unexpected token` — a JSON parse error that cascades through the retry logic, ultimately falling back to minimal placeholder data.

**Fixed:**
- Added `stream: false` to Ollama `/api/generate` request body
- Single non-streaming JSON response now parses correctly

## v0.16.2 (2026-07-04)

### Auth Cookie Fix for HTTP

Fixed login redirect loop when server runs over HTTP (not HTTPS).

**Root cause:** The `bring_session` cookie was set with `Secure` flag, which browsers reject on HTTP connections. This caused a login→redirect→login loop.

**Fixed:**
- Auth cookie now detects protocol and only sets `Secure` flag for HTTPS connections
- Logout cookie also fixed for HTTP compatibility

### LLM JSON Parse Retry

Added retry logic for malformed LLM responses (truncated JSON, garbage output).

**Root cause:** On low-memory systems (8GB RAM, 2 cores), Ollama may return truncated or non-JSON output during complex generation (family trees). The previous code had zero retry — one parse failure meant immediate fallback to generic placeholder data.

**Fixed:**
- New `parseJsonWithRetry()` helper retries up to 2 times with stricter prompt
- Integrated into `LLMClient.generateJson()` — all LLM JSON calls now benefit
- 9 unit tests for retry logic, 10 integration tests for birth flow

## v0.16.0 (2026-07-04)

### Pause Race Condition Fix

Fixed a critical bug where character creation (birth) would hang indefinitely when navigating between pages.

**Root cause:** `sendBeacon(pause)` from `beforeunload` on the chat page could race with `fetch(resume)` on the worlds page, leaving the LLM queue paused. User-initiated LLM calls (birth's `generateFamilyTree`, chat messages) got stuck in the paused queue with no timeout, causing a 20+ minute hang.

**Fixed:**
- Removed `llmQueue.pause()` / `llmQueue.resume()` from `NarrativeService` — the director loop already has its own `_paused` check in `_runTick()`, so pausing the LLM queue was redundant for background tasks but blocked user-initiated actions
- Added `_narrativeCtx.resume()` at the start of the `/launch` endpoint as a safety net
- Reset `_paused` flag in `LLMQueue.start()` and `DirectorLoop.start()` to prevent stale pause state after world switch
- Added `fetch(resume)` in `worlds.html` on page load

### Release Packaging

- All 7 README files now included in release archives (`README*.md` glob)
- Entire `docs/` folder included in release archives (architecture docs, changelog, compile guide, agents reference)
- Project link added to all README files

---

## v0.15.0 (2026-07-04)

### Security Hardening

Comprehensive security audit and hardening — 12 findings fixed, 2 additional improvements.

**Fixed:**
- H1: WebSocket auth bypass — validate session token, not just cookie presence
- H2: Static file path traversal — add path containment check
- H3: Chapter filename traversal — validate filename regex
- M2: In-memory sessions replaced with SQLite-backed store (survives restarts)
- M3: Missing `Secure` flag on session cookie
- M4: Rate limiter IP spoofing — shared `getClientIp` helper
- M5: CSP hardened with `base-uri` and `form-action` restrictions
- L1: Passwords hashed before storage in settings
- L2: Error messages sanitized — no internal details leaked to clients
- L3: Stale login attempt entries cleaned up periodically
- L4: CSRF token validation on login form (cookie double-submit)
- L6: World names validated against path traversal

**New files:**
- `src/lib/session-store.ts` — SQLite-backed session storage with auto-cleanup
- `SECURITY-log.md` — Security change log
- `security.md` — Full security audit report

**Modified files:**
- `src/middleware/auth.ts` — Session store integration, CSRF, Secure cookie, getClientIp
- `src/middleware/rate-limiter.ts` — Uses shared getClientIp
- `src/middleware/security-headers.ts` — Hardened CSP
- `src/index.ts` — WebSocket token validation, session cleanup lifecycle
- `src/app.ts` — Path containment check for static files
- `src/routes/worlds.ts` — World name + filename validation
- `src/routes/chat.ts` — Sanitized error messages

**CI fixes:**
- Fixed GitHub Actions versions (checkout@v4, upload-artifact@v4, download-artifact@v4)
- Removed broken release job from CI workflow (build.yml)
- Renamed CI workflow to "CI" to distinguish from release workflow

---

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
