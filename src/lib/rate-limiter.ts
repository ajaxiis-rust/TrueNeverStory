/**
 * Token Bucket Rate Limiter for LLM API calls.
 * Supports per-provider RPM limits with burst tolerance.
 */

import { getLogger } from "../utils/logger";

const log = getLogger("rate-limiter");

export interface RateLimiterConfig {
  rpm: number;
  burstSize?: number;
}

export class RateLimiter {
  private _rpm: number;
  private _tokens: number;
  private _burstSize: number;
  private _lastRefill: number;
  private _waiters: Array<() => void> = [];
  private _refillTimer: ReturnType<typeof setInterval> | null = null;
  private _429Count = 0;
  private _429Window: number[] = [];
  private _backoffUntil = 0;

  constructor(config: RateLimiterConfig) {
    this._rpm = config.rpm;
    this._burstSize = config.burstSize ?? Math.max(1, Math.floor(config.rpm / 10));
    this._tokens = this._burstSize;
    this._lastRefill = Date.now();
  }

  get rpm(): number { return this._rpm; }
  set rpm(value: number) {
    this._rpm = value;
    this._burstSize = Math.max(1, Math.floor(value / 10));
    this._tokens = Math.min(this._tokens, this._burstSize);
  }

  get availableTokens(): number { return this._tokens; }
  get queueDepth(): number { return this._waiters.length; }

  record429(retryAfterSeconds?: number): void {
    const now = Date.now();
    this._429Count++;
    this._429Window.push(now);

    const windowMs = 60_000;
    this._429Window = this._429Window.filter(t => now - t < windowMs);

    if (this._429Window.length >= 3) {
      const backoffMs = (retryAfterSeconds ?? 60) * 1000;
      this._backoffUntil = now + backoffMs;
      log.warn({ backoffMs, count: this._429Window.length }, "Rate limiter: backing off due to repeated 429s");
    }
  }

  recordSuccess(): void {
    if (this._429Count > 0) this._429Count = Math.max(0, this._429Count - 1);
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    if (now < this._backoffUntil) {
      const waitMs = this._backoffUntil - now;
      log.info({ waitMs: Math.round(waitMs / 1000) }, "Rate limiter: in backoff, waiting");
      await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    }

    this._refill();

    if (this._tokens >= 1) {
      this._tokens--;
      return;
    }

    const waitMs = Math.ceil((1 - this._tokens) * (60_000 / this._rpm));
    log.debug({ waitMs, tokens: this._tokens }, "Rate limiter: waiting for token");
    await new Promise<void>(resolve => {
      this._waiters.push(resolve);
      setTimeout(() => {
        const idx = this._waiters.indexOf(resolve);
        if (idx >= 0) {
          this._waiters.splice(idx, 1);
          resolve();
        }
      }, waitMs + 1000);
    });

    this._refill();
    if (this._tokens >= 1) {
      this._tokens--;
    }
  }

  private _refill(): void {
    const now = Date.now();
    const elapsed = now - this._lastRefill;
    const tokensToAdd = (elapsed / 60_000) * this._rpm;
    this._tokens = Math.min(this._burstSize, this._tokens + tokensToAdd);
    this._lastRefill = now;
  }

  startAutoRefill(intervalMs = 5000): void {
    this._refillTimer = setInterval(() => {
      this._refill();
      while (this._waiters.length > 0 && this._tokens >= 1) {
        this._tokens--;
        const waiter = this._waiters.shift()!;
        waiter();
      }
    }, intervalMs);
  }

  stopAutoRefill(): void {
    if (this._refillTimer) {
      clearInterval(this._refillTimer);
      this._refillTimer = null;
    }
  }

  getStats(): { rpm: number; tokens: number; burstSize: number; waiters: number; backoffUntil: number; recent429s: number } {
    const now = Date.now();
    return {
      rpm: this._rpm,
      tokens: Math.round(this._tokens * 100) / 100,
      burstSize: this._burstSize,
      waiters: this._waiters.length,
      backoffUntil: this._backoffUntil,
      recent429s: this._429Window.filter(t => now - t < 60_000).length,
    };
  }
}
