import { Database } from 'bun:sqlite';
import { BibleVerse, BiblePattern, BibleParseResult, BibleSearchOptions, BiblePatternFilter, BOOK_ABBREVIATIONS, BibleJSONSchema } from './types';
import { getLogger } from '@/utils/logger';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const logger = getLogger('BibleParser');

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
   */
  getVerse(ref: string): BibleVerse | null {
    return this.normalizedDb
      .query('SELECT * FROM bible_verses WHERE id = ?')
      .get(ref) as BibleVerse | null;
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
      books.add(book.name);
      const bookAbbr = BOOK_ABBREVIATIONS[book.name] ?? book.name.substring(0, 3).toUpperCase();

      for (const chapter of book.chapters) {
        for (const v of chapter.verses) {
          const id = `${bookAbbr}.${chapter.chapter}.${v.verse}`;
          const text = v.text.trim();
          if (!text) continue;

          this.normalizedDb
            .query('INSERT OR REPLACE INTO bible_verses (id, book, book_abbr, chapter, verse, text, language, source_table, source_rowid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(id, book.name, bookAbbr, chapter.chapter, v.verse, text, 'en', source ?? data.translation, 0);

          verseCount++;
        }
      }
    }

    logger.info(`Loaded ${verseCount} verses from ${filePath} (${books.size} books)`);
    return { verseCount, bookCount: books.size };
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  close(): void {
    if (this.providedDb) {
      this.providedDb.close();
    }
    this.normalizedDb.close();
  }
}
