import { describe, it, expect } from 'bun:test';
import { WikiSearchTool } from '../../src/mcp/wiki/wiki-search';
import { WikiRAGBuilder } from '../../src/services/wiki-rag-builder';
import type { WikiArticle } from '../../src/services/wikipedia-researcher';

describe('WikiSearchTool', () => {
  it('should search chunks by keyword', async () => {
    const tool = new WikiSearchTool();
    const builder = new WikiRAGBuilder('test-world');

    const mockArticle: WikiArticle = {
      title: 'Knight',
      extract: 'A knight is a person granted an honorary title of knighthood.',
      url: 'https://en.wikipedia.org/wiki/Knight',
      categories: ['Knights'],
      sections: [
        { title: 'History', level: 1, content: 'The concept of knighthood originated in the medieval period.' },
      ],
      infobox: {},
      links: [],
    };

    builder.addArticle(mockArticle);
    tool.registerRAGBuilder('test-world', builder);

    const results = await tool.search({
      query: 'knight medieval',
      worldId: 'test-world',
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('article');
    expect(results[0]).toHaveProperty('section');
    expect(results[0]).toHaveProperty('text');
    expect(results[0]).toHaveProperty('score');
  });

  it('should return empty for unknown world', async () => {
    const tool = new WikiSearchTool();
    const results = await tool.search({
      query: 'knight',
      worldId: 'unknown-world',
    });

    expect(results).toEqual([]);
  });
});
