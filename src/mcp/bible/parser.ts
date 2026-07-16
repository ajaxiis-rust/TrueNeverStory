import { Database } from 'bun:sqlite';
import { BibleVerse, BiblePattern, BibleParseResult, BibleSearchOptions, BiblePatternFilter, BOOK_ABBREVIATIONS, BibleJSONSchema } from './types';
import { getLogger } from '@/utils/logger';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import type { CrossRefJSONSchema, CrossRef, CrossRefSearchOptions } from './types';

const logger = getLogger('BibleParser');

// ─── Book Name Normalization ────────────────────────────────────────────────

const BOOK_NAME_NORMALIZATION: Record<string, string> = {
  'I Samuel': '1 Samuel',
  'II Samuel': '2 Samuel',
  'I Kings': '1 Kings',
  'II Kings': '2 Kings',
  'I Chronicles': '1 Chronicles',
  'II Chronicles': '2 Chronicles',
  'I Corinthians': '1 Corinthians',
  'II Corinthians': '2 Corinthians',
  'I Thessalonians': '1 Thessalonians',
  'II Thessalonians': '2 Thessalonians',
  'I Timothy': '1 Timothy',
  'II Timothy': '2 Timothy',
  'I Peter': '1 Peter',
  'II Peter': '2 Peter',
  'I John': '1 John',
  'II John': '2 John',
  'III John': '3 John',
  'Revelation of John': 'Revelation',
};

function normalizeBookName(name: string): string {
  return BOOK_NAME_NORMALIZATION[name] ?? name;
}

// ─── Configuration ───────────────────────────────────────────────────────────

export interface BibleParseConfig {
  dbPath: string;
  verseTable?: string;
  verseColumns?: {
    text: string;
    book?: string;
    chapter?: string;
    verse?: string;
    bookAbbr?: string;
  };
  normalizeToEnglish?: boolean;
  dataDir?: string;
}

// ─── Bible Parser ────────────────────────────────────────────────────────────

export class BibleParser {
  private providedDb: Database | null = null;
  private normalizedDb: Database;
  private config: BibleParseConfig;
  private dataDir: string;

  constructor(config: BibleParseConfig) {
    this.config = config;
    this.dataDir = config.dataDir ?? join(process.cwd(), 'data', 'bible');

    // Ensure data directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    // Open normalized database
    const normalizedPath = join(this.dataDir, 'bible-normalized.db');
    this.normalizedDb = new Database(normalizedPath);
    this.normalizedDb.exec('PRAGMA journal_mode=WAL');
    this.normalizedDb.exec('PRAGMA synchronous=NORMAL');

    // Create tables if they don't exist
    this.createNormalizedTables();
  }

  /**
   * Introspect the provided DB schema and extract verses.
   * Runs once on first load, then uses cache.
   */
  async parse(): Promise<BibleParseResult> {
    // Check if already parsed
    const existing = this.normalizedDb.query('SELECT COUNT(*) as count FROM bible_verses').get() as { count: number };
    if (existing.count > 0) {
      logger.info(`Bible already parsed: ${existing.count} verses`);
      const books = this.normalizedDb.query('SELECT DISTINCT book FROM bible_verses').all() as { book: string }[];
      return {
        verseCount: existing.count,
        bookCount: books.length,
        books: books.map(b => b.book),
      };
    }

    // Open provided database
    this.providedDb = new Database(this.config.dbPath, { readonly: true });

    // Introspect schema
    const schema = await this.introspectSchema();
    logger.info(`Introspected schema: ${JSON.stringify(schema)}`);

    // Extract verses
    const verses = await this.extractVerses(schema);
    logger.info(`Extracted ${verses.length} verses`);

    // Build FTS index
    await this.buildSearchIndex();

    this.providedDb.close();
    this.providedDb = null;

    const books = this.normalizedDb.query('SELECT DISTINCT book FROM bible_verses').all() as { book: string }[];
    return {
      verseCount: verses.length,
      bookCount: books.length,
      books: books.map(b => b.book),
    };
  }

  /**
   * Search verses by text, book, or reference.
   */
  search(query: string, options?: BibleSearchOptions): BibleVerse[] {
    const limit = options?.limit ?? 20;

    if (options?.book) {
      return this.normalizedDb
        .query('SELECT * FROM bible_verses WHERE book = ? AND text LIKE ? LIMIT ?')
        .all(options.book, `%${query}%`, limit) as BibleVerse[];
    }

    if (options?.chapter) {
      return this.normalizedDb
        .query('SELECT * FROM bible_verses WHERE chapter = ? AND text LIKE ? LIMIT ?')
        .all(options.chapter, `%${query}%`, limit) as BibleVerse[];
    }

    // Full-text search
    return this.normalizedDb
      .query('SELECT * FROM bible_verses WHERE text LIKE ? LIMIT ?')
      .all(`%${query}%`, limit) as BibleVerse[];
  }

  /**
   * Get verse by atomic pointer (GUID/reference).
   * Accepts both abbreviated IDs ("ISA.63.12") and full book names ("Isaiah.63.12").
   */
  getVerse(ref: string): BibleVerse | null {
    // Try exact match first
    const exact = this.normalizedDb
      .query('SELECT * FROM bible_verses WHERE id = ?')
      .get(ref) as BibleVerse | null;
    if (exact) return exact;

    // Try resolving full book name → abbreviation
    const parts = ref.split('.');
    if (parts.length >= 3) {
      const bookName = parts[0]!;
      const chapter = parts[1]!;
      const verse = parts[2]!;
      const abbr = BOOK_ABBREVIATIONS[bookName];
      if (abbr) {
        const abbrRef = `${abbr}.${chapter}.${verse}`;
        return this.normalizedDb
          .query('SELECT * FROM bible_verses WHERE id = ?')
          .get(abbrRef) as BibleVerse | null;
      }
    }

    return null;
  }

  /**
   * Get pattern by archetype or mood.
   */
  getPatterns(filter?: BiblePatternFilter): BiblePattern[] {
    let query = 'SELECT * FROM bible_patterns WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.archetype) {
      query += ' AND archetype = ?';
      params.push(filter.archetype);
    }

    if (filter?.mood) {
      query += ' AND mood = ?';
      params.push(filter.mood);
    }

    if (filter?.narrativeFunction) {
      query += ' AND narrative_functions LIKE ?';
      params.push(`%${filter.narrativeFunction}%`);
    }

    const results = this.normalizedDb.query(query).all(...params as any[]) as Array<{
      id: string;
      name: string;
      archetype: string;
      verses: string;
      description: string;
      narrative_functions: string;
      mood: string;
    }>;

    return results.map(r => ({
      id: r.id,
      name: r.name,
      archetype: r.archetype,
      verses: JSON.parse(r.verses),
      description: r.description,
      narrativeFunctions: JSON.parse(r.narrative_functions),
      mood: r.mood,
    }));
  }

  /**
   * Get all books in the database.
   */
  getBooks(): string[] {
    return (this.normalizedDb
      .query('SELECT DISTINCT book FROM bible_verses ORDER BY book')
      .all() as { book: string }[]).map(b => b.book);
  }

  /**
   * Get verse count for a book.
   */
  getVerseCount(book?: string): number {
    if (book) {
      return (this.normalizedDb
        .query('SELECT COUNT(*) as count FROM bible_verses WHERE book = ?')
        .get(book) as { count: number }).count;
    }
    return (this.normalizedDb
      .query('SELECT COUNT(*) as count FROM bible_verses')
      .get() as { count: number }).count;
  }

  // ─── Schema Introspection ─────────────────────────────────────────────

  private async introspectSchema(): Promise<{
    table: string;
    columns: Record<string, string>;
  }> {
    if (!this.providedDb) throw new Error('Database not opened');

    // Get all tables
    const tables = this.providedDb
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    logger.info(`Found tables: ${tables.map(t => t.name).join(', ')}`);

    // Find the most likely verse table
    const verseTableNames = ['bible', 'verses', 'bible_verses', 'scripture', 'text', 'texts'];
    let verseTable = this.config.verseTable;

    if (!verseTable) {
      // Auto-detect: look for tables with text content
      for (const tableName of verseTableNames) {
        const table = tables.find(t => t.name.toLowerCase() === tableName);
        if (table) {
          verseTable = table.name;
          break;
        }
      }

      // If not found, use the first table with text-like columns
      if (!verseTable) {
        for (const table of tables) {
          const columns = this.providedDb
            .query(`PRAGMA table_info(${table.name})`)
            .all() as { name: string; type: string }[];

          const hasText = columns.some(c =>
            c.type.toUpperCase().includes('TEXT') ||
            c.name.toLowerCase().includes('text') ||
            c.name.toLowerCase().includes('content')
          );

          if (hasText) {
            verseTable = table.name;
            break;
          }
        }
      }
    }

    if (!verseTable) {
      throw new Error(`Could not find verse table in ${this.config.dbPath}`);
    }

    // Get columns
    const columns = this.providedDb
      .query(`PRAGMA table_info(${verseTable})`)
      .all() as { name: string; type: string }[];

    const columnMap: Record<string, string> = {};
    for (const col of columns) {
      columnMap[col.name] = col.type;
    }

    return { table: verseTable, columns: columnMap };
  }

  // ─── Verse Extraction ─────────────────────────────────────────────────

  private async extractVerses(schema: { table: string; columns: Record<string, string> }): Promise<BibleVerse[]> {
    if (!this.providedDb) throw new Error('Database not opened');

    const cols = this.config.verseColumns ?? this.autoDetectColumns(schema.columns);
    const verses: BibleVerse[] = [];

    // Query all rows
    const rows = this.providedDb.query(`SELECT * FROM ${schema.table}`).all() as Record<string, unknown>[];

    for (const row of rows) {
      const text = String(row[cols.text] ?? '');
      if (!text.trim()) continue;

      const book = String(row[cols.book ?? ''] ?? this.inferBook(row, schema.columns) ?? 'Unknown');
      const bookAbbr = BOOK_ABBREVIATIONS[book] ?? book.substring(0, 3).toUpperCase();
      const chapter = Number(row[cols.chapter ?? ''] ?? this.inferChapter(row, schema.columns) ?? 0);
      const verseNum = Number(row[cols.verse ?? ''] ?? this.inferVerse(row, schema.columns) ?? 0);

      const verse: BibleVerse = {
        id: `${bookAbbr}.${chapter}.${verseNum}`,
        book,
        bookAbbr,
        chapter,
        verse: verseNum,
        text: text.trim(),
        language: this.config.normalizeToEnglish ? 'en' : 'unknown',
        sourceTable: schema.table,
        sourceRowid: row['rowid'] as number | undefined,
      };

      // Insert into normalized database
      this.normalizedDb
        .query('INSERT OR IGNORE INTO bible_verses (id, book, book_abbr, chapter, verse, text, language, source_table, source_rowid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(verse.id, verse.book, verse.bookAbbr, verse.chapter, verse.verse, verse.text, verse.language, verse.sourceTable ?? '', verse.sourceRowid ?? 0);

      verses.push(verse);
    }

    return verses;
  }

  private autoDetectColumns(columns: Record<string, string>): {
    text: string;
    book?: string;
    chapter?: string;
    verse?: string;
  } {
    const colNames = Object.keys(columns);

    // Find text column
    const textCol = colNames.find(c =>
      c.toLowerCase().includes('text') ||
      c.toLowerCase().includes('content') ||
      c.toLowerCase().includes('verse_text')
    ) ?? colNames[0];

    // Find book column
    const bookCol = colNames.find(c =>
      c.toLowerCase().includes('book') ||
      c.toLowerCase().includes('name')
    );

    // Find chapter column
    const chapterCol = colNames.find(c =>
      c.toLowerCase().includes('chapter')
    );

    // Find verse column
    const verseCol = colNames.find(c =>
      c.toLowerCase().includes('verse') &&
      !c.toLowerCase().includes('verse_text')
    );

    return {
      text: textCol ?? colNames[0] ?? 'text',
      book: bookCol,
      chapter: chapterCol,
      verse: verseCol,
    };
  }

  private inferBook(row: Record<string, unknown>, columns: Record<string, string>): string | null {
    // Try to infer book from other fields
    const keys = Object.keys(row);
    for (const key of keys) {
      if (key.toLowerCase().includes('book') || key.toLowerCase().includes('name')) {
        const val = String(row[key] ?? '');
        if (val && val.length > 2) return val;
      }
    }
    return null;
  }

  private inferChapter(row: Record<string, unknown>, columns: Record<string, string>): number | null {
    const keys = Object.keys(row);
    for (const key of keys) {
      if (key.toLowerCase().includes('chapter')) {
        return Number(row[key]) || null;
      }
    }
    return null;
  }

  private inferVerse(row: Record<string, unknown>, columns: Record<string, string>): number | null {
    const keys = Object.keys(row);
    for (const key of keys) {
      if (key.toLowerCase().includes('verse') && !key.toLowerCase().includes('text')) {
        return Number(row[key]) || null;
      }
    }
    return null;
  }

  // ─── FTS Index ────────────────────────────────────────────────────────

  private async buildSearchIndex(): Promise<void> {
    // Create FTS table if it doesn't exist
    this.normalizedDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS bible_fts
      USING fts5(text, book, content=bible_verses, content_rowid=rowid)
    `);

    // Populate FTS
    this.normalizedDb.exec(`
      INSERT OR REPLACE INTO bible_fts (rowid, text, book)
      SELECT rowid, text, book FROM bible_verses
    `);
  }

  // ─── Normalized Tables ────────────────────────────────────────────────

  private createNormalizedTables(): void {
    this.normalizedDb.exec(`
      CREATE TABLE IF NOT EXISTS bible_verses (
        id TEXT PRIMARY KEY,
        book TEXT NOT NULL,
        book_abbr TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        verse INTEGER NOT NULL,
        text TEXT NOT NULL,
        language TEXT DEFAULT 'en',
        source_table TEXT,
        source_rowid INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    this.normalizedDb.exec(`
      CREATE TABLE IF NOT EXISTS bible_patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        archetype TEXT NOT NULL,
        verses TEXT NOT NULL,
        description TEXT NOT NULL,
        narrative_functions TEXT NOT NULL,
        mood TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    this.normalizedDb.exec(`
      CREATE TABLE IF NOT EXISTS bible_cross_refs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_book TEXT NOT NULL,
        from_chapter INTEGER NOT NULL,
        from_verse INTEGER NOT NULL,
        to_book TEXT NOT NULL,
        to_chapter INTEGER NOT NULL,
        to_verse_start INTEGER NOT NULL,
        to_verse_end INTEGER NOT NULL,
        votes INTEGER DEFAULT 0,
        source TEXT
      )
    `);

    this.normalizedDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS bible_cross_refs_fts
      USING fts5(from_book, to_book, content=bible_cross_refs, content_rowid=id)
    `);

    this.normalizedDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_cross_refs_from
      ON bible_cross_refs(from_book, from_chapter, from_verse)
    `);

    this.normalizedDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_cross_refs_to
      ON bible_cross_refs(to_book, to_chapter, to_verse_start)
    `);
  }

  // ─── JSON Loading ────────────────────────────────────────────────────

  /**
   * Load verses from a scrollmapper/bible_databases JSON file.
   * Uses INSERT OR REPLACE — later loads overwrite earlier ones for same verse ID.
   */
  async loadFromJSON(filePath: string, source?: string): Promise<{ verseCount: number; bookCount: number }> {
    const raw = readFileSync(filePath, 'utf-8');
    const data: BibleJSONSchema = JSON.parse(raw);

    let verseCount = 0;
    const books = new Set<string>();

    for (const book of data.books) {
      const normalizedName = normalizeBookName(book.name);
      books.add(normalizedName);
      const bookAbbr = BOOK_ABBREVIATIONS[normalizedName] ?? BOOK_ABBREVIATIONS[book.name] ?? book.name.substring(0, 3).toUpperCase();

      for (const chapter of book.chapters) {
        for (const v of chapter.verses) {
          const id = `${bookAbbr}.${chapter.chapter}.${v.verse}`;
          const text = v.text.trim();
          if (!text) continue;

          this.normalizedDb
            .query('INSERT OR REPLACE INTO bible_verses (id, book, book_abbr, chapter, verse, text, language, source_table, source_rowid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(id, normalizedName, bookAbbr, chapter.chapter, v.verse, text, 'en', source ?? data.translation, 0);

          verseCount++;
        }
      }
    }

    logger.info(`Loaded ${verseCount} verses from ${filePath} (${books.size} books)`);
    return { verseCount, bookCount: books.size };
  }

  // ─── Cross-References ───────────────────────────────────────────────

  /**
   * Load cross-references from scrollmapper JSON shards.
   */
  async loadCrossRefs(shardsDir: string): Promise<{ refCount: number }> {
    const files = readdirSync(shardsDir).filter(f => f.startsWith('cross_references_') && f.endsWith('.json'));
    let refCount = 0;

    for (const file of files) {
      const raw = readFileSync(join(shardsDir, file), 'utf-8');
      const data: CrossRefJSONSchema = JSON.parse(raw);

      for (const ref of data.cross_references) {
        for (const to of ref.to_verse) {
          this.normalizedDb
            .query('INSERT INTO bible_cross_refs (from_book, from_chapter, from_verse, to_book, to_chapter, to_verse_start, to_verse_end, votes, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(
              normalizeBookName(ref.from_verse.book),
              ref.from_verse.chapter,
              ref.from_verse.verse,
              normalizeBookName(to.book),
              to.chapter,
              to.verse_start,
              to.verse_end,
              ref.votes,
              file,
            );
          refCount++;
        }
      }

      logger.info(`Loaded cross-refs from ${file}`);
    }

    this.normalizedDb.exec('INSERT OR REPLACE INTO bible_cross_refs_fts(bible_cross_refs_fts) VALUES("rebuild")');

    logger.info(`Loaded ${refCount} cross-references total`);
    return { refCount };
  }

  /**
   * Get cross-references for a specific verse.
   */
  getCrossRefs(options: CrossRefSearchOptions): CrossRef[] {
    let query = 'SELECT * FROM bible_cross_refs WHERE from_book = ? AND from_chapter = ? AND from_verse = ?';
    const params: unknown[] = [options.book!, options.chapter!, options.verse!];

    if (options.minVotes) {
      query += ' AND votes >= ?';
      params.push(options.minVotes);
    }

    query += ' ORDER BY votes DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.normalizedDb.query(query).all(...params) as Array<{
      id: number;
      from_book: string;
      from_chapter: number;
      from_verse: number;
      to_book: string;
      to_chapter: number;
      to_verse_start: number;
      to_verse_end: number;
      votes: number;
      source: string | null;
    }>;

    return rows.map(r => ({
      id: r.id,
      fromBook: r.from_book,
      fromChapter: r.from_chapter,
      fromVerse: r.from_verse,
      toBook: r.to_book,
      toChapter: r.to_chapter,
      toVerseStart: r.to_verse_start,
      toVerseEnd: r.to_verse_end,
      votes: r.votes,
      source: r.source ?? undefined,
    }));
  }

  /**
   * Graph traversal: find related verses up to N hops.
   */
  getRelatedVerses(book: string, chapter: number, verse: number, depth: number = 1): CrossRef[] {
    const visited = new Set<string>();
    const results: CrossRef[] = [];
    const queue: Array<{ book: string; chapter: number; verse: number; currentDepth: number }> = [
      { book, chapter, verse, currentDepth: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.book}.${current.chapter}.${current.verse}`;

      if (visited.has(key)) continue;
      visited.add(key);

      const refs = this.getCrossRefs({
        book: current.book,
        chapter: current.chapter,
        verse: current.verse,
      });

      for (const ref of refs) {
        results.push(ref);

        if (current.currentDepth < depth) {
          for (let v = ref.toVerseStart; v <= ref.toVerseEnd; v++) {
            const targetKey = `${ref.toBook}.${ref.toChapter}.${v}`;
            if (!visited.has(targetKey)) {
              queue.push({
                book: ref.toBook,
                chapter: ref.toChapter,
                verse: v,
                currentDepth: current.currentDepth + 1,
              });
            }
          }
        }
      }
    }

    return results;
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  close(): void {
    if (this.providedDb) {
      this.providedDb.close();
    }
    this.normalizedDb.close();
  }
}
