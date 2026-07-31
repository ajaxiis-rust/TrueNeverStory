---
feature: selective-gutenberg-download
status: delivered
specs:
  - docs/compose/specs/2026-07-30-selective-gutenberg-download.md
plans:
  - docs/compose/plans/2026-07-30-selective-gutenberg-download.md
branch: main
---

# Selective Gutenberg Download — Final Report

## What Was Built

A metadata-first catalog system for selectively downloading books from Project Gutenberg. Instead of downloading the entire 51K-book corpus (12.9 GB), users can now browse a lightweight catalog, filter by author/topic/year, select specific books, and download only the chosen texts.

The system consists of three layers:
1. **Catalog DB** — SQLite database storing book metadata (title, author, subjects, download counts)
2. **Fetcher scripts** — CLI tools to populate the catalog from Gutendex API
3. **Web UI** — Browser-based interface for browsing, filtering, selecting, and downloading

## Architecture

### Components

```
Web UI (mcp.html)
  └─ Catalog tab — browse, search, filter, checkboxes, download

REST API (src/routes/mcp.ts)
  ├─ POST /mcp/gutenberg/catalog/build — fetch metadata
  ├─ GET  /mcp/gutenberg/catalog/stats — total/downloaded/selected counts
  ├─ GET  /mcp/gutenberg/catalog — paginated list
  ├─ GET  /mcp/gutenberg/catalog/search — FTS search
  ├─ GET  /mcp/gutenberg/catalog/filter — author/year/downloads filter
  ├─ POST /mcp/gutenberg/download-selected — download chosen books
  ├─ POST /mcp/gutenberg/catalog/select-all — select all matching filter
  └─ POST /mcp/gutenberg/catalog/deselect-all — clear selections

Catalog Module (src/mcp/gutenberg/catalog.ts)
  └─ GutenbergCatalog class — CRUD, FTS, selection, pagination

Scripts
  ├─ scripts/build-gutenberg-catalog.ts — Gutendex metadata fetcher
  └─ scripts/download-gutenberg-selected.ts — selective text downloader

Storage
  ├─ data/mcp/gutenberg-catalog.db — catalog metadata
  └─ data/gutenberg/texts/<id>.txt — downloaded book texts
```

### Data Flow

1. **Build Catalog** — Fetch metadata from Gutendex API by author/topic/popular
2. **Browse & Select** — Search, filter, checkbox selection in web UI
3. **Download** — Fetch plain text from gutenberg.org, strip headers, save locally

### Design Decisions

- **Separate catalog DB** — Catalog metadata is stored in `gutenberg-catalog.db`, separate from the existing `gutenberg-bookcorpus.db` to avoid schema conflicts
- **FTS5 triggers** — Automatic full-text search index synchronization via SQLite triggers
- **Gutendex API** — Used instead of direct Gutenberg.org scraping for reliable metadata
- **Rate limiting** — 200ms between Gutendex requests, 100ms between text downloads

## Usage

### Build Catalog

```bash
# By author
bun scripts/build-gutenberg-catalog.ts --authors "Mark Twain,Jack London"

# By topic
bun scripts/build-gutenberg-catalog.ts --topic "adventure"

# Popular books
bun scripts/build-gutenberg-catalog.ts --popular --limit 500
```

### Download Selected

```bash
# Download specific books
bun scripts/download-gutenberg-selected.ts --etextnos "74,76,86"

# Download all selected books
bun scripts/download-gutenberg-selected.ts --selected

# Select and download by author
bun scripts/download-gutenberg-selected.ts --author "Twain"
```

### Web UI

Navigate to MCP Console → Catalog tab:
- Enter authors or topic, click "Build Catalog"
- Search/filter by title, author, year, downloads
- Select books with checkboxes
- Click "Download Selected"

## Verification

- **35 tests pass** — All MCP route tests including 11 new catalog tests
- **Type check clean** — No TypeScript errors in catalog.ts or mcp.ts
- **Existing tests preserved** — All 24 existing tests still pass

### Test Coverage

- GET /mcp/gutenberg/catalog/stats — returns zero when empty
- POST /mcp/gutenberg/catalog/build — starts job
- GET /mcp/gutenberg/catalog — paginated results
- GET /mcp/gutenberg/catalog/search — FTS search by title/author
- GET /mcp/gutenberg/catalog/filter — author/year range filtering
- POST /mcp/gutenberg/catalog/select-all — select matching
- POST /mcp/gutenberg/catalog/deselect-all — clear selections
- POST /mcp/gutenberg/download-selected — starts job, validates input

## Journey Log

- [lesson] Gutendex API is reliable and doesn't require authentication
- [pivot] Used `db.query().run()` instead of `db.run()` for proper TypeScript typing with bun:sqlite
- [lesson] FTS5 triggers simplify search index management significantly

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-07-30-selective-gutenberg-download.md` | Design spec | Includes topic support |
| `docs/compose/plans/2026-07-30-selective-gutenberg-download.md` | Implementation plan | 7 tasks, all complete |
| `src/mcp/gutenberg/catalog.ts` | Catalog module | GutenbergCatalog class |
| `scripts/build-gutenberg-catalog.ts` | Metadata fetcher | --authors, --topic, --popular |
| `scripts/download-gutenberg-selected.ts` | Text downloader | --etextnos, --selected, --author |
| `src/routes/mcp.ts` | API endpoints | 8 new catalog endpoints |
| `public/mcp.html` | Web UI | Catalog tab added |
| `src/routes/mcp.test.ts` | Tests | 11 new catalog tests |
