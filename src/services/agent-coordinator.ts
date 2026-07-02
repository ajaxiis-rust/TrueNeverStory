/**
 * AgentCoordinator — priority queue for director task execution.
 * Replaces world_director/agent_coordinator.py.
 */

import { DirectorTask, TaskPriority } from "../models/director";
import { getLogger } from "../utils/logger";

const log = getLogger("agent-coordinator");

type TaskHandler = (task: DirectorTask) => Promise<unknown>;

export class AgentCoordinator {
  private _maxConcurrent: number;
  private _queue: Array<{ priority: number; timestamp: number; task: DirectorTask }> = [];
  private _handlers = new Map<string, TaskHandler>();
  private _running = false;
  private _activeCount = 0;
  private _drainTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxConcurrentTasks = 5) {
    this._maxConcurrent = maxConcurrentTasks;
  }

  registerHandler(taskType: string, handler: TaskHandler): void {
    this._handlers.set(taskType, handler);
  }

  async submit(task: DirectorTask): Promise<void> {
    const entry = {
      priority: task.priority,
      timestamp: task.createdAt.getTime(),
      task,
    };

    // Insert maintaining priority order (lower priority value = higher priority)
    let inserted = false;
    for (let i = 0; i < this._queue.length; i++) {
      const existing = this._queue[i]!;
      if (
        entry.priority < existing.priority ||
        (entry.priority === existing.priority && entry.timestamp < existing.timestamp)
      ) {
        this._queue.splice(i, 0, entry);
        inserted = true;
        break;
      }
    }
    if (!inserted) this._queue.push(entry);

    log.debug({ taskId: task.id, type: task.type, priority: task.priority }, "Submitted task");
    this._drain();
  }

  async submitAndWait(task: DirectorTask, timeoutMs = 30_000): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task ${task.id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const originalHandler = this._handlers.get(task.type);
      const wrapped: TaskHandler = async (t) => {
        try {
          const result = await (originalHandler?.(t) ?? Promise.resolve(null));
          clearTimeout(timer);
          resolve(result);
        } catch (err) {
          clearTimeout(timer);
          reject(err);
        } finally {
          if (originalHandler) this._handlers.set(task.type, originalHandler);
          else this._handlers.delete(task.type);
        }
      };

      this._handlers.set(task.type, wrapped);
      this.submit(task);
    });
  }

  private _drain(): void {
    if (!this._running) return;
    while (this._activeCount < this._maxConcurrent && this._queue.length > 0) {
      const entry = this._queue.shift()!;
      this._activeCount++;
      this._execute(entry.task)
        .catch((err) => log.error({ err, taskId: entry.task.id }, "Task execution failed"))
        .finally(() => {
          this._activeCount--;
          this._drain();
        });
    }
  }

  private async _execute(task: DirectorTask): Promise<void> {
    const handler = this._handlers.get(task.type);
    if (!handler) {
      log.error("No handler for task type %s", task.type);
      return;
    }
    await handler(task);
    log.info({ taskId: task.id, type: task.type }, "Completed task");
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    log.info({ max: this._maxConcurrent }, "Agent coordinator started");
  }

  stop(): void {
    this._running = false;
    if (this._drainTimer) {
      clearInterval(this._drainTimer);
      this._drainTimer = null;
    }
    this._queue.length = 0;
    log.info("Agent coordinator stopped");
  }

  get pendingCount(): number {
    return this._queue.length;
  }

  get activeCount(): number {
    return this._activeCount;
  }

  async executePipeline(
    steps: Array<{ agentId: string; priority: number; execute: () => Promise<string> }>,
  ): Promise<string[]> {
    const sorted = [...steps].sort((a, b) => b.priority - a.priority);
    const results: string[] = [];

    for (const step of sorted) {
      try {
        const result = await step.execute();
        results.push(result);
        log.debug({ agentId: step.agentId }, "Pipeline step completed");
      } catch (err) {
        log.error({ err, agentId: step.agentId }, "Pipeline step failed");
        results.push("");
      }
    }

    return results;
  }
}
