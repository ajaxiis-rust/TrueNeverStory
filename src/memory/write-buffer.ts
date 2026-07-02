/**
 * Write-behind buffer for asynchronous batch persistence.
 * Replaces world_core/memory/write_buffer.ts.
 */

import { getLogger } from "../utils/logger";

const log = getLogger("write-buffer");

export class WriteBehindBuffer<T> {
  private _buffer: T[] = [];
  private _flushInterval: number;
  private _maxSize: number;
  private _running = false;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _flushCallback: ((items: T[]) => Promise<void>) | null = null;
  private _stats = { flushCount: 0, totalFlushed: 0 };

  constructor(flushIntervalMs = 5000, maxSize = 100) {
    this._flushInterval = flushIntervalMs;
    this._maxSize = maxSize;
  }

  async start(flushCallback: (items: T[]) => Promise<void>): Promise<void> {
    this._flushCallback = flushCallback;
    this._running = true;
    this._timer = setInterval(() => this._tick(), this._flushInterval);
    log.info("WriteBehindBuffer started");
  }

  async stop(): Promise<void> {
    this._running = false;
    if (this._timer) clearInterval(this._timer);
    await this.flushNow();
    log.info("WriteBehindBuffer stopped");
  }

  async append(data: T): Promise<void> {
    this._buffer.push(data);
    if (this._buffer.length >= this._maxSize) {
      await this.flushNow();
    }
  }

  async flushNow(): Promise<void> {
    if (this._buffer.length === 0 || !this._flushCallback) return;
    const batch = this._buffer.splice(0);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this._flushCallback(batch);
        this._stats.flushCount++;
        this._stats.totalFlushed += batch.length;
        return;
      } catch (err) {
        log.error({ err, attempt }, "Flush failed");
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    log.error({ count: batch.length }, "Dropping items after 3 flush failures");
  }

  private async _tick(): Promise<void> {
    if (this._running && this._buffer.length > 0) {
      await this.flushNow();
    }
  }

  get bufferSize(): number {
    return this._buffer.length;
  }

  get stats() {
    return { ...this._stats, currentBufferSize: this._buffer.length };
  }
}
