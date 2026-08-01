import { getLogger } from '../utils/logger';
import type { WikipediaResearcher } from './wikipedia-researcher';
import type { WikiRAGBuilder } from './wiki-rag-builder';
import type { WorldCreationProgressManager } from './world-creation-progress';

const log = getLogger('idle-research-scheduler');

export interface IdleResearchConfig {
  idleThresholdMs: number;
  checkIntervalMs: number;
  maxArticlesPerSession: number;
}

export class IdleResearchScheduler {
  private worldId: string;
  private config: IdleResearchConfig;
  private lastActivityTime: Date;
  private timer: ReturnType<typeof setInterval> | null = null;
  private _isResearching = false;
  private researcher?: WikipediaResearcher;
  private ragBuilder?: WikiRAGBuilder;
  private progress?: WorldCreationProgressManager;
  private pendingTopics: string[] = [];

  constructor(worldId: string, config?: Partial<IdleResearchConfig>) {
    this.worldId = worldId;
    this.config = {
      idleThresholdMs: config?.idleThresholdMs ?? 3600000,
      checkIntervalMs: config?.checkIntervalMs ?? 300000,
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
    return this._isResearching;
  }

  private async checkAndResearch(): Promise<void> {
    if (this._isResearching || !this.isIdle() || this.pendingTopics.length === 0) {
      return;
    }

    if (!this.researcher || !this.ragBuilder || !this.progress) {
      log.warn('Dependencies not set for idle research');
      return;
    }

    this._isResearching = true;
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
      this._isResearching = false;
    }
  }
}
