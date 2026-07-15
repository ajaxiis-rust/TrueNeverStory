import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { BibleParser } from '../../src/mcp/bible/parser';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';

describe('BibleParser cross-references', () => {
  let parser: BibleParser;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'bible-xref-test-'));
    parser = new BibleParser({ dbPath: ':memory:', dataDir: tempDir });
  });

  afterAll(() => {
    parser.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should load cross-references from JSON shards', async () => {
    const shardDir = join(tempDir, 'shards');
    mkdirSync(shardDir, { recursive: true });

    const shardData = {
      cross_references: [
        {
          from_verse: { book: 'Genesis', chapter: 1, verse: 1 },
          to_verse: [
            { book: 'Proverbs', chapter: 8, verse_start: 22, verse_end: 22 },
            { book: 'Acts', chapter: 14, verse_start: 15, verse_end: 15 },
          ],
          votes: 59,
        },
        {
          from_verse: { book: 'Genesis', chapter: 1, verse: 2 },
          to_verse: [
            { book: 'Job', chapter: 38, verse_start: 4, verse_end: 7 },
          ],
          votes: 32,
        },
      ],
    };

    writeFileSync(join(shardDir, 'cross_references_0.json'), JSON.stringify(shardData));

    const result = await parser.loadCrossRefs(shardDir);
    expect(result.refCount).toBe(3);
  });

  it('should query cross-references by verse', async () => {
    const refs = parser.getCrossRefs({ book: 'Genesis', chapter: 1, verse: 1 });
    expect(refs.length).toBe(2);
    const toBooks = refs.map(r => r.toBook);
    expect(toBooks).toContain('Proverbs');
    expect(toBooks).toContain('Acts');
    expect(refs[0]!.votes).toBe(59);
  });

  it('should find related verses via graph traversal', async () => {
    const related = parser.getRelatedVerses('Genesis', 1, 1, 1);
    expect(related.length).toBeGreaterThanOrEqual(2);
    const toBooks = related.map(r => r.toBook);
    expect(toBooks).toContain('Proverbs');
    expect(toBooks).toContain('Acts');
  });
});
