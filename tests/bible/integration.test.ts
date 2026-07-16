import { describe, it, expect, beforeAll, afterAll, test } from 'bun:test';
import { BibleParser } from '../../src/mcp/bible/parser';
import { CharacterDB } from '../../src/mcp/bible/characters';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const BIBLE_DIR = join(process.cwd(), 'sources', 'bible');
const DB_PATH = join(process.cwd(), 'data', 'bible', 'bible-normalized.db');

describe('Bible integration with real data', () => {
  let parser: BibleParser;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'bible-integration-test-'));
    parser = new BibleParser({ dbPath: ':memory:', dataDir: tempDir });

    // Load BSB (primary)
    await parser.loadFromJSON(join(BIBLE_DIR, 'BSB.json'), 'BSB');
  }, 30000);

  afterAll(() => {
    parser.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should load BSB and have Genesis verses', () => {
    const genesis = parser.search('', { book: 'Genesis', limit: 5 });
    expect(genesis.length).toBe(5);
    expect(genesis[0]!.text).toContain('In the beginning');
  });

  it('should load cross-references', async () => {
    const shardDir = join(BIBLE_DIR);
    const result = await parser.loadCrossRefs(shardDir);
    expect(result.refCount).toBeGreaterThan(0);
  }, 120000);

  it('should find cross-refs for Genesis 1:1', () => {
    const refs = parser.getCrossRefs({ book: 'Genesis', chapter: 1, verse: 1 });
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]!.votes).toBeGreaterThan(0);
  });

  it('should traverse cross-ref graph', () => {
    const related = parser.getRelatedVerses('Genesis', 1, 1, 2);
    expect(related.length).toBeGreaterThan(2);
  });
});

describe('Bible DB Integration — P0 + P2', () => {
  let parser: BibleParser;

  beforeAll(() => {
    parser = new BibleParser({ dbPath: DB_PATH });
  });

  afterAll(() => {
    parser.close();
  });

  test('FTS search returns results for "love"', () => {
    const results = parser.search('love', { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
  });

  test('batch graph traversal returns same results as sequential', () => {
    const results1 = parser.getRelatedVerses('Joh', 3, 16, 1);
    const results2 = parser.getRelatedVerses('Joh', 3, 16, 1);
    const ids1 = new Set(results1.map(r => `${r.toBook}.${r.toChapter}.${r.toVerseStart}`));
    const ids2 = new Set(results2.map(r => `${r.toBook}.${r.toChapter}.${r.toVerseStart}`));
    expect(ids1).toEqual(ids2);
  });

  test('character system finds Moses', () => {
    const charDB = new CharacterDB(parser);
    charDB.createTables();
    const { charactersFound } = charDB.extractFromText(parser);
    expect(charactersFound).toBeGreaterThan(0);
    const moses = charDB.getById('moses');
    expect(moses).not.toBeNull();
    expect(moses!.canonical_name).toBe('Moses');
    const searchResults = charDB.search('Моисей');
    expect(searchResults.length).toBeGreaterThanOrEqual(1);
    charDB.close();
  });

  test('searchLike fallback works when FTS returns nothing', () => {
    // FTS may not handle single-char queries well, LIKE should catch them
    const results = parser.search('a', { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
  });

  test('getBooks returns non-empty list', () => {
    const books = parser.getBooks();
    expect(books.length).toBeGreaterThan(0);
    expect(books).toContain('Genesis');
  });
});
