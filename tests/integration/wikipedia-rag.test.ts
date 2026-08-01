import { describe, it, expect, beforeAll } from 'bun:test';
import { WikipediaResearcher } from '../../src/services/wikipedia-researcher';
import { WikiRAGBuilder } from '../../src/services/wiki-rag-builder';
import { WorldCreationProgressManager } from '../../src/services/world-creation-progress';

describe('Wikipedia RAG Integration', () => {
  let researcher: WikipediaResearcher;
  let ragBuilder: WikiRAGBuilder;
  let progressManager: WorldCreationProgressManager;

  beforeAll(() => {
    researcher = new WikipediaResearcher();
    ragBuilder = new WikiRAGBuilder('test-world');
    progressManager = new WorldCreationProgressManager('test-world');
  });

  it('should search and add articles to RAG', async () => {
    const results = await researcher.search('medieval knighthood', 3);
    expect(results.length).toBeGreaterThan(0);

    for (const result of results) {
      const article = await researcher.getArticle(result.title);
      if (article) {
        ragBuilder.addArticle(article);
      }
    }

    const stats = ragBuilder.getStats();
    expect(stats.articles).toBeGreaterThan(0);
    expect(stats.chunks).toBeGreaterThan(0);
  }, 60000);

  it('should track progress', () => {
    progressManager.update({
      stage: 'researching',
      current: 1,
      total: 5,
      message: 'Test research',
    });

    const progress = progressManager.getProgress();
    expect(progress.stage).toBe('researching');
    expect(progress.current).toBe(1);
  });

  it('should handle pause and resume', () => {
    progressManager.pause();
    expect(progressManager.isPaused()).toBe(true);

    progressManager.resume();
    expect(progressManager.isPaused()).toBe(false);
  });

  it('should get article with sections', async () => {
    const article = await researcher.getArticle('Knight');
    expect(article).not.toBeNull();
    if (article) {
      expect(article.title).toBe('Knight');
      expect(article.extract.length).toBeGreaterThan(0);
      expect(article.sections).toBeArray();
      expect(article.categories).toBeArray();
    }
  }, 30000);

  it('should chunk article correctly', () => {
    const article = {
      title: 'Test Article',
      extract: 'This is a test extract with enough content to create multiple chunks.',
      url: 'https://example.com',
      categories: ['test'],
      sections: [
        { title: 'Section 1', level: 1, content: 'Content of section 1 with enough text to create chunks.' },
      ],
      infobox: {},
      links: [],
    };

    const chunks = ragBuilder.chunkArticle(article);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].metadata.source).toBe('wikipedia');
    expect(chunks[0].metadata.article).toBe('Test Article');
  });
});
