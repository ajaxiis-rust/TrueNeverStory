/**
 * Batched embedding request queue.
 * Replaces world_core/memory/embedding_queue.ts.
 */

import type { LLMClient } from "../lib/llm-client";
import { getLogger } from "../utils/logger";

const log = getLogger("embedding-queue");

interface QueueItem {
  text: string;
  resolve: (embedding: number[]) => void;
  reject: (err: unknown) => void;
}

export class EmbeddingQueue {
  private _llm: LLMClient;
  private _batchSize: number;
  private _flushInterval: number;
  private _embeddingDim: number;
  private _queue: QueueItem[] = [];
  private _running = false;
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(llm: LLMClient, batchSize = 50, flushIntervalMs = 5000, embeddingDim = 384) {
    this._llm = llm;
    this._batchSize = batchSize;
    this._flushInterval = flushIntervalMs;
    this._embeddingDim = embeddingDim;
  }

  async start(): Promise<void> {
    this._running = true;
    this._timer = setInterval(() => this._tick(), this._flushInterval);
  }

  async stop(): Promise<void> {
    this._running = false;
    if (this._timer) clearInterval(this._timer);
    await this._flush();
  }

  embed(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this._queue.push({ text, resolve, reject });
      if (this._queue.length >= this._batchSize) {
        this._flush();
      }
    });
  }

  private _generateFallback(text: string): number[] {
    // Deterministic hash-based embedding fallback
    const embedding: number[] = [];
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < this._embeddingDim; i++) {
      hash = ((hash << 13) ^ hash) | 0;
      embedding.push(((hash & 0x7fffffff) / 0x7fffffff) * 2 - 1);
    }
    return embedding;
  }

  private async _flush(): Promise<void> {
    if (this._queue.length === 0) return;
    const batch = this._queue.splice(0, this._batchSize);
    const texts = batch.map((q) => q.text);

    try {
      // Try batch embedding via LLM
      const embeddings: number[][] = [];
      for (const text of texts) {
        const emb = await this._llm.generateEmbedding(text);
        embeddings.push(emb.length > 0 ? emb : this._generateFallback(text));
      }
      for (let i = 0; i < batch.length; i++) {
        batch[i]!.resolve(embeddings[i]!);
      }
    } catch (err) {
      log.warn({ err }, "Embedding API failed, using fallback");
      for (const item of batch) {
        item.resolve(this._generateFallback(item.text));
      }
    }
  }

  private async _tick(): Promise<void> {
    if (this._running && this._queue.length > 0) {
      await this._flush();
    }
  }

  get queueSize(): number {
    return this._queue.length;
  }
}
