import { Database } from 'bun:sqlite';
import { GutenbergStyle, GutenbergText, GutenbergParseResult, GutenbergSearchOptions, StyleExtractionConfig } from './types';
import { Delexifier } from './delexifier';
import { getLogger } from '@/utils/logger';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const logger = getLogger('GutenbergParser');

// ─── Configuration ───────────────────────────────────────────────────────────

export interface GutenbergParseConfig {
  dbPath: string;
  textTable?: string;
  textColumns?: {
    title?: string;
    author?: string;
    text?: string;
    language?: string;
    workId?: string;
  };
  extractStyles?: boolean;
  dataDir?: string;
  styleExtraction?: Partial<StyleExtractionConfig>;
}

// ─── Gutenberg Parser ────────────────────────────────────────────────────────

export class GutenbergParser {
  private providedDb: Database | null = null;
  private normalizedDb: Database;
  private config: GutenbergParseConfig;
  private dataDir: string;
  private delexifier: Delexifier;

  constructor(config: GutenbergParseConfig) {
    this.config = config;
    this.dataDir = config.dataDir ?? join(process.cwd(), 'data', 'gutenberg');
    this.delexifier = new Delexifier();

    // Ensure data directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    // Open normalized database
    const normalizedPath = join(this.dataDir, 'gutenberg-normalized.db');
    this.normalizedDb = new Database(normalizedPath);
    this.normalizedDb.exec('PRAGMA journal_mode=WAL');
    this.normalizedDb.exec('PRAGMA synchronous=NORMAL');

    // Create tables if they don't exist
    this.createNormalizedTables();
  }

  /**
   * Parse provided DB, extract texts, build style patterns.
   */
  async parse(): Promise<GutenbergParseResult> {
    // Check if already parsed
    const existingTexts = this.normalizedDb.query('SELECT COUNT(*) as count FROM gutenberg_texts').get() as { count: number };
    if (existingTexts.count > 0 && !this.config.extractStyles) {
      logger.info(`Gutenberg already parsed: ${existingTexts.count} texts`);
      const styles = this.normalizedDb.query('SELECT COUNT(*) as count FROM gutenberg_styles').get() as { count: number };
      return { textCount: existingTexts.count, styleCount: styles.count };
    }

    // Open provided database
    this.providedDb = new Database(this.config.dbPath, { readonly: true });

    // Introspect schema
    const schema = await this.introspectSchema();
    logger.info(`Introspected schema: ${JSON.stringify(schema)}`);

    // Extract texts
    const texts = await this.extractTexts(schema);
    logger.info(`Extracted ${texts.length} texts`);

    // Extract styles if requested
    let styleCount = 0;
    if (this.config.extractStyles !== false) {
      const styles = await this.extractStyles(texts);
      styleCount = styles.length;
      logger.info(`Extracted ${styleCount} styles`);
    }

    // Build FTS index
    await this.buildSearchIndex();

    this.providedDb.close();
    this.providedDb = null;

    return { textCount: texts.length, styleCount };
  }

  /**
   * Delexify a passage — replace proper nouns with placeholders.
   */
  delexify(text: string): string {
    return this.delexifier.delexify(text);
  }

  /**
   * Search styles by mood, tags, or description.
   */
  searchStyles(query: string, options?: GutenbergSearchOptions): GutenbergStyle[] {
    const limit = options?.limit ?? 20;

    if (options?.mood) {
      return this.normalizedDb
        .query('SELECT * FROM gutenberg_styles WHERE mood_tags LIKE ? AND (name LIKE ? OR description LIKE ?) LIMIT ?')
        .all(`%${options.mood}%`, `%${query}%`, `%${query}%`, limit) as GutenbergStyle[];
    }

    return this.normalizedDb
      .query('SELECT * FROM gutenberg_styles WHERE name LIKE ? OR description LIKE ? OR vocabulary LIKE ? LIMIT ?')
      .all(`%${query}%`, `%${query}%`, `%${query}%`, limit) as GutenbergStyle[];
  }

  /**
   * Get style by ID.
   */
  getStyle(id: string): GutenbergStyle | null {
    return this.normalizedDb
      .query('SELECT * FROM gutenberg_styles WHERE id = ?')
      .get(id) as GutenbergStyle | null;
  }

  /**
   * Get all styles.
   */
  getAllStyles(): GutenbergStyle[] {
    return this.normalizedDb
      .query('SELECT * FROM gutenberg_styles')
      .all() as GutenbergStyle[];
  }

  /**
   * Get text count.
   */
  getTextCount(): number {
    return (this.normalizedDb
      .query('SELECT COUNT(*) as count FROM gutenberg_texts')
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

    // Find the most likely text table
    const textTableNames = ['gutenberg', 'texts', 'books', 'works', 'content', 'chapters'];
    let textTable = this.config.textTable;

    if (!textTable) {
      // Auto-detect
      for (const tableName of textTableNames) {
        const table = tables.find(t => t.name.toLowerCase() === tableName);
        if (table) {
          textTable = table.name;
          break;
        }
      }

      // If not found, use the largest table
      if (!textTable) {
        let maxRows = 0;
        for (const table of tables) {
          const count = this.providedDb
            .query(`SELECT COUNT(*) as count FROM ${table.name}`)
            .get() as { count: number };
          if (count.count > maxRows) {
            maxRows = count.count;
            textTable = table.name;
          }
        }
      }
    }

    if (!textTable) {
      throw new Error(`Could not find text table in ${this.config.dbPath}`);
    }

    // Get columns
    const columns = this.providedDb
      .query(`PRAGMA table_info(${textTable})`)
      .all() as { name: string; type: string }[];

    const columnMap: Record<string, string> = {};
    for (const col of columns) {
      columnMap[col.name] = col.type;
    }

    return { table: textTable, columns: columnMap };
  }

  // ─── Text Extraction ──────────────────────────────────────────────────

  private async extractTexts(schema: { table: string; columns: Record<string, string> }): Promise<GutenbergText[]> {
    if (!this.providedDb) throw new Error('Database not opened');

    const cols = this.config.textColumns ?? this.autoDetectColumns(schema.columns);
    const texts: GutenbergText[] = [];

    // Query all rows (limit to avoid memory issues)
    const rows = this.providedDb.query(`SELECT * FROM ${schema.table} LIMIT 10000`).all() as Record<string, unknown>[];

    for (const row of rows) {
      const text = String(row[cols.text ?? ''] ?? '');
      if (!text.trim() || text.length < 100) continue; // Skip very short texts

      const title = String(row[cols.title ?? ''] ?? 'Unknown');
      const author = String(row[cols.author ?? ''] ?? 'Unknown');
      const language = String(row[cols.language ?? ''] ?? 'en');
      const workId = cols.workId ? String(row[cols.workId] ?? '') : undefined;

      const gutenbergText: GutenbergText = {
        id: `gutenberg-${texts.length}`,
        title,
        author,
        language,
        text: text.trim(),
        sourceWorkId: workId,
      };

      // Insert into normalized database
      this.normalizedDb
        .query('INSERT OR IGNORE INTO gutenberg_texts (id, title, author, language, text, source_work_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(gutenbergText.id, gutenbergText.title, gutenbergText.author, gutenbergText.language, gutenbergText.text, gutenbergText.sourceWorkId ?? '');

      texts.push(gutenbergText);
    }

    return texts;
  }

  private autoDetectColumns(columns: Record<string, string>): {
    title?: string;
    author?: string;
    text?: string;
    language?: string;
    workId?: string;
  } {
    const colNames = Object.keys(columns);

    // Find title column
    const titleCol = colNames.find(c =>
      c.toLowerCase().includes('title') ||
      c.toLowerCase().includes('name')
    );

    // Find author column
    const authorCol = colNames.find(c =>
      c.toLowerCase().includes('author') ||
      c.toLowerCase().includes('writer')
    );

    // Find text column
    const textCol = colNames.find(c =>
      c.toLowerCase().includes('text') ||
      c.toLowerCase().includes('content') ||
      c.toLowerCase().includes('body')
    ) ?? colNames[0];

    // Find language column
    const langCol = colNames.find(c =>
      c.toLowerCase().includes('language') ||
      c.toLowerCase().includes('lang')
    );

    // Find work ID column
    const workIdCol = colNames.find(c =>
      c.toLowerCase().includes('work_id') ||
      c.toLowerCase().includes('gutenberg_id')
    );

    return {
      title: titleCol,
      author: authorCol,
      text: textCol,
      language: langCol,
      workId: workIdCol,
    };
  }

  // ─── Style Extraction ─────────────────────────────────────────────────

  private async extractStyles(texts: GutenbergText[]): Promise<GutenbergStyle[]> {
    const styles: GutenbergStyle[] = [];
    const config: StyleExtractionConfig = {
      minSentenceLength: 20,
      maxSentencePatterns: 10,
      minVocabularyFrequency: 3,
      delexifyNames: true,
      delexifyPlaces: true,
      ...this.config.styleExtraction,
    };

    // Group texts by potential style (simple heuristic: by author)
    const authorGroups = new Map<string, GutenbergText[]>();
    for (const text of texts) {
      const key = text.author;
      if (!authorGroups.has(key)) {
        authorGroups.set(key, []);
      }
      authorGroups.get(key)!.push(text);
    }

    // Extract style from each author group
    let styleIndex = 0;
    for (const [author, authorTexts] of authorGroups) {
      if (authorTexts.length === 0) continue;

      // Sample text (first 5000 chars from first text)
      const firstText = authorTexts[0];
      if (!firstText) continue;
      const sampleText = firstText.text.substring(0, 5000);

      // Delexify
      const delexified = config.delexifyNames || config.delexifyPlaces
        ? this.delexifier.delexify(sampleText)
        : sampleText;

      // Extract vocabulary
      const vocabulary = this.extractVocabulary(delexified, 20);

      // Extract sentence patterns
      const sentencePatterns = this.extractSentencePatterns(delexified, config.maxSentencePatterns);

      // Extract example sentences
      const examples = this.extractExampleSentences(delexified, 5);

      // Determine mood tags
      const moodTags = this.inferMoodTags(delexified);

      const style: GutenbergStyle = {
        id: `style-${styleIndex++}`,
        name: `${author} Style`,
        description: `Writing style of ${author}, characterized by ${moodTags.join(', ')} mood.`,
        examples,
        vocabulary,
        sentencePatterns,
        moodTags,
        source: 'gutenberg_project',
        sourceWorkId: firstText.sourceWorkId,
      };

      // Insert into normalized database
      this.normalizedDb
        .query('INSERT OR IGNORE INTO gutenberg_styles (id, name, description, examples, vocabulary, sentence_patterns, mood_tags, source, source_work_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          style.id,
          style.name,
          style.description,
          JSON.stringify(style.examples),
          JSON.stringify(style.vocabulary),
          JSON.stringify(style.sentencePatterns),
          JSON.stringify(style.moodTags),
          style.source,
          style.sourceWorkId ?? '',
        );

      styles.push(style);
    }

    return styles;
  }

  private extractVocabulary(text: string, topN: number): string[] {
    const words = text.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);

    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([word]) => word);
  }

  private extractSentencePatterns(text: string, maxPatterns: number): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const patterns: string[] = [];

    for (const sentence of sentences.slice(0, 50)) {
      const words = sentence.trim().split(/\s+/);
      if (words.length < 5) continue;

      // Create a simplified pattern
      const pattern = words.map(w => {
        if (/^(the|a|an|is|are|was|were|has|have|had|will|would|could|should|may|might|can)$/i.test(w)) {
          return w.toLowerCase();
        }
        if (w.length > 6) return '[word]';
        return w.toLowerCase();
      }).join(' ');

      if (!patterns.includes(pattern) && patterns.length < maxPatterns) {
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  private extractExampleSentences(text: string, count: number): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 30);
    return sentences.slice(0, count).map(s => s.trim() + '.');
  }

  private inferMoodTags(text: string): string[] {
    const tags: string[] = [];
    const lower = text.toLowerCase();

    if (/\b(dark|shadow|gloomy|somber|melancholy|sad|sorrow|death|die|dead)\b/.test(lower)) {
      tags.push('dark');
    }
    if (/\b(bright|sun|light|happy|joy|cheerful|laugh|smile)\b/.test(lower)) {
      tags.push('bright');
    }
    if (/\b(fear|afraid|terrified|horror|scream|blood|violence)\b/.test(lower)) {
      tags.push('fearful');
    }
    if (/\b(love|heart|passion|kiss|embrace|tender|gentle)\b/.test(lower)) {
      tags.push('romantic');
    }
    if (/\b(mystery|secret|hidden|unknown|strange|curious|wonder)\b/.test(lower)) {
      tags.push('mysterious');
    }

    if (tags.length === 0) tags.push('neutral');
    return tags;
  }

  // ─── FTS Index ────────────────────────────────────────────────────────

  private async buildSearchIndex(): Promise<void> {
    // Create FTS table for texts
    this.normalizedDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS gutenberg_fts
      USING fts5(title, author, text, content=gutenberg_texts, content_rowid=rowid)
    `);

    // Populate FTS
    this.normalizedDb.exec(`
      INSERT OR REPLACE INTO gutenberg_fts (rowid, title, author, text)
      SELECT rowid, title, author, text FROM gutenberg_texts
    `);

    // Create FTS table for styles
    this.normalizedDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS gutenberg_styles_fts
      USING fts5(name, description, vocabulary, content=gutenberg_styles, content_rowid=rowid)
    `);

    // Populate styles FTS
    this.normalizedDb.exec(`
      INSERT OR REPLACE INTO gutenberg_styles_fts (rowid, name, description, vocabulary)
      SELECT rowid, name, description, vocabulary FROM gutenberg_styles
    `);
  }

  // ─── Normalized Tables ────────────────────────────────────────────────

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
        source TEXT,
        source_work_id TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  close(): void {
    if (this.providedDb) {
      this.providedDb.close();
    }
    this.normalizedDb.close();
  }
}
