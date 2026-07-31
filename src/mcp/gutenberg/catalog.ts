import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { getLogger } from '@/utils/logger';

const logger = getLogger('GutenbergCatalog');

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CatalogBook {
  etextno: number;
  title: string;
  author: string;
  birth_year: number | null;
  death_year: number | null;
  subjects: string[];
  bookshelves: string[];
  summary: string | null;
  download_count: number;
  word_count: number;
  downloaded: boolean;
  selected: boolean;
}

export interface CatalogPage {
  books: CatalogBook[];
  total: number;
  page: number;
  totalPages: number;
}

export interface FilterOptions {
  author?: string;
  year_from?: number;
  year_to?: number;
  min_downloads?: number;
  subject?: string;
}

// ─── Gutenberg Catalog ─────────────────────────────────────────────────────

export class GutenbergCatalog {
  private db: Database;

  constructor(dbPath = 'data/mcp/gutenberg-catalog.db') {
    const dir = join(dbPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');

    this.createTables();
  }

  // ─── Metadata Operations ──────────────────────────────────────────────

  upsertBook(book: CatalogBook): void {
    this.db.query(`
      INSERT OR REPLACE INTO books (etextno, title, author, birth_year, death_year, subjects, bookshelves, summary, download_count, word_count, downloaded, selected)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      book.etextno,
      book.title,
      book.author,
      book.birth_year,
      book.death_year,
      JSON.stringify(book.subjects),
      JSON.stringify(book.bookshelves),
      book.summary,
      book.download_count,
      book.word_count,
      book.downloaded ? 1 : 0,
      book.selected ? 1 : 0,
    );
  }

  upsertBooks(books: CatalogBook[]): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO books (etextno, title, author, birth_year, death_year, subjects, bookshelves, summary, download_count, word_count, downloaded, selected)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const batchInsert = this.db.transaction((items: CatalogBook[]) => {
      for (const book of items) {
        insert.run(
          book.etextno,
          book.title,
          book.author,
          book.birth_year,
          book.death_year,
          JSON.stringify(book.subjects),
          JSON.stringify(book.bookshelves),
          book.summary,
          book.download_count,
          book.word_count,
          book.downloaded ? 1 : 0,
          book.selected ? 1 : 0,
        );
      }
    });

    batchInsert(books);
  }

  // ─── Query Operations ─────────────────────────────────────────────────

  getStats(): { total: number; downloaded: number; selected: number } {
    const row = this.db.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN downloaded = 1 THEN 1 ELSE 0 END) as downloaded,
        SUM(CASE WHEN selected = 1 THEN 1 ELSE 0 END) as selected
      FROM books
    `).get() as { total: number; downloaded: number; selected: number };

    return {
      total: row.total,
      downloaded: row.downloaded ?? 0,
      selected: row.selected ?? 0,
    };
  }

  getPage(page: number, limit: number, sort: string, order: string): CatalogPage {
    const offset = (page - 1) * limit;
    const validSorts = ['etextno', 'title', 'author', 'download_count', 'word_count', 'birth_year'];
    const sortCol = validSorts.includes(sort) ? sort : 'download_count';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const total = (this.db.query('SELECT COUNT(*) as count FROM books').get() as { count: number }).count;
    const totalPages = Math.ceil(total / limit);

    const rows = this.db.query(`
      SELECT * FROM books
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `).all(limit, offset) as Array<Record<string, unknown>>;

    return {
      books: rows.map(this.rowToBook),
      total,
      page,
      totalPages,
    };
  }

  search(query: string, limit: number): CatalogBook[] {
    const rows = this.db.query(`
      SELECT b.* FROM books b
      JOIN books_fts fts ON b.rowid = fts.rowid
      WHERE books_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Array<Record<string, unknown>>;

    return rows.map(this.rowToBook);
  }

  filter(opts: FilterOptions): CatalogBook[] {
    let sql = 'SELECT * FROM books WHERE 1=1';
    const params: string[] = [];

    if (opts.author) {
      sql += ' AND author LIKE ?';
      params.push(`%${opts.author}%`);
    }
    if (opts.year_from) {
      sql += ' AND birth_year >= ?';
      params.push(String(opts.year_from));
    }
    if (opts.year_to) {
      sql += ' AND death_year <= ?';
      params.push(String(opts.year_to));
    }
    if (opts.min_downloads) {
      sql += ' AND download_count >= ?';
      params.push(String(opts.min_downloads));
    }
    if (opts.subject) {
      sql += ' AND subjects LIKE ?';
      params.push(`%${opts.subject}%`);
    }

    sql += ' ORDER BY download_count DESC';

    const rows = this.db.query(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(this.rowToBook);
  }

  // ─── Selection Operations ─────────────────────────────────────────────

  select(etextnos: number[]): void {
    const stmt = this.db.prepare('UPDATE books SET selected = 1 WHERE etextno = ?');
    const batchSelect = this.db.transaction((ids: number[]) => {
      for (const id of ids) {
        stmt.run(id);
      }
    });
    batchSelect(etextnos);
  }

  deselect(etextnos: number[]): void {
    const stmt = this.db.prepare('UPDATE books SET selected = 0 WHERE etextno = ?');
    const batchDeselect = this.db.transaction((ids: number[]) => {
      for (const id of ids) {
        stmt.run(id);
      }
    });
    batchDeselect(etextnos);
  }

  selectAll(filter?: FilterOptions): number {
    if (!filter) {
      const result = this.db.run('UPDATE books SET selected = 1');
      return result.changes;
    }

    let sql = 'UPDATE books SET selected = 1 WHERE 1=1';
    const params: string[] = [];

    if (filter.author) {
      sql += ' AND author LIKE ?';
      params.push(`%${filter.author}%`);
    }
    if (filter.year_from) {
      sql += ' AND birth_year >= ?';
      params.push(String(filter.year_from));
    }
    if (filter.year_to) {
      sql += ' AND death_year <= ?';
      params.push(String(filter.year_to));
    }
    if (filter.min_downloads) {
      sql += ' AND download_count >= ?';
      params.push(String(filter.min_downloads));
    }
    if (filter.subject) {
      sql += ' AND subjects LIKE ?';
      params.push(`%${filter.subject}%`);
    }

    const result = this.db.query(sql).run(...params);
    return result.changes;
  }

  deselectAll(): void {
    this.db.run('UPDATE books SET selected = 0');
  }

  getSelected(): CatalogBook[] {
    const rows = this.db.query('SELECT * FROM books WHERE selected = 1 ORDER BY download_count DESC').all() as Array<Record<string, unknown>>;
    return rows.map(this.rowToBook);
  }

  // ─── Download Tracking ────────────────────────────────────────────────

  markDownloaded(etextno: number, wordCount: number): void {
    this.db.query('UPDATE books SET downloaded = 1, word_count = ? WHERE etextno = ?').run(wordCount, etextno);
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS books (
        etextno INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        birth_year INTEGER,
        death_year INTEGER,
        subjects TEXT,
        bookshelves TEXT,
        summary TEXT,
        download_count INTEGER DEFAULT 0,
        word_count INTEGER DEFAULT 0,
        downloaded BOOLEAN DEFAULT 0,
        selected BOOLEAN DEFAULT 0
      )
    `);

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_author ON books(author)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_downloaded ON books(downloaded)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_selected ON books(selected)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_download_count ON books(download_count)');

    // FTS5 virtual table
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
        title, author, subjects,
        content=books, content_rowid=rowid
      )
    `);

    // FTS sync triggers
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
        INSERT INTO books_fts(rowid, title, author, subjects)
        VALUES (new.rowid, new.title, new.author, new.subjects);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
        INSERT INTO books_fts(books_fts, rowid, title, author, subjects)
        VALUES ('delete', old.rowid, old.title, old.author, old.subjects);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
        INSERT INTO books_fts(books_fts, rowid, title, author, subjects)
        VALUES ('delete', old.rowid, old.title, old.author, old.subjects);
        INSERT INTO books_fts(rowid, title, author, subjects)
        VALUES (new.rowid, new.title, new.author, new.subjects);
      END
    `);
  }

  private rowToBook(row: Record<string, unknown>): CatalogBook {
    return {
      etextno: row.etextno as number,
      title: row.title as string,
      author: row.author as string,
      birth_year: row.birth_year as number | null,
      death_year: row.death_year as number | null,
      subjects: JSON.parse((row.subjects as string) ?? '[]'),
      bookshelves: JSON.parse((row.bookshelves as string) ?? '[]'),
      summary: row.summary as string | null,
      download_count: (row.download_count as number) ?? 0,
      word_count: (row.word_count as number) ?? 0,
      downloaded: (row.downloaded as number) === 1,
      selected: (row.selected as number) === 1,
    };
  }
}
