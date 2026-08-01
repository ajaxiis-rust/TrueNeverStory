import { getLogger } from '../utils/logger';
import type { WikiArticle } from './wikipedia-researcher';

const log = getLogger('wiki-rag-builder');

export interface WikiChunk {
  text: string;
  metadata: {
    source: 'wikipedia';
    article: string;
    section: string;
    categories: string[];
    worldId: string;
    chunkIndex: number;
  };
}

export interface WikiArticleRecord {
  title: string;
  url: string;
  categories: string[];
  worldId: string;
  fetchedAt: Date;
}

export class WikiRAGBuilder {
  private worldId: string;
  private chunks: WikiChunk[] = [];
  private articles: WikiArticleRecord[] = [];
  private chunkSize = 1500;
  private chunkOverlap = 150;

  constructor(worldId: string) {
    this.worldId = worldId;
  }

  addArticle(article: WikiArticle): void {
    this.articles.push({
      title: article.title,
      url: article.url,
      categories: article.categories,
      worldId: this.worldId,
      fetchedAt: new Date(),
    });

    const articleChunks = this.chunkArticle(article);
    this.chunks.push(...articleChunks);

    log.info(`Added article "${article.title}" with ${articleChunks.length} chunks`);
  }

  chunkArticle(article: WikiArticle): WikiChunk[] {
    const chunks: WikiChunk[] = [];
    let chunkIndex = 0;

    if (article.extract) {
      const extractChunks = this.splitText(article.extract);
      for (const text of extractChunks) {
        chunks.push({
          text,
          metadata: {
            source: 'wikipedia',
            article: article.title,
            section: 'Summary',
            categories: article.categories,
            worldId: this.worldId,
            chunkIndex: chunkIndex++,
          },
        });
      }
    }

    for (const section of article.sections) {
      if (!section.content || section.content.length < 50) continue;

      const sectionChunks = this.splitText(section.content);
      for (const text of sectionChunks) {
        chunks.push({
          text,
          metadata: {
            source: 'wikipedia',
            article: article.title,
            section: section.title,
            categories: article.categories,
            worldId: this.worldId,
            chunkIndex: chunkIndex++,
          },
        });
      }
    }

    return chunks;
  }

  getChunks(): WikiChunk[] {
    return this.chunks;
  }

  getArticles(): WikiArticleRecord[] {
    return this.articles;
  }

  getStats(): { articles: number; chunks: number; worldId: string } {
    return {
      articles: this.articles.length,
      chunks: this.chunks.length,
      worldId: this.worldId,
    };
  }

  private splitText(text: string): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > this.chunkSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          const overlapStart = Math.max(0, currentChunk.length - this.chunkOverlap);
          currentChunk = currentChunk.substring(overlapStart) + ' ' + sentence;
        } else {
          currentChunk = sentence;
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}
