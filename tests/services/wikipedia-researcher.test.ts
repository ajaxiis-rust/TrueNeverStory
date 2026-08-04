import { describe, it, expect } from 'bun:test';
import { WikipediaResearcher } from '../../src/services/wikipedia-researcher';

describe('WikipediaResearcher', () => {
  it('should search articles by query', async () => {
    const researcher = new WikipediaResearcher({ retryCount: 1, retryDelay: 1000 });
    const results = await researcher.search('medieval knighthood', 5);
    expect(results).toBeArray();
    expect(results.length).toBeLessThanOrEqual(5);
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('extract');
      expect(results[0]).toHaveProperty('url');
    }
  });

  it('should get full article by title', async () => {
    const researcher = new WikipediaResearcher({ retryCount: 1, retryDelay: 1000 });
    const article = await researcher.getArticle('Knight');
    expect(article).not.toBeNull();
    if (article) {
      expect(article.title).toBe('Knight');
      expect(article.extract.length).toBeGreaterThan(0);
      expect(article.sections).toBeArray();
    }
  });

  it('should handle API errors gracefully', async () => {
    const researcher = new WikipediaResearcher({ retryCount: 1, retryDelay: 1000 });
    const article = await researcher.getArticle('NonExistentArticle12345');
    expect(article).toBeNull();
  });
});
