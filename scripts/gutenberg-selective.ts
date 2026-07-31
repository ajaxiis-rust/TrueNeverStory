#!/usr/bin/env bun
/**
 * Selective Gutenberg download experiment.
 * Downloads books by specific authors via Gutendex API → SQLite.
 *
 * Usage: bun scripts/gutenberg-selective.ts [--db path] [--authors "name1,name2"]
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const DB_PATH = flag("--db", "data/gutenberg/selective-test.db");
const AUTHORS = flag("--authors", "Mark Twain,Jack London,Jules Verne,William Shakespeare")
  .split(",")
  .map((s) => s.trim());

const TEXT_DIR = "data/gutenberg/texts";

// ── Gutendex API ──────────────────────────────────────────────

interface GutendexBook {
  id: number;
  title: string;
  authors: Array<{ name: string; birth_year: number | null; death_year: null | number }>;
  summaries: string[];
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  copyright: boolean;
  media_type: string;
  formats: Record<string, string>;
  download_count: number;
}

interface GutendexResponse {
  count: number;
  next: string | null;
  results: GutendexBook[];
}

async function fetchAuthorBooks(author: string): Promise<GutendexBook[]> {
  const books: GutendexBook[] = [];
  let url: string | null = `https://gutendex.com/books/?search=${encodeURIComponent(author)}&languages=en`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gutendex API error: ${res.status}`);
    const data: GutendexResponse = await res.json();

    // Filter: only books where author name matches
    const matched = data.results.filter((b) =>
      b.authors.some((a) => a.name.toLowerCase().includes(author.split(" ").pop()!.toLowerCase()))
    );
    books.push(...matched);

    url = data.next;
    // Rate limit: be polite
    await new Promise((r) => setTimeout(r, 200));
  }

  return books;
}

// ── Download text ─────────────────────────────────────────────

async function downloadText(etextno: number): Promise<string | null> {
  const url = `https://www.gutenberg.org/files/${etextno}/${etextno}-0.txt`;
  const urlUtf8 = `https://www.gutenberg.org/ebooks/${etextno}.txt.utf-8`;

  for (const u of [urlUtf8, url]) {
    try {
      const res = await fetch(u);
      if (res.ok) {
        const text = await res.text();
        // Strip Gutenberg header/footer
        return stripGutenberg(text);
      }
    } catch {
      // try next URL
    }
  }
  return null;
}

function stripGutenberg(text: string): string {
  const startMarkers = [
    "*** START OF THE PROJECT GUTENBERG EBOOK",
    "*** START OF THIS PROJECT GUTENBERG EBOOK",
    "***START OF THE PROJECT GUTENBERG EBOOK",
    "*** START OF THE PROJECT GUTENBERG E-TEXT",
  ];
  const endMarkers = [
    "*** END OF THE PROJECT GUTENBERG EBOOK",
    "*** END OF THIS PROJECT GUTENBERG EBOOK",
    "***END OF THE PROJECT GUTENBERG EBOOK",
    "*** END OF THE PROJECT GUTENBERG E-TEXT",
  ];

  let start = 0;
  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      start = text.indexOf("\n", idx) + 1;
      break;
    }
  }

  let end = text.length;
  for (const marker of endMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      end = idx;
      break;
    }
  }

  return text.slice(start, end).trim();
}

// ── SQLite ────────────────────────────────────────────────────

function initDb(dbPath: string): Database {
  mkdirSync(dbPath.replace(/\/[^/]+$/, ""), { recursive: true });
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      etextno INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      birth_year INTEGER,
      death_year INTEGER,
      subjects TEXT,
      bookshelves TEXT,
      summary TEXT,
      download_count INTEGER,
      word_count INTEGER,
      text_path TEXT
    )
  `);
  return db;
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`Authors: ${AUTHORS.join(", ")}`);
  console.log(`DB: ${DB_PATH}\n`);

  const db = initDb(DB_PATH);
  const insert = db.prepare(`
    INSERT OR REPLACE INTO books (etextno, title, author, birth_year, death_year, subjects, bookshelves, summary, download_count, word_count, text_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const allBooks = new Map<number, GutendexBook>();

  for (const author of AUTHORS) {
    console.log(`Fetching: ${author}...`);
    const books = await fetchAuthorBooks(author);
    console.log(`  Found ${books.length} books`);
    for (const b of books) {
      allBooks.set(b.id, b);
    }
  }

  console.log(`\nTotal unique books: ${allBooks.size}`);
  console.log("Downloading texts...\n");

  mkdirSync(TEXT_DIR, { recursive: true });

  let downloaded = 0;
  let failed = 0;
  let skipped = 0;

  for (const [id, book] of allBooks) {
    const textPath = join(TEXT_DIR, `${id}.txt`);

    // Check if already downloaded
    if (existsSync(textPath)) {
      const text = readFileSync(textPath, "utf-8");
      const wordCount = text.split(/\s+/).length;
      const author = book.authors[0]?.name || "Unknown";
      insert.run(
        id, book.title, author,
        book.authors[0]?.birth_year ?? null,
        book.authors[0]?.death_year ?? null,
        JSON.stringify(book.subjects),
        JSON.stringify(book.bookshelves),
        book.summaries[0] ?? null,
        book.download_count,
        wordCount,
        textPath
      );
      skipped++;
      continue;
    }

    const text = await downloadText(id);
    if (text) {
      await Bun.write(textPath, text);
      const wordCount = text.split(/\s+/).length;
      const author = book.authors[0]?.name || "Unknown";
      insert.run(
        id, book.title, author,
        book.authors[0]?.birth_year ?? null,
        book.authors[0]?.death_year ?? null,
        JSON.stringify(book.subjects),
        JSON.stringify(book.bookshelves),
        book.summaries[0] ?? null,
        book.download_count,
        wordCount,
        textPath
      );
      downloaded++;
      if (downloaded % 10 === 0) {
        console.log(`  ${downloaded} downloaded...`);
      }
    } else {
      failed++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 100));
  }

  // Stats
  console.log("\n=== Results ===");
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Skipped (cached): ${skipped}`);
  console.log(`Failed: ${failed}`);

  const stats = db.query(`
    SELECT author, COUNT(*) as cnt, SUM(word_count) as total_words, AVG(download_count) as avg_downloads
    FROM books GROUP BY author ORDER BY total_words DESC
  `).all() as Array<{ author: string; cnt: number; total_words: number; avg_downloads: number }>;

  console.log("\nPer author:");
  for (const s of stats) {
    console.log(`  ${s.author}: ${s.cnt} books, ${(s.total_words / 1e6).toFixed(1)}M words, avg ${(s.avg_downloads | 0)} downloads`);
  }

  const total = db.query("SELECT COUNT(*) as n, SUM(word_count) as w FROM books").get() as { n: number; w: number };
  console.log(`\nTotal: ${total.n} books, ${(total.w / 1e6).toFixed(1)}M words → ${DB_PATH}`);
  db.close();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
