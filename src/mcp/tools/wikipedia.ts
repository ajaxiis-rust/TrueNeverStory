import { VerifyFactInput, GetContextInput } from '../schemas';
import { getLogger } from '@/utils/logger';

const logger = getLogger('WikipediaMCPTools');

// ─── Wikipedia Client ────────────────────────────────────────────────────────

interface WikipediaArticle {
  title: string;
  extract: string;
  categories: string[];
  url: string;
}

interface VerificationResult {
  claim: string;
  verified: boolean;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  evidence: string[];
  sources: string[];
}

// ─── Wikipedia MCP Tools ─────────────────────────────────────────────────────

export class WikipediaMCPTools {
  private baseUrl = 'https://en.wikipedia.org/api/rest_v1';
  private cache = new Map<string, { data: WikipediaArticle; timestamp: number }>();
  private cacheTTL = 60 * 60 * 1000; // 1 hour

  /**
   * Verify a factual claim against Wikipedia.
   */
  async verifyFact(input: VerifyFactInput): Promise<VerificationResult> {
    try {
      // Extract key entities from claim
      const entities = this.extractEntities(input.claim);

      // Search Wikipedia for each entity
      const articles = await Promise.all(
        entities.map(e => this.searchArticle(e))
      );

      // Filter out null results
      const validArticles = articles.filter((a): a is WikipediaArticle => a !== null);

      if (validArticles.length === 0) {
        return {
          claim: input.claim,
          verified: false,
          confidence: 'unknown',
          evidence: [],
          sources: [],
        };
      }

      // Cross-check claim against articles
      const evidence: string[] = [];
      const sources: string[] = [];
      let matchCount = 0;

      for (const article of validArticles) {
        if (this.claimMatchesArticle(input.claim, article)) {
          matchCount++;
          evidence.push(`Wikipedia article "${article.title}" supports the claim`);
          sources.push(article.url);
        }
      }

      const confidence: VerificationResult['confidence'] =
        matchCount >= 3 ? 'high' :
        matchCount >= 2 ? 'medium' :
        matchCount >= 1 ? 'low' : 'unknown';

      return {
        claim: input.claim,
        verified: matchCount > 0,
        confidence,
        evidence,
        sources,
      };
    } catch (error) {
      logger.error('Failed to verify fact:', error as string);
      return {
        claim: input.claim,
        verified: false,
        confidence: 'unknown',
        evidence: [],
        sources: [],
      };
    }
  }

  /**
   * Get Wikipedia context for a topic.
   */
  async getContext(input: GetContextInput): Promise<{
    topic: string;
    summary: string;
    categories: string[];
    url: string;
    found: boolean;
  }> {
    try {
      const article = await this.searchArticle(input.topic);

      if (!article) {
        return {
          topic: input.topic,
          summary: '',
          categories: [],
          url: '',
          found: false,
        };
      }

      return {
        topic: input.topic,
        summary: article.extract,
        categories: article.categories,
        url: article.url,
        found: true,
      };
    } catch (error) {
      logger.error('Failed to get context:', error as string);
      return {
        topic: input.topic,
        summary: '',
        categories: [],
        url: '',
        found: false,
      };
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private extractEntities(text: string): string[] {
    // Simple entity extraction: look for capitalized words
    const entities: string[] = [];
    const words = text.split(/\s+/);

    for (const word of words) {
      const cleaned = word.replace(/[^a-zA-Z]/g, '');
      if (cleaned.length > 2 && cleaned[0] && cleaned[0] === cleaned[0].toUpperCase()) {
        entities.push(cleaned);
      }
    }

    // Deduplicate
    return [...new Set(entities)].slice(0, 5);
  }

  private async searchArticle(query: string): Promise<WikipediaArticle | null> {
    // Check cache
    const cached = this.cache.get(query.toLowerCase());
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // Search for article
      const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl);

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as {
        title?: string;
        extract?: string;
        categories?: string[];
        content_urls?: { desktop?: { page?: string } };
      };

      const article: WikipediaArticle = {
        title: data.title ?? query,
        extract: data.extract ?? '',
        categories: data.categories ?? [],
        url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
      };

      // Cache result
      this.cache.set(query.toLowerCase(), { data: article, timestamp: Date.now() });

      return article;
    } catch (error) {
      logger.error(`Failed to search Wikipedia for "${query}":`, error as string);
      return null;
    }
  }

  private claimMatchesArticle(claim: string, article: WikipediaArticle): boolean {
    const claimLower = claim.toLowerCase();
    const articleLower = article.extract.toLowerCase();

    // Simple word overlap check
    const claimWords = claimLower.split(/\s+/).filter(w => w.length > 3);
    const articleWords = new Set(articleLower.split(/\s+/));

    let matchCount = 0;
    for (const word of claimWords) {
      if (articleWords.has(word)) {
        matchCount++;
      }
    }

    // Require at least 50% word overlap
    return matchCount >= claimWords.length * 0.5;
  }
}
