# Changelog

## [v0.32.1] — 2026-08-15 — Jungian Profiler specs + plans

### Jungian Profiler — design corrected + 18-file implementation plan

- **Design spec v1.3** (`docs/compose/specs/2026-08-10-jungian-profiler-design_1.3.md`) — corrected against real code: two-stage LLM text analysis (createWorld + birth wizard), `profile.l3.psychotype`, `recordSimulation` fix, 1024-dim BGE-M3, nested S5 schema
- **4 impl specs** (blend-algorithm, behavioral-metrics, persistence, integration, implementation) — fixed to match real code: Hono `worlds.ts` (not a class), `INSERT OR REPLACE` → `ON CONFLICT DO UPDATE`, `node:os.tmpdir()`, `__tests__/` paths
- **18-file phase plan** (`docs/compose/plans/2026-08-14-jungian-profiler*.md`) — P1 (data model + blend + Director + persistence) → P4 (AuthorMatcher), TDD, ≤300 lines/phase
- **Bugfix** — `MetricsCollector.recordSimulation` command branch now reads `intent.command`

### Tests

- metrics-collector: 29 pass / 0 fail

---

## [v0.32.0] — 2026-08-10 — Gutenberg Processing Pipeline

### Gutenberg Pipeline — 59 books → 4 SQLite databases

- **Import script** (`scripts/import-gutenberg-texts.ts`) — reads .txt files + catalog → `classics.db`
- **Process script** (`scripts/process-gutenberg.ts`) — Phase A (V1 rule-based) + Phase B (V2 LLM) orchestrator
- **Expand corpus** (`scripts/expand-corpus.ts`) — fetch additional books from Gutendex API, 59 → 250+
- **MCP endpoint** `/gutenberg/process` — trigger pipeline from MCP Console UI

### Analysis & Extraction

- **AnalyzePass** (`src/mcp/gutenberg/analyze-pass.ts`) — unified chunk analysis: pre-score, scene classification, sensory tags, temporal markers
- **NarrativeExtractor** (`src/mcp/gutenberg/narrative-extractor.ts`) — LLM-based narrative structure extraction (plot arcs, character arcs, thematic motifs, moral vector)
- **Shared cleanGutenbergText** (`src/mcp/gutenberg/clean.ts`) — deduplicated text cleaning (was 3 separate implementations)
- **Era/period helpers** (`src/mcp/gutenberg/helpers.ts`) — `inferEra()`, `inferLiteraryPeriod()`, `sampleExcerpts()`

### Player Profiles

- **PlayerProfileStore** (`src/lib/player-profile-store.ts`) — standalone cross-agent player style profiles (sentence length, sensory bias, register, dialogue ratio, preferred motifs, literary sophistication)
- 14 tracked style metrics per player, confidence-weighted updates

### Literary Compiler Extensions

- **DramaturgicPass prose mode** (`src/mcp/literary-compiler/dramaturgic-pass.ts`) — generate prose templates from chunk analysis (PROSE_ARCHETYPE_KEYWORDS, generateProseTemplate)
- **New DB tables** — `narrative_arcs`, `thematic_motifs`, `quality_calibration` in classics-compiled.db

### Tests

- 4 new test files: analyze-pass, clean, helpers, player-profile-store
- Full suite: 1145 pass / 1 fail (pre-existing)

---

## [v0.31.1] — 2026-08-08 — MCP Console Polish

### MCP Console — 8-stage polish pass

- **Tests:** 14 MCP tests fixed (404→200), 37/37 pass, full suite 1114 pass / 0 fail
- **XSS protection:** `escapeHtml()` helper + applied to all 11 `innerHTML` locations in `public/mcp.html`
- **Catalog i18n:** 26 keys en+ru, `data-i18n` attributes, `t()` calls in JS table rendering
- **Progress bar:** CSS + DOM + visual progress in `trackProgress()` during SSE operations
- **Sequential compact:** `runAction()` returns Promise, `compactAll()` waits for each job completion
- **Economics read-only:** `EconomicService` lazy singleton, phase + jubilee endpoints, dilemma removed from UI
- **5 stub endpoints:** `literary/compile` → `compile-classics.ts`, others with honest messages
- **Translations:** de/fr/es/ja/zh added (~56 keys × 5 languages)

## [v0.31.0] — 2026-08-08 — RoleplayEngine Refactoring

### Architecture — RoleplayEngine strangled into composable services

- **SessionState** (`src/services/roleplay/session-state.ts`) — 7 mutable public fields extracted into encapsulated class with backward-compat getter/setter
- **CommandHandler** (`src/services/roleplay/handlers/command-handler.ts`) — 11 commands (/help, /look, /craft, /status, etc.) extracted from 126-line switch/case
- **PipelineRunner** (`src/services/roleplay/pipeline-runner.ts`) — shared translateAndClassify + runSimulation + buildGameContext logic deduplicated for processInput/processInputStream
- **PipelineContext** (`src/services/roleplay/pipeline-context.ts`) — unified state container across pipeline stages

### Prose strategies (Phase 4)

- **ProseGenerator** interface — pluggable prose generation strategy
- **LiteraryV2Generator** — feature-flag gated V2 literary compiler
- **LegacyIntentGenerator** — dispatches by intent type to specialized handlers
- **4 intent handlers**: MovementHandler, DialogueHandler, ObservationHandler, ActionHandler (sync + stream variants)
- Old `_handle*` methods (~200 lines) removed from RoleplayEngine

### Agent infrastructure (Phase 5)

- **EngineAgents** interface — 17-agent bundle for DI injection
- **LegacyAgentAdapter** — wraps ServiceMessageAgent implementations
- Constructor supports pre-created agents via `deps.agents`

### Fixes & improvements

- **SQLiteStore UI extraction** — `seedUITranslations()` (798 lines) moved to `ui-translation-seeder.ts`, SQLiteStore: 1325→532 lines
- **Heartbeat session filtering** — `ManagedSocket.worldId/sessionId`, `broadcast(filter)` for world-scoped heartbeats
- **publishSimple await** — 6 fire-and-forget heartbeat calls in processInput now awaited
- **WS concurrency guard** — `_processingQueue` serializes processInput/processInputStream
- **Seeded PRNG** (`src/lib/prng.ts`) — mulberry32 replaces Math.random() in 61 simulation calls for deterministic replay
- **Empty catch blocks** — 11 production catch blocks now log context instead of swallowing errors silently

### Tests — 24 safety-net tests

- `src/services/roleplay-engine.test.ts` — covers commands, agent mentions, intents, streaming, concurrency guard, translation

### Docs

- `docs/ARCHITECTURE.md` updated to v0.31.0 with new pipeline stages and agent architecture

---

## [v0.30.1] — 2026-07-30 — Bugfix Release

- fix: MCP stats endpoints — correct DB paths, 404→200
- fix: 12 race conditions from concurrency audit
- fix: 18 bugs from code audit

---

## [v0.29.6] — Literary Compiler v2

- Literary Compiler v2 — deterministic template + style pattern system
- Hybrid Retrieval Pipeline — FTS5 + vector + RRF
- 12 Canonical Archetypes
- MCP Console
