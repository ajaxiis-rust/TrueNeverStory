#!/usr/bin/env bun
/**
 * ONE-TIME bootstrap: load JSON → persistent SQLite.
 * Subsequent runs skip automatically (cache hit).
 */
import { BibleParser } from '../src/mcp/bible/parser';
import { CharacterDB } from '../src/mcp/bible/characters';
import { join } from 'path';
import { existsSync } from 'fs';

const BIBLE_DIR = join(process.cwd(), 'sources', 'bible');
const ARCHIVE_DIR = join(BIBLE_DIR, 'archive');
const DATA_DIR = join(process.cwd(), 'data', 'bible');

function getJsonPath(filename: string): string {
  // Check archive first (gzipped), then original location
  const gzPath = join(ARCHIVE_DIR, `${filename}.gz`);
  if (existsSync(gzPath)) return gzPath;
  return join(BIBLE_DIR, filename);
}

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
  console.log('[1/5] Loading NHEBME (base layer)...');
  await parser.loadFromJSON(getJsonPath('NHEBME.json'), 'NHEBME');

  console.log('[2/5] Loading LEB (middle layer)...');
  await parser.loadFromJSON(getJsonPath('LEB.json'), 'LEB');

  console.log('[3/5] Loading BSB (top layer, wins)...');
  await parser.loadFromJSON(getJsonPath('BSB.json'), 'BSB');

  console.log(`  Total unique verses: ${parser.getVerseCount()}`);

  // Load cross-references
  console.log('[4/5] Loading cross-references (7 shards)...');
  const t0 = Date.now();
  await parser.loadCrossRefs(existsSync(ARCHIVE_DIR) ? ARCHIVE_DIR : BIBLE_DIR);
  console.log(`  Done in ${Date.now() - t0}ms`);

  // Populate characters from dictionary
  console.log('[5/5] Populating character database...');
  const charDB = new CharacterDB(parser);
  charDB.createTables();
  const t1 = Date.now();
  const { charactersFound, mentionsCreated } = charDB.extractFromText(parser);
  console.log(`  Done in ${Date.now() - t1}ms`);
  console.log(`  Characters: ${charactersFound}, Mentions: ${mentionsCreated}`);

  // Summary
  const books = parser.getBooks();
  console.log(`\nBooks: ${books.length}`);
  console.log(`Verses: ${parser.getVerseCount()}`);
  console.log(`Characters: ${charactersFound}`);
  console.log(`Mentions: ${mentionsCreated}`);
  console.log(`DB: ${join(DATA_DIR, 'bible-normalized.db')}`);

  parser.close();
  console.log('\nBootstrap complete. Next runs will be instant.');
}

main().catch(console.error);
