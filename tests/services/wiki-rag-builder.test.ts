import { describe, it, expect } from 'bun:test';
import { WikiRAGBuilder } from '../../src/services/wiki-rag-builder';
import type { WikiArticle } from '../../src/services/wikipedia-researcher';

describe('WikiRAGBuilder', () => {
  const mockArticle: WikiArticle = {
    title: 'Knight',
    extract: 'A knight is a person granted an honorary title of knighthood by a head of state. The concept of knighthood originated in the medieval period.',
    url: 'https://en.wikipedia.org/wiki/Knight',
    categories: ['Knights', 'Medieval'],
    sections: [
      { title: 'History', level: 1, content: 'The concept of knighthood originated in the medieval period. Knights were typically mounted warriors who served a lord or king.' },
      { title: 'Equipment', level: 1, content: 'Knights typically wore armor and carried swords. Their equipment included shields, lances, and chainmail.' },
    ],
    infobox: {},
    links: ['Chivalry', 'Sword'],
  };

  it('should chunk article into pieces', () => {
    const builder = new WikiRAGBuilder('test-world');
    const chunks = builder.chunkArticle(mockArticle);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toHaveProperty('text');
    expect(chunks[0]).toHaveProperty('metadata');
    expect(chunks[0].metadata.source).toBe('wikipedia');
    expect(chunks[0].metadata.article).toBe('Knight');
  });

  it('should create chunks with proper size', () => {
    const builder = new WikiRAGBuilder('test-world');
    const chunks = builder.chunkArticle(mockArticle);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(2000);
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it('should include section titles in metadata', () => {
    const builder = new WikiRAGBuilder('test-world');
    const chunks = builder.chunkArticle(mockArticle);
    const historyChunk = chunks.find(c => c.metadata.section === 'History');
    expect(historyChunk).toBeDefined();
  });

  it('should track articles and chunks', () => {
    const builder = new WikiRAGBuilder('test-world');
    builder.addArticle(mockArticle);
    const stats = builder.getStats();
    expect(stats.articles).toBe(1);
    expect(stats.chunks).toBeGreaterThan(0);
    expect(stats.worldId).toBe('test-world');
  });
});
