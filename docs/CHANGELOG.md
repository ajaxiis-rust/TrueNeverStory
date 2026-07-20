# Changelog

## v0.28.5 (2026-07-20)

### LLM Performance Optimization — Dual Model + Translation Batching

Reduced LLM requests per user input from 4-5 to 2-3 for non-English languages.

#### Translation + Intent Batching
- **`TranslationService.translateAndClassify()`** — combines translation and intent classification into a single LLM call
- **`RoleplayEngine.processInput()`** — uses `translateAndClassify` for non-English input, falls back to separate calls on failure
- Saves 1 LLM request per non-English user input

#### Dual Model Support
- **`AgentConfig`** — added `translationProviderId` and `translationModelId` fields
- **`AgentAssignment`** — added `translationProviderId` and `translationModelId` fields
- **`LLMClientOptions`** — added `useTranslationModel` flag
- **`LLMClient._getProvider()`** — uses translation provider when `useTranslationModel=true`
- **`LLMClient._getModel()`** — uses translation model when `useTranslationModel=true`
- **`LLMQueue.getAgentClient()`** — separates translation clients from regular clients in cache

#### LLM Cache Bug Fix (from v0.28.4)
- Removed `LRUCache` from `LLMClient` — cache was causing cross-agent hallucinations
- Cache key did not include `systemPrompt` or `agentId`, so different agents got cached responses from each other
- For local models, cache hit rate was ~0% anyway (prompts are unique each tick)

#### Tests
- `src/services/translation-service.test.ts` — 19 tests for TranslationService (detectLanguage, translate, translateToEnglish, translateAndClassify, translateResponse)
- `src/lib/llm-client-translation.test.ts` — 2 tests for LLMClientOptions.useTranslationModel
- Total: 944 tests pass (5 pre-existing failures unrelated to changes)

## v0.28.0 (2026-07-18)

### Full Audit — Silent Errors, Type Safety, Performance, Security

Comprehensive codebase audit with all issues resolved:

#### Silent Catch Blocks — All Replaced with Logging
- **14 files** modified: every empty `catch {}` now logs via `log.debug()` or `log.warn()`
- `src/routes/settings.ts` — 6 catch blocks in `killLlamaServers` and `findModel`
- `src/lib/mojo-ffi.ts` — 5 catch blocks in `tryLoad*` FFI functions
- `src/lib/atomic-io.ts` — 2 catch blocks in `readJsonFileSync` and `atomicWriteJson`
- `src/services/chronicler.ts` — 1 catch block in `getTimeline`
- `src/services/agent-config.ts` — 3 catch blocks in config reading
- `src/lib/providers/google-provider.ts` — 1 catch block in SSE parsing
- `src/lib/providers/llamacpp-provider.ts` — 1 catch block in SSE parsing
- `src/lib/providers/openai-provider.ts` — 2 catch blocks in OAuth and SSE
- `src/routes/chat.ts` — 1 catch block in story_time parsing
- `src/routes/providers.ts` — 1 catch block in rate-limit config reading
- `src/routes/worlds.ts` — 4 catch blocks in world data reading

#### Type Safety — Eliminated All `as any` Casts
- **13 `as any` casts removed** across the codebase
- `src/services/roleplay-engine.ts` — 12x replaced with typed `EventTopic` enum values
- `src/services/agents/stylist.ts` — removed casts, added `tags`/`variables` to `NarrativePattern` interface
- `src/services/agents/dramaturg.ts` — fixed `etype` → `entityType` bug
- `src/store/world-store.ts` — 7x replaced with typed SQL row interfaces (`QuestRow`, `NPCMemoryRow`, `WorldFrameRow`, `CountRow`)
- `src/mcp/bible/parser.ts` — replaced `as any[]` with `SQLQueryBindings[]`
- `src/mcp/bible/characters.ts` — replaced `(parser as any).normalizedDb` with public getter `parser.db`
- `src/mcp/literary-compiler/economic-schema.ts` — 2x replaced with `FactionLaborRuleRow` type
- `src/routes/providers.ts` + `src/index.ts` — typed global `__narrativeService` via `global.d.ts`

#### Performance — O(n²) → O(1) Model Lookup
- `src/services/model-manager.ts:listModels` — replaced `models.find()` in loops with `Map.get()` for O(1) lookups

#### Security — Hardened `safeEval` and Error Handler
- `src/services/probability-expression.ts` — blocked `__proto__`, `constructor`, `prototype` in regex
- `src/middleware/error-handler.ts` — removed internal error message disclosure from HTTP responses
- Added 3 security tests for prototype pollution patterns

#### Architecture — Strategy Pattern Refactoring
- `src/index.ts` — `handleWSMessage` refactored from 70-line if/else chain to strategy pattern with `handleMessage`, `handleSetup`, `handlePing` functions

#### Event System — Typed Topics
- `src/lib/event-bus.ts` — added 6 heartbeat event topics to `EventTopic` enum
- `src/services/roleplay-engine.ts` — all event publishing now uses typed enum values

#### TODO Resolution
- `src/services/roleplay-engine.ts` — `characterLevel` now fetched from entity store instead of hardcoded `1`

## v0.27.0 (2026-07-17)

### Release Packaging — Database Archives

Compiled `.db` databases are now included in release builds as compressed archives:

- **`build.sh`**: New `pack_databases()` step compresses all `data/**/*.db` into `databases.tar.gz` (71MB → 15MB) and places it in each release target directory
- **`startgame.sh`**: New `ensure_databases()` section auto-extracts `databases.tar.gz` on first launch if `.db` files are missing from disk
- Works for all 7 compiled databases: bible-normalized, literary-compiler (literary + economic), gutenberg-normalized, bible-compiler-output (literary, literary-cached, literary-full)

## v0.26.0 (2026-07-17)

### Bug Fixes

- **Fixed `loadRateLimitConfig()` reading wrong config file** — was reading `conf/providers.json` with non-existent `data.rateLimit` key, always falling back to defaults. Now correctly reads `conf/provider-rate-limits.json` and sums per-provider RPM values.

### New Agents Wired into Pipeline

5 previously orphaned specialist agents are now instantiated in `RoleplayEngine` and available for use:

| Agent | Purpose |
|-------|---------|
| **CartographerAgent** | Generates location/geography information — distances, paths, terrain, points of interest |
| **HistorianAgent** | Recalls and narrates world history, chronology, and past events |
| **LorekeeperAgent** | Maintains world facts, magic system rules, race information, established canon |
| **MerchantAgent** | Handles NPC merchant trading, pricing, inventory management |
| **QuestGiverAgent** | Generates quests based on current world state, player level, and story threads |

### Dialogue System

New `DialogueManager` + `DialogueContext` wired into the engine (when `npcRuntime` is available):

- Session-based NPC conversations (greeting → active → farewell)
- Relationship-aware greetings (friend/neutral/enemy)
- Feudal hierarchy awareness (lord/vassal greetings)
- Topic-based dialogue choices (personal, faction, quest, trade, combat, etc.)
- Dialogue memory recording for NPC long-term memory

### Code Cleanup

- **Removed dead `BaseAgent` v1 class** from `agent-interface.ts` — superseded by `BaseAgentV2`, never extended by any agent. Kept only type interfaces (`Agent`, `AgentConfig`, `AgentContext`, `AgentResponse`) used by `AgentRegistry`.
- **Removed dead `AGENT_CONFIGS` constant and `AgentId` type** — never imported anywhere.
- **Added `GraphValidator` to `intelligence/index.ts` barrel export** — was missing from the barrel, imported via direct path.

---

## v0.25.7 (2026-07-16)

### Translation Models

Added multilingual translation models to the catalog:

- **NLLB-200 600M** — Meta's 35+ language translation model (Q8_0 and Q4_K_M)
- **MADLAD-400 3B** — Google's 400+ language model for rare languages

### Hardware Documentation

New comprehensive hardware requirements guide (`docs/HARDWARE.md`):

- 4 configuration profiles (Ultra-Light to GPU-Accelerated)
- Model recommendations by task (intent, translation, narrative, embeddings)
- Configuration examples for different setups
- Performance tips and language support matrix
- Translations to 7 languages (ru, de, fr, es, ja, zh)

---

## v0.25.4 (2026-07-16)

### Translation Agent

New `translation` agent for configuring translation model/provider in settings:

- **Agent ID:** `translation`
- **Purpose:** Translates game narrative between languages
- **Configurable:** Model and provider assignment via Agents settings UI
- **Prompt:** English-only for maximum speed, preserves literary style and tone

**Changes:**
- Added `translation` agent to `DEFAULT_AGENTS` in `agent-config.ts`
- Added translation prompts (EN) for the agent
- Added agent names/descriptions in all 7 languages to `agents.html`
- Translation service uses `translation` agentId for model resolution

---

## v0.25.3 (2026-07-14)

### Literary Compiler (Phases 0-6)

4 offline analysis passes for quest template enrichment:

- **Dramaturgic Analysis** — Narrative structure, tension arcs, character dynamics
- **Stylistic Analysis** — Vocabulary, sentence patterns, readability metrics
- **Emotional Analysis** — Sentiment progression, emotional peaks, mood mapping
- **Metadata Extraction** — Genre tags, difficulty, estimated duration

**New Files:**
- `src/services/literary-compiler.ts` — Main compiler orchestrator
- `src/services/literary-analyzer.ts` — 4 analysis passes
- `src/services/linter.ts` — Validation, deduplication, cliché detection

**SQL Schema:**
- `quest_templates` table with FTS5 full-text search
- `quest_template_analysis` table for analysis results
- Indexes for fast archetype/mood/tag lookups

**Anti-Moralizing Prompt:**
- New Stylist system prompt instruction to avoid moralizing narrative conclusions

---

### Economic Models

4 new economic subsystems for faction management:

- **JubileeManager** — Debt reset every 50 years, land return, loyalty boost
- **FactionTaxDilemma** — Auto-generated faction tax disputes with player choices
- **FactionLaborRules** — Per-faction fixed/proportional wages, loyalty conflict detection
- **EconomicCycles** — Joseph model with abundance/transition/famine phases

**New Files:**
- `src/services/jubilee-manager.ts` — Jubilee cycle management
- `src/services/faction-tax-dilemma.ts` — Tax dilemma generation
- `src/services/faction-labor-rules.ts` — Wage calculation and loyalty conflicts
- `src/services/economic-cycles.ts` — Joseph economic model
- `src/services/economic-service.ts` — Facade wrapping all 4 models

---

### Economic Integration

- **DirectorLoop** integration: cycle transitions, jubilee events, dilemma generation
- **NPC-Economy** labor rule integration with wage calculation
- **7 new MCP tools:** `get_economic_phase`, `get_price_modifier`, `calculate_price`, `get_wage`, `generate_dilemma`, `check_jubilee`, `get_jubilee_info`

---

### Bug Fixes

- Removed unused `better-sqlite3` dependency (project uses `bun:sqlite`)
- Fixed hardcoded faction names in dilemma choices — now uses actual faction names
- Fixed hardcoded faction list in DirectorLoop — now reads from world config
- Fixed year approximation drift — uses `getFullYear()` instead of manual calculation

---

## v0.25.0 (2026-07-13)

### State-First Architecture

Complete rewrite of the core engine pipeline. The engine now processes actions **deterministically before generating text**, eliminating model "deafness" and restoring game logic integrity.

**New Pipeline:**
1. **Intent Parser** — Zod-validated structured intents replace regex routing
2. **Simulation Engine** — Mojo FFI computes outcomes before prose generation
3. **State Mutator** — EntityStore updates immediately after logic
4. **Context Builder** — Shared game context for all agents
5. **Prose Generation** — LLM generates text constrained by simulation results

**New Files:**
- `src/models/intent.ts` — Zod schemas for 6 intent types
- `src/models/simulation.ts` — OutcomeQuality enum, SimulationResult types
- `src/services/intent-parser.ts` — Regex + LLM intent classification
- `src/services/simulation-engine.ts` — Deterministic simulation
- `src/services/state-mutator.ts` — Immediate EntityStore mutations
- `src/services/context-builder.ts` — Shared game context assembly

---

### MCP Integration (Literature-as-Code)

New MCP server providing external knowledge sources for narrative generation.

**Bible as stdlib:**
- Biblical patterns as narrative archetypes
- SQLite storage with FTS search
- Verse-level granularity with atomic pointers

**Gutenberg as Style CSS:**
- Delexified stylistic patterns
- Style extraction from Gutenberg Project texts
- Vocabulary and sentence pattern analysis

**Wikipedia as Validator:**
- Historical fact-checking via Wikipedia API
- Claim verification with confidence levels

**New Files:**
- `src/mcp/server.ts` — TNS MCP Server
- `src/mcp/schemas.ts` — Zod schemas for MCP tools
- `src/mcp/bible/parser.ts` — Bible SQLite parser
- `src/mcp/bible/types.ts` — Bible verse/pattern types
- `src/mcp/gutenberg/parser.ts` — Gutenberg SQLite parser
- `src/mcp/gutenberg/delexifier.ts` — Name/place replacement
- `src/mcp/tools/bible.ts` — Bible search tools
- `src/mcp/tools/gutenberg.ts` — Gutenberg style tools
- `src/mcp/tools/wikipedia.ts` — Wikipedia verification tools

---

### Agent Consolidation (14 → 6)

Consolidated 14 agents into 6 specialized roles (The Big Six).

**New Agents:**

| Agent | Role | Replaces |
|-------|------|----------|
| **Dramaturg** | The Architect | Director, Story Planner, Lorekeeper, Quest Giver |
| **Validator** | The Fact-Checker | Researcher |
| **Stylist** | The Narrator | Narrator, Scene |
| **Actor** | NPC Ensemble | NPC, Cartographer, Merchant, Crafter, Social Sim, User Agent |
| **Censor** | Linter | NEW |
| **Chronicler** | World Memory | Chronicler, Historian |

**New Files:**
- `src/services/agent-v2.ts` — New AgentV2 interface
- `src/services/agents/dramaturg.ts` — Bible pattern selection
- `src/services/agents/validator.ts` — Wikipedia fact-checking
- `src/services/agents/stylist.ts` — Gutenberg style rendering
- `src/services/agents/actor.ts` — NPC dialogue with L3 motivations
- `src/services/agents/censor.ts` — AI cliché removal
- `src/services/agents/chronicler-agent.ts` — World memory updates
- `src/services/agent-registry-v2.ts` — Agent lifecycle management

**Backward Compatibility:**
Old agent IDs (`@narrator`, `@director`, etc.) still work but route to new agents internally.

---

### System Heartbeat

Real-time progress indicators in chat UI showing engine stages.

**Stages:**
1. "Understanding your input..."
2. "Rolling dice..."
3. "Outcome: Success (73%)"
4. "Weaving narrative..."
5. "Complete"

**New Files:**
- `src/models/heartbeat.ts` — HeartbeatStage enum, progress map
- `src/services/heartbeat.ts` — WebSocket broadcast service
- `public/static/heartbeat.js` — Frontend progress bar UI

**SSE Integration:**
Heartbeat events are yielded as part of the SSE stream, providing real-time feedback to the frontend.

---

### Interlingua (English as Internal Language)

All agent-to-agent and agent-to-MCP operations use English for token efficiency and accuracy.

**Translation Service:**
- Translates at output boundary
- Supports 7 languages (EN, RU, DE, FR, ES, JA, ZH)
- Language detection for user input

**New Files:**
- `src/services/translation-service.ts` — Translation at output boundary

---

### Bug Fixes

- Fixed all TypeScript errors (0 errors)
- Fixed SQLite query parameter types
- Fixed LLMQueue signature mismatches
- Fixed EventBus handler signatures
- Fixed LayeredProfile type issues

---

### Tests

Added 31 tests for new components:

- `src/services/intent-parser.test.ts` — 8 tests
- `src/services/simulation-engine.test.ts` — 7 tests
- `src/services/state-mutator.test.ts` — 6 tests
- `src/services/agent-registry-v2.test.ts` — 10 tests

---

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
