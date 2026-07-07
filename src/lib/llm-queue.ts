/**
 * Global LLM Queue for prioritized request handling.
 * Rate limiting, concurrency control, queue cap with priority eviction.
 */

import { LLMClient, type LLMClientOptions } from "./llm-client";
import { RateLimiter, type RateLimiterConfig } from "./rate-limiter";
import { TaskPriority, DirectorTask } from "../models/director";
import { getLogger } from "../utils/logger";

const log = getLogger("llm-queue");

export interface LLMQueueConfig {
  maxConcurrent?: number;
  maxQueueSize?: number;
  rateLimit?: RateLimiterConfig;
}

interface QueuedTask {
  task: DirectorTask;
  agentId?: string;
  resolve: (value: string | Record<string, unknown>) => void;
  reject: (reason: unknown) => void;
}

export class LLMQueue {
  private _llm: LLMClient;
  private _agentClients: Map<string, LLMClient> = new Map();
  private _maxConcurrent: number;
  private _maxQueueSize: number;
  private _running = 0;
  private _queue: QueuedTask[] = [];
  private _processing = false;
  private _paused = false;
  private _rateLimiter: RateLimiter | null = null;
  private _stats = { totalProcessed: 0, totalDropped: 0, totalErrors: 0 };

  constructor(llm: LLMClient, config?: LLMQueueConfig) {
    this._llm = llm;
    this._maxConcurrent = config?.maxConcurrent ?? 3;
    this._maxQueueSize = config?.maxQueueSize ?? 50;

    if (config?.rateLimit) {
      this._rateLimiter = new RateLimiter(config.rateLimit);
      this._rateLimiter.startAutoRefill();
    }
  }

  get rateLimiter(): RateLimiter | null { return this._rateLimiter; }
  get queueLength(): number { return this._queue.length; }
  get running(): number { return this._running; }
  get stats() { return { ...this._stats, queueLength: this._queue.length, running: this._running }; }

  setRateLimit(config: RateLimiterConfig): void {
    if (this._rateLimiter) {
      this._rateLimiter.rpm = config.rpm;
    } else {
      this._rateLimiter = new RateLimiter(config);
      this._rateLimiter.startAutoRefill();
    }
  }

  setMaxQueueSize(size: number): void {
    this._maxQueueSize = size;
  }

  getAgentClient(agentId: string, options?: LLMClientOptions): LLMClient {
    if (!this._agentClients.has(agentId)) {
      this._agentClients.set(agentId, new LLMClient({ ...options, agentId }));
    }
    return this._agentClients.get(agentId)!;
  }

  async start(): Promise<void> {
    this._processing = true;
    this._paused = false;
  }

  async stop(): Promise<void> {
    this._processing = false;
    if (this._rateLimiter) this._rateLimiter.stopAutoRefill();
    const deadline = Date.now() + 3000;
    while (this._running > 0 && Date.now() < deadline) {
      await Bun.sleep(50);
    }
    if (this._running > 0) {
      log.warn({ running: this._running }, "Force shutdown — tasks still running");
    }
  }

  pause(): void {
    this._paused = true;
    log.info("LLM queue paused");
  }

  resume(): void {
    this._paused = false;
    log.info("LLM queue resumed");
    this._processNext();
  }

  async generateText(
    prompt: string,
    priority: TaskPriority = TaskPriority.NORMAL,
    temperature = 0.7,
    agentId?: string,
    timeout?: number,
  ): Promise<string> {
    const task = new DirectorTask({
      id: crypto.randomUUID(),
      type: "llm_text",
      priority,
      data: { prompt, temperature, timeout },
      created_at: new Date(),
    });

    return this._submit(task, agentId) as Promise<string>;
  }

  async *generateTextStream(
    prompt: string,
    priority: TaskPriority = TaskPriority.NORMAL,
    temperature = 0.7,
    agentId?: string,
  ): AsyncGenerator<string> {
    const llm = agentId ? this.getAgentClient(agentId) : this._llm;
    yield* llm.generateTextStream(prompt, { temperature });
  }

  async generateJson(
    prompt: string,
    priority: TaskPriority = TaskPriority.NORMAL,
    temperature = 0.7,
    agentId?: string,
    timeout?: number,
  ): Promise<Record<string, unknown>> {
    const task = new DirectorTask({
      id: crypto.randomUUID(),
      type: "llm_json",
      priority,
      data: { prompt, temperature, timeout },
      created_at: new Date(),
    });

    return this._submit(task, agentId) as Promise<Record<string, unknown>>;
  }

  private _submit(task: DirectorTask, agentId?: string): Promise<string | Record<string, unknown>> {
    if (this._queue.length >= this._maxQueueSize) {
      if (task.priority <= TaskPriority.LOW) {
        this._stats.totalDropped++;
        log.warn({ taskId: task.id, priority: task.priority }, "Queue full, dropping low-priority task");
        return Promise.reject(new Error("Queue full — low priority task dropped"));
      }
      this._evictLowest();
    }

    return new Promise((resolve, reject) => {
      this._queue.push({ task, agentId, resolve, reject });
      this._queue.sort((a, b) => b.task.priority - a.task.priority);
      this._processNext();
    });
  }

  private _evictLowest(): void {
    for (let i = this._queue.length - 1; i >= 0; i--) {
      const item = this._queue[i]!;
      if (item.task.priority <= TaskPriority.LOW) {
        this._queue.splice(i, 1);
        item.reject(new Error("Evicted by higher priority task"));
        this._stats.totalDropped++;
        log.debug({ taskId: item.task.id }, "Evicted low-priority task from queue");
        return;
      }
    }
  }

  private async _processNext(): Promise<void> {
    if (this._paused || this._running >= this._maxConcurrent || this._queue.length === 0) return;

    const item = this._queue.shift();
    if (!item) return;

    if (this._rateLimiter) {
      await this._rateLimiter.acquire();
    }

    this._running++;
    try {
      const { task, agentId, resolve, reject } = item;
      try {
        const llm = agentId ? this.getAgentClient(agentId) : this._llm;
        let result: string | Record<string, unknown>;
        if (task.type === "llm_text") {
          result = await llm.generateText(
            task.data.prompt as string,
            { temperature: task.data.temperature as number, timeout: task.data.timeout as number | undefined },
          );
        } else {
          result = await llm.generateJson(
            task.data.prompt as string,
            { temperature: task.data.temperature as number, timeout: task.data.timeout as number | undefined },
          );
        }
        this._rateLimiter?.recordSuccess();
        this._stats.totalProcessed++;
        resolve(result);
      } catch (err) {
        this._stats.totalErrors++;
        reject(err);
      }
    } finally {
      this._running--;
      this._processNext();
    }
  }
}
