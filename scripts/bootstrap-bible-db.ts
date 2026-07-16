#!/usr/bin/env bun
/**
 * ONE-TIME bootstrap: load JSON → persistent SQLite.
 * Subsequent runs skip automatically (cache hit).
 */
import { BibleParser } from '../src/mcp/bible/parser';
import { join } from 'path';

const BIBLE_DIR = join(process.cwd(), 'sources', 'bible');
const DATA_DIR = join(process.cwd(), 'data', 'bible');

async function main() {
  console.log('=== Bible DB Bootstrap (one-time) ===\n');

  const parser = new BibleParser({ dbPath: ':memory:', dataDir: DATA_DIR });

  // Check cache
  const existing = parser.getVerseCount();
  if (existing > 0) {
    console.log(`Cache hit: ${existing} verses already loaded. Skipping.`);
    const books = parser.getBooks();
    console.log(`Books: ${books.length}`);
    parser.close();
    return;
  }

  // Load all three translations
  console.log('[1/4] Loading NHEBME (base layer)...');
  await parser.loadFromJSON(join(BIBLE_DIR, 'NHEBME.json'), 'NHEBME');

  console.log('[2/4] Loading LEB (middle layer)...');
  await parser.loadFromJSON(join(BIBLE_DIR, 'LEB.json'), 'LEB');

  console.log('[3/4] Loading BSB (top layer, wins)...');
  await parser.loadFromJSON(join(BIBLE_DIR, 'BSB.json'), 'BSB');

  console.log(`  Total unique verses: ${parser.getVerseCount()}`);

  // Load cross-references
  console.log('[4/4] Loading cross-references (7 shards)...');
  const t0 = Date.now();
  await parser.loadCrossRefs(BIBLE_DIR);
  console.log(`  Done in ${Date.now() - t0}ms`);

  // Summary
  const books = parser.getBooks();
  console.log(`\nBooks: ${books.length}`);
  console.log(`Verses: ${parser.getVerseCount()}`);
  console.log(`DB: ${join(DATA_DIR, 'bible-normalized.db')}`);

  parser.close();
  console.log('\nBootstrap complete. Next runs will be instant.');
}

main().catch(console.error);
