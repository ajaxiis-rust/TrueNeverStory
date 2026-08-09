#!/usr/bin/env bun
import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { cleanGutenbergText } from '../src/mcp/gutenberg/clean';
import { GutenbergCatalog } from '../src/mcp/gutenberg/catalog';

const TEXTS_DIR = './data/gutenberg/texts';
const CATALOG_DB = './data/mcp/gutenberg-catalog.db';
const CLASSICS_DB = './data/gutenberg/classics.db';

interface ProgressMsg { phase: string; pct: number; message: string; }
function emit(msg: ProgressMsg) { console.log(JSON.stringify(msg)); }

async function main() {
  // Ensure output dir
  const dir = join(CLASSICS_DB, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const classicsDb = new Database(CLASSICS_DB);
  classicsDb.exec('PRAGMA journal_mode=WAL');
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

  // Open catalog (optional)
  let catalog: GutenbergCatalog | null = null;
  if (existsSync(CATALOG_DB)) {
    catalog = new GutenbergCatalog(CATALOG_DB);
  }

  const files = readdirSync(TEXTS_DIR).filter(f => f.endsWith('.txt'));
  emit({ phase: 'import', pct: 0, message: `Found ${files.length} text files` });

  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const etextno = parseInt(basename(file, '.txt'), 10);
    if (isNaN(etextno)) { skipped++; continue; }

    // Dedup
    const existing = classicsDb.query('SELECT etextno FROM gutenberg WHERE etextno = ?').get(etextno);
    if (existing) { skipped++; continue; }

    let raw: string;
    try { raw = readFileSync(join(TEXTS_DIR, file), 'utf-8'); }
    catch {
      emit({ phase: 'import', pct: ((i+1)/files.length)*100, message: `WARN: Cannot read ${file}` });
      skipped++;
      continue;
    }

    const cleaned = cleanGutenbergText(raw);
    if (cleaned.length < 200) { skipped++; continue; }

    let title = `Gutenberg #${etextno}`;
    let author = 'Unknown';
    let authorBirth: number | null = null;
    let authorDeath: number | null = null;
    let subjects = '[]';
    let bookshelves = '[]';

    if (catalog) {
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

    classicsDb.query(`INSERT INTO gutenberg (etextno, book_title, author, author_birth, author_death, subjects, bookshelves, language, context) VALUES (?, ?, ?, ?, ?, ?, ?, 'en', ?)`)
      .run(etextno, title, author, authorBirth, authorDeath, subjects, bookshelves, cleaned);

    imported++;
    emit({ phase: 'import', pct: ((i+1)/files.length)*100, message: `Imported: ${title} by ${author}` });
  }

  catalog?.close();
  classicsDb.close();
  emit({ phase: 'done', pct: 100, message: `Imported ${imported} books, skipped ${skipped}` });
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
