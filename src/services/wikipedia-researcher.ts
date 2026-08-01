import { getLogger } from '../utils/logger';

const log = getLogger('wikipedia-researcher');

export interface WikiSearchResult {
  title: string;
  extract: string;
  url: string;
  categories: string[];
  pageid: number;
}

export interface WikiArticle {
  title: string;
  extract: string;
  url: string;
  categories: string[];
  sections: WikiSection[];
  infobox: Record<string, string>;
  links: string[];
}

export interface WikiSection {
  title: string;
  level: number;
  content: string;
}

export class WikipediaResearcher {
  private baseUrl = 'https://en.wikipedia.org/w/api.php';
  private restUrl = 'https://en.wikipedia.org/api/rest_v1';
  private retryCount = 5;
  private retryDelay = 5000;
  private timeout = 120000;

  async search(query: string, limit = 10): Promise<WikiSearchResult[]> {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: String(limit),
      format: 'json',
      origin: '*',
    });

    const data = await this.fetchWithRetry(`${this.baseUrl}?${params}`);
    if (!data?.query?.search) return [];

    return data.query.search.map((item: any) => ({
      title: item.title,
      extract: this.stripHtml(item.snippet || ''),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
      categories: [],
      pageid: item.pageid,
    }));
  }

  async getArticle(title: string): Promise<WikiArticle | null> {
    const params = new URLSearchParams({
      action: 'parse',
      page: title,
      prop: 'sections|wikitext|links|categories',
      format: 'json',
      origin: '*',
    });

    const data = await this.fetchWithRetry(`${this.baseUrl}?${params}`);
    if (!data?.parse) return null;

    const sections = this.parseSections(data.parse.sections || []);
    const links = (data.parse.links || []).map((l: any) => l['*']).slice(0, 50);
    const categories = (data.parse.categories || []).map((c: any) => c['*']);

    const summary = await this.getSummary(title);

    return {
      title: data.parse.title,
      extract: summary?.extract || '',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      categories,
      sections,
      infobox: {},
      links,
    };
  }

  async getCategoryMembers(category: string, depth = 1): Promise<string[]> {
    const members: string[] = [];
    const visited = new Set<string>();

    const fetchMembers = async (cat: string, currentDepth: number) => {
      if (currentDepth > depth || visited.has(cat)) return;
      visited.add(cat);

      const params = new URLSearchParams({
        action: 'query',
        list: 'categorymembers',
        cmtitle: `Category:${cat}`,
        cmlimit: '50',
        cmtype: 'page',
        format: 'json',
        origin: '*',
      });

      const data = await this.fetchWithRetry(`${this.baseUrl}?${params}`);
      if (data?.query?.categorymembers) {
        for (const member of data.query.categorymembers) {
          members.push(member.title);
        }
      }
    };

    await fetchMembers(category, 0);
    return [...new Set(members)];
  }

  async getRelatedArticles(title: string, depth = 1): Promise<string[]> {
    const related: string[] = [];
    const visited = new Set<string>();

    const fetchLinks = async (pageTitle: string, currentDepth: number) => {
      if (currentDepth > depth || visited.has(pageTitle)) return;
      visited.add(pageTitle);

      const params = new URLSearchParams({
        action: 'query',
        titles: pageTitle,
        prop: 'links',
        pllimit: '50',
        format: 'json',
        origin: '*',
      });

      const data = await this.fetchWithRetry(`${this.baseUrl}?${params}`);
      const pages = data?.query?.pages;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        const links = pages[pageId]?.links || [];
        for (const link of links) {
          related.push(link.title);
        }
      }
    };

    await fetchLinks(title, 0);
    return [...new Set(related)];
  }

  private async fetchWithRetry(url: string, attempt = 1): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt < this.retryCount) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        log.warn(`Wikipedia API error (attempt ${attempt}/${this.retryCount}): ${error}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchWithRetry(url, attempt + 1);
      }
      log.error(`Wikipedia API failed after ${this.retryCount} attempts: ${error}`);
      return null;
    }
  }

  private async getSummary(title: string): Promise<{ extract: string } | null> {
    try {
      const url = `${this.restUrl}/page/summary/${encodeURIComponent(title)}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  private parseSections(sections: any[]): WikiSection[] {
    return sections.map(s => ({
      title: s.line || '',
      level: parseInt(s.level || '1'),
      content: '',
    }));
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}
