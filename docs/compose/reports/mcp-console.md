---
feature: mcp-console
status: delivered
specs:
  - docs/compose/specs/2026-07-30-mcp-console-design.md
plans:
  - docs/compose/plans/2026-07-30-mcp-console.md
branch: main
---

# MCP Console — Final Report

## What Was Built

MCP Console is a database management mode for TrueNeverStory, activated via `--mcp` flag in `startgame.sh`. It runs the Hono server in a dedicated mode serving only MCP-related REST endpoints and a web UI — no game logic, no auth gate, no agent pipeline.

The console provides CRUD and pipeline operations for all 5 project databases: Bible (biblical texts, characters), Gutenberg (literary styles), Wikipedia (fact-checking), LiteraryCompiler (quest templates), and Economics. Long operations (download, convert, compact) use SSE for real-time progress tracking.

## Architecture

### Components

| Component | File | Purpose |
|-----------|------|---------|
| Launcher flag | `startgame.sh` | `--mcp` sets `TNS_MCP_MODE=1`, auto-starts llama.cpp |
| App entry | `src/app.ts` | Conditional routing: MCP mode skips auth, serves only MCP routes |
| Route aggregator | `src/routes/index.ts` | Mounts `mcpRouter` at `/mcp` |
| MCP routes | `src/routes/mcp.ts` | REST API for all 5 DBs + System + SSE stream |
| Web UI | `public/mcp.html` | Vanilla JS console with 7 tabs, i18n, polling |

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
```

### Design Decisions

- **No auth in MCP mode** — the console is a local dev tool, not exposed externally. Auth gate would block casual access.
- **SSE over WebSocket** — simpler implementation, works with vanilla JS `EventSource`, no upgrade handshake needed.
- **Direct `Database` from `bun:sqlite`** for LiteraryCompiler queries — `LiteraryCompilerDB.db` is private; using raw SQLite avoids modifying the class API.
- **`require()` replaced with static import** — Bun ESM doesn't support conditional `require()` cleanly; `mcpRouter` is always imported but only mounted in MCP mode.

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
```

### Web UI Tabs

| Tab | Features |
|-----|----------|
| Dashboard | DB status (exists/size), quick actions (Compact All, Rebuild Index) |
| Bible | Verse search, character search, Bootstrap/Compact |
| Gutenberg | Style search, delexify text, Download/Convert/Compact |
| Wikipedia | Article search, fact verification, Download/Convert/Compact |
| Literary | Template search, Compile/Compact |
| Economics | Phase status, dilemma generation |
| System | Uptime, memory, mode, operation logs |

### i18n

Supported: English, Russian. Language stored in `localStorage.tns-lang`.

## Verification

- **TypeScript:** 0 new errors in modified files (22 pre-existing in literary-compiler/translation-service)
- **Tests:** 1012/1017 pass (5 pre-existing failures: Bible DB integration, Performance, TranslationService)
- **Syntax:** `bash -n startgame.sh` passes

## Journey Log

- [lesson] `LiteraryCompilerDB.db` is private — used `Database` from `bun:sqlite` directly instead of modifying the class
- [lesson] `GetContextSchema` has no `maxFacts` field — removed from Wikipedia endpoint calls
- [pivot] `CharacterDB` takes `BibleParser` instance, not `dbPath` — adjusted Bible character endpoints to create parser first

## Source Materials

| File | Role |
|------|------|
| `docs/compose/specs/2026-07-30-mcp-console-design.md` | Design spec (S1-S7) |
| `docs/compose/plans/2026-07-30-mcp-console.md` | Implementation plan (12 tasks) |
