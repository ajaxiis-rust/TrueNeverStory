# Selective Gutenberg Download — Design Spec (v2)

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/selective-gutenberg-download.md)

## [S1] Problem

The current Gutenberg pipeline downloads the entire corpus (51K books, 12.9 GB parquet) before any filtering. This wastes bandwidth and time when only specific genres, authors, or books are needed.

**Goal:** Enable metadata-first browsing and selective downloading — build a lightweight catalog first, then download only chosen books.

## [S2] Architecture

```
Web UI (mcp.html)
  ├─ Catalog tab (browse, search, filter, checkboxes)
  ├─ "Build Catalog" button → Gutendex API → local SQLite
  └─ "Download Selected" button → selective text download → SQLite

REST API (mcp.ts)
  ├─ POST /mcp/gutenberg/catalog/build
  ├─ GET  /mcp/gutenberg/catalog/stats
  ├─ GET  /mcp/gutenberg/catalog?page=&limit=&sort=&order=
  ├─ GET  /mcp/gutenberg/catalog/search?q=&limit=
  ├─ GET  /mcp/gutenberg/catalog/filter?author=&year_from=&year_to=
  ├─ POST /mcp/gutenberg/download-selected { etextnos: [...] }
  └─ POST /mcp/gutenberg/catalog/select-all { filter: {...} }

Local Catalog DB (data/mcp/gutenberg-catalog.db)
  ├─ books: etextno, title, author, birth_year, death_year, subjects, bookshelves, summary, download_count, downloaded, selected
  └─ books_fts: FTS5 on title, author, subjects

Gutendex API (gutendex.com)
  └─ GET /books/?search=<author>&languages=en → paginated metadata
  └─ GET /books/?topic=<subject>&languages=en → paginated by subject

Gutenberg.org
  └─ GET /ebooks/<id>.txt.utf-8 → plain text
```

## [S3] Data Flow

### Phase 1: Catalog Build (by author or topic)

**By author:**
1. For each author in list, call Gutendex API: `GET /books/?search=<author>&languages=en`
2. Paginate through all results (32 per page)
3. Filter: only books where author name matches (case-insensitive)
4. Extract: id, title, authors, subjects, bookshelves, summaries, download_count
5. Save to local `gutenberg-catalog.db`
6. SSE progress: "Fetching Mark Twain: 150/213..."

**By topic:**
1. Call Gutendex API: `GET /books/?topic=<topic>&languages=en`
2. Paginate through all results (32 per page)
3. Extract: same fields as author mode
4. Save to local `gutenberg-catalog.db`
5. SSE progress: "Fetching adventure: page 5/12..."

**By popular:**
1. Call Gutendex API: `GET /books/?sort=popular&languages=en`
2. Paginate, extract, save
3. Apply `--limit` to take top N by download count

### Phase 2: Browse & Select

1. `GET /mcp/gutenberg/catalog?page=1&limit=50` → paginated table
2. `GET /mcp/gutenberg/catalog/search?q=Shakespeare` → FTS search
3. `GET /mcp/gutenberg/catalog/filter?author=Twain` → filtered results
4. User selects books via checkboxes → `selected = 1` in DB

### Phase 3: Selective Download

1. `POST /mcp/gutenberg/download-selected { etextnos: [74, 76, 86] }`
2. For each etextno, download plain text from `gutenberg.org/ebooks/<id>.txt.utf-8`
3. Strip Gutenberg header/footer
4. Store text in `data/gutenberg/texts/<id>.txt`
5. Insert metadata into `gutenberg-bookcorpus.db` (or separate selective DB)
6. Mark books as `downloaded = 1` in catalog
7. SSE progress: "Downloading 3/50: Tom Sawyer (71k words)..."

## [S4] API Endpoints

### Catalog Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp/gutenberg/catalog/build` | POST | Fetch metadata via Gutendex API → local catalog. Body: `{ authors?: ["Mark Twain"], topic?: "adventure", limit?: 500 }` |
| `/mcp/gutenberg/catalog/stats` | GET | `{ total: 545, downloaded: 100, selected: 25 }` |
| `/mcp/gutenberg/catalog` | GET | Paginated: `?page=1&limit=50&sort=download_count&order=desc` |
| `/mcp/gutenberg/catalog/search` | GET | FTS: `?q=adventures&limit=50` |
| `/mcp/gutenberg/catalog/filter` | GET | Filter: `?author=Twain&year_from=1850&year_to=1910` |

### Selection & Download

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp/gutenberg/download-selected` | POST | `{ etextnos: [74, 76] }` — download only these |
| `/mcp/gutenberg/catalog/select-all` | POST | `{ filter: { author: "Twain" } }` — select all matching |
| `/mcp/gutenberg/catalog/deselect-all` | POST | Clear all selections |

## [S5] Local Catalog Schema

```sql
CREATE TABLE books (
  etextno INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  birth_year INTEGER,
  death_year INTEGER,
  subjects TEXT,          -- JSON array
  bookshelves TEXT,       -- JSON array
  summary TEXT,
  download_count INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  downloaded BOOLEAN DEFAULT 0,
  selected BOOLEAN DEFAULT 0
);

CREATE INDEX idx_author ON books(author);
CREATE INDEX idx_downloaded ON books(downloaded);
CREATE INDEX idx_selected ON books(selected);
CREATE INDEX idx_download_count ON books(download_count);

CREATE VIRTUAL TABLE books_fts USING fts5(
  title, author, subjects,
  content=books, content_rowid=rowid
);
```

## [S6] Gutendex API

```
GET https://gutendex.com/books/?search=<author>&languages=en
```

Response:
```json
{
  "count": 213,
  "next": "https://gutendex.com/books/?page=2&search=mark+twain&languages=en",
  "results": [
    {
      "id": 74,
      "title": "The Adventures of Tom Sawyer, Complete",
      "authors": [{ "name": "Twain, Mark", "birth_year": 1835, "death_year": 1910 }],
      "summaries": ["..."],
      "subjects": ["Adventure stories", "Bildungsromans"],
      "bookshelves": ["Category: Adventure", "Category: American Literature"],
      "download_count": 43362
    }
  ]
}
```

Pagination: follow `next` URL until null.

Rate limit: 200ms between requests (be polite).

## [S7] Selective Download Logic

```typescript
// 1. Get selected books from catalog
const selected = db.query(
  "SELECT etextno, title, author, word_count FROM books WHERE selected = 1"
).all();

// 2. Download plain text for each
for (const book of selected) {
  const url = `https://www.gutenberg.org/ebooks/${book.etextno}.txt.utf-8`;
  const text = await fetch(url).then(r => r.text());
  const clean = stripGutenberg(text);

  // Save to file
  await Bun.write(`data/gutenberg/texts/${book.etextno}.txt`, clean);

  // Update catalog
  db.run("UPDATE books SET downloaded = 1, word_count = ? WHERE etextno = ?",
    clean.split(/\s+/).length, book.etextno);
}
```

## [S8] Web UI — Catalog Tab

New tab in `mcp.html`:

- **Build Catalog** section:
  - Author input (comma-separated names)
  - "Build Catalog" button
  - SSE progress bar
- **Stats bar**: total books, downloaded, selected
- **Search bar**: FTS search by title/author/subjects
- **Filter dropdowns**: author, year range, min downloads
- **Table**: checkbox, etextno, title, author, subjects, downloads, word_count
- **Pagination**: prev/next, page size selector
- **Action bar**: "Download Selected" button with count
- **Select All / Deselect All** buttons

## [S9] Implementation Tasks

| # | Task | Files | Depends |
|---|------|-------|---------|
| 1 | Catalog DB schema + helper | `src/mcp/gutenberg/catalog.ts` | — |
| 2 | Gutendex fetcher (metadata) | `scripts/build-gutenberg-catalog.ts` | T1 |
| 3 | Selective text downloader | `scripts/download-gutenberg-selected.ts` | T1 |
| 4 | Catalog API endpoints | `src/routes/mcp.ts` | T1, T2 |
| 5 | Download-selected endpoint | `src/routes/mcp.ts` | T1, T3 |
| 6 | Web UI Catalog tab | `public/mcp.html` | T4, T5 |
| 7 | Tests | `src/routes/mcp.test.ts` | T4, T5 |

## [S10] Constraints

- No new dependencies (use existing bun:sqlite, fetch)
- Catalog build must show SSE progress
- Download-selected must show SSE progress
- Existing full-download endpoint remains available as fallback
- Catalog DB is separate from corpus DB (no schema conflicts)
- Rate limit: 200ms between Gutendex requests, 100ms between Gutenberg text downloads

## [S11] Experiment Results (validated)

Tested with 4 authors via `scripts/gutenberg-selective.ts`:

| Author | Books | Words | Avg Downloads |
|--------|-------|-------|---------------|
| Mark Twain | 158 | 8.0M | 1,942 |
| Shakespeare | 183 | 7.4M | 3,049 |
| Jules Verne | 52 | 4.3M | 4,520 |
| Jack London | 56 | 3.2M | 1,751 |
| **Total** | **449** | **22.9M** | |

- Download time: ~25 min (with rate limiting)
- Size: ~50MB texts + <1MB metadata
- 96 books failed (mostly non-English editions filtered by language param)
- Gutendex API is reliable, no auth needed
- Plain text from gutenberg.org is clean and well-structured
