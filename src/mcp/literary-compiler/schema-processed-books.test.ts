import { describe, it, expect } from 'bun:test';
import { LiteraryCompilerDB } from './schema';

describe('v2_processed_books marker', () => {
  it('returns false for unprocessed book, true after markBookProcessed', () => {
    const db = new LiteraryCompilerDB(':memory:');
    db.createV2Tables();
    try {
      expect(db.isBookProcessed('Author::Title')).toBe(false);
      db.markBookProcessed('Author::Title');
      expect(db.isBookProcessed('Author::Title')).toBe(true);
    } finally {
      db.close();
    }
  });

  it('markBookProcessed is idempotent (INSERT OR REPLACE)', () => {
    const db = new LiteraryCompilerDB(':memory:');
    db.createV2Tables();
    try {
      db.markBookProcessed('A::B');
      db.markBookProcessed('A::B');
      expect(db.isBookProcessed('A::B')).toBe(true);
      const row = db.db.prepare('SELECT COUNT(*) AS n FROM v2_processed_books').get() as { n: number };
      expect(row.n).toBe(1);
    } finally {
      db.close();
    }
  });

  it('different books are tracked independently', () => {
    const db = new LiteraryCompilerDB(':memory:');
    db.createV2Tables();
    try {
      db.markBookProcessed('A::Done');
      expect(db.isBookProcessed('A::Done')).toBe(true);
      expect(db.isBookProcessed('A::Other')).toBe(false);
    } finally {
      db.close();
    }
  });
});
