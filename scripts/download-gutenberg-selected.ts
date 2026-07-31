#!/usr/bin/env bun
/**
 * Download plain text for selected books from Gutenberg.org.
 *
 * Supports:
 * - --etextnos "74,76,86" — download specific books
 * - --selected — download all selected=1 from catalog
 * - --author "Twain" — select+download all by author
 *
 * Outputs JSON progress lines to stdout for SSE integration.
 *
 * Usage: bun scripts/download-gutenberg-selected.ts [--etextnos "..."] [--selected] [--author "..."]
 */

import { GutenbergCatalog } from '../src/mcp/gutenberg/catalog';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
function hasFlag(name: string): boolean {
  return args.includes(name);
}

const ETETEXTNOS = flag('--etextnos', '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
const SELECTED = hasFlag('--selected');
const AUTHOR = flag('--author', '');
const DB_PATH = flag('--db', 'data/mcp/gutenberg-catalog.db');
const OUT_DIR = flag('--out-dir', 'data/gutenberg/texts');

const RATE_LIMIT_MS = 100;

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

// ── Text Download ─────────────────────────────────────────────

async function downloadText(etextno: number): Promise<string | null> {
  const urls = [
    `https://www.gutenberg.org/ebooks/${etextno}.txt.utf-8`,
    `https://www.gutenberg.org/files/${etextno}/${etextno}-0.txt`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
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
    '*** START OF THE PROJECT GUTENBERG EBOOK',
    '*** START OF THIS PROJECT GUTENBERG EBOOK',
    '***START OF THE PROJECT GUTENBERG EBOOK',
    '*** START OF THE PROJECT GUTENBERG E-TEXT',
  ];
  const endMarkers = [
    '*** END OF THE PROJECT GUTENBERG EBOOK',
    '*** END OF THIS PROJECT GUTENBERG EBOOK',
    '***END OF THE PROJECT GUTENBERG EBOOK',
    '*** END OF THE PROJECT GUTENBERG E-TEXT',
  ];

  let start = 0;
  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      start = text.indexOf('\n', idx) + 1;
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

// ── Main ──────────────────────────────────────────────────────

async function main() {
  if (ETETEXTNOS.length === 0 && !SELECTED && !AUTHOR) {
    emit('error', 0, 'No source specified. Use --etextnos, --selected, or --author');
    process.exit(1);
  }

  const catalog = new GutenbergCatalog(DB_PATH);
  mkdirSync(OUT_DIR, { recursive: true });

  // Get list of books to download
  let etextnos: number[] = [];

  if (ETETEXTNOS.length > 0) {
    etextnos = ETETEXTNOS;
  } else if (SELECTED) {
    const selected = catalog.getSelected();
    etextnos = selected.map(b => b.etextno);
  } else if (AUTHOR) {
    // Select all by author, then download
    const count = catalog.selectAll({ author: AUTHOR });
    emit('init', 0, `Selected ${count} books by "${AUTHOR}"`);
    const selected = catalog.getSelected();
    etextnos = selected.map(b => b.etextno);
  }

  if (etextnos.length === 0) {
    emit('error', 0, 'No books to download');
    catalog.close();
    process.exit(1);
  }

  emit('download', 0, `Downloading ${etextnos.length} books...`);

  let downloaded = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < etextnos.length; i++) {
    const etextno = etextnos[i];
    const textPath = join(OUT_DIR, `${etextno}.txt`);

    // Skip if already downloaded
    if (existsSync(textPath)) {
      skipped++;
      continue;
    }

    const pct = ((i + 1) / etextnos.length) * 100;
    emit('download', pct, `${i + 1}/${etextnos.length}: etextno ${etextno}`);

    const text = await downloadText(etextno);
    if (text) {
      await Bun.write(textPath, text);
      const wordCount = text.split(/\s+/).length;
      catalog.markDownloaded(etextno, wordCount);
      downloaded++;
    } else {
      failed++;
    }

    // Rate limit
    if (i < etextnos.length - 1) {
      await Bun.sleep(RATE_LIMIT_MS);
    }
  }

  emit('done', 100, `${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);

  catalog.close();
}

main().catch((err) => {
  emit('error', 0, String(err));
  process.exit(1);
});
