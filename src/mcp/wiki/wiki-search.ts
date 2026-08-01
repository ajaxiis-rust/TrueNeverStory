import { getLogger } from '@/utils/logger';
import type { WikiRAGBuilder } from '@/services/wiki-rag-builder';

const log = getLogger('wiki-search-tool');

export interface WikiSearchInput {
  query: string;
  worldId: string;
  limit?: number;
}

export interface WikiSearchResult {
  article: string;
  section: string;
  text: string;
  score: number;
}

export class WikiSearchTool {
  private ragBuilders: Map<string, WikiRAGBuilder> = new Map();

  registerRAGBuilder(worldId: string, builder: WikiRAGBuilder): void {
    this.ragBuilders.set(worldId, builder);
    log.info(`Registered RAG builder for world ${worldId}`);
  }

  async search(input: WikiSearchInput): Promise<WikiSearchResult[]> {
    const builder = this.ragBuilders.get(input.worldId);
    if (!builder) {
      log.warn(`No RAG builder found for world ${input.worldId}`);
      return [];
    }

    const chunks = builder.getChunks();
    const query = input.query.toLowerCase();
    const limit = input.limit || 10;

    const results: WikiSearchResult[] = [];

    for (const chunk of chunks) {
      const text = chunk.text.toLowerCase();
      const score = this.calculateRelevance(query, text);

      if (score > 0) {
        results.push({
          article: chunk.metadata.article,
          section: chunk.metadata.section,
          text: chunk.text,
          score,
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private calculateRelevance(query: string, text: string): number {
    const queryWords = query.split(/\s+/);
    let matches = 0;

    for (const word of queryWords) {
      if (text.includes(word)) {
        matches++;
      }
    }

    return matches / queryWords.length;
  }
}
