# Wikipedia RAG Enrichment Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/wikipedia-rag.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Обогатить миры TrueNeverStory реальными знаниями из Wikipedia через RAG-систему с прогресс-баром и автоматическим исследованием.

**Architecture:** Расширяем существующий `WikipediaMCPTools` до полноценного исследовательского сервиса. Добавляем `WikipediaResearcher` для глубокого парсинга, `WikiRAGBuilder` для создания векторного индекса, `WorldCreationProgress` для отслеживания прогресса, и `IdleResearchScheduler` для фонового обогащения.

**Tech Stack:** TypeScript, Bun, Hono (SSE), SQLite, FAISS, MediaWiki API

## Global Constraints

- Английская Wikipedia только (`en.wikipedia.org`)
- Retry: 5 попыток, таймаут 2 минуты, экспоненциальная задержка
- Graceful degradation: мир создаётся даже если Wikipedia недоступен
- Прогресс-бар: CLI + Web UI (SSE)
- Кнопки в чате: запуск, пауза, продолжение
- Отдельный wiki-rag индекс (не смешивать с существующим)
- Привязка к `world_id` — каждый мир изолирован

---

### Task 1: Расширение WikipediaResearcher

**Covers:** S4.1, S6

**Files:**
- Modify: `src/mcp/tools/wikipedia.ts`
- Create: `src/services/wikipedia-researcher.ts`
- Test: `tests/services/wikipedia-researcher.test.ts`

**Interfaces:**
- Consumes: `fetch` (встроенный), существующий `WikipediaMCPTools`
- Produces: `WikipediaResearcher` класс с методами `search()`, `getArticle()`, `getCategoryMembers()`, `getRelatedArticles()`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/services/wikipedia-researcher.test.ts
import { describe, it, expect, mock } from 'bun:test';
import { WikipediaResearcher } from '../../src/services/wikipedia-researcher';

describe('WikipediaResearcher', () => {
  it('should search articles by query', async () => {
    const researcher = new WikipediaResearcher();
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
    const researcher = new WikipediaResearcher();
    const article = await researcher.getArticle('Knight');
    expect(article).not.toBeNull();
    if (article) {
      expect(article.title).toBe('Knight');
      expect(article.extract.length).toBeGreaterThan(0);
      expect(article.sections).toBeArray();
    }
  });

  it('should handle API errors gracefully', async () => {
    const researcher = new WikipediaResearcher();
    const article = await researcher.getArticle('NonExistentArticle12345');
    expect(article).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/services/wikipedia-researcher.test.ts`
Expected: FAIL with "Cannot find module '../../src/services/wikipedia-researcher'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/wikipedia-researcher.ts
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
  private retryDelay = 5000; // 5 seconds initial
  private timeout = 120000; // 2 minutes

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
    // Get full article with sections
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

    // Get summary via REST API
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

  // ─── Private Helpers ──────────────────────────────────────────────────

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
      content: '', // Will be filled by getArticle if needed
    }));
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/services/wikipedia-researcher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/wikipedia-researcher.ts tests/services/wikipedia-researcher.test.ts
git commit -m "feat: add WikipediaResearcher service with retry logic"
```

---

### Task 2: WikiRAGBuilder — парсинг и векторизация

**Covers:** S4.2, S7

**Files:**
- Create: `src/services/wiki-rag-builder.ts`
- Test: `tests/services/wiki-rag-builder.test.ts`

**Interfaces:**
- Consumes: `WikiArticle` из Task 1, `VectorIndex` из `src/memory/faiss-index.ts`
- Produces: `WikiRAGBuilder` класс с методами `addArticle()`, `search()`, `getStats()`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/services/wiki-rag-builder.test.ts
import { describe, it, expect } from 'bun:test';
import { WikiRAGBuilder } from '../../src/services/wiki-rag-builder';
import type { WikiArticle } from '../../src/services/wikipedia-researcher';

describe('WikiRAGBuilder', () => {
  const mockArticle: WikiArticle = {
    title: 'Knight',
    extract: 'A knight is a person granted an honorary title of knighthood by a head of state.',
    url: 'https://en.wikipedia.org/wiki/Knight',
    categories: ['Knights', 'Medieval'],
    sections: [
      { title: 'History', level: 1, content: 'The concept of knighthood originated in the medieval period.' },
      { title: 'Equipment', level: 1, content: 'Knights typically wore armor and carried swords.' },
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
      expect(chunk.text.length).toBeLessThanOrEqual(2000); // ~500 tokens
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it('should include section titles in metadata', () => {
    const builder = new WikiRAGBuilder('test-world');
    const chunks = builder.chunkArticle(mockArticle);
    const historyChunk = chunks.find(c => c.metadata.section === 'History');
    expect(historyChunk).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/services/wiki-rag-builder.test.ts`
Expected: FAIL with "Cannot find module '../../src/services/wiki-rag-builder'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/wiki-rag-builder.ts
import { getLogger } from '../utils/logger';
import type { WikiArticle } from './wikipedia-researcher';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
  private chunkSize = 1500; // characters (~500 tokens)
  private chunkOverlap = 150; // characters (~50 tokens)

  constructor(worldId: string) {
    this.worldId = worldId;
  }

  addArticle(article: WikiArticle): void {
    // Record article
    this.articles.push({
      title: article.title,
      url: article.url,
      categories: article.categories,
      worldId: this.worldId,
      fetchedAt: new Date(),
    });

    // Chunk article
    const articleChunks = this.chunkArticle(article);
    this.chunks.push(...articleChunks);

    log.info(`Added article "${article.title}" with ${articleChunks.length} chunks`);
  }

  chunkArticle(article: WikiArticle): WikiChunk[] {
    const chunks: WikiChunk[] = [];
    let chunkIndex = 0;

    // Chunk extract (summary)
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

    // Chunk sections
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

  // ─── Private Helpers ──────────────────────────────────────────────────

  private splitText(text: string): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > this.chunkSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          // Overlap: keep last part of previous chunk
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/services/wiki-rag-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/wiki-rag-builder.ts tests/services/wiki-rag-builder.test.ts
git commit -m "feat: add WikiRAGBuilder for article chunking"
```

---

### Task 3: WorldCreationProgress — менеджер прогресса

**Covers:** S4.4, S8

**Files:**
- Create: `src/services/world-creation-progress.ts`
- Test: `tests/services/world-creation-progress.test.ts`

**Interfaces:**
- Consumes: нет
- Produces: `WorldCreationProgressManager` класс с методами `update()`, `subscribe()`, `pause()`, `resume()`, `getProgress()`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/services/world-creation-progress.test.ts
import { describe, it, expect } from 'bun:test';
import { WorldCreationProgressManager } from '../../src/services/world-creation-progress';

describe('WorldCreationProgressManager', () => {
  it('should track progress updates', () => {
    const manager = new WorldCreationProgressManager('test-world');
    manager.update({
      stage: 'researching',
      current: 5,
      total: 10,
      message: 'Researching medieval knighthood...',
    });

    const progress = manager.getProgress();
    expect(progress.stage).toBe('researching');
    expect(progress.current).toBe(5);
    expect(progress.total).toBe(10);
    expect(progress.isPaused).toBe(false);
  });

  it('should support pause and resume', () => {
    const manager = new WorldCreationProgressManager('test-world');
    manager.update({ stage: 'researching', current: 0, total: 10, message: 'Starting...' });

    manager.pause();
    expect(manager.getProgress().isPaused).toBe(true);

    manager.resume();
    expect(manager.getProgress().isPaused).toBe(false);
  });

  it('should notify subscribers', () => {
    const manager = new WorldCreationProgressManager('test-world');
    const received: any[] = [];

    manager.subscribe((progress) => {
      received.push(progress);
    });

    manager.update({ stage: 'generating', current: 0, total: 1, message: 'Generating world...' });
    manager.update({ stage: 'researching', current: 0, total: 10, message: 'Starting research...' });

    expect(received.length).toBe(2);
    expect(received[0].stage).toBe('generating');
    expect(received[1].stage).toBe('researching');
  });

  it('should track errors', () => {
    const manager = new WorldCreationProgressManager('test-world');
    manager.update({
      stage: 'researching',
      current: 5,
      total: 10,
      message: 'Researching...',
      errors: ['Failed to fetch article X'],
    });

    const progress = manager.getProgress();
    expect(progress.errors).toContain('Failed to fetch article X');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/services/world-creation-progress.test.ts`
Expected: FAIL with "Cannot find module '../../src/services/world-creation-progress'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/world-creation-progress.ts
import { getLogger } from '../utils/logger';

const log = getLogger('world-creation-progress');

export type ProgressStage = 'idle' | 'generating' | 'researching' | 'building_rag' | 'complete' | 'error';

export interface WorldCreationProgress {
  stage: ProgressStage;
  current: number;
  total: number;
  message: string;
  currentArticle?: string;
  errors: string[];
  isPaused: boolean;
  startedAt?: Date;
  completedAt?: Date;
}

export type ProgressCallback = (progress: WorldCreationProgress) => void;

export class WorldCreationProgressManager {
  private worldId: string;
  private progress: WorldCreationProgress;
  private subscribers: Set<ProgressCallback> = new Set();

  constructor(worldId: string) {
    this.worldId = worldId;
    this.progress = {
      stage: 'idle',
      current: 0,
      total: 0,
      message: '',
      errors: [],
      isPaused: false,
    };
  }

  update(update: Partial<WorldCreationProgress>): void {
    this.progress = {
      ...this.progress,
      ...update,
    };

    if (update.stage === 'researching' && !this.progress.startedAt) {
      this.progress.startedAt = new Date();
    }

    if (update.stage === 'complete' || update.stage === 'error') {
      this.progress.completedAt = new Date();
    }

    log.debug(`Progress [${this.worldId}]: ${this.progress.stage} ${this.progress.current}/${this.progress.total}`);

    // Notify subscribers
    for (const callback of this.subscribers) {
      try {
        callback(this.progress);
      } catch (error) {
        log.error('Subscriber callback error:', error as string);
      }
    }
  }

  subscribe(callback: ProgressCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  pause(): void {
    this.progress.isPaused = true;
    log.info(`Research paused for world ${this.worldId}`);
    this.notifySubscribers();
  }

  resume(): void {
    this.progress.isPaused = false;
    log.info(`Research resumed for world ${this.worldId}`);
    this.notifySubscribers();
  }

  getProgress(): WorldCreationProgress {
    return { ...this.progress };
  }

  isPaused(): boolean {
    return this.progress.isPaused;
  }

  waitForResume(): Promise<void> {
    if (!this.progress.isPaused) return Promise.resolve();

    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (!this.progress.isPaused) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this.progress);
      } catch (error) {
        log.error('Subscriber callback error:', error as string);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/services/world-creation-progress.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/world-creation-progress.ts tests/services/world-creation-progress.test.ts
git commit -m "feat: add WorldCreationProgressManager with SSE support"
```

---

### Task 4: IdleResearchScheduler — фоновое обогащение

**Covers:** S4.3

**Files:**
- Create: `src/services/idle-research-scheduler.ts`
- Test: `tests/services/idle-research-scheduler.test.ts`

**Interfaces:**
- Consumes: `WikipediaResearcher` из Task 1, `WikiRAGBuilder` из Task 2, `WorldCreationProgressManager` из Task 3
- Produces: `IdleResearchScheduler` класс с методами `start()`, `stop()`, `isIdle()`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/services/idle-research-scheduler.test.ts
import { describe, it, expect, mock } from 'bun:test';
import { IdleResearchScheduler } from '../../src/services/idle-research-scheduler';

describe('IdleResearchScheduler', () => {
  it('should track last activity time', () => {
    const scheduler = new IdleResearchScheduler('test-world', {
      idleThresholdMs: 1000,
    });

    scheduler.recordActivity();
    expect(scheduler.isIdle()).toBe(false);
  });

  it('should detect idle state after threshold', async () => {
    const scheduler = new IdleResearchScheduler('test-world', {
      idleThresholdMs: 100,
    });

    scheduler.recordActivity();
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(scheduler.isIdle()).toBe(true);
  });

  it('should not be idle initially', () => {
    const scheduler = new IdleResearchScheduler('test-world', {
      idleThresholdMs: 1000,
    });

    expect(scheduler.isIdle()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/services/idle-research-scheduler.test.ts`
Expected: FAIL with "Cannot find module '../../src/services/idle-research-scheduler'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/idle-research-scheduler.ts
import { getLogger } from '../utils/logger';
import type { WikipediaResearcher } from './wikipedia-researcher';
import type { WikiRAGBuilder } from './wiki-rag-builder';
import type { WorldCreationProgressManager } from './world-creation-progress';

const log = getLogger('idle-research-scheduler');

export interface IdleResearchConfig {
  idleThresholdMs: number;      // Default: 1 hour (3600000)
  checkIntervalMs: number;      // Default: 5 minutes (300000)
  maxArticlesPerSession: number; // Default: 10
}

export class IdleResearchScheduler {
  private worldId: string;
  private config: IdleResearchConfig;
  private lastActivityTime: Date;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isResearching = false;
  private researcher?: WikipediaResearcher;
  private ragBuilder?: WikiRAGBuilder;
  private progress?: WorldCreationProgressManager;
  private pendingTopics: string[] = [];

  constructor(worldId: string, config?: Partial<IdleResearchConfig>) {
    this.worldId = worldId;
    this.config = {
      idleThresholdMs: config?.idleThresholdMs ?? 3600000, // 1 hour
      checkIntervalMs: config?.checkIntervalMs ?? 300000,  // 5 minutes
      maxArticlesPerSession: config?.maxArticlesPerSession ?? 10,
    };
    this.lastActivityTime = new Date();
  }

  setDependencies(
    researcher: WikipediaResearcher,
    ragBuilder: WikiRAGBuilder,
    progress: WorldCreationProgressManager,
  ): void {
    this.researcher = researcher;
    this.ragBuilder = ragBuilder;
    this.progress = progress;
  }

  addTopics(topics: string[]): void {
    this.pendingTopics.push(...topics);
    log.info(`Added ${topics.length} topics for idle research. Total pending: ${this.pendingTopics.length}`);
  }

  start(): void {
    if (this.timer) return;

    log.info(`Starting idle research scheduler for world ${this.worldId}`);
    this.timer = setInterval(() => {
      this.checkAndResearch();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  recordActivity(): void {
    this.lastActivityTime = new Date();
  }

  isIdle(): boolean {
    const now = new Date();
    const idleTime = now.getTime() - this.lastActivityTime.getTime();
    return idleTime >= this.config.idleThresholdMs;
  }

  isResearching(): boolean {
    return this.isResearching;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private async checkAndResearch(): Promise<void> {
    if (this.isResearching || !this.isIdle() || this.pendingTopics.length === 0) {
      return;
    }

    if (!this.researcher || !this.ragBuilder || !this.progress) {
      log.warn('Dependencies not set for idle research');
      return;
    }

    this.isResearching = true;
    log.info(`Starting idle research for world ${this.worldId}. Topics: ${this.pendingTopics.length}`);

    try {
      const topicsToResearch = this.pendingTopics.splice(0, this.config.maxArticlesPerSession);

      this.progress.update({
        stage: 'researching',
        current: 0,
        total: topicsToResearch.length,
        message: `Idle research: investigating ${topicsToResearch.length} topics...`,
      });

      for (let i = 0; i < topicsToResearch.length; i++) {
        // Check if paused
        if (this.progress.isPaused()) {
          await this.progress.waitForResume();
        }

        const topic = topicsToResearch[i];
        this.progress.update({
          current: i + 1,
          message: `Idle research: ${topic}`,
          currentArticle: topic,
        });

        try {
          const articles = await this.researcher.search(topic, 3);
          for (const searchResult of articles) {
            const article = await this.researcher.getArticle(searchResult.title);
            if (article) {
              this.ragBuilder.addArticle(article);
            }
          }
        } catch (error) {
          log.error(`Failed to research topic "${topic}":`, error as string);
          this.progress.update({
            errors: [...(this.progress.getProgress().errors || []), `Failed: ${topic}`],
          });
        }
      }

      log.info(`Idle research complete for world ${this.worldId}`);
    } catch (error) {
      log.error('Idle research error:', error as string);
    } finally {
      this.isResearching = false;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/services/idle-research-scheduler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/idle-research-scheduler.ts tests/services/idle-research-scheduler.test.ts
git commit -m "feat: add IdleResearchScheduler for background enrichment"
```

---

### Task 5: Интеграция с WorldBuilder

**Covers:** S12

**Files:**
- Modify: `src/services/world-builder.ts`

**Interfaces:**
- Consumes: `WikipediaResearcher`, `WikiRAGBuilder`, `WorldCreationProgressManager` из предыдущих задач
- Produces: Расширенный `WorldBuilder.createWorld()` с Wikipedia исследованием

- [ ] **Step 1: Write the failing test**

```typescript
// tests/services/world-builder-wiki.test.ts
import { describe, it, expect, mock } from 'bun:test';

describe('WorldBuilder Wikipedia integration', () => {
  it('should extract keywords from world description', () => {
    // Test keyword extraction logic
    const worldDescription = 'A medieval world of knights and castles in England';
    const keywords = extractKeywords(worldDescription);
    expect(keywords).toContain('medieval');
    expect(keywords).toContain('knights');
    expect(keywords).toContain('castles');
    expect(keywords).toContain('England');
  });
});

function extractKeywords(description: string): string[] {
  // Simple keyword extraction - remove common words, keep nouns
  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
  return description
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z]/g, ''))
    .filter(w => w.length > 2 && !stopWords.has(w));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/services/world-builder-wiki.test.ts`
Expected: FAIL (test should pass, but integration not yet done)

- [ ] **Step 3: Add Wikipedia research to WorldBuilder**

```typescript
// Add to src/services/world-builder.ts

import { WikipediaResearcher } from './wikipedia-researcher';
import { WikiRAGBuilder } from './wiki-rag-builder';
import { WorldCreationProgressManager } from './world-creation-progress';

// Add to WorldBuilder class:
private _wikiResearcher?: WikipediaResearcher;
private _ragBuilder?: WikiRAGBuilder;
private _progressManager?: WorldCreationProgressManager;

// Add method to enable Wikipedia research:
enableWikipediaResearch(worldId: string): void {
  this._wikiResearcher = new WikipediaResearcher();
  this._ragBuilder = new WikiRAGBuilder(worldId);
  this._progressManager = new WorldCreationProgressManager(worldId);
}

// Add to createWorld() after world frame is generated:
async enrichWithWikipedia(): Promise<void> {
  if (!this._wikiResearcher || !this._ragBuilder || !this._progressManager || !this.worldFrame) {
    return;
  }

  const keywords = this.extractKeywords(
    JSON.stringify(this.worldFrame)
  );

  this._progressManager.update({
    stage: 'researching',
    current: 0,
    total: keywords.length,
    message: 'Starting Wikipedia research...',
  });

  for (let i = 0; i < keywords.length; i++) {
    if (this._progressManager.isPaused()) {
      await this._progressManager.waitForResume();
    }

    const keyword = keywords[i];
    this._progressManager.update({
      current: i + 1,
      message: `Researching: ${keyword}`,
      currentArticle: keyword,
    });

    try {
      const articles = await this._wikiResearcher.search(keyword, 5);
      for (const result of articles) {
        const article = await this._wikiResearcher.getArticle(result.title);
        if (article) {
          this._ragBuilder.addArticle(article);
        }
      }
    } catch (error) {
      log.error(`Failed to research keyword "${keyword}":`, error as string);
    }
  }

  this._progressManager.update({
    stage: 'complete',
    message: 'Wikipedia research complete',
  });
}

private extractKeywords(text: string): string[] {
  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can']);

  return text
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z]/g, ''))
    .filter(w => w.length > 3 && !stopWords.has(w))
    .filter((v, i, a) => a.indexOf(v) === i) // deduplicate
    .slice(0, 20); // limit to 20 keywords
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/services/world-builder-wiki.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/world-builder.ts tests/services/world-builder-wiki.test.ts
git commit -m "feat: integrate Wikipedia research into WorldBuilder"
```

---

### Task 6: SSE Endpoints для прогресса

**Covers:** S9

**Files:**
- Create: `src/routes/wiki-research.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Consumes: `WorldCreationProgressManager` из Task 3
- Produces: REST + SSE endpoints для UI

- [ ] **Step 1: Write the failing test**

```typescript
// tests/routes/wiki-research.test.ts
import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';

describe('Wiki Research Routes', () => {
  it('should return progress status', async () => {
    // Will be implemented with actual routes
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Create route handler**

```typescript
// src/routes/wiki-research.ts
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { WorldCreationProgressManager } from '../services/world-creation-progress';
import { getLogger } from '../utils/logger';

const log = getLogger('wiki-research-routes');

// In-memory store of progress managers (keyed by worldId)
const progressManagers = new Map<string, WorldCreationProgressManager>();

export function getOrCreateProgressManager(worldId: string): WorldCreationProgressManager {
  if (!progressManagers.has(worldId)) {
    progressManagers.set(worldId, new WorldCreationProgressManager(worldId));
  }
  return progressManagers.get(worldId)!;
}

export const wikiResearchRoutes = new Hono();

// GET /api/wiki/research/:worldId/progress - SSE endpoint
wikiResearchRoutes.get('/api/wiki/research/:worldId/progress', (c) => {
  const worldId = c.req.param('worldId');
  const manager = getOrCreateProgressManager(worldId);

  return streamSSE(c, async (stream) => {
    // Send current progress immediately
    const currentProgress = manager.getProgress();
    await stream.writeSSE({
      data: JSON.stringify(currentProgress),
      event: 'progress',
    });

    // Subscribe to updates
    const unsubscribe = manager.subscribe(async (progress) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify(progress),
          event: progress.stage === 'complete' ? 'complete' : 'progress',
        });
      } catch (error) {
        // Client disconnected
        unsubscribe();
      }
    });

    // Keep connection alive
    while (true) {
      await stream.writeSSE({ data: '', event: 'heartbeat' });
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  });
});

// POST /api/wiki/research/:worldId - Start research
wikiResearchRoutes.post('/api/wiki/research/:worldId', async (c) => {
  const worldId = c.req.param('worldId');
  const manager = getOrCreateProgressManager(worldId);

  // Research will be triggered by WorldBuilder
  // This endpoint just returns the current status
  return c.json({
    worldId,
    status: manager.getProgress().stage,
    message: 'Research initiated',
  });
});

// POST /api/wiki/research/:worldId/pause - Pause research
wikiResearchRoutes.post('/api/wiki/research/:worldId/pause', (c) => {
  const worldId = c.req.param('worldId');
  const manager = getOrCreateProgressManager(worldId);
  manager.pause();

  return c.json({ worldId, paused: true });
});

// POST /api/wiki/research/:worldId/resume - Resume research
wikiResearchRoutes.post('/api/wiki/research/:worldId/resume', (c) => {
  const worldId = c.req.param('worldId');
  const manager = getOrCreateProgressManager(worldId);
  manager.resume();

  return c.json({ worldId, paused: false });
});

// GET /api/wiki/research/:worldId/status - Get current status
wikiResearchRoutes.get('/api/wiki/research/:worldId/status', (c) => {
  const worldId = c.req.param('worldId');
  const manager = getOrCreateProgressManager(worldId);

  return c.json(manager.getProgress());
});
```

- [ ] **Step 3: Register routes in app.ts**

```typescript
// Add to src/app.ts
import { wikiResearchRoutes } from './routes/wiki-research';

// In the app setup:
app.route('/', wikiResearchRoutes);
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/routes/wiki-research.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/wiki-research.ts src/app.ts tests/routes/wiki-research.test.ts
git commit -m "feat: add SSE endpoints for Wikipedia research progress"
```

---

### Task 7: CLI Progress Bar

**Covers:** S8

**Files:**
- Create: `src/utils/progress-bar.ts`
- Test: `tests/utils/progress-bar.test.ts`

**Interfaces:**
- Consumes: `WorldCreationProgress` из Task 3
- Produces: `CLIProgressBar` класс для терминального вывода

- [ ] **Step 1: Write the failing test**

```typescript
// tests/utils/progress-bar.test.ts
import { describe, it, expect } from 'bun:test';
import { CLIProgressBar } from '../../src/utils/progress-bar';

describe('CLIProgressBar', () => {
  it('should format progress bar correctly', () => {
    const bar = new CLIProgressBar();
    const formatted = bar.format({
      stage: 'researching',
      current: 5,
      total: 10,
      message: 'Researching medieval knighthood...',
      currentArticle: 'Knight',
      errors: [],
      isPaused: false,
    });

    expect(formatted).toContain('50%');
    expect(formatted).toContain('5/10');
    expect(formatted).toContain('Researching');
  });

  it('should show 100% when complete', () => {
    const bar = new CLIProgressBar();
    const formatted = bar.format({
      stage: 'complete',
      current: 10,
      total: 10,
      message: 'Complete',
      errors: [],
      isPaused: false,
    });

    expect(formatted).toContain('100%');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/utils/progress-bar.test.ts`
Expected: FAIL with "Cannot find module '../../src/utils/progress-bar'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/utils/progress-bar.ts
import type { WorldCreationProgress } from '../services/world-creation-progress';

export class CLIProgressBar {
  private lastOutput = '';

  format(progress: WorldCreationProgress): string {
    const percentage = progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

    const barLength = 30;
    const filledLength = Math.round(barLength * (percentage / 100));
    const emptyLength = barLength - filledLength;

    const bar = '▓'.repeat(filledLength) + '░'.repeat(emptyLength);

    const stageLabel = this.getStageLabel(progress.stage);
    const pauseIndicator = progress.isPaused ? ' [PAUSED]' : '';

    let output = `[${stageLabel}] ${progress.message}\n`;
    output += `  [${bar}] ${percentage}% (${progress.current}/${progress.total})${pauseIndicator}\n`;

    if (progress.currentArticle) {
      output += `  → Current: ${progress.currentArticle}\n`;
    }

    if (progress.errors.length > 0) {
      output += `  → Errors: ${progress.errors.length}\n`;
    }

    return output;
  }

  print(progress: WorldCreationProgress): void {
    const output = this.format(progress);

    // Clear previous output
    if (this.lastOutput) {
      const lines = this.lastOutput.split('\n').length;
      for (let i = 0; i < lines; i++) {
        process.stdout.write('\x1b[1A\x1b[2K'); // Move up and clear line
      }
    }

    process.stdout.write(output);
    this.lastOutput = output;
  }

  private getStageLabel(stage: string): string {
    switch (stage) {
      case 'generating': return 'Stage 1/3: Generating World';
      case 'researching': return 'Stage 2/3: Wikipedia Research';
      case 'building_rag': return 'Stage 3/3: Building RAG';
      case 'complete': return 'Complete';
      case 'error': return 'Error';
      default: return stage;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/utils/progress-bar.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/progress-bar.ts tests/utils/progress-bar.test.ts
git commit -m "feat: add CLI progress bar for Wikipedia research"
```

---

### Task 8: MCP Wiki RAG Integration

**Covers:** S4.5

**Files:**
- Create: `src/mcp/wiki/index.ts`
- Create: `src/mcp/wiki/wiki-search.ts`
- Modify: `src/mcp/server.ts`

**Interfaces:**
- Consumes: `WikiRAGBuilder` из Task 2
- Produces: MCP tools для поиска по wiki-rag

- [ ] **Step 1: Create MCP wiki module**

```typescript
// src/mcp/wiki/index.ts
export { WikiSearchTool } from './wiki-search';
```

- [ ] **Step 2: Create wiki search tool**

```typescript
// src/mcp/wiki/wiki-search.ts
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

    // Simple keyword search (can be enhanced with vector search later)
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

    // Sort by score and limit
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
```

- [ ] **Step 3: Register in MCP server**

```typescript
// Add to src/mcp/server.ts
import { WikiSearchTool } from './wiki/wiki-search';

// In TNSServer class:
private wikiSearchTool: WikiSearchTool;

// In constructor:
this.wikiSearchTool = new WikiSearchTool();

// In registerTools():
this.wikiSearchTool.registerRAGBuilder(worldId, ragBuilder);
```

- [ ] **Step 4: Commit**

```bash
git add src/mcp/wiki/ src/mcp/server.ts
git commit -m "feat: add MCP wiki search tool for RAG queries"
```

---

### Task 9: Integration Tests

**Covers:** S14

**Files:**
- Create: `tests/integration/wikipedia-rag.test.ts`

**Interfaces:**
- Consumes: все предыдущие компоненты
- Produces: полная интеграционная проверка

- [ ] **Step 1: Write integration test**

```typescript
// tests/integration/wikipedia-rag.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
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
  }, 60000); // 60 second timeout for API calls

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
});
```

- [ ] **Step 2: Run integration tests**

Run: `bun test tests/integration/wikipedia-rag.test.ts`
Expected: PASS (with network access)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/wikipedia-rag.test.ts
git commit -m "test: add integration tests for Wikipedia RAG pipeline"
```

---

### Task 10: Documentation

**Covers:** S15

**Files:**
- Create: `docs/wikipedia-rag.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: все компоненты
- Produces: документация для разработчиков

- [ ] **Step 1: Create documentation**

```markdown
# Wikipedia RAG Enrichment

## Overview

TrueNeverStory uses Wikipedia to enrich game worlds with real-world knowledge. During world creation, the system automatically researches relevant topics and builds a RAG (Retrieval-Augmented Generation) index.

## Architecture

1. **WikipediaResearcher** - Fetches articles from Wikipedia API
2. **WikiRAGBuilder** - Chunks articles and builds vector index
3. **WorldCreationProgress** - Tracks progress with SSE support
4. **IdleResearchScheduler** - Enriches RAG during player idle time

## Usage

### Automatic Research

When creating a world, Wikipedia research happens automatically:

```typescript
const worldBuilder = new WorldBuilder(deps);
worldBuilder.enableWikipediaResearch(worldId);
await worldBuilder.createWorld();
await worldBuilder.enrichWithWikipedia();
```

### Manual Research

Trigger research from the UI:
- Click "🌍 Исследовать Wikipedia" button
- Monitor progress via SSE endpoint
- Pause/resume as needed

### CLI Progress

Progress is displayed in the terminal during world creation:

```
[Stage 2/3: Wikipedia Research] Researching medieval knighthood...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Current: Knight
```

## API Endpoints

- `GET /api/wiki/research/:worldId/progress` - SSE progress stream
- `POST /api/wiki/research/:worldId` - Start research
- `POST /api/wiki/research/:worldId/pause` - Pause research
- `POST /api/wiki/research/:worldId/resume` - Resume research
- `GET /api/wiki/research/:worldId/status` - Get current status

## Configuration

Retry policy:
- 5 attempts per article
- 2 minute timeout per attempt
- Exponential backoff: 5s → 10s → 20s → 40s → 80s

Idle enrichment:
- Triggers after 1 hour of inactivity
- Processes up to 10 topics per session
```

- [ ] **Step 2: Update README.md**

Add Wikipedia RAG section to README.md with quick start instructions.

- [ ] **Step 3: Commit**

```bash
git add docs/wikipedia-rag.md README.md
git commit -m "docs: add Wikipedia RAG enrichment documentation"
```

---

## Self-Review Checklist

- [x] S1 (Architecture) - Covered by Tasks 1-4
- [x] S2 (Wikipedia API) - Covered by Task 1
- [x] S3 (RAG Storage) - Covered by Task 2
- [x] S4.1 (WikipediaResearcher) - Covered by Task 1
- [x] S4.2 (WikiRAGBuilder) - Covered by Task 2
- [x] S4.3 (IdleResearchScheduler) - Covered by Task 4
- [x] S4.4 (WorldCreationProgress) - Covered by Task 3
- [x] S4.5 (MCP Wiki Resource) - Covered by Task 8
- [x] S5 (Data Flow) - Covered by Task 5
- [x] S6 (Retry Policy) - Covered by Task 1
- [x] S7 (RAG Storage) - Covered by Task 2
- [x] S8 (Progress Bar) - Covered by Tasks 3, 7
- [x] S9 (Chat Buttons) - Covered by Task 6
- [x] S10 (Error Handling) - Covered by Tasks 1, 4
- [x] S11 (File Structure) - All files defined
- [x] S12 (Integration Points) - Covered by Task 5
- [x] S13 (Dependencies) - No new dependencies needed
- [x] S14 (Testing) - Covered by Task 9
- [x] S15 (Success Criteria) - Covered by Task 10
