import { describe, test, expect, beforeAll } from 'bun:test';
import { BibleParser } from '@/mcp/bible/parser';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'data', 'bible', 'test-fts-parity.db');

describe('FTS vs LIKE parity', () => {
  let parser: BibleParser;

  beforeAll(() => {
    parser = new BibleParser({ dbPath: DB_PATH });
  });

  test('FTS and LIKE return same verse IDs for simple query', () => {
    const query = 'love';
    const ftsResults = parser.search(query, { limit: 20 });
    const likeResults = parser.searchLike(query, { limit: 20 });

    const ftsIds = new Set(ftsResults.map(v => v.id));
    const likeIds = new Set(likeResults.map(v => v.id));

    for (const id of likeIds) {
      expect(ftsIds.has(id)).toBe(true);
    }
  });

  test('FTS handles book filter', () => {
    const results = parser.search('God', { book: 'Genesis', limit: 10 });
    for (const v of results) {
      expect(v.book).toBe('Genesis');
    }
  });
});