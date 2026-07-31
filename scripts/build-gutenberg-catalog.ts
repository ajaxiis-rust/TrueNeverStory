#!/usr/bin/env bun
/**
 * Fetch Gutenberg metadata from Gutendex API → local catalog SQLite.
 *
 * Supports:
 * - --authors "Name1,Name2" — fetch by author search
 * - --topic "adventure" — fetch by Gutendex topic
 * - --popular — fetch top N by download count
 * - --limit N — max books per mode
 *
 * Outputs JSON progress lines to stdout for SSE integration.
 *
 * Usage: bun scripts/build-gutenberg-catalog.ts [--authors "..."] [--topic "..."] [--popular] [--limit 500]
 */

import { GutenbergCatalog } from '../src/mcp/gutenberg/catalog';
import type { CatalogBook } from '../src/mcp/gutenberg/catalog';

// ── Args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
function hasFlag(name: string): boolean {
  return args.includes(name);
}

const AUTHORS = flag('--authors', '').split(',').map(s => s.trim()).filter(Boolean);
const TOPIC = flag('--topic', '');
const POPULAR = hasFlag('--popular');
const LIMIT = parseInt(flag('--limit', '0'), 10);
const DB_PATH = flag('--db', 'data/mcp/gutenberg-catalog.db');

// ── Progress ──────────────────────────────────────────────────

interface ProgressMsg {
  phase: string;
  pct: number;
  message: string;
}

function emit(phase: string, pct: number, message: string) {
  const msg: ProgressMsg = { phase, pct: Math.round(pct), message };
  console.log(JSON.stringify(msg));
}

// ── Gutendex API ──────────────────────────────────────────────

interface GutendexBook {
  id: number;
  title: string;
  authors: Array<{ name: string; birth_year: number | null; death_year: number | null }>;
  summaries: string[];
  subjects: string[];
  bookshelves: string[];
  download_count: number;
}

interface GutendexResponse {
  count: number;
  next: string | null;
  results: GutendexBook[];
}

const RATE_LIMIT_MS = 200;

async function fetchPage(url: string): Promise<GutendexResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gutendex API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<GutendexResponse>;
}

async function fetchByAuthor(author: string): Promise<GutendexBook[]> {
  const books: GutendexBook[] = [];
  const authorLower = author.split(' ').pop()!.toLowerCase();
  let url: string | null = `https://gutendex.com/books/?search=${encodeURIComponent(author)}&languages=en`;
  let page = 0;

  while (url) {
    page++;
    const data = await fetchPage(url);
    const totalPages = Math.ceil(data.count / 32);

    emit('fetch', 0, `Fetching ${author}: page ${page}/${totalPages} (${books.length} books)`);

    // Filter: only books where author name matches
    const matched = data.results.filter(b =>
      b.authors.some(a => a.name.toLowerCase().includes(authorLower))
    );
    books.push(...matched);

    url = data.next;
    if (url) await Bun.sleep(RATE_LIMIT_MS);
  }

  return books;
}

async function fetchByTopic(topic: string): Promise<GutendexBook[]> {
  const books: GutendexBook[] = [];
  let url: string | null = `https://gutendex.com/books/?topic=${encodeURIComponent(topic)}&languages=en`;
  let page = 0;

  while (url) {
    page++;
    const data = await fetchPage(url);
    const totalPages = Math.ceil(data.count / 32);

    emit('fetch', 0, `Fetching topic "${topic}": page ${page}/${totalPages} (${books.length} books)`);

    books.push(...data.results);

    url = data.next;
    if (url) await Bun.sleep(RATE_LIMIT_MS);
  }

  return books;
}

async function fetchPopular(limit: number): Promise<GutendexBook[]> {
  const books: GutendexBook[] = [];
  let url: string | null = 'https://gutendex.com/books/?sort=popular&languages=en';
  let page = 0;

  while (url && (limit === 0 || books.length < limit)) {
    page++;
    const data = await fetchPage(url);

    emit('fetch', 0, `Fetching popular: page ${page} (${books.length} books)`);

    books.push(...data.results);

    url = data.next;
    if (url) await Bun.sleep(RATE_LIMIT_MS);
  }

  // Apply limit
  if (limit > 0 && books.length > limit) {
    return books.slice(0, limit);
  }

  return books;
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  if (AUTHORS.length === 0 && !TOPIC && !POPULAR) {
    emit('error', 0, 'No source specified. Use --authors, --topic, or --popular');
    process.exit(1);
  }

  emit('init', 0, 'Starting catalog build...');

  const catalog = new GutenbergCatalog(DB_PATH);
  const allBooks = new Map<number, GutendexBook>();

  // Fetch by authors
  for (const author of AUTHORS) {
    const books = await fetchByAuthor(author);
    for (const b of books) allBooks.set(b.id, b);
  }

  // Fetch by topic
  if (TOPIC) {
    const books = await fetchByTopic(TOPIC);
    for (const b of books) allBooks.set(b.id, b);
  }

  // Fetch popular
  if (POPULAR) {
    const books = await fetchPopular(LIMIT);
    for (const b of books) allBooks.set(b.id, b);
  }

  emit('save', 50, `Saving ${allBooks.size} books to catalog...`);

  // Convert to CatalogBook and upsert
  const catalogBooks: CatalogBook[] = Array.from(allBooks.values()).map(b => ({
    etextno: b.id,
    title: b.title,
    author: b.authors[0]?.name ?? 'Unknown',
    birth_year: b.authors[0]?.birth_year ?? null,
    death_year: b.authors[0]?.death_year ?? null,
    subjects: b.subjects,
    bookshelves: b.bookshelves,
    summary: b.summaries[0] ?? null,
    download_count: b.download_count,
    word_count: 0,
    downloaded: false,
    selected: false,
  }));

  catalog.upsertBooks(catalogBooks);

  const stats = catalog.getStats();
  emit('done', 100, `${stats.total} books cataloged (new: ${catalogBooks.length})`);

  catalog.close();
}

main().catch((err) => {
  emit('error', 0, String(err));
  process.exit(1);
});
