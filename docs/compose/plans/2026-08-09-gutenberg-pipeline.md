# Gutenberg Processing Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete pipeline from 59 downloaded Gutenberg `.txt` files to four populated SQLite databases consumed by Stylist, Dramaturg, and LiteraryV2Generator agents.

**Architecture:** Two scripts (`import-gutenberg-texts.ts` and `process-gutenberg.ts`) + shared utilities. Phase A (rule-based, no LLM) fills `gutenberg-normalized.db` and `classics-compiled.db`. Phase B (LLM) fills `literary.db`. A separate `PlayerProfileStore` manages cross-agent player profiles.

**Tech Stack:** Bun runtime, `bun:sqlite`, TypeScript, existing LiteraryCompiler passes (DramaturgicPass, StylisticPass, EmotionalPass, MetadataPass, Linter)

## Global Constraints

- `bun` is the only runtime/package manager — no node/npm
- LLM cache is disabled — do not enable
- Agents generate narrative in English only — TranslationService handles user language
- Do not modify Bible pipeline, existing FTS5 indexes, or agent prompts
- No auto-trigger after download — manual control via MCP endpoint
- Each commit must pass `bun test` (if tests exist for touched files)
- **S15 (V1.5 LLM-enriched style analysis)** is deferred — V1 rule-based + V2 LLM is sufficient for initial pipeline; V1.5 adds 1 LLM request per book as a future optimization

---

## File Structure

### New Files
| Path | Responsibility |
|------|---------------|
| `src/mcp/gutenberg/clean.ts` | Shared `cleanGutenbergText()` function |
| `src/mcp/gutenberg/helpers.ts` | `inferEra()`, `inferLiteraryPeriod()`, `sampleExcerpts()` |
| `src/lib/player-profile-store.ts` | Standalone `PlayerProfileStore` (shared V1/V2) |
| `scripts/import-gutenberg-texts.ts` | Import `.txt` + catalog → `classics.db` |
| `scripts/process-gutenberg.ts` | Phase A (V1) + Phase B (V2) pipeline orchestrator |
| `src/mcp/gutenberg/analyze-pass.ts` | Combined `analyzeChunk()` — pre-score + scene classification |
| `src/mcp/gutenberg/narrative-extractor.ts` | Narrative structure extraction (arcs, motifs) |
| `scripts/expand-corpus.ts` | Corpus expansion from 59 → 250+ |
| `src/mcp/gutenberg/__tests__/clean.test.ts` | Tests for clean function |
| `src/mcp/gutenberg/__tests__/helpers.test.ts` | Tests for helpers |
| `src/mcp/gutenberg/__tests__/analyze-pass.test.ts` | Tests for AnalyzePass |
| `src/lib/__tests__/player-profile-store.test.ts` | Tests for PlayerProfileStore |

### Modified Files
| Path | Changes |
|------|---------|
| `src/mcp/gutenberg/parser.ts` | Fix source DB to `classics.db`; extend `gutenberg_styles` schema with new columns |
| `src/mcp/literary-compiler/schema.ts` | Add `narrative_arcs`, `thematic_motifs`, `quality_calibration` tables; extend `chunk_index` with new columns |
| `src/mcp/literary-compiler/types.ts` | Add `mode` to `DramaturgicInput` |
| `src/mcp/literary-compiler/dramaturgic-pass.ts` | Add prose mode: `PROSE_ARCHETYPE_KEYWORDS`, `generateProseTemplate()`, prose positions/variables |
| `src/routes/mcp.ts` | Add `/gutenberg/process` endpoint |
| `scripts/compile-classics.ts` | Replace inline `cleanText()` with shared `cleanGutenbergText()` |

---

### Task 1: Shared Text Cleaning Function [S4]

**Covers:** S4, S9 (bug #9: three different stripGutenberg functions)

**Files:**
- Create: `src/mcp/gutenberg/clean.ts`
- Create: `src/mcp/gutenberg/__tests__/clean.test.ts`

**Interfaces:**
- Produces: `cleanGutenbergText(raw: string): string` — used by Tasks 2, 4, 5

- [ ] **Step 1: Write failing tests for cleanGutenbergText**

```typescript
// src/mcp/gutenberg/__tests__/clean.test.ts
import { describe, it, expect } from 'bun:test';
import { cleanGutenbergText } from '../clean';

describe('cleanGutenbergText', () => {
  it('removes standard START/END markers', () => {
    const raw = `Header junk
*** START OF THE PROJECT GUTENBERG EBOOK ***
Real content here.
*** END OF THE PROJECT GUTENBERG EBOOK ***
Footer junk`;
    const result = cleanGutenbergText(raw);
    expect(result).toContain('Real content here.');
    expect(result).not.toContain('START OF');
    expect(result).not.toContain('END OF');
    expect(result).not.toContain('Header junk');
    expect(result).not.toContain('Footer junk');
  });

  it('removes variant START markers', () => {
    const raw = `*** START OF THIS PROJECT GUTENBERG EBOOK ***
Content
*** END OF THIS PROJECT GUTENBERG EBOOK ***`;
    const result = cleanGutenbergText(raw);
    expect(result).toBe('Content');
  });

  it('removes "Produced by" and "Transcriber\'s Note" lines', () => {
    const raw = `*** START OF THE PROJECT GUTENBERG EBOOK ***
Produced by John Doe
Transcriber's Note: fixed typos
Actual text.
*** END OF THE PROJECT GUTENBERG EBOOK ***`;
    const result = cleanGutenbergText(raw);
    expect(result).not.toContain('Produced by');
    expect(result).not.toContain('Transcriber');
    expect(result).toContain('Actual text.');
  });

  it('normalizes CRLF to LF', () => {
    const raw = 'line1\r\nline2\r\nline3';
    const result = cleanGutenbergText(raw);
    expect(result).not.toContain('\r');
  });

  it('collapses triple+ newlines to double', () => {
    const raw = 'a\n\n\n\n\nb';
    const result = cleanGutenbergText(raw);
    expect(result).toBe('a\n\nb');
  });

  it('trims whitespace', () => {
    const raw = '   content   ';
    const result = cleanGutenbergText(raw);
    expect(result).toBe('content');
  });

  it('handles text without markers (returns trimmed)', () => {
    const raw = 'Just plain text without markers.';
    const result = cleanGutenbergText(raw);
    expect(result).toBe('Just plain text without markers.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/mcp/gutenberg/__tests__/clean.test.ts`
Expected: FAIL — module `../clean` not found

- [ ] **Step 3: Implement cleanGutenbergText**

```typescript
// src/mcp/gutenberg/clean.ts

/**
 * Strip Gutenberg header/footer boilerplate and normalize whitespace.
 * Shared across import-gutenberg-texts, process-gutenberg, and compile-classics.
 */
export function cleanGutenbergText(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n');

  const startMarkers = [
    '*** START OF THE PROJECT GUTENBERG EBOOK',
    '*** START OF THIS PROJECT GUTENBERG EBOOK',
    '***START OF THE PROJECT GUTENBERG EBOOK',
    '*** START OF THE PROJECT GUTENBERG E-TEXT',
  ];
  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      text = text.slice(text.indexOf('\n', idx) + 1);
      break;
    }
  }

  const endMarkers = [
    '*** END OF THE PROJECT GUTENBERG EBOOK',
    '*** END OF THIS PROJECT GUTENBERG EBOOK',
    '***END OF THE PROJECT GUTENBERG EBOOK',
    '*** END OF THE PROJECT GUTENBERG E-TEXT',
  ];
  for (const marker of endMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      text = text.slice(0, idx);
      break;
    }
  }

  text = text.replace(/^.*Project Gutenberg.*$/gm, '');
  text = text.replace(/^.*This etext was prepared.*$/gm, '');
  text = text.replace(/^.*Produced by.*$/gm, '');
  text = text.replace(/^.*Transcriber's [Nn]ote.*$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/mcp/gutenberg/__tests__/clean.test.ts`
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp/gutenberg/clean.ts src/mcp/gutenberg/__tests__/clean.test.ts
git commit -m "feat(gutenberg): add shared cleanGutenbergText utility

Extracts common text cleaning from three different implementations
(stripGutenberg in compile-classics, download-gutenberg-selected, and
inline in parser). Fixes bug #9 from design spec."
```

---

### Task 2: Era/Period Helpers + Schema Extensions [S3, S12, S13]

**Covers:** S3.1, S3.2 (new columns), S3.5 (player-profiles schema), S12 (helpers), S13.1-13.3

**Files:**
- Create: `src/mcp/gutenberg/helpers.ts`
- Create: `src/mcp/gutenberg/__tests__/helpers.test.ts`
- Modify: `src/mcp/literary-compiler/schema.ts` — add `narrative_arcs`, `thematic_motifs`, `quality_calibration` tables; extend `chunk_index` and `style_patterns` with new columns

**Interfaces:**
- Produces: `inferEra(birth?, death?): string`, `inferLiteraryPeriod(birth?, death?): string`, `sampleExcerpts(text, count, length): string[]`
- Produces: `LiteraryCompilerDB.createNarrativeTables()`, `insertNarrativeArc()`, `insertThematicMotif()`, `insertQualityCalibration()`

- [ ] **Step 1: Write failing tests for helpers**

```typescript
// src/mcp/gutenberg/__tests__/helpers.test.ts
import { describe, it, expect } from 'bun:test';
import { inferEra, inferLiteraryPeriod, sampleExcerpts } from '../helpers';

describe('inferEra', () => {
  it('returns 18th_century for mid < 1790', () => {
    expect(inferEra(1660, 1730)).toBe('18th_century');
  });
  it('returns 19th_century for mid 1790-1899', () => {
    expect(inferEra(1810, 1870)).toBe('19th_century');
  });
  it('returns early_20th_century for mid >= 1900', () => {
    expect(inferEra(1880, 1940)).toBe('early_20th_century');
  });
  it('uses defaults when no years given', () => {
    expect(inferEra()).toBe('19th_century');
  });
});

describe('inferLiteraryPeriod', () => {
  it('returns enlightenment for mid < 1790', () => {
    expect(inferLiteraryPeriod(1660, 1730)).toBe('enlightenment');
  });
  it('returns romanticism for mid 1790-1859', () => {
    expect(inferLiteraryPeriod(1790, 1850)).toBe('romanticism');
  });
  it('returns victorian for mid 1860-1899', () => {
    expect(inferLiteraryPeriod(1830, 1890)).toBe('victorian');
  });
  it('returns modernism for mid >= 1900', () => {
    expect(inferLiteraryPeriod(1880, 1940)).toBe('modernism');
  });
});

describe('sampleExcerpts', () => {
  it('returns requested number of excerpts', () => {
    const text = 'a'.repeat(10000);
    const result = sampleExcerpts(text, 3, 200);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(200);
  });
  it('handles text shorter than requested total', () => {
    const text = 'short text';
    const result = sampleExcerpts(text, 3, 200);
    expect(result.length).toBeLessThanOrEqual(3);
  });
  it('returns excerpts from different positions', () => {
    const text = 'A'.repeat(5000) + 'B'.repeat(5000);
    const result = sampleExcerpts(text, 2, 100);
    expect(result[0]).toContain('A');
    expect(result[1]).toContain('B');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/mcp/gutenberg/__tests__/helpers.test.ts`
Expected: FAIL — module `../helpers` not found

- [ ] **Step 3: Implement helpers**

```typescript
// src/mcp/gutenberg/helpers.ts

export function inferEra(birthYear?: number, deathYear?: number): string {
  const mid = ((birthYear ?? 1800) + (deathYear ?? 1900)) / 2;
  if (mid < 1790) return '18th_century';
  if (mid < 1900) return '19th_century';
  return 'early_20th_century';
}

export function inferLiteraryPeriod(birthYear?: number, deathYear?: number): string {
  const mid = ((birthYear ?? 1800) + (deathYear ?? 1900)) / 2;
  if (mid < 1790) return 'enlightenment';
  if (mid < 1860) return 'romanticism';
  if (mid < 1900) return 'victorian';
  return 'modernism';
}

/**
 * Sample `count` excerpts of `length` chars from evenly-spaced positions in `text`.
 */
export function sampleExcerpts(text: string, count: number, length: number): string[] {
  if (text.length <= length * count) {
    // Text is short — return what we can
    const results: string[] = [];
    for (let i = 0; i < count && i * length < text.length; i++) {
      results.push(text.slice(i * length, (i + 1) * length));
    }
    return results;
  }

  const step = Math.floor((text.length - length) / Math.max(count - 1, 1));
  const excerpts: string[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.min(i * step, text.length - length);
    excerpts.push(text.slice(start, start + length));
  }
  return excerpts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/mcp/gutenberg/__tests__/helpers.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Extend LiteraryCompilerDB schema**

Add the following to `src/mcp/literary-compiler/schema.ts`:

In `createV2Tables()`, add to the `chunk_index` table creation (after `cluster_id`):

```sql
scene_type TEXT,
tempo TEXT,
sensory_tags TEXT DEFAULT '[]',
narrative_distance REAL DEFAULT 0.5,
temporal_markers TEXT DEFAULT '[]',
```

Also add these new columns to the `style_patterns` table:

```sql
narrative_voice TEXT NOT NULL DEFAULT 'third_person',
temporal_style TEXT NOT NULL DEFAULT 'linear',
dialogue_style TEXT NOT NULL DEFAULT 'direct',
metaphor_density REAL NOT NULL DEFAULT 0.5,
sentence_opening_variance REAL NOT NULL DEFAULT 0.5,
paragraph_length_avg REAL NOT NULL DEFAULT 60.0,
exclamation_ratio REAL NOT NULL DEFAULT 0.05,
rhetorical_devices TEXT NOT NULL DEFAULT '[]',
era TEXT NOT NULL DEFAULT '19th_century',
literary_period TEXT NOT NULL DEFAULT 'romanticism',
```

Add a new method `createNarrativeTables()`:

```typescript
createNarrativeTables(): void {
  this.db.exec(`
    CREATE TABLE IF NOT EXISTS narrative_arcs (
      id TEXT PRIMARY KEY,
      source_book TEXT NOT NULL,
      arc_type TEXT NOT NULL,
      archetype TEXT NOT NULL,
      tension_points TEXT NOT NULL DEFAULT '[]',
      transformation TEXT,
      thematic_motifs TEXT NOT NULL DEFAULT '[]',
      moral_vector TEXT,
      scale TEXT NOT NULL DEFAULT 'personal',
      quality_score REAL NOT NULL DEFAULT 0.5,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  this.db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS narrative_arcs_fts
    USING fts5(source_book, transformation, thematic_motifs, archetype,
               content=narrative_arcs, content_rowid=rowid);
  `);

  this.db.exec(`
    CREATE TABLE IF NOT EXISTS thematic_motifs (
      id TEXT PRIMARY KEY,
      source_book TEXT NOT NULL,
      motif_name TEXT NOT NULL,
      occurrences TEXT NOT NULL DEFAULT '[]',
      symbolic_layer TEXT,
      evolution TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  this.db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS thematic_motifs_fts
    USING fts5(motif_name, symbolic_layer, evolution,
               content=thematic_motifs, content_rowid=rowid);
  `);

  this.db.exec(`
    CREATE TABLE IF NOT EXISTS quality_calibration (
      source_book TEXT NOT NULL,
      l0_avg REAL NOT NULL,
      l1_avg REAL NOT NULL,
      correlation REAL NOT NULL,
      template_count INTEGER NOT NULL,
      outlier_count INTEGER NOT NULL,
      calibrated_at INTEGER NOT NULL,
      PRIMARY KEY (source_book)
    );
  `);

  this.db.exec(`
    CREATE TABLE IF NOT EXISTS literary_influences (
      id             TEXT PRIMARY KEY,
      source_author  TEXT NOT NULL,
      influenced_by  TEXT NOT NULL,
      influence_type TEXT NOT NULL,
      description    TEXT NOT NULL,
      examples       TEXT NOT NULL DEFAULT '[]',
      created_at     INTEGER NOT NULL
    );
  `);

  this.db.exec(`
    CREATE TABLE IF NOT EXISTS style_continuum (
      style_id_a    TEXT NOT NULL,
      style_id_b    TEXT NOT NULL,
      distance      REAL NOT NULL,
      transition    TEXT NOT NULL,
      PRIMARY KEY (style_id_a, style_id_b)
    );
  `);
}
```

Add insert/query methods:

```typescript
insertNarrativeArc(arc: {
  id: string; source_book: string; arc_type: string; archetype: string;
  tension_points: string; transformation: string | null;
  thematic_motifs: string; moral_vector: string | null;
  scale: string; quality_score: number; created_at: number;
}): void {
  this.db.prepare(`
    INSERT OR REPLACE INTO narrative_arcs
    (id, source_book, arc_type, archetype, tension_points, transformation,
     thematic_motifs, moral_vector, scale, quality_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    arc.id, arc.source_book, arc.arc_type, arc.archetype,
    arc.tension_points, arc.transformation, arc.thematic_motifs,
    arc.moral_vector, arc.scale, arc.quality_score, arc.created_at
  );
}

insertThematicMotif(motif: {
  id: string; source_book: string; motif_name: string;
  occurrences: string; symbolic_layer: string | null;
  evolution: string | null; created_at: number;
}): void {
  this.db.prepare(`
    INSERT OR REPLACE INTO thematic_motifs
    (id, source_book, motif_name, occurrences, symbolic_layer, evolution, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    motif.id, motif.source_book, motif.motif_name,
    motif.occurrences, motif.symbolic_layer, motif.evolution, motif.created_at
  );
}

insertQualityCalibration(cal: {
  source_book: string; l0_avg: number; l1_avg: number;
  correlation: number; template_count: number;
  outlier_count: number; calibrated_at: number;
}): void {
  this.db.prepare(`
    INSERT OR REPLACE INTO quality_calibration
    (source_book, l0_avg, l1_avg, correlation, template_count, outlier_count, calibrated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    cal.source_book, cal.l0_avg, cal.l1_avg, cal.correlation,
    cal.template_count, cal.outlier_count, cal.calibrated_at
  );
}

updateChunkAnalysis(chunk: {
  chunk_id: string; scene_type: string; tempo: string;
  sensory_tags: string; narrative_distance: number;
  temporal_markers: string; dict_hits: number; pre_score: number;
}): void {
  this.db.prepare(`
    UPDATE chunk_index SET
      scene_type = ?, tempo = ?, sensory_tags = ?,
      narrative_distance = ?, temporal_markers = ?,
      dict_hits = ?, pre_score = ?
    WHERE chunk_id = ?
  `).run(
    chunk.scene_type, chunk.tempo, chunk.sensory_tags,
    chunk.narrative_distance, chunk.temporal_markers,
    chunk.dict_hits, chunk.pre_score, chunk.chunk_id
  );
}
```

- [ ] **Step 6: Run existing tests to verify no regressions**

Run: `bun test src/mcp/literary-compiler/`
Expected: all existing tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/mcp/gutenberg/helpers.ts src/mcp/gutenberg/__tests__/helpers.test.ts \
        src/mcp/literary-compiler/schema.ts
git commit -m "feat(gutenberg): add era/period helpers and extend DB schemas

- inferEra/inferLiteraryPeriod for author birth/death year mapping
- sampleExcerpts for V1.5 LLM analysis
- narrative_arcs, thematic_motifs, quality_calibration tables
- Extended chunk_index with scene_type, tempo, sensory_tags, etc.
- Extended style_patterns with narrative_voice, era, literary_period, etc."
```

---

### Task 3: Fix GutenbergParser Source DB + Import Script [S1, S3.1, S5, S11]

**Covers:** S1 (bug #2: parser reads itself), S3.1 (classics.db schema), S5 (import script), S11 (bug #11)

**Files:**
- Modify: `src/mcp/gutenberg/parser.ts` — fix `config.dbPath` to `classics.db`; extend `gutenberg_styles` schema
- Create: `scripts/import-gutenberg-texts.ts`

**Interfaces:**
- Consumes: `cleanGutenbergText` from Task 1, `GutenbergCatalog` (existing)
- Produces: `data/gutenberg/classics.db` with `gutenberg` table (S3.1 schema)

- [ ] **Step 1: Fix GutenbergParser to read from classics.db**

In `src/mcp/gutenberg/parser.ts`, modify `createNormalizedTables()` to add the new columns from S3.2:

```typescript
private createNormalizedTables(): void {
  this.normalizedDb.exec(`
    CREATE TABLE IF NOT EXISTS gutenberg_texts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      language TEXT DEFAULT 'en',
      text TEXT NOT NULL,
      source_work_id TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  this.normalizedDb.exec(`
    CREATE TABLE IF NOT EXISTS gutenberg_styles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      examples TEXT NOT NULL,
      vocabulary TEXT NOT NULL,
      sentence_patterns TEXT NOT NULL,
      mood_tags TEXT NOT NULL,
      narrative_voice TEXT NOT NULL DEFAULT 'third_person',
      temporal_style TEXT NOT NULL DEFAULT 'linear',
      metaphor_density REAL NOT NULL DEFAULT 0.5,
      rhetorical_devices TEXT NOT NULL DEFAULT '[]',
      era TEXT NOT NULL DEFAULT '19th_century',
      source TEXT,
      source_work_id TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);
}
```

In `extractStyles()`, update the INSERT statement to include the new columns (with defaults):

```typescript
this.normalizedDb
  .query(`INSERT OR IGNORE INTO gutenberg_styles
    (id, name, description, examples, vocabulary, sentence_patterns, mood_tags,
     narrative_voice, temporal_style, metaphor_density, rhetorical_devices, era,
     source, source_work_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'third_person', 'linear', 0.5, '[]', '19th_century', ?, ?)`)
  .run(
    style.id, style.name, style.description,
    JSON.stringify(style.examples), JSON.stringify(style.vocabulary),
    JSON.stringify(style.sentencePatterns), JSON.stringify(style.moodTags),
    style.source, style.sourceWorkId ?? '',
  );
```

- [ ] **Step 2: Write import-gutenberg-texts.ts**

```typescript
#!/usr/bin/env bun
/**
 * Import Gutenberg .txt files into classics.db.
 *
 * Reads:  data/gutenberg/texts/*.txt
 *         data/mcp/gutenberg-catalog.db (metadata)
 * Writes: data/gutenberg/classics.db
 *
 * Usage: bun scripts/import-gutenberg-texts.ts
 */

import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { GutenbergCatalog } from '../src/mcp/gutenberg/catalog';
import { cleanGutenbergText } from '../src/mcp/gutenberg/clean';

// ── Config ──────────────────────────────────────────────────────
const TEXTS_DIR = './data/gutenberg/texts';
const CATALOG_DB = './data/mcp/gutenberg-catalog.db';
const CLASSICS_DB = './data/gutenberg/classics.db';

// ── Progress ────────────────────────────────────────────────────
interface ProgressMsg {
  phase: string;
  pct: number;
  message: string;
}
function emit(msg: ProgressMsg) {
  console.log(JSON.stringify(msg));
}

// ── Main ────────────────────────────────────────────────────────

// Ensure output directory exists
const dir = join(CLASSICS_DB, '..');
const { mkdirSync, existsSync } = await import('node:fs');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

// Open/create classics.db
const classicsDb = new Database(CLASSICS_DB);
classicsDb.exec('PRAGMA journal_mode=WAL');
classicsDb.exec('PRAGMA synchronous=NORMAL');
classicsDb.exec(`
  CREATE TABLE IF NOT EXISTS gutenberg (
    etextno       INTEGER PRIMARY KEY,
    book_title    TEXT NOT NULL,
    author        TEXT NOT NULL,
    author_birth  INTEGER,
    author_death  INTEGER,
    subjects      TEXT,
    bookshelves   TEXT,
    language      TEXT DEFAULT 'en',
    context       TEXT NOT NULL
  )
`);

// Open catalog (optional — may not exist yet)
let catalog: GutenbergCatalog | null = null;
if (existsSync(CATALOG_DB)) {
  catalog = new GutenbergCatalog(CATALOG_DB);
}

// Read text files
const files = readdirSync(TEXTS_DIR).filter(f => f.endsWith('.txt'));
emit({ phase: 'import', pct: 0, message: `Found ${files.length} text files` });

let imported = 0;
let skipped = 0;

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const etextno = parseInt(basename(file, '.txt'), 10);
  if (isNaN(etextno)) {
    skipped++;
    continue;
  }

  // Deduplication
  const existing = classicsDb
    .query('SELECT etextno FROM gutenberg WHERE etextno = ?')
    .get(etextno) as { etextno: number } | null;
  if (existing) {
    skipped++;
    continue;
  }

  // Read and clean
  let raw: string;
  try {
    raw = readFileSync(join(TEXTS_DIR, file), 'utf-8');
  } catch {
    emit({ phase: 'import', pct: ((i + 1) / files.length) * 100, message: `WARN: Cannot read ${file}, skipping` });
    skipped++;
    continue;
  }

  const cleaned = cleanGutenbergText(raw);
  if (cleaned.length < 200) {
    skipped++;
    continue;
  }

  // Metadata from catalog
  let title = `Gutenberg #${etextno}`;
  let author = 'Unknown';
  let authorBirth: number | null = null;
  let authorDeath: number | null = null;
  let subjects = '[]';
  let bookshelves = '[]';

  if (catalog) {
    // Search by etextno in catalog
    const books = catalog.filter({});
    const meta = books.find(b => b.etextno === etextno);
    if (meta) {
      title = meta.title;
      author = meta.author;
      authorBirth = meta.birth_year;
      authorDeath = meta.death_year;
      subjects = JSON.stringify(meta.subjects);
      bookshelves = JSON.stringify(meta.bookshelves);
    }
  }

  // Insert
  classicsDb
    .query(`INSERT INTO gutenberg
      (etextno, book_title, author, author_birth, author_death, subjects, bookshelves, language, context)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'en', ?)`)
    .run(etextno, title, author, authorBirth, authorDeath, subjects, bookshelves, cleaned);

  imported++;
  emit({
    phase: 'import',
    pct: ((i + 1) / files.length) * 100,
    message: `Imported: ${title} by ${author}`,
  });
}

catalog?.close();
classicsDb.close();

emit({ phase: 'done', pct: 100, message: `Imported ${imported} books, skipped ${skipped}` });
```

- [ ] **Step 3: Run the import script on existing data**

Run: `bun run scripts/import-gutenberg-texts.ts`
Expected: JSON progress lines, final line `phase: "done"` with imported count.
Note: Requires `data/gutenberg/texts/` to have `.txt` files and `data/mcp/gutenberg-catalog.db` to exist. If neither exists, the script will report 0 imported (which is valid — data comes later).

- [ ] **Step 4: Verify classics.db schema**

Run: `bun -e "const d = new (require('bun:sqlite').Database)('data/gutenberg/classics.db'); console.log(d.query('SELECT COUNT(*) as n FROM gutenberg').get()); d.close();"`
Expected: `{ n: <number> }` — count of imported books

- [ ] **Step 5: Commit**

```bash
git add src/mcp/gutenberg/parser.ts scripts/import-gutenberg-texts.ts
git commit -m "feat(gutenberg): fix parser source DB and add import script

- GutenbergParser now reads from classics.db (fixes bug #11: circular source)
- Extended gutenberg_styles schema with narrative_voice, temporal_style, etc.
- New import-gutenberg-texts.ts reads .txt files + catalog metadata into classics.db"
```

---

### Task 4: DramaturgicPass Prose Mode [S7]

**Covers:** S7 (prose archetypes, template generator, positions/variables)

**Files:**
- Modify: `src/mcp/literary-compiler/types.ts` — add `mode` to `DramaturgicInput`
- Modify: `src/mcp/literary-compiler/dramaturgic-pass.ts` — add prose mode

**Interfaces:**
- Consumes: `Delexifier` (existing)
- Produces: `DramaturgicInput.mode: 'bible' | 'prose'` — used by Task 6

- [ ] **Step 1: Add mode to DramaturgicInput**

In `src/mcp/literary-compiler/types.ts`, add `mode` field:

```typescript
export interface DramaturgicInput {
  text: string;
  source_book: string;
  source_chapter: number;
  mode?: 'bible' | 'prose'; // default: 'bible' (backward compatible)
}
```

- [ ] **Step 2: Add PROSE_ARCHETYPE_KEYWORDS and prose positions/variables**

At the top of `src/mcp/literary-compiler/dramaturgic-pass.ts`, add after `DEFAULT_VARIABLES`:

```typescript
const PROSE_ARCHETYPE_KEYWORDS: Record<string, { strong: string[]; weak: string[] }> = {
  escape: {
    strong: ['flee', 'escape', 'pursuit', 'chase', 'prison', 'captive'],
    weak:   ['river', 'cross', 'border', 'wall', 'gate', 'door', 'window']
  },
  judgment: {
    strong: ['trial', 'verdict', 'court', 'judge', 'jury', 'sentence', 'condemn'],
    weak:   ['decide', 'choice', 'justice', 'guilty', 'innocent']
  },
  political: {
    strong: ['throne', 'king', 'queen', 'crown', 'usurp', 'rebellion', 'treason', 'plot'],
    weak:   ['power', 'rule', 'palace', 'court', 'council']
  },
  rescue: {
    strong: ['save', 'rescue', 'deliver', 'liberate', 'free', 'release'],
    weak:   ['help', 'aid', 'danger', 'threat', 'enemy']
  },
  endurance: {
    strong: ['endure', 'suffer', 'bear', 'survive', 'starve', 'freeze', 'torture'],
    weak:   ['pain', 'hunger', 'cold', 'weary', 'tired', 'exhausted']
  },
  loyalty: {
    strong: ['loyal', 'faithful', 'betray', 'oath', 'allegiance', 'swear'],
    weak:   ['follow', 'serve', 'master', 'lord', 'duty']
  },
  wisdom: {
    strong: ['wisdom', 'wise', 'sage', 'prophecy', 'oracle', 'riddle'],
    weak:   ['learn', 'teach', 'study', 'book', 'knowledge']
  },
  romance: {
    strong: ['love', 'marry', 'wedding', 'propose', 'engagement'],
    weak:   ['kiss', 'embrace', 'heart', 'courtship', 'suitor', 'jealous']
  },
  revenge: {
    strong: ['revenge', 'vengeance', 'avenge', 'retribution', 'vendetta'],
    weak:   ['pay back', 'settle score', 'grudge', 'hatred']
  },
  discovery: {
    strong: ['discover', 'find', 'uncover', 'reveal', 'secret', 'hidden'],
    weak:   ['search', 'explore', 'map', 'treasure', 'artifact']
  },
  inner_monologue: {
    strong: ['conscience', 'torment', 'within me', 'my soul', 'I could not', 'I wondered', 'I felt'],
    weak:   ['thought', 'mind', 'doubt', 'questioned', 'pondered', 'conscious', 'guilt']
  },
  social_microscopy: {
    strong: ['propriety', 'reputation', 'eligible', 'match', 'fortune', 'connection', 'society'],
    weak:   ['bow', 'curtsey', 'glance', 'whisper', 'compliment', 'introduction', 'ball', 'dinner']
  },
  ironic_distance: {
    strong: ['indeed', 'perhaps', 'it must be admitted', 'one might suppose', 'it is a truth', 'reader'],
    weak:   ['certainly', 'naturally', 'of course', 'surely', 'doubtless', 'evidently']
  },
  polyphony: {
    strong: ['meanwhile', 'on the other hand', 'from where he stood', 'to her mind', 'as for him'],
    weak:   ['but', 'however', 'yet', 'still', 'though', 'although']
  },
  domestic_epic: {
    strong: ['breakfast', 'kitchen', 'garden', 'household', 'ordinary', 'commonplace', 'everyday'],
    weak:   ['tea', 'dinner', 'parlour', 'drawing room', 'servant', 'maid', 'butler']
  },
  temporal_layering: {
    strong: ['remembered', 'years ago', 'in those days', 'the old times', 'used to', 'it was then'],
    weak:   ['ago', 'before', 'once', 'former', 'past', 'memory', 'childhood', 'youth']
  },
  rise_fall_rise: {
    strong: ['rise', 'fall', 'ruin', 'bankrupt', 'fortune', 'restore', 'reclaim'],
    weak:   ['success', 'failure', 'wealth', 'poverty']
  },
};

const PROSE_DEFAULT_POSITIONS: Record<string, string[]> = {
  escape:     ['leader', 'follower', 'prisoner'],
  judgment:   ['judge', 'lawyer', 'accused'],
  political:  ['leader', 'advisor', 'spy', 'rebel'],
  rescue:     ['leader', 'savior', 'captive'],
  endurance:  ['survivor', 'witness'],
  loyalty:    ['follower', 'knight', 'vassal'],
  wisdom:     ['sage', 'student', 'seeker'],
  romance:    ['lover', 'suitor', 'rival'],
  revenge:    ['avenger', 'victim', 'accomplice'],
  discovery:  ['explorer', 'scholar', 'guide'],
  inner_monologue:    ['thinker', 'tormented_soul', 'doubter'],
  social_microscopy:  ['lady', 'gentleman', 'suitor', 'chaperone', 'matchmaker'],
  ironic_distance:    ['narrator', 'observer', 'satirist'],
  polyphony:          ['narrator', 'character_a', 'character_b', 'chorus'],
  domestic_epic:      ['householder', 'servant', 'child', 'neighbour'],
  temporal_layering:  ['elder', 'youth', 'ancestor', 'witness'],
  rise_fall_rise: ['hero', 'merchant', 'noble', 'outcast'],
};

const PROSE_DEFAULT_VARIABLES: Record<string, string[]> = {
  escape:     ['PROTAGONIST', 'ANTAGONIST', 'ALLY', 'OBSTACLE', 'RESOLUTION'],
  judgment:   ['JUDGE', 'ACCUSED', 'WITNESS', 'EVIDENCE', 'VERDICT'],
  political:  ['RULER', 'ADVISOR', 'ENEMY', 'SECRET', 'CHOICE'],
  rescue:     ['CAPTIVE', 'SAVIOR', 'THREAT', 'SACRIFICE', 'DELIVERANCE'],
  endurance:  ['SUFFERER', 'TRIAL', 'LOSS', 'STRENGTH', 'SURVIVAL'],
  loyalty:    ['FOLLOWER', 'LORD', 'BETRAYAL', 'TEST', 'REWARD'],
  wisdom:     ['SEEKER', 'MENTOR', 'RIDDLE', 'KNOWLEDGE', 'CONSEQUENCE'],
  romance:    ['LOVER', 'RIVAL', 'OBSTACLE', 'CHOICE', 'RESOLUTION'],
  revenge:    ['AVENGER', 'VICTIM', 'GRUDGE', 'PLAN', 'CONSEQUENCE'],
  discovery:  ['EXPLORER', 'SECRET', 'CLUE', 'DANGER', 'REVELATION'],
  inner_monologue:    ['THINKER', 'CONSCIENCE', 'DOUBT', 'RESOLUTION'],
  social_microscopy:  ['LADY', 'GENTLEMAN', 'SUITOR', 'FORTUNE', 'REPUTATION'],
  ironic_distance:    ['NARRATOR', 'OBSERVER', 'CLAIM', 'CONTRADICTION'],
  polyphony:          ['VOICE_A', 'VOICE_B', 'CONFLICT', 'SYNTHESIS'],
  domestic_epic:      ['HOUSEHOLDER', 'SERVANT', 'RITUAL', 'CHANGE'],
  temporal_layering:  ['ELDER', 'YOUTH', 'MEMORY', 'PRESENT', 'FUTURE'],
  rise_fall_rise: ['HERO', 'FORTUNE', 'RIVALS', 'DOWNFALL', 'RESTORATION'],
};
```

- [ ] **Step 3: Add generateProseTemplate method**

Add this private method to the `DramaturgicPass` class:

```typescript
private generateProseTemplate(text: string): { template: string; devices: string[] } {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences.length === 0) {
    return {
      template: `The [PROTAGONIST] faces [CONFLICT] at the [LOCATION].`,
      devices: []
    };
  }

  // Score sentences by sensory + emotion density
  const scored = sentences.map((s, i) => {
    const lower = s.toLowerCase();
    const sensory = ['saw','heard','felt','smelled','tasted','bright','dark','cold','warm','silence']
      .filter(k => lower.includes(k)).length;
    const emotion = ['fear','love','hate','anger','joy','sad','grief','hope','despair']
      .filter(k => lower.includes(k)).length;
    return { s, i, score: sensory + emotion * 1.5 };
  });
  scored.sort((a, b) => b.score - a.score);

  // Take top sentence + neighbors for context
  const best = scored[0];
  const neighbors = [best];
  if (best.i > 0) {
    const prev = sentences[best.i - 1];
    if (prev) neighbors.unshift({ s: prev, i: best.i - 1, score: 0 });
  }
  if (best.i < sentences.length - 1) {
    const next = sentences[best.i + 1];
    if (next) neighbors.push({ s: next, i: best.i + 1, score: 0 });
  }

  let template = neighbors.map(n => n.s.trim()).join('. ') + '.';

  // Extract rhetorical devices before delexification
  const devices: string[] = [];
  if (/(.+),\s*\1/i.test(template)) devices.push('anaphora');
  if (/(.+);\s*(.+);\s*(.+)/.test(template)) devices.push('tricolon');
  if (/not\s+\w+,\s+but\s+\w+/.test(template)) devices.push('antithesis');
  if (/\b(O\s+|alas|ah|how\s+\w+)\b/i.test(template)) devices.push('exclamation');
  if (/\b(reader|you|we)\b/i.test(template.toLowerCase())) devices.push('direct_address');

  // Delexify: replace names, preserve syntax
  template = this.delexifier.delexify(template);

  // Ensure we have at least one placeholder
  if (!/\[.*?\]/.test(template)) {
    template = `The [PROTAGONIST] enters the [LOCATION], ` +
               `where [CONFLICT] unfolds as [ALLY] reveals [SECRET].`;
  }

  return { template, devices };
}
```

- [ ] **Step 4: Modify parse() to support prose mode**

In the `parse()` method, add prose-mode branching. Replace the archetype inference and template generation sections:

```typescript
async parse(input: DramaturgicInput): Promise<DramaturgicOutput> {
  const templates: QuestTemplate[] = [];
  const errors: string[] = [];
  const mode = input.mode ?? 'bible';

  if (!input.text.trim()) {
    return { templates, errors };
  }

  try {
    const verses = this.extractVerses(input.text);
    if (verses.length === 0) {
      return { templates, errors };
    }

    const archetype = mode === 'prose'
      ? this._inferArchetypeProse(input.text)
      : await this.inferArchetype(input.text, input.source_book, input.source_chapter);

    const mood = this.inferMood(input.text);
    const difficulty = this.inferDifficulty(verses.length);
    const moralAmbiguity = this.inferMoralAmbiguity(input.text);

    const variables = mode === 'prose'
      ? (PROSE_DEFAULT_VARIABLES[archetype] ?? ['PROTAGONIST', 'CONFLICT'])
      : (DEFAULT_VARIABLES[archetype] ?? ['current_hero', 'obstacle']);

    const positions = mode === 'prose'
      ? (PROSE_DEFAULT_POSITIONS[archetype] ?? ['follower'])
      : (DEFAULT_POSITIONS[archetype] ?? ['follower']);

    const tags = this.extractTags(input.text, archetype);

    let templateText: string;
    let devices: string[] = [];
    if (mode === 'prose') {
      const result = this.generateProseTemplate(input.text);
      templateText = result.template;
      devices = result.devices;
    } else {
      templateText = this.generateTemplateText(input.text, variables);
    }

    const template: QuestTemplate = {
      id: `${input.source_book}.${input.source_chapter}`,
      source_book: input.source_book,
      source_chapter: input.source_chapter,
      archetype,
      applicable_positions: positions,
      variables,
      template_text: templateText,
      mood,
      difficulty,
      moral_ambiguity: moralAmbiguity,
      tags: mode === 'prose' ? [...tags, ...devices] : tags,
      created_at: Math.floor(Date.now() / 1000),
    };

    templates.push(template);
    this.db.insertTemplate(template);

    logger.info(`Parsed ${input.source_book}.${input.source_chapter} (${mode}): archetype=${archetype}, mood=${mood}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Failed to parse ${input.source_book}.${input.source_chapter}: ${msg}`);
    logger.error(`Dramaturgic pass error: ${msg}`);
  }

  return { templates, errors };
}
```

Add the prose archetype inference method:

```typescript
private _inferArchetypeProse(text: string): string {
  const lowerText = text.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [archetype, keywords] of Object.entries(PROSE_ARCHETYPE_KEYWORDS)) {
    scores[archetype] = 0;
    for (const kw of keywords.strong) {
      if (lowerText.includes(kw)) scores[archetype] += 2;
    }
    for (const kw of keywords.weak) {
      if (lowerText.includes(kw)) scores[archetype] += 1;
    }
  }

  let maxScore = 0;
  let inferred = 'everyday_life';

  for (const [archetype, score] of Object.entries(scores)) {
    // Need at least 1 strong OR 2+ weak
    if (score >= 2 && score > maxScore) {
      maxScore = score;
      inferred = archetype;
    }
  }

  return inferred;
}
```

- [ ] **Step 5: Add Delexifier import if not already present**

Ensure the class imports and instantiates the Delexifier. Check that `this.delexifier` is available. Add to constructor if missing:

```typescript
import { Delexifier } from '../gutenberg/delexifier';

// In constructor:
this.delexifier = new Delexifier();
```

- [ ] **Step 6: Run existing tests**

Run: `bun test src/mcp/literary-compiler/`
Expected: all existing tests PASS (backward compatible — default mode is 'bible')

- [ ] **Step 7: Commit**

```bash
git add src/mcp/literary-compiler/types.ts src/mcp/literary-compiler/dramaturgic-pass.ts
git commit -m "feat(literary-compiler): add prose mode to DramaturgicPass

- New mode: 'bible' | 'prose' (default 'bible' for backward compat)
- 11 prose-specific archetypes with strong/weak keyword weighting
- generateProseTemplate() selects sensory-rich sentences + delexifies
- Prose positions/variables (PROTAGONIST, CONFLICT, etc.)
- Rhetorical device detection (anaphora, tricolon, antithesis, etc.)"
```

---

### Task 5: AnalyzePass — Combined Pre-Score + Scene Classifier [S8]

**Covers:** S8 (unified analyzeChunk, keyword dictionaries, fallback clustering)

**Files:**
- Create: `src/mcp/gutenberg/analyze-pass.ts`
- Create: `src/mcp/gutenberg/__tests__/analyze-pass.test.ts`

**Interfaces:**
- Produces: `analyzeChunk(text: string): ChunkAnalysis` — used by Task 6 (Phase B)
- Produces: `clusterBySceneType(chunks): Chunk[][]` — fallback clustering

- [ ] **Step 1: Write failing tests**

```typescript
// src/mcp/gutenberg/__tests__/analyze-pass.test.ts
import { describe, it, expect } from 'bun:test';
import { analyzeChunk, clusterBySceneType } from '../analyze-pass';

describe('analyzeChunk', () => {
  it('identifies battle_scene from combat keywords', () => {
    const text = 'The sword struck the shield. Blood ran down the warrior\'s arm as the battle raged.';
    const result = analyzeChunk(text);
    expect(result.scene_type).toBe('battle_scene');
    expect(result.pre_score).toBeGreaterThan(0);
  });

  it('identifies love_scene from romantic keywords', () => {
    const text = 'He kissed her tenderly. The embrace was gentle, their hearts beating as one in the moonlight.';
    const result = analyzeChunk(text);
    expect(result.scene_type).toBe('love_scene');
  });

  it('identifies dialogue_scene from quoted speech ratio', () => {
    const text = '"Hello," she said. "How are you?" he asked. "I am well," she replied. "Good," he answered.';
    const result = analyzeChunk(text);
    expect(result.scene_type).toBe('dialogue_scene');
  });

  it('identifies introspection from first-person markers', () => {
    const text = 'I thought about what I had done. I felt the weight of my conscience. I wondered if I could ever be forgiven.';
    const result = analyzeChunk(text);
    expect(result.scene_type).toBe('introspection');
  });

  it('returns sensory tags for sensory-rich text', () => {
    const text = 'I saw the bright light. I heard the thunder. I felt the cold wind on my skin.';
    const result = analyzeChunk(text);
    expect(result.sensory_tags).toContain('sight');
    expect(result.sensory_tags).toContain('sound');
    expect(result.sensory_tags).toContain('touch');
  });

  it('calculates tempo from sentence variance', () => {
    // Low variance = slow
    const slow = 'He went. She came. They sat. He left. She stayed.';
    const slowResult = analyzeChunk(slow);
    expect(slowResult.tempo).toBe('slow');
  });

  it('detects flashback temporal markers', () => {
    const text = 'He remembered the days of his youth. Years ago, things had been different.';
    const result = analyzeChunk(text);
    expect(result.temporal_markers).toContain('flashback');
  });

  it('calculates narrative_distance for first-person text', () => {
    const text = 'I felt my heart racing. I thought about my past. I remembered the old days. I knew this was important.';
    const result = analyzeChunk(text);
    expect(result.narrative_distance).toBeGreaterThan(0.5);
  });

  it('returns pre_score between 0 and 1', () => {
    const text = 'Some random text without much interesting content for analysis.';
    const result = analyzeChunk(text);
    expect(result.pre_score).toBeGreaterThanOrEqual(0);
    expect(result.pre_score).toBeLessThanOrEqual(1);
  });
});

describe('clusterBySceneType', () => {
  it('groups chunks by scene_type', () => {
    const chunks = [
      { scene_type: 'battle_scene', id: '1' },
      { scene_type: 'love_scene', id: '2' },
      { scene_type: 'battle_scene', id: '3' },
    ] as any[];
    const clusters = clusterBySceneType(chunks);
    expect(clusters).toHaveLength(2);
    expect(clusters.find(c => c[0].scene_type === 'battle_scene')).toHaveLength(2);
    expect(clusters.find(c => c[0].scene_type === 'love_scene')).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(clusterBySceneType([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/mcp/gutenberg/__tests__/analyze-pass.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement analyzeChunk and clusterBySceneType**

```typescript
// src/mcp/gutenberg/analyze-pass.ts

export interface ChunkAnalysis {
  pre_score: number;
  dict_hits: number;
  scene_type: string;
  tempo: string;
  sensory_tags: string[];
  narrative_distance: number;
  temporal_markers: string[];
}

const SCENE_TYPE_KEYWORDS: Record<string, string[]> = {
  battle_scene: [
    'battle', 'fight', 'sword', 'blood', 'strike', 'army', 'clash', 'war',
    'attack', 'defend', 'slash', 'arrow', 'shield', 'spear', 'charge',
    'combat', 'warrior', 'soldier', 'regiment', 'cannon', 'gunfire',
    'duel', 'wound', 'stab', 'parry', 'thrust', 'shot', 'bullet'
  ],
  love_scene: [
    'love', 'kiss', 'embrace', 'heart', 'passion', 'desire', 'tender',
    'gentle', 'caress', 'whisper', 'gaze', 'blush', 'romance', 'darling',
    'beloved', 'lover', 'sweetheart', 'affection', 'longing', 'yearning',
    'fell in love', 'proposal', 'wedding', 'marry'
  ],
  nature_description: [
    'forest', 'mountain', 'river', 'tree', 'sun', 'sky', 'cloud', 'wind',
    'flower', 'grass', 'snow', 'rain', 'sea', 'field', 'ocean', 'lake',
    'valley', 'hill', 'stream', 'meadow', 'garden', 'horizon', 'dawn',
    'dusk', 'twilight', 'moonlight', 'stars', 'thunder', 'lightning',
    'landscape', 'scenery', 'wilderness', 'woods', 'grove'
  ],
  dialogue_scene: [
    'said', 'asked', 'replied', 'answered', 'spoke', 'told', 'whispered',
    'shouted', 'conversation', 'discuss', 'explain', 'argue',
    'insist', 'protest', 'agree', 'disagree', 'interrupt', 'mutter',
    'murmur', 'exclaim', 'declare', 'announce'
  ],
  introspection: [
    'thought', 'wondered', 'remembered', 'realized', 'felt', 'knew',
    'understood', 'decided', 'considered', 'reflection', 'memory',
    'recall', 'conscious', 'mind', 'soul', 'conscience',
    'doubt', 'questioned', 'pondered', 'contemplated', 'meditate'
  ],
  travel_scene: [
    'walk', 'ride', 'journey', 'road', 'path', 'travel', 'move', 'cross',
    'ford', 'climb', 'descend', 'march', 'leave', 'arrive', 'depart',
    'wander', 'roam', 'trek', 'expedition', 'voyage', 'caravan',
    'horseback', 'carriage', 'coach', 'mile', 'league', 'distance'
  ],
  ritual_scene: [
    'ceremony', 'ritual', 'prayer', 'crown', 'throne', 'kneel', 'bow',
    'oath', 'vow', 'knight', 'altar', 'sacrifice', 'blessing', 'coronation',
    'wedding', 'funeral', 'procession', 'incense', 'chant', 'hymn',
    'solemn', 'sacred', 'holy', 'ordain', 'anoint', 'baptize'
  ],
  death_scene: [
    'death', 'die', 'dead', 'body', 'funeral', 'grave', 'mourn', 'grief',
    'weep', 'last breath', 'farewell', 'loss', 'departed', 'passed away',
    'coffin', 'burial', 'tomb', 'mourner', 'widow', 'orphan',
    'lament', 'final', 'last words', 'dying'
  ],
  chase_scene: [
    'run', 'chase', 'flee', 'escape', 'hide', 'pursue', 'catch', 'grab',
    'snatch', 'stealth', 'sneak', 'shadow', 'dash', 'sprint', 'race',
    'dodge', 'duck', 'pursuit', 'hunted', 'track', 'follow', 'trail'
  ],
};

const SENSORY_KEYWORDS: Record<string, string[]> = {
  sight: ['saw', 'looked', 'gazed', 'watched', 'visible', 'bright', 'dark',
          'light', 'shadow', 'colour', 'color', 'red', 'blue', 'green',
          'golden', 'silver', 'glimpse', 'stared', 'observed', 'view', 'scene'],
  sound: ['heard', 'listened', 'voice', 'sound', 'whisper', 'shout', 'cry',
          'laugh', 'silence', 'thunder', 'wind', 'echo', 'noise',
          'roar', 'rustle', 'creak', 'bang', 'footstep', 'music', 'song'],
  touch: ['felt', 'touched', 'cold', 'warm', 'hot', 'rough', 'smooth', 'soft',
          'hard', 'wet', 'dry', 'heat', 'chill', 'pressure', 'grip', 'stroke',
          'prick', 'sting', 'numb', 'tingle'],
  smell: ['smelled', 'scent', 'fragrance', 'stench', 'aroma', 'perfume',
          'smoke', 'dust', 'odor', 'reek', 'stink', 'whiff', 'fresh', 'musty',
          'sweet', 'foul', 'pungent'],
  taste: ['tasted', 'sweet', 'bitter', 'sour', 'salty', 'delicious', 'bland',
          'flavor', 'flavour', 'tang', 'spice', 'honey', 'wine'],
  kinaesthetic: ['heavy', 'light', 'weight', 'burden', 'float', 'sink', 'fall',
                 'rise', 'fly', 'drag', 'lift', 'carry', 'weary', 'exhausted',
                 'strength', 'weakness', 'faint', 'stagger', 'tremble'],
  temperature: ['warmth', 'cold', 'chill', 'frost', 'fire', 'flame', 'ember',
                'frozen', 'burning', 'fever', 'icy', 'scorching', 'tepid',
                'blaze', 'shiver', 'sweat'],
  chiaroscuro: ['shadow', 'light', 'darkness', 'gloom', 'brilliance', 'dim',
                'glow', 'shade', 'twilight', 'dawn', 'dusk', 'candle', 'torch',
                'moonlight', 'starlight', 'lantern', 'murky', 'radiant'],
  silence: ['silence', 'silent', 'quiet', 'hush', 'still', 'mute', 'speechless',
            'whisper', 'murmur', 'faintly', 'barely', 'nothing', 'emptiness',
            'absence', 'deafening'],
  temporal: ['moment', 'instant', 'eternity', 'forever', 'never', 'always',
             'suddenly', 'gradually', 'slowly', 'quickly', 'endless', 'brief',
             'fleeting', 'lingering', 'pause', 'hesitation', 'delay'],
};

export function analyzeChunk(text: string): ChunkAnalysis {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // 1. Scene type scoring
  const typeScores: Record<string, number> = {};
  for (const [type, keywords] of Object.entries(SCENE_TYPE_KEYWORDS)) {
    typeScores[type] = keywords.filter(kw => lower.includes(kw)).length;
  }

  let sceneType = 'travel_scene';
  let maxScore = 0;
  for (const [type, score] of Object.entries(typeScores)) {
    if (score > maxScore) {
      maxScore = score;
      sceneType = type;
    }
  }

  if (maxScore === 0) {
    const quotedRatio = (text.match(/"[^"]+"/g)?.length ?? 0) / Math.max(sentences.length, 1);
    const firstPersonRatio = (text.match(/\b(I|me|my|mine|myself)\b/gi)?.length ?? 0) / Math.max(words.length, 1);
    sceneType = quotedRatio > 0.4 ? 'dialogue_scene'
              : firstPersonRatio > 0.01 ? 'introspection'
              : 'travel_scene';
  }

  // 2. Sensory tags
  const sensoryTags: string[] = [];
  for (const [sense, keywords] of Object.entries(SENSORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      sensoryTags.push(sense);
    }
  }

  // 3. Tempo (variance-based)
  const sentLens = sentences.map(s => s.split(/\s+/).length);
  const avgWords = words.length / Math.max(sentences.length, 1);
  const variance = sentLens.reduce((sum, len) => sum + (len - avgWords) ** 2, 0) / Math.max(sentLens.length, 1);
  const stdDev = Math.sqrt(variance);
  const tempo = stdDev > 12 ? 'fast' : stdDev < 5 ? 'slow' : 'medium';

  // 3b. Narrative distance
  const innerMarkers = text.match(/\b(I|me|my|mine|myself|thought|felt|wondered|realized|remembered)\b/gi)?.length ?? 0;
  const outerMarkers = text.match(/\b(he|she|they|him|her|them|his|theirs|looked|walked|said|stood)\b/gi)?.length ?? 0;
  const totalPronouns = innerMarkers + outerMarkers;
  const narrativeDistance = totalPronouns > 0 ? innerMarkers / totalPronouns : 0.5;

  // 3c. Temporal markers
  const temporalMarkers: string[] = [];
  if (/\b(remembered|years ago|in those days|used to|it was then|once upon)\b/i.test(text))
    temporalMarkers.push('flashback');
  if (/\b(would|someday|one day|in the future|when he would)\b/i.test(text))
    temporalMarkers.push('flashforward');
  if (/\b(now|at this moment|just then|at that instant|simultaneously)\b/i.test(text))
    temporalMarkers.push('simultaneity');
  if (/\b(always|never|eternal|forever|for all time)\b/i.test(text))
    temporalMarkers.push('timelessness');

  // 4. Pre-score
  const hasConflict = /battle|fight|argue|conflict|dispute|struggle|war|attack/.test(lower);
  const hasDialogue = /"[^"]{10,}"/.test(text);
  const hasEmotion = /fear|love|hate|anger|joy|sad|cry|tear|laugh|shout/.test(lower);

  let baseScore = Math.min((typeScores[sceneType] ?? 0) / 10, 0.5);
  if (hasConflict) baseScore += 0.15;
  if (hasDialogue) baseScore += 0.15;
  if (hasEmotion) baseScore += 0.10;
  if (sensoryTags.length >= 2) baseScore += 0.10;

  const preScore = Math.min(baseScore, 1.0);
  const dictHits = Object.values(typeScores).filter(s => s > 0).length;

  return {
    pre_score: preScore,
    dict_hits: dictHits,
    scene_type: sceneType,
    tempo,
    sensory_tags: sensoryTags,
    narrative_distance: narrativeDistance,
    temporal_markers: temporalMarkers,
  };
}

export function clusterBySceneType(chunks: Array<{ scene_type: string; [key: string]: unknown }>): typeof chunks[] {
  const groups = new Map<string, typeof chunks>();
  for (const chunk of chunks) {
    const key = chunk.scene_type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(chunk);
  }
  return [...groups.values()];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/mcp/gutenberg/__tests__/analyze-pass.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp/gutenberg/analyze-pass.ts src/mcp/gutenberg/__tests__/analyze-pass.test.ts
git commit -m "feat(gutenberg): add unified AnalyzePass for chunk analysis

- analyzeChunk() combines pre-score + scene classification in one pass
- 9 scene types with keyword dictionaries
- 11 sensory categories (sight, sound, touch, kinaesthetic, etc.)
- Tempo calculation via sentence-length variance
- Narrative distance from pronoun ratios
- Temporal marker detection (flashback, flashforward, etc.)
- Fallback clusterBySceneType() for when embeddings unavailable"
```

---

### Task 6: PlayerProfileStore [S9]

**Covers:** S3.5 (player-profiles.db schema), S9 (auto-update, retrieval)

**Files:**
- Create: `src/lib/player-profile-store.ts`
- Create: `src/lib/__tests__/player-profile-store.test.ts`

**Interfaces:**
- Produces: `PlayerProfileStore` — `getProfile()`, `upsertProfile()` — used by Stylist and LiteraryV2Generator

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/__tests__/player-profile-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PlayerProfileStore, createDefaultProfile } from '../player-profile-store';
import { unlinkSync } from 'node:fs';

const TEST_DB = '/tmp/test-player-profiles.db';

describe('PlayerProfileStore', () => {
  let store: PlayerProfileStore;

  beforeEach(() => {
    try { unlinkSync(TEST_DB); } catch {}
    store = new PlayerProfileStore(TEST_DB);
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  it('returns null for non-existent player', () => {
    expect(store.getProfile('nonexistent')).toBeNull();
  });

  it('creates and retrieves a profile', () => {
    const profile = createDefaultProfile('player1');
    profile.avg_sentence_len = 25.5;
    store.upsertProfile(profile);

    const retrieved = store.getProfile('player1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.player_id).toBe('player1');
    expect(retrieved!.avg_sentence_len).toBe(25.5);
  });

  it('updates existing profile on upsert', () => {
    const profile = createDefaultProfile('player1');
    profile.avg_sentence_len = 15.0;
    store.upsertProfile(profile);

    profile.avg_sentence_len = 30.0;
    store.upsertProfile(profile);

    const retrieved = store.getProfile('player1');
    expect(retrieved!.avg_sentence_len).toBe(30.0);
  });

  it('createDefaultProfile sets correct defaults', () => {
    const profile = createDefaultProfile('test');
    expect(profile.player_id).toBe('test');
    expect(profile.avg_sentence_len).toBe(15.0);
    expect(profile.sensory_bias).toBe(0.5);
    expect(profile.register_score).toBe(0.5);
    expect(profile.confidence).toBe(0.0);
    expect(profile.message_count_used).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/__tests__/player-profile-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PlayerProfileStore**

```typescript
// src/lib/player-profile-store.ts
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PlayerStyleProfile {
  player_id: string;
  avg_sentence_len: number;
  sensory_bias: number;
  register_score: number;
  dialogue_ratio: number;
  preferred_motifs: string[];
  anti_patterns: string[];
  sample_snippets: string[];
  confidence: number;
  narrative_distance: number;
  action_orientation: number;
  emotional_expressiveness: number;
  preferred_pace: string;
  literary_sophistication: number;
  message_count_used: number;
  last_updated: number;
}

export function createDefaultProfile(playerId: string): PlayerStyleProfile {
  const now = Math.floor(Date.now() / 1000);
  return {
    player_id: playerId,
    avg_sentence_len: 15.0,
    sensory_bias: 0.5,
    register_score: 0.5,
    dialogue_ratio: 0.3,
    preferred_motifs: [],
    anti_patterns: [],
    sample_snippets: [],
    confidence: 0.0,
    narrative_distance: 0.5,
    action_orientation: 0.5,
    emotional_expressiveness: 0.5,
    preferred_pace: 'medium',
    literary_sophistication: 0.5,
    message_count_used: 0,
    last_updated: now,
  };
}

export class PlayerProfileStore {
  private db: Database;

  constructor(dbPath = 'data/player-profiles.db') {
    const dir = dirname(dbPath);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA synchronous=NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_style_profiles (
        player_id           TEXT PRIMARY KEY,
        avg_sentence_len    REAL NOT NULL DEFAULT 15.0,
        sensory_bias        REAL NOT NULL DEFAULT 0.5,
        register_score      REAL NOT NULL DEFAULT 0.5,
        dialogue_ratio      REAL NOT NULL DEFAULT 0.3,
        preferred_motifs    TEXT NOT NULL DEFAULT '[]',
        anti_patterns       TEXT NOT NULL DEFAULT '[]',
        sample_snippets     TEXT NOT NULL DEFAULT '[]',
        confidence          REAL NOT NULL DEFAULT 0.0,
        narrative_distance    REAL NOT NULL DEFAULT 0.5,
        action_orientation    REAL NOT NULL DEFAULT 0.5,
        emotional_expressiveness REAL NOT NULL DEFAULT 0.5,
        preferred_pace        TEXT NOT NULL DEFAULT 'medium',
        literary_sophistication REAL NOT NULL DEFAULT 0.5,
        message_count_used  INTEGER NOT NULL DEFAULT 0,
        last_updated        INTEGER NOT NULL
      )
    `);
  }

  getProfile(playerId: string): PlayerStyleProfile | null {
    const row = this.db
      .prepare('SELECT * FROM player_style_profiles WHERE player_id = ?')
      .get(playerId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      player_id: row.player_id as string,
      avg_sentence_len: row.avg_sentence_len as number,
      sensory_bias: row.sensory_bias as number,
      register_score: row.register_score as number,
      dialogue_ratio: row.dialogue_ratio as number,
      preferred_motifs: JSON.parse(row.preferred_motifs as string),
      anti_patterns: JSON.parse(row.anti_patterns as string),
      sample_snippets: JSON.parse(row.sample_snippets as string),
      confidence: row.confidence as number,
      narrative_distance: row.narrative_distance as number,
      action_orientation: row.action_orientation as number,
      emotional_expressiveness: row.emotional_expressiveness as number,
      preferred_pace: row.preferred_pace as string,
      literary_sophistication: row.literary_sophistication as number,
      message_count_used: row.message_count_used as number,
      last_updated: row.last_updated as number,
    };
  }

  upsertProfile(profile: PlayerStyleProfile): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO player_style_profiles
      (player_id, avg_sentence_len, sensory_bias, register_score, dialogue_ratio,
       preferred_motifs, anti_patterns, sample_snippets, confidence,
       narrative_distance, action_orientation, emotional_expressiveness,
       preferred_pace, literary_sophistication, message_count_used, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.player_id,
      profile.avg_sentence_len,
      profile.sensory_bias,
      profile.register_score,
      profile.dialogue_ratio,
      JSON.stringify(profile.preferred_motifs),
      JSON.stringify(profile.anti_patterns),
      JSON.stringify(profile.sample_snippets),
      profile.confidence,
      profile.narrative_distance,
      profile.action_orientation,
      profile.emotional_expressiveness,
      profile.preferred_pace,
      profile.literary_sophistication,
      profile.message_count_used,
      profile.last_updated,
    );
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/__tests__/player-profile-store.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/player-profile-store.ts src/lib/__tests__/player-profile-store.test.ts
git commit -m "feat: add standalone PlayerProfileStore for cross-agent player profiles

- Separate data/player-profiles.db (shared by Stylist V1 and LiteraryV2Generator)
- Full schema: 16 metrics including narrative_distance, action_orientation,
  emotional_expressiveness, literary_sophistication, preferred_pace
- createDefaultProfile() for initialization
- getProfile/upsertProfile with JSON array serialization"
```

---

### Task 7: process-gutenberg.ts — Phase A (V1 Pipeline) [S6]

**Covers:** S6 (Phase A: GutenbergParser fix, V1 compiler with prose mode)

**Files:**
- Create: `scripts/process-gutenberg.ts` (Phase A only initially)

**Interfaces:**
- Consumes: `cleanGutenbergText` (Task 1), `GutenbergParser` (existing, fixed in Task 3), `DramaturgicPass` with prose mode (Task 4)
- Produces: populated `gutenberg-normalized.db` and `classics-compiled.db`

- [ ] **Step 1: Write process-gutenberg.ts skeleton with Phase A**

```typescript
#!/usr/bin/env bun
/**
 * Process Gutenberg texts through V1 (rule-based) and V2 (LLM) pipelines.
 *
 * Reads:  data/gutenberg/classics.db
 * Writes: data/gutenberg/gutenberg-normalized.db  (Phase A)
 *         data/literary-compiler/classics-compiled.db  (Phase A)
 *         data/literary-compiler/literary.db  (Phase B)
 *
 * Usage: bun scripts/process-gutenberg.ts [--phase v1|v2|all]
 */

import { Database } from 'bun:sqlite';
import { GutenbergParser } from '../src/mcp/gutenberg/parser';
import { LiteraryCompilerDB } from '../src/mcp/literary-compiler/schema';
import { DramaturgicPass } from '../src/mcp/literary-compiler/dramaturgic-pass';
import { StylisticPass } from '../src/mcp/literary-compiler/stylistic-pass';
import { EmotionalPass } from '../src/mcp/literary-compiler/emotional-pass';
import { MetadataPass } from '../src/mcp/literary-compiler/metadata-pass';
import { Linter } from '../src/mcp/literary-compiler/linter';
import { cleanGutenbergText } from '../src/mcp/gutenberg/clean';
import type { QuestTemplate } from '../src/mcp/literary-compiler/types';

// ── Args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const phase = flag('--phase', 'all');

// ── Progress ──────────────────────────────────────────────────────
interface ProgressMsg { phase: string; pct: number; message: string; }
function emit(msg: ProgressMsg) { console.log(JSON.stringify(msg)); }

// ── Config ────────────────────────────────────────────────────────
const CLASSICS_DB = './data/gutenberg/classics.db';
const NORMALIZED_DB_DIR = './data/gutenberg';
const COMPILED_DB = './data/literary-compiler/classics-compiled.db';
const CHAPTER_WORD_TARGET = 3000;
const MAX_TEMPLATE_WORDS = 500;

// ── Helpers ───────────────────────────────────────────────────────

function splitIntoChapters(text: string, targetWords: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  const chapters: string[] = [];
  let current = '';
  let wordCount = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).length;
    if (wordCount + paraWords > targetWords && current.length > 100) {
      chapters.push(current.trim());
      current = '';
      wordCount = 0;
    }
    current += para + '\n\n';
    wordCount += paraWords;
  }

  if (current.trim().length > 100) {
    chapters.push(current.trim());
  }

  return chapters.length > 0 ? [text.substring(0, 5000)] : chapters;
}

// ── Phase A: V1 Pipeline (rule-based, no LLM) ────────────────────

async function runPhaseA(): Promise<void> {
  emit({ phase: 'v1-start', pct: 0, message: 'Starting Phase A (V1 pipeline)' });

  // Step A1: GutenbergParser — extract styles
  emit({ phase: 'v1-styles', pct: 5, message: 'Extracting styles via GutenbergParser' });

  const parser = new GutenbergParser({
    dbPath: CLASSICS_DB,  // ← FIX: read from classics.db, not self
    dataDir: NORMALIZED_DB_DIR,
    extractStyles: true,
  });

  const parseResult = await parser.parse();
  parser.close();

  emit({
    phase: 'v1-styles',
    pct: 30,
    message: `Extracted ${parseResult.textCount} texts, ${parseResult.styleCount} styles`,
  });

  // Step A2: 4-pass compiler — quest templates
  emit({ phase: 'v1-compiler', pct: 35, message: 'Running V1 compiler (4-pass)' });

  const srcDb = new Database(CLASSICS_DB, { readonly: true });
  const books = srcDb.query(
    'SELECT etextno, book_title, author, author_birth, author_death, subjects, bookshelves, context FROM gutenberg ORDER BY author, book_title'
  ).all() as Array<{
    etextno: number; book_title: string; author: string;
    author_birth: number | null; author_death: number | null;
    subjects: string; bookshelves: string; context: string;
  }>;

  const compilerDb = new LiteraryCompilerDB(COMPILED_DB);

  const dramaturgic = new DramaturgicPass(compilerDb);
  const stylistic = new StylisticPass();
  const emotional = new EmotionalPass();
  const metadata = new MetadataPass();
  const linter = new Linter();

  let totalTemplates = 0;
  const allTemplates: QuestTemplate[] = [];

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const cleaned = cleanGutenbergText(book.context);

    if (cleaned.length < 200) continue;

    // Deduplication
    const sourceBook = `${book.author}::${book.book_title}`;
    const existing = compilerDb.db.query(
      'SELECT COUNT(*) as n FROM bible_quest_templates WHERE source_book = ?'
    ).get(sourceBook) as { n: number };
    if (existing.n > 0) continue;

    const chapters = splitIntoChapters(cleaned, CHAPTER_WORD_TARGET);

    for (let ch = 0; ch < chapters.length; ch++) {
      const chapterText = chapters[ch];
      const chapterNum = ch + 1;

      // Pass 1: Dramaturgic (prose mode)
      const dramResult = await dramaturgic.parse({
        text: chapterText,
        source_book: sourceBook,
        source_chapter: chapterNum,
        mode: 'prose',
      });

      for (const template of dramResult.templates) {
        // Pass 2: Stylistic
        const styResult = stylistic.analyze({ text: chapterText, source_id: template.id });
        if (styResult.patterns.length > 0 && styResult.patterns[0].sensory_markers.length > 0) {
          template.tags = [...new Set([...template.tags, ...styResult.patterns[0].sensory_markers])];
        }

        // Pass 3: Emotional
        const emoResult = emotional.analyze({ text: chapterText, source_id: template.id });
        if (emoResult.arcs.length > 0) {
          const arc = emoResult.arcs[0];
          if (arc.dominant_emotion !== 'neutral') template.mood = arc.dominant_emotion;
          if (arc.tension_level > 0.7) template.difficulty = 'high';
          else if (arc.tension_level < 0.3) template.difficulty = 'low';
        }

        // Pass 4: Metadata — inject catalog tags
        const catalogTags = [
          ...JSON.parse(book.subjects || '[]'),
          ...JSON.parse(book.bookshelves || '[]'),
        ].map((t: string) => t.toLowerCase());
        template.tags = [...new Set([...template.tags, ...catalogTags])];

        metadata.enrich({ template, context: chapterText.substring(0, 1000) });

        // Truncate
        if (template.template_text.split(/\s+/).length > MAX_TEMPLATE_WORDS) {
          template.template_text = template.template_text.split(/\s+/).slice(0, MAX_TEMPLATE_WORDS).join(' ') + '...';
        }

        allTemplates.push(template);
        totalTemplates++;
      }
    }

    if ((i + 1) % 5 === 0 || i === books.length - 1) {
      emit({
        phase: 'v1-compiler',
        pct: 35 + Math.floor(((i + 1) / books.length) * 55),
        message: `Processed ${i + 1}/${books.length} books (${totalTemplates} templates)`,
      });
    }
  }

  // Lint
  const lintResult = linter.lint(allTemplates);
  for (const t of lintResult.valid_templates) {
    compilerDb.insertTemplate(t);
  }

  srcDb.close();
  compilerDb.close();

  emit({
    phase: 'v1-done',
    pct: 100,
    message: `Phase A done: ${lintResult.valid_templates.length} valid templates (${lintResult.invalid_templates.length} rejected)`,
  });
}

// ── Main ──────────────────────────────────────────────────────────

if (phase === 'v1' || phase === 'all') {
  await runPhaseA();
}

if (phase === 'v2' || phase === 'all') {
  // Phase B will be implemented in Task 8
  emit({ phase: 'v2', pct: 0, message: 'Phase B not yet implemented' });
}

emit({ phase: 'done', pct: 100, message: 'Processing complete' });
```

- [ ] **Step 2: Run Phase A on existing data**

Run: `bun run scripts/process-gutenberg.ts --phase v1`
Expected: JSON progress lines, `phase: "v1-done"` with template count.
Note: Requires `data/gutenberg/classics.db` to exist (from Task 3).

- [ ] **Step 3: Verify output databases**

Run: `bun -e "
const d1 = new (require('bun:sqlite').Database)('data/gutenberg/gutenberg-normalized.db');
console.log('styles:', d1.query('SELECT COUNT(*) as n FROM gutenberg_styles').get());
d1.close();
const d2 = new (require('bun:sqlite').Database)('data/literary-compiler/classics-compiled.db');
console.log('templates:', d2.query('SELECT COUNT(*) as n FROM bible_quest_templates').get());
d2.close();
"`
Expected: non-zero counts for both

- [ ] **Step 4: Commit**

```bash
git add scripts/process-gutenberg.ts
git commit -m "feat(gutenberg): add process-gutenberg.ts with Phase A (V1 pipeline)

- GutenbergParser reads from classics.db (bug #11 fix)
- 4-pass compiler: DramaturgicPass (prose mode) → Stylistic → Emotional → Metadata
- Deduplication per book, catalog tag injection, template truncation
- Linter integration (only valid templates inserted)
- Phase B placeholder (LLM pipeline, Task 8)"
```

---

### Task 8: process-gutenberg.ts — Phase B (V2 LLM Pipeline) [S6]

**Covers:** S6 (Phase B: chunking, AnalyzePass, LLM extraction, style patterns, quality score)

**Files:**
- Modify: `scripts/process-gutenberg.ts` — implement `runPhaseB()`

**Interfaces:**
- Consumes: `analyzeChunk` (Task 5), `clusterBySceneType` (Task 5), `LiteraryCompilerDB.createV2Tables()` (existing), `inferEra/inferLiteraryPeriod` (Task 2)
- Produces: populated `literary.db` with `scene_templates`, `style_patterns`, `template_style_links`, `chunk_index`

- [ ] **Step 1: Implement calculateLiteraryQuality helper**

Add to `scripts/process-gutenberg.ts`:

```typescript
function hasMoralizing(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(ought|should|must always|never forget|always remember|lesson|moral)\b/.test(lower);
}

function calculateLiteraryQuality(template: { template_text: string; archetype_secondary: string | null; variables: string[]; tags: string[] }, chunk: { sensory_tags: string[] }): number {
  let score = 0.5;

  const variableCount = (template.template_text.match(/\[.*?\]/g) ?? []).length;
  const wordCount = template.template_text.split(/\s+/).length;
  const concreteness = 1 - (variableCount / Math.max(wordCount, 1));
  score += concreteness * 0.15;

  score += Math.min(chunk.sensory_tags.length / 5, 0.15);

  if (template.archetype_secondary) score += 0.05;
  if (template.variables.includes('CHOICE')) score += 0.05;
  if (template.variables.includes('CONFLICT')) score += 0.05;

  const devices = template.tags.filter((t: string) =>
    ['anaphora','chiasmus','litotes','antithesis','tricolon'].includes(t));
  score += Math.min(devices.length * 0.03, 0.1);

  if (wordCount > 120) score -= 0.15;
  if (hasMoralizing(template.template_text)) score -= 0.25;

  return Math.max(0, Math.min(1, score));
}
```

- [ ] **Step 2: Implement chunkText helper**

Add to `scripts/process-gutenberg.ts`:

```typescript
interface TextChunk {
  id: string;
  text: string;
  token_est: number;
  char_start: number;
  char_end: number;
  source_book: string;
  source_chapter: number;
  // Analysis fields (filled by AnalyzePass)
  pre_score: number;
  dict_hits: number;
  scene_type: string;
  tempo: string;
  sensory_tags: string[];
  narrative_distance: number;
  temporal_markers: string[];
}

function chunkText(text: string, sourceBook: string, opts: { minTokens: number; maxTokens: number; overlap: number }): TextChunk[] {
  const words = text.split(/\s+/);
  const chunks: TextChunk[] = [];
  const step = opts.maxTokens - opts.overlap;
  let charPos = 0;

  for (let i = 0; i < words.length; i += step) {
    const chunkWords = words.slice(i, i + opts.maxTokens);
    if (chunkWords.length < opts.minTokens) break;

    const chunkText = chunkWords.join(' ');
    chunks.push({
      id: `${sourceBook}:chunk:${chunks.length}`,
      text: chunkText,
      token_est: chunkWords.length,
      char_start: charPos,
      char_end: charPos + chunkText.length,
      source_book: sourceBook,
      source_chapter: 0,
      pre_score: 0,
      dict_hits: 0,
      scene_type: 'unknown',
      tempo: 'medium',
      sensory_tags: [],
      narrative_distance: 0.5,
      temporal_markers: [],
    });

    charPos += chunkText.length + 1;
  }

  return chunks;
}
```

- [ ] **Step 3: Implement runPhaseB**

Add to `scripts/process-gutenberg.ts`, replacing the placeholder:

```typescript
import { analyzeChunk, clusterBySceneType } from '../src/mcp/gutenberg/analyze-pass';
import { inferEra, inferLiteraryPeriod } from '../src/mcp/gutenberg/helpers';
import { StylisticPass } from '../src/mcp/literary-compiler/stylistic-pass';

async function checkEmbeddingServer(): Promise<boolean> {
  try {
    const resp = await fetch('http://localhost:5002/health', { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}

async function runPhaseB(): Promise<void> {
  emit({ phase: 'v2-start', pct: 0, message: 'Starting Phase B (V2 LLM pipeline)' });

  // Check LLM availability (optional — graceful degradation)
  let llm: { generateText(prompt: string): Promise<string> } | null = null;
  try {
    // Dynamic import to avoid hard dependency
    const { LLMQueue } = await import('../src/services/llm-queue');
    const queue = LLMQueue.getInstance();
    const client = queue.getAgentClient('literary-compiler');
    llm = { generateText: (p: string) => client.generate(p) };
  } catch {
    emit({ phase: 'v2', pct: 0, message: 'LLM unavailable, Phase B requires LLM — skipping' });
    return;
  }

  const hasEmbeddings = await checkEmbeddingServer();
  if (!hasEmbeddings) {
    emit({ phase: 'v2', pct: 5, message: 'Embedding server unavailable, using keyword-based clustering' });
  }

  const srcDb = new Database(CLASSICS_DB, { readonly: true });
  const books = srcDb.query(
    'SELECT etextno, book_title, author, author_birth, author_death, subjects, bookshelves, context FROM gutenberg ORDER BY author, book_title'
  ).all() as Array<{
    etextno: number; book_title: string; author: string;
    author_birth: number | null; author_death: number | null;
    subjects: string; bookshelves: string; context: string;
  }>;

  const litDb = new LiteraryCompilerDB(LITERARY_DB);
  litDb.createV2Tables();
  litDb.createV2FTS();
  litDb.createNarrativeTables();

  const stylistic = new StylisticPass();

  const EXTRACT_TEMPLATE_PROMPT = (prevChunk: string | null, currentChunk: string, nextChunk: string | null) => `
You are a literary analyst extracting narrative templates from classical prose.

CONTEXT:
${prevChunk ? `PREVIOUS: "${prevChunk.slice(0, 300)}"` : '(beginning of chapter)'}
CURRENT: "${currentChunk}"
${nextChunk ? `NEXT: "${nextChunk.slice(0, 300)}"` : '(end of chapter)'}

Extract:
1. template_text: A reusable narrative template (≤120 words) with [VARIABLE] placeholders
2. archetype_primary: The dominant archetype (escape/judgment/political/rescue/endurance/loyalty/romance/revenge/discovery/inner_monologue/social_microscopy/ironic_distance)
3. rhetorical_devices: List of rhetorical devices found (anaphora/chiasmus/litotes/antithesis/tricolon/direct_address)
4. narrative_voice: first_person / third_person / omniscient / free_indirect
5. tempo: fast / medium / slow
6. sensory_dominance: Which sense is most prominent (sight/sound/touch/smell/taste/kinaesthetic)

Return JSON:
{
  "template_text": "string (≤120 words)",
  "archetype_primary": "string",
  "archetype_secondary": null,
  "variables": ["VARIABLE"],
  "rhetorical_devices": ["anaphora"],
  "narrative_voice": "third_person",
  "mood": "dark/hopeful/tense/epic/neutral/romantic/melancholic",
  "difficulty": "low/medium/high",
  "moral_ambiguity": 0.0-1.0,
  "beat_sequence": ["opening", "escalation", "climax", "resolution"],
  "tension_curve": [0.1, 0.3, 0.7, 0.9, 0.5]
}

Return JSON only. No markdown.`;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const sourceBook = `${book.author}::${book.book_title}`;

    // Dedup
    const existing = litDb.db.query(
      'SELECT COUNT(*) as n FROM scene_templates WHERE source_book = ?'
    ).get(sourceBook) as { n: number };
    if (existing.n > 0) continue;

    const cleaned = cleanGutenbergText(book.context);
    if (cleaned.length < 200) continue;

    // Transaction per book
    litDb.db.exec('BEGIN TRANSACTION');
    try {
      // 1. Chunk
      const chunks = chunkText(cleaned, sourceBook, { minTokens: 200, maxTokens: 400, overlap: 60 });

      // Insert chunks
      for (const chunk of chunks) {
        litDb.insertChunkIndex({
          chunk_id: chunk.id,
          source_book: sourceBook,
          source_chapter: 0,
          text: chunk.text,
          token_est: chunk.token_est,
          char_start: chunk.char_start,
          char_end: chunk.char_end,
          embedding_ref: null,
          dict_hits: 0,
          pre_score: 0,
          cluster_id: null,
          created_at: Math.floor(Date.now() / 1000),
        });
      }

      // 2. AnalyzePass — single pass
      for (const chunk of chunks) {
        const analysis = analyzeChunk(chunk.text);
        Object.assign(chunk, analysis);
        litDb.updateChunkAnalysis({
          chunk_id: chunk.id,
          scene_type: analysis.scene_type,
          tempo: analysis.tempo,
          sensory_tags: JSON.stringify(analysis.sensory_tags),
          narrative_distance: analysis.narrative_distance,
          temporal_markers: JSON.stringify(analysis.temporal_markers),
          dict_hits: analysis.dict_hits,
          pre_score: analysis.pre_score,
        });
      }

      // 3. Filter candidates
      const candidates = chunks.filter(c => c.pre_score > 0.3);
      if (candidates.length === 0) {
        litDb.db.exec('COMMIT');
        continue;
      }

      // 4. Cluster (fallback if no embeddings)
      const clusters = hasEmbeddings
        ? clusterBySceneType(candidates) // TODO: replace with embedding-based cosine clustering when BGE-M3 integration is ready
        : clusterBySceneType(candidates);

      // 5. Select representatives
      const representatives = clusters.map(cluster =>
        cluster.reduce((a, b) => a.pre_score > b.pre_score ? a : b)
      );

      // 6. LLM extraction + style pattern creation
      for (let r = 0; r < representatives.length; r++) {
        const rep = representatives[r];
        const prevRep = r > 0 ? representatives[r - 1] : null;
        const nextRep = r < representatives.length - 1 ? representatives[r + 1] : null;

        let llmResult: Record<string, unknown> | null = null;
        try {
          const raw = await llm!.generateText(
            EXTRACT_TEMPLATE_PROMPT(
              prevRep?.text.slice(0, 1500) ?? null,
              rep.text.slice(0, 1500),
              nextRep?.text.slice(0, 1500) ?? null,
            )
          );
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) llmResult = JSON.parse(jsonMatch[0]);
        } catch {
          continue; // skip on LLM error
        }

        if (!llmResult) continue;

        const templateId = `scene-${book.etextno}-${representatives.indexOf(rep)}`;
        const qualityScore = calculateLiteraryQuality(
          {
            template_text: llmResult.template_text as string,
            archetype_secondary: llmResult.archetype_secondary as string | null,
            variables: llmResult.variables as string[],
            tags: [rep.scene_type, ...rep.sensory_tags],
          },
          { sensory_tags: rep.sensory_tags }
        );

        if (qualityScore < 0.3) continue;

        litDb.insertSceneTemplate({
          id: templateId,
          source_book: sourceBook,
          source_chapter: 0,
          source_chunk_ids: [rep.id],
          archetype_primary: (llmResult.archetype_primary as string) ?? 'everyday_life',
          archetype_secondary: llmResult.archetype_secondary as string | null,
          applicable_positions: [],
          variables: (llmResult.variables as string[]) ?? [],
          template_text: (llmResult.template_text as string) ?? '',
          beat_sequence: (llmResult.beat_sequence as string[]) ?? [],
          mood: (llmResult.mood as string) ?? 'neutral',
          difficulty: (llmResult.difficulty as string) ?? 'medium',
          moral_ambiguity: (llmResult.moral_ambiguity as number) ?? 0.5,
          tension_curve: (llmResult.tension_curve as number[]) ?? [],
          tags: [rep.scene_type, ...rep.sensory_tags],
          domain: rep.scene_type,
          scale: 1.0,
          embedding_id: null,
          quality_score: qualityScore,
          use_count: 0,
          last_used_at: null,
          created_at: Math.floor(Date.now() / 1000),
        });

        // 7. Style pattern
        const styleResult = stylistic.analyze({ text: rep.text, source_id: templateId });
        const pattern = styleResult.patterns[0];
        if (pattern) {
          const styleId = `style-${templateId}`;
          litDb.insertStylePattern({
            id: styleId,
            source_author_or_era: book.author,
            source_chunk_ids: [rep.id],
            avg_sentence_len: pattern.avg_sentence_length,
            sentence_len_variance: 0,
            sensory_ratio: pattern.sensory_markers.length / 5,
            register: pattern.lexical_richness > 0.6 ? 'formal' : 'casual',
            pacing: pattern.pacing,
            tone: pattern.tone,
            preferred_constructions: pattern.syntax_patterns,
            forbidden_phrases: [],
            example_snippets: [rep.text.slice(0, 200)],
            narrative_voice: rep.narrative_distance > 0.7 ? 'first_person' : 'third_person',
            temporal_style: rep.temporal_markers.includes('flashback') ? 'retrospective' : 'linear',
            dialogue_style: (rep.text.match(/"[^"]+"/g)?.length ?? 0) > 3 ? 'direct' : 'indirect',
            metaphor_density: 0.5,
            sentence_opening_variance: 0.5,
            paragraph_length_avg: 60,
            exclamation_ratio: (rep.text.match(/!/g)?.length ?? 0) / Math.max(pattern.avg_sentence_length, 1),
            rhetorical_devices: [],
            era: inferEra(book.author_birth ?? undefined, book.author_death ?? undefined),
            literary_period: inferLiteraryPeriod(book.author_birth ?? undefined, book.author_death ?? undefined),
            quality_score: qualityScore,
            created_at: Math.floor(Date.now() / 1000),
          });

          // 8. Link template ↔ style
          litDb.insertTemplateStyleLink({ template_id: templateId, style_id: styleId, weight: 1.0 });
        }
      }

      litDb.db.exec('COMMIT');

      emit({
        phase: 'v2',
        pct: Math.floor(((i + 1) / books.length) * 100),
        message: `Processed ${book.book_title} (${representatives.length} templates)`,
      });

    } catch (error) {
      litDb.db.exec('ROLLBACK');
      emit({
        phase: 'v2',
        pct: Math.floor(((i + 1) / books.length) * 100),
        message: `WARN: Failed ${book.book_title}: ${error}`,
      });
    }
  }

  srcDb.close();
  litDb.close();

  emit({ phase: 'v2-done', pct: 100, message: 'Phase B complete' });
}
```

- [ ] **Step 4: Wire Phase B into main**

Update the main block:

```typescript
if (phase === 'v2' || phase === 'all') {
  await runPhaseB();
}
```

Also add the constant at the top:

```typescript
const LITERARY_DB = './data/literary-compiler/literary.db';
```

- [ ] **Step 5: Run Phase B on existing data**

Run: `bun run scripts/process-gutenberg.ts --phase v2`
Expected: JSON progress lines, `phase: "v2-done"`.
Note: Requires classics.db from Task 3 and LLM availability. If LLM is unavailable, Phase B skips gracefully.

- [ ] **Step 6: Verify literary.db output**

Run: `bun -e "
const d = new (require('bun:sqlite').Database)('data/literary-compiler/literary.db');
console.log('templates:', d.query('SELECT COUNT(*) as n FROM scene_templates').get());
console.log('styles:', d.query('SELECT COUNT(*) as n FROM style_patterns').get());
console.log('chunks:', d.query('SELECT COUNT(*) as n FROM chunk_index').get());
d.close();
"`
Expected: non-zero counts

- [ ] **Step 7: Commit**

```bash
git add scripts/process-gutenberg.ts
git commit -m "feat(gutenberg): add Phase B (V2 LLM pipeline) to process-gutenberg

- Chunking (200-400 tokens, 60 overlap)
- Unified AnalyzePass per chunk (pre-score + scene type + sensory)
- LLM template extraction with retry
- Style pattern creation per template
- calculateLiteraryQuality heuristic (S13.5)
- Transaction per book with ROLLBACK on error
- Fallback keyword-based clustering when embeddings unavailable"
```

---

### Task 9: MCP Endpoint + compile-classics.ts Cleanup [S4, S10]

**Covers:** S10 (MCP endpoint), S4 (replace inline cleanText in compile-classics)

**Files:**
- Modify: `src/routes/mcp.ts` — add `/gutenberg/process` endpoint
- Modify: `scripts/compile-classics.ts` — use shared `cleanGutenbergText`

**Interfaces:**
- Produces: `POST /mcp/gutenberg/process` — runs import + Phase A + Phase B

- [ ] **Step 1: Add /gutenberg/process endpoint to mcp.ts**

In `src/routes/mcp.ts`, add after the existing gutenberg endpoints:

```typescript
mcpRouter.post("/gutenberg/process", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const phase = (body as { phase?: string }).phase ?? "all";

  const importResult = runScriptWithJob([
    "bun", "run", "scripts/import-gutenberg-texts.ts"
  ]);

  let v1Result = null;
  let v2Result = null;

  if (phase === "v1" || phase === "all") {
    v1Result = runScriptWithJob([
      "bun", "run", "scripts/process-gutenberg.ts", "--phase", "v1"
    ]);
  }

  if (phase === "v2" || phase === "all") {
    v2Result = runScriptWithJob([
      "bun", "run", "scripts/process-gutenberg.ts", "--phase", "v2"
    ]);
  }

  return c.json({
    importJob: importResult.jobId,
    v1Job: v1Result?.jobId ?? null,
    v2Job: v2Result?.jobId ?? null,
  });
});
```

- [ ] **Step 2: Replace inline cleanText in compile-classics.ts**

In `scripts/compile-classics.ts`, replace the `cleanText` function with an import:

Remove:
```typescript
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\*\*\*\s*(END|END OF|End of).*$/gms, '')
    .replace(/Project Gutenberg.*?$/gm, '')
    .replace(/This etext was prepared.*?$/gm, '')
    .replace(/Produced by.*?$/gm, '')
    .trim();
}
```

Add at top:
```typescript
import { cleanGutenbergText } from '../src/mcp/gutenberg/clean';
```

Replace usage:
```typescript
const cleaned = cleanGutenbergText(book.context);
```

- [ ] **Step 3: Test compile-classics.ts still works**

Run: `bun run scripts/compile-classics.ts`
Expected: Same behavior as before (may need classics.db to exist).

- [ ] **Step 4: Commit**

```bash
git add src/routes/mcp.ts scripts/compile-classics.ts
git commit -m "feat(gutenberg): add /mcp/gutenberg/process endpoint and clean up

- POST /mcp/gutenberg/process runs import + Phase A + Phase B pipeline
- Replaced inline cleanText in compile-classics.ts with shared cleanGutenbergText
- Bug #9 fix: single source of truth for text cleaning"
```

---

### Task 10: Narrative Structure Extraction [S16]

**Covers:** S16 (narrative_arcs, thematic_motifs, NARRATIVE_STRUCTURE_PROMPT)

**Files:**
- Create: `src/mcp/gutenberg/narrative-extractor.ts`
- Modify: `scripts/process-gutenberg.ts` — add narrative extraction step

**Interfaces:**
- Consumes: `LitDb.insertNarrativeArc()`, `LitDb.insertThematicMotif()` (Task 2)
- Produces: `extractNarrativeStructure()` — called inside Phase B per-book transaction

- [ ] **Step 1: Implement narrative-extractor.ts**

```typescript
// src/mcp/gutenberg/narrative-extractor.ts

import type { LiteraryCompilerDB } from '../literary-compiler/schema';
import { getLogger } from '@/utils/logger';

const logger = getLogger('NarrativeExtractor');

interface NarrativeLLM {
  generateText(prompt: string): Promise<string>;
}

interface LLMNarrativeResult {
  plot_arc: {
    archetype: string;
    tension_points: Array<{ position: number; intensity: number; label: string }>;
  };
  character_arcs: Array<{
    character_name: string;
    start_state: string;
    end_state: string;
    transformation: string;
    archetype: string;
  }>;
  thematic_motifs: Array<{
    name: string;
    symbolic_layer: string;
    evolution: string;
  }>;
  moral_vector: string;
  scale: string;
}

const NARRATIVE_STRUCTURE_PROMPT = (
  title: string,
  author: string,
  excerpts: Array<{ chapter: number; text: string }>
) => `
Analyze the narrative structure of "${title}" by ${author}.

Chapter excerpts (sampled from throughout the book):
${excerpts.map(e => `--- Chapter ${e.chapter} ---\n"${e.text.slice(0, 500)}"`).join('\n\n')}

Extract JSON:
{
  "plot_arc": {
    "archetype": "rise_fall" | "fall_rise" | "steady_rise" | "steady_fall" | "cyclical" | "flat",
    "tension_points": [{"position": 0.0-1.0, "intensity": 0.0-1.0, "label": "string"}]
  },
  "character_arcs": [
    {"character_name": "string", "start_state": "string", "end_state": "string", "transformation": "string", "archetype": "redemption" | "corruption" | "growth" | "stagnation"}
  ],
  "thematic_motifs": [
    {"name": "string", "symbolic_layer": "string", "evolution": "string"}
  ],
  "moral_vector": "redemptive" | "corruptive" | "ambiguous" | "amoral",
  "scale": "personal" | "interpersonal" | "societal" | "cosmic"
}

Return JSON only.`;

export async function extractNarrativeStructure(
  litDb: LiteraryCompilerDB,
  llm: NarrativeLLM,
  book: { etextno: number; book_title: string; author: string },
  sourceBook: string,
  chunks: Array<{ text: string }>
): Promise<void> {
  // Sample 5 excerpts evenly
  const count = Math.min(5, chunks.length);
  const step = Math.floor(chunks.length / Math.max(count, 1));
  const excerpts: Array<{ chapter: number; text: string }> = [];
  for (let i = 0; i < count; i++) {
    excerpts.push({ chapter: i + 1, text: chunks[Math.min(i * step, chunks.length - 1)].text });
  }

  try {
    const raw = await llm.generateText(
      NARRATIVE_STRUCTURE_PROMPT(book.book_title, book.author, excerpts)
    );
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const result: LLMNarrativeResult = JSON.parse(jsonMatch[0]);

    // Plot arc
    litDb.insertNarrativeArc({
      id: `arc-plot-${book.etextno}`,
      source_book: sourceBook,
      arc_type: 'plot_arc',
      archetype: result.plot_arc.archetype,
      tension_points: JSON.stringify(result.plot_arc.tension_points),
      transformation: null,
      thematic_motifs: JSON.stringify(result.thematic_motifs.map(m => m.name)),
      moral_vector: result.moral_vector,
      scale: result.scale,
      quality_score: 0.7,
      created_at: Math.floor(Date.now() / 1000),
    });

    // Character arcs (max 3)
    for (const char of result.character_arcs.slice(0, 3)) {
      litDb.insertNarrativeArc({
        id: `arc-char-${book.etextno}-${char.character_name.toLowerCase().replace(/\s+/g, '-')}`,
        source_book: sourceBook,
        arc_type: 'character_arc',
        archetype: char.archetype,
        tension_points: '[]',
        transformation: char.transformation,
        thematic_motifs: '[]',
        moral_vector: null,
        scale: 'personal',
        quality_score: 0.7,
        created_at: Math.floor(Date.now() / 1000),
      });
    }

    // Thematic motifs
    for (const motif of result.thematic_motifs) {
      litDb.insertThematicMotif({
        id: `motif-${book.etextno}-${motif.name.toLowerCase().replace(/\s+/g, '-')}`,
        source_book: sourceBook,
        motif_name: motif.name,
        occurrences: '[]',
        symbolic_layer: motif.symbolic_layer,
        evolution: motif.evolution,
        created_at: Math.floor(Date.now() / 1000),
      });
    }

    logger.info(`Extracted narrative structure for ${sourceBook}: ${result.character_arcs.length} arcs, ${result.thematic_motifs.length} motifs`);
  } catch (error) {
    logger.warn(`Narrative extraction failed for ${sourceBook}: ${error}`);
  }
}
```

- [ ] **Step 2: Integrate into Phase B**

In `scripts/process-gutenberg.ts`, import and call inside the per-book transaction (after step 8, before COMMIT):

```typescript
import { extractNarrativeStructure } from '../src/mcp/gutenberg/narrative-extractor';

// Inside the transaction, after style pattern creation:
await extractNarrativeStructure(litDb, llm!, book, sourceBook, chunks);
```

- [ ] **Step 3: Commit**

```bash
git add src/mcp/gutenberg/narrative-extractor.ts scripts/process-gutenberg.ts
git commit -m "feat(gutenberg): add narrative structure extraction (S16)

- extractNarrativeStructure() with LLM prompt for plot/character arcs + motifs
- Integrated into Phase B per-book transaction
- Creates narrative_arcs and thematic_motifs entries
- Samples 5 evenly-spaced excerpts for context"
```

---

### Task 11: Quality Score Validation [S17]

**Covers:** S17 (L1 calibration, quality threshold, MCP endpoints)

**Files:**
- Modify: `scripts/process-gutenberg.ts` — add calibration after Phase B
- Modify: `src/routes/mcp.ts` — add quality report endpoints

**Interfaces:**
- Produces: `quality_calibration` entries in `literary.db`
- Produces: `GET /mcp/gutenberg/quality-report`, `GET /mcp/gutenberg/quality-outliers`

- [ ] **Step 1: Implement calibrateQualityScores**

Add to `scripts/process-gutenberg.ts`:

```typescript
const QUALITY_CALIBRATION_PROMPT = (templates: Array<{ id: string; text: string }>) => `
Rate these narrative templates extracted from classical literature.

For each, score 0.0-1.0 on:
- literary_quality: Is this genuinely good prose, or generic filler?
- specificity: Could this describe ANY story, or only this specific one?
- reusability: Would this template produce interesting scenes?

Templates:
${templates.map((t, i) => `${i + 1}. [${t.id}] "${t.text.slice(0, 200)}"`).join('\n')}

Return JSON array:
[{"id": "template_id", "literary_quality": 0.0-1.0, "specificity": 0.0-1.0, "reusability": 0.0-1.0, "composite_score": 0.0-1.0}]

Return JSON only.`;

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
  return den === 0 ? 0 : num / den;
}

async function calibrateQualityScores(): Promise<void> {
  emit({ phase: 'calibration', pct: 0, message: 'Starting quality calibration' });

  let llm: { generateText(prompt: string): Promise<string> } | null = null;
  try {
    const { LLMQueue } = await import('../src/services/llm-queue');
    const queue = LLMQueue.getInstance();
    const client = queue.getAgentClient('literary-compiler');
    llm = { generateText: (p: string) => client.generate(p) };
  } catch {
    emit({ phase: 'calibration', pct: 100, message: 'LLM unavailable, skipping calibration' });
    return;
  }

  const litDb = new LiteraryCompilerDB(LITERARY_DB);
  const books = litDb.db.prepare(
    'SELECT DISTINCT source_book FROM scene_templates'
  ).all() as Array<{ source_book: string }>;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const templates = litDb.db.prepare(
      'SELECT id, template_text, quality_score FROM scene_templates WHERE source_book = ?'
    ).all(book.source_book) as Array<{ id: string; template_text: string; quality_score: number }>;

    if (templates.length < 3) continue;

    // Sample up to 10
    const sample = templates.slice(0, 10);
    const l0Scores = sample.map(t => t.quality_score);

    try {
      const raw = await llm!.generateText(
        QUALITY_CALIBRATION_PROMPT(sample.map(t => ({ id: t.id, text: t.template_text })))
      );
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const l1Result = JSON.parse(jsonMatch[0]) as Array<{ id: string; composite_score: number }>;
      const l1Map = new Map(l1Result.map(r => [r.id, r.composite_score]));

      const paired = sample
        .filter(t => l1Map.has(t.id))
        .map(t => ({ l0: t.quality_score, l1: l1Map.get(t.id)! }));

      if (paired.length < 2) continue;

      const correlation = pearsonCorrelation(
        paired.map(p => p.l0),
        paired.map(p => p.l1)
      );

      const l0Avg = l0Scores.reduce((a, b) => a + b, 0) / l0Scores.length;
      const l1Avg = paired.reduce((a, p) => a + p.l1, 0) / paired.length;
      const outliers = paired.filter(p => Math.abs(p.l0 - p.l1) > 0.3);

      litDb.insertQualityCalibration({
        source_book: book.source_book,
        l0_avg: l0Avg,
        l1_avg: l1Avg,
        correlation,
        template_count: templates.length,
        outlier_count: outliers.length,
        calibrated_at: Math.floor(Date.now() / 1000),
      });

    } catch {
      continue;
    }

    emit({
      phase: 'calibration',
      pct: Math.floor(((i + 1) / books.length) * 100),
      message: `Calibrated ${book.source_book}`,
    });
  }

  litDb.close();
  emit({ phase: 'calibration-done', pct: 100, message: 'Quality calibration complete' });
}
```

- [ ] **Step 2: Wire calibration into main**

```typescript
if (phase === 'all') {
  await calibrateQualityScores();
}
```

- [ ] **Step 3: Add quality report endpoints to mcp.ts**

```typescript
mcpRouter.get("/gutenberg/quality-report", (c) => {
  const db = new Database('./data/literary-compiler/literary.db', { readonly: true });

  const total = db.prepare('SELECT COUNT(*) as n FROM scene_templates').get() as { n: number };
  const avg = db.prepare('SELECT AVG(quality_score) as avg FROM scene_templates').get() as { avg: number };
  const distribution = db.prepare(`
    SELECT
      SUM(CASE WHEN quality_score < 0.3 THEN 1 ELSE 0 END) as low,
      SUM(CASE WHEN quality_score >= 0.3 AND quality_score <= 0.7 THEN 1 ELSE 0 END) as normal,
      SUM(CASE WHEN quality_score > 0.7 THEN 1 ELSE 0 END) as high
    FROM scene_templates
  `).get() as { low: number; normal: number; high: number };

  const byBook = db.prepare(`
    SELECT source_book, AVG(quality_score) as avg_score, COUNT(*) as template_count
    FROM scene_templates GROUP BY source_book ORDER BY avg_score DESC
  `).all();

  const calibration = db.prepare('SELECT * FROM quality_calibration').all();

  db.close();

  return c.json({
    total_templates: total.n,
    avg_score: avg.avg,
    distribution,
    by_book: byBook,
    calibration_summary: calibration,
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add scripts/process-gutenberg.ts src/routes/mcp.ts
git commit -m "feat(gutenberg): add quality calibration and report endpoint

- L1 LLM calibration: samples 10 templates per book, computes Pearson correlation
- quality_calibration table stores calibration results
- GET /mcp/gutenberg/quality-report: stats, distribution, per-book averages
- Integrated into process-gutenberg as post-Phase-B step"
```

---

### Task 12: Extend Corpus — expand-corpus.ts [S14]

**Covers:** S14 (corpus expansion from 59 to 250+)

**Files:**
- Create: `scripts/expand-corpus.ts`

**Interfaces:**
- Consumes: `GutenbergCatalog` (existing), Gutendex API
- Produces: downloaded `.txt` files, `data/gutenberg/corpus-manifest.json`

- [ ] **Step 1: Implement expand-corpus.ts**

```typescript
#!/usr/bin/env bun
/**
 * Expand Gutenberg corpus by downloading books from specific authors.
 *
 * Usage: bun scripts/expand-corpus.ts --authors "Dickens,Tolstoy,Austen" [--dry-run] [--target 3]
 */

import { GutenbergCatalog } from '../src/mcp/gutenberg/catalog';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const hasFlag = (name: string) => args.includes(name);

const AUTHORS = flag('--authors', '').split(',').filter(Boolean);
const TARGET_PER_AUTHOR = parseInt(flag('--target', '3'), 10);
const DRY_RUN = hasFlag('--dry-run');
const MANIFEST_PATH = flag('--manifest', 'data/gutenberg/corpus-manifest.json');
const OUT_DIR = 'data/gutenberg/texts';

interface ManifestEntry {
  etextno: number;
  title: string;
  author: string;
  era: string;
  downloadedAt: string;
  status: 'downloaded' | 'processed_v1' | 'processed_v2' | 'error';
}

interface Manifest {
  version: 1;
  lastUpdated: string;
  books: Record<string, ManifestEntry>;
}

function loadManifest(): Manifest {
  if (existsSync(MANIFEST_PATH)) {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  }
  return { version: 1, lastUpdated: new Date().toISOString(), books: {} };
}

function saveManifest(manifest: Manifest) {
  manifest.lastUpdated = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

async function fetchGutendex(author: string, limit: number) {
  const url = `https://gutendex.com/books/?author=${encodeURIComponent(author)}&languages=en&sort=downloads`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Gutendex error: ${resp.status}`);
  const data = await resp.json() as { results: Array<{ id: number; title: string; authors: Array<{ name: string; birth_year?: number; death_year?: number }>; subjects: string[]; bookshelves: string[]; formats: Record<string, string>; download_count: number }> };
  return data.results.slice(0, limit);
}

async function downloadText(etextno: number): Promise<string | null> {
  const url = `https://www.gutenberg.org/files/${etextno}/${etextno}-0.txt`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      // Try alternate URL
      const alt = `https://www.gutenberg.org/cache/epub/${etextno}/pg${etextno}.txt`;
      const resp2 = await fetch(alt);
      if (!resp2.ok) return null;
      return await resp2.text();
    }
    return await resp.text();
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────

if (AUTHORS.length === 0) {
  console.error('Usage: bun scripts/expand-corpus.ts --authors "Dickens,Tolstoy" [--dry-run]');
  process.exit(1);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const manifest = loadManifest();
let downloaded = 0;
let skipped = 0;

for (const author of AUTHORS) {
  console.log(`\n=== ${author} ===`);

  const books = await fetchGutendex(author, TARGET_PER_AUTHOR * 2); // fetch extra for filtering

  for (const book of books) {
    if (downloaded >= TARGET_PER_AUTHOR && !DRY_RUN) break;

    const etextno = book.id;

    // Skip if already in manifest or on disk
    if (manifest.books[etextno.toString()]) {
      skipped++;
      continue;
    }

    const filePath = join(OUT_DIR, `${etextno}.txt`);
    if (existsSync(filePath)) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] Would download: ${book.title} (${etextno}) by ${book.authors[0]?.name ?? 'Unknown'}`);
      downloaded++;
      continue;
    }

    // Download
    const text = await downloadText(etextno);
    if (!text || text.length < 10000) {
      console.log(`  SKIP (too short): ${book.title}`);
      continue;
    }

    writeFileSync(filePath, text);

    manifest.books[etextno.toString()] = {
      etextno,
      title: book.title,
      author: book.authors[0]?.name ?? 'Unknown',
      era: 'unknown',
      downloadedAt: new Date().toISOString(),
      status: 'downloaded',
    };

    downloaded++;
    console.log(`  Downloaded: ${book.title} (${etextno})`);

    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }
}

saveManifest(manifest);
console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped`);
```

- [ ] **Step 2: Test with dry run**

Run: `bun run scripts/expand-corpus.ts --authors "Dickens" --dry-run`
Expected: Lists books that would be downloaded

- [ ] **Step 3: Commit**

```bash
git add scripts/expand-corpus.ts
git commit -m "feat(gutenberg): add expand-corpus.ts for corpus expansion

- Queries Gutendex API by author name
- Downloads .txt files from Project Gutenberg
- Maintains corpus-manifest.json with status tracking
- Dry-run mode by default (safe)
- Rate limiting (200ms between downloads)"
```

---

### Task 13: Full Pipeline Integration Test

**Covers:** End-to-end verification

**Files:** No new files — verification only

- [ ] **Step 1: Run the full pipeline**

```bash
# Import (if texts exist)
bun run scripts/import-gutenberg-texts.ts

# Phase A (V1)
bun run scripts/process-gutenberg.ts --phase v1

# Phase B (V2) — requires LLM
bun run scripts/process-gutenberg.ts --phase v2
```

- [ ] **Step 2: Verify all databases are populated**

```bash
bun -e "
const { Database } = require('bun:sqlite');

console.log('=== classics.db ===');
const c = new Database('data/gutenberg/classics.db');
console.log('books:', c.query('SELECT COUNT(*) as n FROM gutenberg').get());
c.close();

console.log('=== gutenberg-normalized.db ===');
const n = new Database('data/gutenberg/gutenberg-normalized.db');
console.log('texts:', n.query('SELECT COUNT(*) as n FROM gutenberg_texts').get());
console.log('styles:', n.query('SELECT COUNT(*) as n FROM gutenberg_styles').get());
n.close();

console.log('=== classics-compiled.db ===');
const cc = new Database('data/literary-compiler/classics-compiled.db');
console.log('templates:', cc.query('SELECT COUNT(*) as n FROM bible_quest_templates').get());
cc.close();

console.log('=== literary.db ===');
const l = new Database('data/literary-compiler/literary.db');
console.log('scene_templates:', l.query('SELECT COUNT(*) as n FROM scene_templates').get());
console.log('style_patterns:', l.query('SELECT COUNT(*) as n FROM style_patterns').get());
console.log('chunks:', l.query('SELECT COUNT(*) as n FROM chunk_index').get());
console.log('narrative_arcs:', l.query('SELECT COUNT(*) as n FROM narrative_arcs').get());
console.log('thematic_motifs:', l.query('SELECT COUNT(*) as n FROM thematic_motifs').get());
l.close();

console.log('=== player-profiles.db ===');
const p = new Database('data/player-profiles.db');
console.log('profiles:', p.query('SELECT COUNT(*) as n FROM player_style_profiles').get());
p.close();
"
```

- [ ] **Step 3: Test MCP endpoint**

```bash
curl -X POST http://localhost:3000/mcp/gutenberg/process \
  -H "Content-Type: application/json" \
  -d '{"phase": "all"}'
```

Expected: `{ "importJob": "uuid", "v1Job": "uuid", "v2Job": "uuid" }`

- [ ] **Step 4: Test quality report**

```bash
curl http://localhost:3000/mcp/gutenberg/quality-report
```

Expected: JSON with `total_templates`, `avg_score`, `distribution`, `by_book`

- [ ] **Step 5: Run all tests**

```bash
bun test src/mcp/gutenberg/ src/lib/ src/mcp/literary-compiler/
```

Expected: all tests PASS

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify full Gutenberg pipeline integration

All 4 databases populated:
- classics.db: imported books
- gutenberg-normalized.db: texts + styles
- classics-compiled.db: V1 quest templates
- literary.db: V2 scene templates + style patterns + narrative structure
- player-profiles.db: cross-agent player profiles"
```
