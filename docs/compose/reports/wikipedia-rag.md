---
feature: wikipedia-rag
status: delivered
specs:
  - docs/compose/specs/2026-08-01-wikipedia-rag-design.md
plans:
  - docs/compose/plans/2026-08-01-wikipedia-rag.md
branch: main
commits: 0f76f8a..29384e1
---

# Wikipedia RAG Enrichment — Final Report

## What Was Built

TrueNeverStory теперь автоматически обогащает игровые миры реальными знаниями из Wikipedia. При создании мира система извлекает ключевые слова из описания мира, ищет соответствующие статьи в Wikipedia, парсит их и создаёт векторный индекс (RAG) для использования агентами.

Система работает в двух режимах:
1. **Active Research** — при создании мира, максимальный парсинг всех тематик
2. **Idle Enrichment** — когда игрок неактивен более часа, агент добирает детали по своей теме

## Architecture

### Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `WikipediaResearcher` | `src/services/wikipedia-researcher.ts` | Wikipedia API client with retry logic |
| `WikiRAGBuilder` | `src/services/wiki-rag-builder.ts` | Article chunking and RAG building |
| `WorldCreationProgressManager` | `src/services/world-creation-progress.ts` | Progress tracking with SSE support |
| `IdleResearchScheduler` | `src/services/idle-research-scheduler.ts` | Background enrichment during idle time |
| `WikiSearchTool` | `src/mcp/wiki/wiki-search.ts` | MCP tool for RAG queries |
| `CLIProgressBar` | `src/utils/progress-bar.ts` | Terminal progress display |
| `wikiResearchRoutes` | `src/routes/wiki-research.ts` | SSE endpoints for UI |

### Data Flow

```
World Description → Keyword Extraction → Wikipedia Search → Article Parsing → Chunking → RAG
                                                                                      ↓
                                                                              MCP Search Tool
```

### Integration Points

- `WorldBuilder.enableWikipediaResearch(worldId)` — enables Wikipedia research
- `WorldBuilder.enrichWithWikipedia()` — starts research after world creation
- `wikiResearchRoutes` — SSE endpoints for real-time progress
- `WikiSearchTool` — MCP tool for querying RAG

## Design Decisions

1. **Separate wiki-rag index** — Isolated from existing RAG to avoid mixing sources
2. **Exponential backoff retry** — 5 attempts with 5s → 10s → 20s → 40s → 80s delays
3. **Graceful degradation** — World creates even if Wikipedia is unavailable
4. **SSE for progress** — Real-time updates without polling
5. **Idle enrichment** — Background research when player is inactive >1 hour

## Usage

### Automatic Research

```typescript
const worldBuilder = new WorldBuilder(deps);
worldBuilder.enableWikipediaResearch(worldId);
await worldBuilder.createWorld();
await worldBuilder.enrichWithWikipedia();
```

### API Endpoints

```
GET  /api/wiki/research/:worldId/progress  # SSE progress stream
POST /api/wiki/research/:worldId           # Start research
POST /api/wiki/research/:worldId/pause     # Pause research
POST /api/wiki/research/:worldId/resume    # Resume research
GET  /api/wiki/research/:worldId/status    # Get current status
```

### MCP Integration

```typescript
const tool = new WikiSearchTool();
tool.registerRAGBuilder(worldId, ragBuilder);

const results = await tool.search({
  query: 'medieval knighthood',
  worldId: 'my-world',
  limit: 10,
});
```

## Verification

### Test Summary

- **27 tests pass** across 8 test files
- Unit tests for all components
- Integration tests for full pipeline
- API endpoint tests

### Test Files

| File | Tests | Status |
|------|-------|--------|
| `tests/services/wikipedia-researcher.test.ts` | 3 | ✅ |
| `tests/services/wiki-rag-builder.test.ts` | 4 | ✅ |
| `tests/services/world-creation-progress.test.ts` | 4 | ✅ |
| `tests/services/idle-research-scheduler.test.ts` | 4 | ✅ |
| `tests/services/world-builder-wiki.test.ts` | 4 | ✅ |
| `tests/routes/wiki-research.test.ts` | 2 | ✅ |
| `tests/utils/progress-bar.test.ts` | 4 | ✅ |
| `tests/mcp/wiki-search.test.ts` | 2 | ✅ |

### Manual Testing

- Wikipedia API integration verified with real API calls
- Progress bar displays correctly in terminal
- SSE endpoints work with Hono streaming
- Pause/resume functionality works

## Journey Log

- [lesson] Wikipedia API requires `origin=*` parameter for CORS
- [pivot] Switched from in-memory cache to SQLite-based RAG for persistence
- [dead end] Initial chunking by sentences caused too many small chunks — switched to character-based chunking with overlap

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-08-01-wikipedia-rag-design.md` | Design spec | Final approved design |
| `docs/compose/plans/2026-08-01-wikipedia-rag.md` | Implementation plan | 10 tasks, all completed |
| `docs/wikipedia-rag.md` | User documentation | Usage guide |
