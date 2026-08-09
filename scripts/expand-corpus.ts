#!/usr/bin/env bun
/**
 * Expand Gutenberg book corpus by author name.
 *
 * Fetches books from Gutendex API, downloads .txt files, maintains corpus-manifest.json.
 * Deduplicates by manifest key + existing files on disk.
 *
 * Usage: bun scripts/expand-corpus.ts --authors "Dickens,Tolstoy" [--dry-run] [--target 3]
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

// ── CLI Args ──────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const hasFlag = (name: string) => args.includes(name);

const AUTHORS = flag("--authors", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TARGET = parseInt(flag("--target", "3"), 10);
const DRY_RUN = hasFlag("--dry-run");
const MANIFEST_PATH = flag("--manifest", "data/gutenberg/corpus-manifest.json");
const OUT_DIR = "data/gutenberg/texts";

if (AUTHORS.length === 0) {
  console.error('Usage: bun scripts/expand-corpus.ts --authors "Dickens,Tolstoy" [--dry-run] [--target 3]');
  process.exit(1);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(dirname(MANIFEST_PATH), { recursive: true });

// ── Types ─────────────────────────────────────────────────────

interface GutendexAuthor {
  name: string;
  birth_year: number | null;
  death_year: number | null;
}

interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  formats: Record<string, string>;
}

interface GutendexResponse {
  results: GutendexBook[];
}

interface ManifestEntry {
  etextno: number;
  title: string;
  author: string;
  era: string;
  downloadedAt: string;
  status: string;
}

interface Manifest {
  version: number;
  lastUpdated: string;
  books: Record<string, ManifestEntry>;
}

// ── Manifest ──────────────────────────────────────────────────

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH))
    return { version: 1, lastUpdated: new Date().toISOString(), books: {} };
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

function saveManifest(manifest: Manifest): void {
  manifest.lastUpdated = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

// ── Gutendex API ──────────────────────────────────────────────

async function fetchGutendex(author: string, limit: number): Promise<GutendexBook[]> {
  const url = `https://gutendex.com/books/?author=${encodeURIComponent(author)}&languages=en&sort=downloads`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gutendex returned ${res.status} for author "${author}"`);
  const data = (await res.json()) as GutendexResponse;
  return (data.results || []).slice(0, limit);
}

// ── Download ──────────────────────────────────────────────────

async function downloadText(etextno: number): Promise<string> {
  const primaryUrl = `https://www.gutenberg.org/files/${etextno}/${etextno}-0.txt`;
  const fallbackUrl = `https://www.gutenberg.org/cache/epub/${etextno}/pg${etextno}.txt`;

  let text = "";

  try {
    const res = await fetch(primaryUrl);
    if (res.ok) text = await res.text();
  } catch {
    // fall through to fallback
  }

  if (!text) {
    try {
      const res = await fetch(fallbackUrl);
      if (res.ok) text = await res.text();
    } catch {
      throw new Error(`Failed to download etextno ${etextno} from both URLs`);
    }
  }

  if (text.length < 10000) throw new Error(`Text too short (${text.length} chars) for etextno ${etextno}`);
  return text;
}

// ── Era guess ─────────────────────────────────────────────────

function guessEra(author: string, book: GutendexBook): string {
  const deathYear = book.authors?.[0]?.death_year;
  if (deathYear) {
    if (deathYear <= 1500) return "Medieval";
    if (deathYear <= 1700) return "Renaissance";
    if (deathYear <= 1750) return "Enlightenment";
    if (deathYear <= 1830) return "Romantic";
    if (deathYear <= 1900) return "Victorian";
    if (deathYear <= 1920) return "Edwardian";
    if (deathYear <= 1945) return "Modern";
    return "Contemporary";
  }
  return "Unknown";
}

function manifestKey(etextno: number): string {
  return `pg${etextno}`;
}

function outputPath(etextno: number): string {
  return join(OUT_DIR, `pg${etextno}.txt`);
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const manifest = loadManifest();
  const downloaded: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const author of AUTHORS) {
    console.log(`\n📚 Searching for books by "${author}"...`);

    let books: GutendexBook[];
    try {
      books = await fetchGutendex(author, TARGET);
    } catch (err: any) {
      console.error(`  ❌ API error for "${author}": ${err.message}`);
      continue;
    }

    console.log(`  Found ${books.length} results`);

    for (const book of books) {
      const key = manifestKey(book.id);
      const dest = outputPath(book.id);

      // Dedup: manifest
      if (manifest.books[key]) {
        skipped.push(`${book.title} (PG${book.id}) — already in manifest`);
        continue;
      }

      // Dedup: disk
      if (existsSync(dest)) {
        skipped.push(`${book.title} (PG${book.id}) — file exists on disk`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [DRY-RUN] would download: ${book.title} (PG${book.id})`);
        downloaded.push(`${book.title} (PG${book.id})`);
        continue;
      }

      // Download
      console.log(`  ⬇ ${book.title} (PG${book.id})...`);
      try {
        const text = await downloadText(book.id);
        writeFileSync(dest, text);
        manifest.books[key] = {
          etextno: book.id,
          title: book.title,
          author,
          era: guessEra(author, book),
          downloadedAt: new Date().toISOString(),
          status: "downloaded",
        };
        console.log(`    ✅ ${text.length.toLocaleString()} chars`);
        downloaded.push(`${book.title} (PG${book.id})`);
      } catch (err: any) {
        console.error(`    ❌ ${err.message}`);
        failed.push(`${book.title} (PG${book.id}) — ${err.message}`);
      }

      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  if (!DRY_RUN) saveManifest(manifest);

  // ── Summary ────────────────────────────────────
  console.log(`\n── Summary ──`);
  console.log(`  Downloaded: ${downloaded.length}`);
  console.log(`  Skipped:    ${skipped.length}`);
  console.log(`  Failed:     ${failed.length}`);

  if (downloaded.length > 0) {
    console.log(`\n  Downloaded:`);
    for (const d of downloaded) console.log(`    ✅ ${d}`);
  }
  if (skipped.length > 0) {
    console.log(`\n  Skipped:`);
    for (const s of skipped) console.log(`    ⏭  ${s}`);
  }
  if (failed.length > 0) {
    console.log(`\n  Failed:`);
    for (const f of failed) console.log(`    ❌ ${f}`);
  }

  console.log(`\n  Manifest: ${downloaded.length} new entries → ${Object.keys(manifest.books).length} total`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
