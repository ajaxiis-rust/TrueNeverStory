import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { BibleParser } from '../../src/mcp/bible/parser';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const BIBLE_DIR = join(process.cwd(), 'sources', 'bible');

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
