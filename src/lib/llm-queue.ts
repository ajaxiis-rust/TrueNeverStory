/**
 * Global LLM Queue for prioritized request handling.
 * Supports agent-specific LLM clients with provider routing.
 */

import { LLMClient, type LLMClientOptions } from "./llm-client";
import { TaskPriority, DirectorTask } from "../models/director";
import { getLogger } from "../utils/logger";

const log = getLogger("llm-queue");

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
  private _running = 0;
  private _queue: QueuedTask[] = [];
  private _processing = false;
  private _paused = false;

  constructor(llm: LLMClient, maxConcurrent = 3) {
    this._llm = llm;
    this._maxConcurrent = maxConcurrent;
  }

  getAgentClient(agentId: string, options?: LLMClientOptions): LLMClient {
    if (!this._agentClients.has(agentId)) {
      this._agentClients.set(agentId, new LLMClient({ ...options, agentId }));
    }
    return this._agentClients.get(agentId)!;
  }

  async start(): Promise<void> {
    this._processing = true;
  }

  async stop(): Promise<void> {
    this._processing = false;
    // Wait max 3 seconds for running tasks
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
    return new Promise((resolve, reject) => {
      this._queue.push({ task, agentId, resolve, reject });
      this._queue.sort((a, b) => b.task.priority - a.task.priority);
      this._processNext();
    });
  }

  private async _processNext(): Promise<void> {
    if (this._paused || this._running >= this._maxConcurrent || this._queue.length === 0) return;

    const item = this._queue.shift();
    if (!item) return;

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
        resolve(result);
      } catch (err) {
        reject(err);
      }
    } finally {
      this._running--;
      this._processNext();
    }
  }
}


