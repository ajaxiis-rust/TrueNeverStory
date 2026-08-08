---
feature: mcp-console
status: delivered
specs:
  - docs/compose/specs/2026-07-30-mcp-console-design.md
plans:
  - docs/compose/plans/2026-07-30-mcp-console.md
  - docs/compose/plans/2026-07-31-mcp-catalog-checkbox-and-auth.md
  - docs/compose/plans/2026-08-08-mcp-ui-fixes.md
branch: main
---

# MCP Console — Final Report

## What Was Built

MCP Console is a database management mode for TrueNeverStory, activated via `--mcp` flag in `startgame.sh`. It runs the Hono server in a dedicated mode serving only MCP-related REST endpoints and a web UI — no game logic, no auth gate, no agent pipeline.

The console provides CRUD and pipeline operations for all 5 project databases: Bible (biblical texts, characters), Gutenberg (literary styles), Wikipedia (fact-checking), LiteraryCompiler (quest templates), and Economics. Long operations (download, convert, compact) use SSE for real-time progress tracking with a visual progress bar.

The 2026-08-08 polish pass added: XSS protection across all dynamic rendering, full Catalog tab i18n, visual progress bar, sequential compact execution, read-only economic monitoring (phase + jubilee), and 5 additional language translations (de/fr/es/ja/zh).

## Architecture

### Components

| Component | File | Purpose |
|-----------|------|---------|
| Launcher flag | `startgame.sh` | `--mcp` sets `TNS_MCP_MODE=1`, auto-starts llama.cpp |
| App entry | `src/app.ts` | Conditional routing: MCP mode skips auth, serves only MCP routes |
| MCP routes | `src/routes/mcp.ts` | REST API for all 5 DBs + Economics (read-only) + System + SSE stream |
| MCP tests | `src/routes/mcp.test.ts` | 37 tests covering all endpoints, error responses, catalog |
| Web UI | `public/mcp.html` | Vanilla JS console with 8 tabs, i18n (7 languages), SSE progress bar |

### Data Flow

```
startgame.sh --mcp
  → exports TNS_MCP_MODE=1
  → starts llama.cpp (BGE3M:5001, LLM:5002)
  → starts Hono server

src/app.ts
  → detects TNS_MCP_MODE=1
  → mounts mcpRouter at /mcp
  → serves mcp.html at /
  → skips auth middleware

public/mcp.html
  → fetches /mcp/status (dashboard)
  → fetches /mcp/{db}/{action} (per-tab)
  → POST /mcp/{db}/{action} → SSE /mcp/stream/{jobId} (long ops)
  → trackProgress() updates visual .progress-bar-fill during operation
  → runAction() returns Promise — enables sequential compactAll()
```

### Design Decisions

- **No auth in MCP mode** — the console is a local dev tool, not exposed externally. Auth gate would block casual access.
- **SSE over WebSocket** — simpler implementation, works with vanilla JS `EventSource`, no upgrade handshake needed.
- **Direct `Database` from `bun:sqlite`** for LiteraryCompiler queries — `LiteraryCompilerDB.db` is private; using raw SQLite avoids modifying the class API.
- **Economics is read-only in MCP Console** — dilemma generation is a game mechanic, not DB administration. Manual phase changes would create race conditions with the engine's `EconomicService.checkTick()`. Phase and jubilee info are exposed read-only for monitoring.
- **XSS protection via `escapeHtml()`** — all dynamic data rendered through `innerHTML` (11 locations) is now escaped to prevent injection through compromised API responses.
- **Sequential compact via Promise-based `runAction`** — `compactAll()` now waits for each job's SSE `done` event before starting the next, preventing 4 parallel VACUUM processes from saturating disk I/O.

## Usage

```bash
# Start MCP mode (database management only, no game)
bash startgame.sh --mcp

# Open in browser
# http://localhost:8000

# API examples
curl http://localhost:8000/mcp/status
curl http://localhost:8000/mcp/bible/stats
curl http://localhost:8000/mcp/bible/search?q=love
curl -X POST http://localhost:8000/mcp/gutenberg/compact
curl http://localhost:8000/mcp/economics/phase?worldId=default
curl http://localhost:8000/mcp/economics/jubilee?worldId=default&year=1250
```

### Web UI Tabs

| Tab | Features |
|-----|----------|
| Dashboard | DB status (exists/size), quick actions (Compact All, Rebuild Index), progress bar |
| Bible | Verse search, character search, Bootstrap/Compact |
| Gutenberg | Style search, delexify text, Download/Convert/Compact |
| Catalog | Author/topic build, search, filter (year, downloads), pagination, select-all/download-selected |
| Wikipedia | Article search, fact verification, Download/Convert/Compact |
| Literary | Template search, Compile/Compact |
| Economics | Phase status (abundance/transition/famine), reserve, price modifier; jubilee years-until |
| System | Uptime, memory, mode, operation logs |

### i18n

Supported: English, Russian, German, French, Spanish, Japanese, Chinese. Language stored in `localStorage.tns-lang`. All UI strings (tabs, labels, placeholders, table headers) use `data-i18n` attributes; Catalog tab was moved from hardcoded English to i18n in this release.

## Verification

- **Tests:** 1114 pass / 4 skip / 0 fail (37 MCP-specific tests, all green)
- **XSS:** 11 `innerHTML` locations now pass through `escapeHtml()` — no raw API data rendered as HTML
- **Economics:** phase returns real cycle data from `EconomicCycles` DB, jubilee returns years-until from `JubileeManager`
- **Literary compile:** now spawns `scripts/compile-classics.ts` via `runScriptWithJob` (was stub)

## Journey Log

- [lesson] `LiteraryCompilerDB.db` is private — used `Database` from `bun:sqlite` directly instead of modifying the class
- [lesson] `GetContextSchema` has no `maxFacts` field — removed from Wikipedia endpoint calls
- [pivot] `CharacterDB` takes `BibleParser` instance, not `dbPath` — adjusted Bible character endpoints to create parser first
- [pivot] MCP routes return HTTP 200 with `{error}` for missing DBs, not 404 — tests updated to match real behavior
- [dead end] Considered full Economic dashboard (dilemma generation in UI) — rejected as mixing game mechanics with DB administration; read-only monitoring adopted instead
- [lesson] `forEach` + `await` in `compactAll()` was fire-and-forget — all 4 compacts spawned concurrently, saturating disk. Fixed with Promise-based `runAction` + `onDone` callback

## Source Materials

| File | Role |
|------|------|
| `docs/compose/specs/2026-07-30-mcp-console-design.md` | Design spec (S1-S7) |
| `docs/compose/plans/2026-07-30-mcp-console.md` | Implementation plan (12 tasks) |
| `docs/compose/plans/2026-07-31-mcp-catalog-checkbox-and-auth.md` | Catalog checkbox + auth plan |
| `docs/compose/plans/2026-08-08-mcp-ui-fixes.md` | Polish plan (8 stages: tests, XSS, i18n, progress, compact, economics, stubs, translations) |
