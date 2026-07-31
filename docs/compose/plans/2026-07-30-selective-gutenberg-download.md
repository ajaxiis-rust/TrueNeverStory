# Selective Gutenberg Download — Implementation Plan

> Spec: `docs/compose/specs/2026-07-30-selective-gutenberg-download.md`
> Experiment validated: 449 books, 4 authors, ~50MB, ~25 min

---

## T1: Catalog DB Schema + Helper

**File:** `src/mcp/gutenberg/catalog.ts`

Create a new module that manages the catalog database.

### Schema

```sql
-- data/mcp/gutenberg-catalog.db
CREATE TABLE books (
  etextno INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  birth_year INTEGER,
  death_year INTEGER,
  subjects TEXT,          -- JSON array string
  bookshelves TEXT,       -- JSON array string
  summary TEXT,
  download_count INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  downloaded BOOLEAN DEFAULT 0,
  selected BOOLEAN DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_downloaded ON books(downloaded);
CREATE INDEX IF NOT EXISTS idx_selected ON books(selected);
CREATE INDEX IF NOT EXISTS idx_download_count ON books(download_count);

CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
  title, author, subjects,
  content=books, content_rowid=rowid
);
```

### Class: `GutenbergCatalog`

```typescript
class GutenbergCatalog {
  private db: Database;

  constructor(dbPath = "data/mcp/gutenberg-catalog.db");

  // Metadata operations
  upsertBook(book: CatalogBook): void;
  upsertBooks(books: CatalogBook[]): void;  // batch insert in transaction

  // Query operations
  getStats(): { total: number; downloaded: number; selected: number };
  getPage(page: number, limit: number, sort: string, order: string): CatalogPage;
  search(query: string, limit: number): CatalogBook[];
  filter(opts: FilterOptions): CatalogBook[];

  // Selection operations
  select(etextnos: number[]): void;
  deselect(etextnos: number[]): void;
  selectAll(filter?: FilterOptions): number;  // returns count selected
  deselectAll(): void;
  getSelected(): CatalogBook[];

  // Download tracking
  markDownloaded(etextno: number, wordCount: number): void;

  close(): void;
}
```

### Types

```typescript
interface CatalogBook {
  etextno: number;
  title: string;
  author: string;
  birth_year: number | null;
  death_year: number | null;
  subjects: string[];     // parsed from JSON
  bookshelves: string[];  // parsed from JSON
  summary: string | null;
  download_count: number;
  word_count: number;
  downloaded: boolean;
  selected: boolean;
}

interface CatalogPage {
  books: CatalogBook[];
  total: number;
  page: number;
  totalPages: number;
}

interface FilterOptions {
  author?: string;
  year_from?: number;
  year_to?: number;
  min_downloads?: number;
  subject?: string;
}
```

### FTS sync triggers

```sql
CREATE TRIGGER books_ai AFTER INSERT ON books BEGIN
  INSERT INTO books_fts(rowid, title, author, subjects)
  VALUES (new.rowid, new.title, new.author, new.subjects);
END;

CREATE TRIGGER books_ad AFTER DELETE ON books BEGIN
  INSERT INTO books_fts(books_fts, rowid, title, author, subjects)
  VALUES ('delete', old.rowid, old.title, old.author, old.subjects);
END;

CREATE TRIGGER books_au AFTER UPDATE ON books BEGIN
  INSERT INTO books_fts(books_fts, rowid, title, author, subjects)
  VALUES ('delete', old.rowid, old.title, old.author, old.subjects);
  INSERT INTO books_fts(rowid, title, author, subjects)
  VALUES (new.rowid, new.title, new.author, new.subjects);
END;
```

**Acceptance:** Module exports `GutenbergCatalog` class, DB creates on first use, FTS works for title/author/subjects search.

---

## T2: Gutendex Fetcher Script

**File:** `scripts/build-gutenberg-catalog.ts`

CLI script that fetches metadata from Gutendex API and populates the catalog DB.

### Usage

```bash
bun scripts/build-gutenberg-catalog.ts --authors "Mark Twain,Jack London,Jules Verne"
bun scripts/build-gutenberg-catalog.ts --topic "adventure"
bun scripts/build-gutenberg-catalog.ts --popular --limit 500
```

### Logic

```
1. Parse args: --authors, --topic, --popular, --limit, --db
2. For each author:
   a. GET gutendex.com/books/?search=<author>&languages=en
   b. Paginate: follow `next` URL until null
   c. Filter: only books where author name matches (case-insensitive)
   d. Extract: id, title, authors[0], subjects, bookshelves, summaries[0], download_count
   e. Rate limit: 200ms between requests
3. Deduplicate by etextno (same book may appear in multiple author searches)
4. Batch upsert into catalog DB (transaction per page)
5. Emit JSON progress lines to stdout (for SSE integration)
```

### Progress format

```json
{"phase":"fetch","pct":15,"message":"Fetching Mark Twain: page 3/7 (150 books)"}
{"phase":"fetch","pct":50,"message":"Fetching Jack London: page 2/3 (50 books)"}
{"phase":"done","pct":100,"message":"545 books cataloged"}
```

### Args

| Arg | Default | Description |
|-----|---------|-------------|
| `--authors` | (required) | Comma-separated author names |
| `--topic` | — | Gutendex topic filter |
| `--popular` | false | Fetch top N by download count |
| `--limit` | 0 | Max books per author (0 = all) |
| `--db` | `data/mcp/gutenberg-catalog.db` | Catalog DB path |

**Acceptance:** Script populates catalog DB with metadata, SSE progress works, deduplication works.

---

## T3: Selective Text Downloader Script

**File:** `scripts/download-gutenberg-selected.ts`

CLI script that downloads plain text for selected books from Gutenberg.org.

### Usage

```bash
bun scripts/download-gutenberg-selected.ts --etextnos "74,76,86"
bun scripts/download-gutenberg-selected.ts --selected  # download all selected=1
bun scripts/download-gutenberg-selected.ts --author "Twain"  # select+download all by author
```

### Logic

```
1. Parse args: --etextnos, --selected, --author, --db, --out-dir
2. If --selected: query catalog DB for selected=1
3. If --author: query catalog DB for author match, mark as selected, download
4. For each etextno:
   a. Check if text already exists in out-dir (skip if so)
   b. GET gutenberg.org/ebooks/<id>.txt.utf-8
   c. Strip Gutenberg header/footer (*** START/END markers)
   d. Save to out-dir/<id>.txt
   e. Update catalog: downloaded=1, word_count=N
   f. Rate limit: 100ms between requests
5. Emit JSON progress lines to stdout
```

### Text stripping

```typescript
function stripGutenberg(text: string): string {
  const startMarkers = [
    "*** START OF THE PROJECT GUTENBERG EBOOK",
    "*** START OF THIS PROJECT GUTENBERG EBOOK",
    "***START OF THE PROJECT GUTENBERG EBOOK",
  ];
  const endMarkers = [
    "*** END OF THE PROJECT GUTENBERG EBOOK",
    "*** END OF THIS PROJECT GUTENBERG EBOOK",
    "***END OF THE PROJECT GUTENBERG EBOOK",
  ];
  // Find start marker, take text after first newline
  // Find end marker, take text before it
  // Return trimmed
}
```

### Progress format

```json
{"phase":"download","pct":10,"message":"3/30: The Adventures of Tom Sawyer (71k words)"}
{"phase":"done","pct":100,"message":"30 books downloaded, 0 failed"}
```

### Args

| Arg | Default | Description |
|-----|---------|-------------|
| `--etextnos` | — | Comma-separated etext numbers |
| `--selected` | false | Download all selected=1 from catalog |
| `--author` | — | Select+download all by author |
| `--db` | `data/mcp/gutenberg-catalog.db` | Catalog DB path |
| `--out-dir` | `data/gutenberg/texts` | Output directory |

**Acceptance:** Script downloads texts, strips headers, updates catalog, SSE progress works.

---

## T4: Catalog API Endpoints

**File:** `src/routes/mcp.ts` (add to existing)

Add REST endpoints for catalog browsing and management.

### Endpoints

```typescript
// POST /mcp/gutenberg/catalog/build
// Body: { authors: string[] }
// → spawns build-gutenberg-catalog.ts as child process
// → returns { job_id: "..." } for SSE tracking
router.post("/mcp/gutenberg/catalog/build", async (c) => {
  const { authors } = await c.req.json();
  // Use runScriptWithJob() to spawn script with SSE progress
  // Script: "bun scripts/build-gutenberg-catalog.ts --authors ..."
});

// GET /mcp/gutenberg/catalog/stats
// → { total: 545, downloaded: 100, selected: 25 }
router.get("/mcp/gutenberg/catalog/stats", (c) => {
  const catalog = new GutenbergCatalog();
  const stats = catalog.getStats();
  catalog.close();
  return c.json(stats);
});

// GET /mcp/gutenberg/catalog?page=1&limit=50&sort=download_count&order=desc
router.get("/mcp/gutenberg/catalog", (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "50");
  const sort = c.req.query("sort") || "download_count";
  const order = c.req.query("order") || "desc";
  const catalog = new GutenbergCatalog();
  const result = catalog.getPage(page, limit, sort, order);
  catalog.close();
  return c.json(result);
});

// GET /mcp/gutenberg/catalog/search?q=adventures&limit=50
router.get("/mcp/gutenberg/catalog/search", (c) => {
  const q = c.req.query("q") || "";
  const limit = parseInt(c.req.query("limit") || "50");
  const catalog = new GutenbergCatalog();
  const results = catalog.search(q, limit);
  catalog.close();
  return c.json(results);
});

// GET /mcp/gutenberg/catalog/filter?author=Twain&year_from=1850&year_to=1910
router.get("/mcp/gutenberg/catalog/filter", (c) => {
  const opts = {
    author: c.req.query("author"),
    year_from: c.req.query("year_from") ? parseInt(c.req.query("year_from")!) : undefined,
    year_to: c.req.query("year_to") ? parseInt(c.req.query("year_to")!) : undefined,
    min_downloads: c.req.query("min_downloads") ? parseInt(c.req.query("min_downloads")!) : undefined,
  };
  const catalog = new GutenbergCatalog();
  const results = catalog.filter(opts);
  catalog.close();
  return c.json(results);
});
```

**Acceptance:** All endpoints return correct JSON, catalog CRUD works, SSE progress for build.

---

## T5: Download-Selected Endpoint

**File:** `src/routes/mcp.ts` (add to existing)

```typescript
// POST /mcp/gutenberg/download-selected
// Body: { etextnos: number[] }
// → spawns download-gutenberg-selected.ts as child process
// → returns { job_id: "..." } for SSE tracking
router.post("/mcp/gutenberg/download-selected", async (c) => {
  const { etextnos } = await c.req.json();
  // Use runScriptWithJob() to spawn script with SSE progress
  // Script: "bun scripts/download-gutenberg-selected.ts --etextnos ..."
});

// POST /mcp/gutenberg/catalog/select-all
// Body: { filter?: { author?: string, year_from?: number, year_to?: number } }
router.post("/mcp/gutenberg/catalog/select-all", async (c) => {
  const { filter } = await c.req.json();
  const catalog = new GutenbergCatalog();
  const count = catalog.selectAll(filter);
  catalog.close();
  return c.json({ selected: count });
});

// POST /mcp/gutenberg/catalog/deselect-all
router.post("/mcp/gutenberg/catalog/deselect-all", (c) => {
  const catalog = new GutenbergCatalog();
  catalog.deselectAll();
  catalog.close();
  return c.json({ ok: true });
});
```

**Acceptance:** Download-selected spawns script, SSE progress works, select/deselect endpoints work.

---

## T6: Web UI — Catalog Tab

**File:** `public/mcp.html`

Add a new "Catalog" tab to the existing MCP web interface.

### Layout

```
┌─────────────────────────────────────────────────┐
│ [Bible] [Gutenberg] [Catalog] [Economy] ...     │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌─ Build Catalog ─────────────────────────────┐ │
│ │ Authors: [Mark Twain, Jack London, ...    ] │ │
│ │ [Build Catalog]  [Popular 500]              │ │
│ │ ████████████░░░░░░░░ 60% Fetching Twain...  │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Stats: 545 total | 100 downloaded | 25 selected │
│                                                 │
│ ┌─ Search & Filter ───────────────────────────┐ │
│ │ [🔍 adventures...          ] [Search]       │ │
│ │ Author: [▼ Any] Year: [1800]-[1920]         │ │
│ │ Min downloads: [1000]  [Apply] [Clear]      │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ [Select All] [Deselect All] [Download Selected] │
│                                                 │
│ ┌─ Results ───────────────────────────────────┐ │
│ │ ☑  #74  Tom Sawyer          Twain   43k dl  │ │
│ │ ☑  #76  Huckleberry Finn    Twain   35k dl  │ │
│ │ ☐  #86  Connecticut Yankee  Twain   28k dl  │ │
│ │ ...                                         │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ [< Prev] Page 1/11 [Next >]  Show: [50 ▼]      │
└─────────────────────────────────────────────────┘
```

### JavaScript functions

```typescript
// Build catalog
async function buildCatalog(authors: string): Promise<void>;

// Load catalog page
async function loadCatalogPage(page: number, sort?: string): Promise<void>;

// Search
async function searchCatalog(query: string): Promise<void>;

// Filter
async function filterCatalog(opts: FilterOptions): Promise<void>;

// Selection
function toggleSelect(etextno: number): void;
function selectAll(filter?: FilterOptions): void;
function deselectAll(): void;

// Download
async function downloadSelected(): Promise<void>;
```

### Integration with existing SSE

Reuse the existing SSE job system (`runScriptWithJob`) for progress tracking. The catalog build and download endpoints return `job_id` that the UI subscribes to.

**Acceptance:** Catalog tab renders, build/search/filter/select/download all work, SSE progress shows.

---

## T7: Tests

**File:** `src/routes/mcp.test.ts` (add to existing)

### New test cases

```typescript
describe("Gutenberg Catalog", () => {
  test("GET /mcp/gutenberg/catalog/stats returns zero when empty");
  test("POST /mcp/gutenberg/catalog/build starts job");
  test("GET /mcp/gutenberg/catalog returns paginated results");
  test("GET /mcp/gutenberg/catalog/search finds by title");
  test("GET /mcp/gutenberg/catalog/search finds by author");
  test("GET /mcp/gutenberg/catalog/filter filters by author");
  test("GET /mcp/gutenberg/catalog/filter filters by year range");
  test("POST /mcp/gutenberg/catalog/select-all selects matching");
  test("POST /mcp/gutenberg/catalog/deselect-all clears selections");
  test("POST /mcp/gutenberg/download-selected starts job");
  test("POST /mcp/gutenberg/download-selected with empty list returns error");
});
```

**Acceptance:** All new tests pass, existing tests still pass.

---

## Execution Order

```
T1 (Catalog DB) ──┬──→ T2 (Fetcher script) ──→ T4 (Catalog API)
                   │                              │
                   └──→ T3 (Download script) ──→ T5 (Download API)
                                                    │
                                                    └──→ T6 (Web UI) ──→ T7 (Tests)
```

- T1 is the foundation — everything depends on it
- T2 and T3 can be done in parallel after T1
- T4 and T5 can be done in parallel after T2/T3
- T6 depends on T4+T5 (needs API to exist)
- T7 depends on T4+T5 (tests API endpoints)

## Estimated Effort

| Task | Lines | Time |
|------|-------|------|
| T1: Catalog DB | ~150 | 30 min |
| T2: Fetcher script | ~100 | 20 min |
| T3: Download script | ~100 | 20 min |
| T4: Catalog API | ~100 | 30 min |
| T5: Download API | ~50 | 15 min |
| T6: Web UI | ~300 | 60 min |
| T7: Tests | ~100 | 30 min |
| **Total** | **~900** | **~3.5 hours** |

## Files Created/Modified

| File | Action |
|------|--------|
| `src/mcp/gutenberg/catalog.ts` | **New** — Catalog DB module |
| `scripts/build-gutenberg-catalog.ts` | **New** — Gutendex fetcher |
| `scripts/download-gutenberg-selected.ts` | **New** — Selective downloader |
| `src/routes/mcp.ts` | **Modified** — Add catalog endpoints |
| `public/mcp.html` | **Modified** — Add Catalog tab |
| `src/routes/mcp.test.ts` | **Modified** — Add catalog tests |
| `data/mcp/gutenberg-catalog.db` | **Created at runtime** |
| `data/gutenberg/texts/*.txt` | **Created at runtime** |
