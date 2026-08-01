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
