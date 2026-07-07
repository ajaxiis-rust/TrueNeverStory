/**
 * ProviderRateLimiter — per-provider rate limiting with round-robin API key rotation.
 *
 * Each provider (gemini, openai, ollama, etc.) gets its own rate limiter.
 * Multiple API keys for one provider are rotated round-robin style.
 * When a key hits its limit, the next key is used.
 * When all keys are exhausted, the task waits for the key with the earliest recovery.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("provider-rate-limiter");

export interface ProviderConfig {
  keys: string[];
  rpm: number;
  minIntervalMs: number;
  models: string[];
}

export interface ProviderRateLimitConfig {
  providers: Record<string, ProviderConfig>;
  fallbackProvider: string;
}

interface KeyState {
  key: string;
  requestCount: number;
  lastResetTime: number;
  lastRequestTime: number;
  unavailableUntil: number;
}

interface ProviderState {
  config: ProviderConfig;
  keys: KeyState[];
  currentIndex: number;
}

export class ProviderRateLimiter {
  private _providers: Map<string, ProviderState> = new Map();
  private _fallbackProvider: string;
  private _configPath: string;

  constructor(configPath?: string) {
    this._configPath = configPath ?? join(process.cwd(), "conf", "provider-rate-limits.json");
    this._fallbackProvider = "ollama";
    this._load();
  }

  private _load(): void {
    if (!existsSync(this._configPath)) {
      log.warn("Provider rate limit config not found, using defaults");
      this._createDefault();
      return;
    }

    try {
      const data = JSON.parse(readFileSync(this._configPath, "utf-8")) as ProviderRateLimitConfig;
      this._fallbackProvider = data.fallbackProvider ?? "ollama";

      for (const [providerId, config] of Object.entries(data.providers ?? {})) {
        this._providers.set(providerId, {
          config,
          keys: config.keys.map((key) => ({
            key,
            requestCount: 0,
            lastResetTime: Date.now(),
            lastRequestTime: 0,
            unavailableUntil: 0,
          })),
          currentIndex: 0,
        });
      }

      log.info({ providers: Array.from(this._providers.keys()), fallback: this._fallbackProvider }, "Provider rate limiter loaded");
    } catch (err) {
      log.warn({ err }, "Failed to load provider rate limit config, using defaults");
      this._createDefault();
    }
  }

  private _createDefault(): void {
    this._providers.set("ollama", {
      config: { keys: [], rpm: 999, minIntervalMs: 0, models: [] },
      keys: [{ key: "local", requestCount: 0, lastResetTime: Date.now(), lastRequestTime: 0, unavailableUntil: 0 }],
      currentIndex: 0,
    });
    this._fallbackProvider = "ollama";
  }

  /**
   * Reload config from file (hot reload).
   */
  reload(): void {
    this._providers.clear();
    this._load();
  }

  /**
   * Get the next available API key for a provider.
   * Round-robin rotation with rate limit awareness.
   * Returns null if all keys are exhausted (caller should fallback).
   */
  acquireKey(providerId: string): string | null {
    const state = this._providers.get(providerId);
    if (!state) return null;

    const now = Date.now();

    // Reset counters if minute has passed
    for (const ks of state.keys) {
      if (now - ks.lastResetTime > 60_000) {
        ks.requestCount = 0;
        ks.lastResetTime = now;
      }
    }

    // Find next available key (round-robin)
    const totalKeys = state.keys.length;
    for (let i = 0; i < totalKeys; i++) {
      const idx = (state.currentIndex + i) % totalKeys;
      const ks = state.keys[idx]!;

      // Check if key is temporarily unavailable
      if (ks.unavailableUntil > now) continue;

      // Check RPM limit
      if (ks.requestCount >= state.config.rpm) continue;

      // Check min interval
      const timeSinceLastRequest = now - ks.lastRequestTime;
      if (timeSinceLastRequest < state.config.minIntervalMs) continue;

      // Key is available
      state.currentIndex = (idx + 1) % totalKeys;
      ks.requestCount++;
      ks.lastRequestTime = now;
      return ks.key;
    }

    // All keys exhausted — find the one with earliest recovery
    let earliestRecovery = Infinity;
    let bestKey: KeyState | null = null;

    for (const ks of state.keys) {
      let recoveryTime = ks.unavailableUntil;

      // If not unavailable but RPM limited, calculate when RPM resets
      if (recoveryTime <= now && ks.requestCount >= state.config.rpm) {
        recoveryTime = ks.lastResetTime + 60_000;
      }

      // If min interval not met
      if (recoveryTime <= now) {
        const intervalRecovery = ks.lastRequestTime + state.config.minIntervalMs;
        if (intervalRecovery > recoveryTime) {
          recoveryTime = intervalRecovery;
        }
      }

      if (recoveryTime < earliestRecovery) {
        earliestRecovery = recoveryTime;
        bestKey = ks;
      }
    }

    if (bestKey && earliestRecovery < now + 60_000) {
      // Wait for recovery
      const waitMs = earliestRecovery - now;
      log.debug({ providerId, waitMs }, "All keys exhausted, waiting for recovery");
      // Return the key but caller should wait
      return bestKey.key;
    }

    return null;
  }

  /**
   * Mark a key as temporarily unavailable (e.g., after 429 error).
   */
  markUnavailable(providerId: string, key: string, retryAfterMs: number): void {
    const state = this._providers.get(providerId);
    if (!state) return;

    const ks = state.keys.find((k) => k.key === key);
    if (ks) {
      ks.unavailableUntil = Date.now() + retryAfterMs;
      log.warn({ providerId, key: key.slice(0, 10) + "...", retryAfterMs }, "Key marked unavailable");
    }
  }

  /**
   * Get the time to wait before the next request for a provider.
   * Returns 0 if a key is immediately available.
   */
  getWaitTime(providerId: string): number {
    const state = this._providers.get(providerId);
    if (!state) return 0;

    const now = Date.now();
    let minWait = 0;

    for (const ks of state.keys) {
      if (ks.unavailableUntil > now) {
        const wait = ks.unavailableUntil - now;
        if (minWait === 0 || wait < minWait) minWait = wait;
        continue;
      }

      if (ks.requestCount >= state.config.rpm) {
        const wait = ks.lastResetTime + 60_000 - now;
        if (wait > 0 && (minWait === 0 || wait < minWait)) minWait = wait;
        continue;
      }

      const timeSinceLastRequest = now - ks.lastRequestTime;
      if (timeSinceLastRequest < state.config.minIntervalMs) {
        const wait = state.config.minIntervalMs - timeSinceLastRequest;
        if (minWait === 0 || wait < minWait) minWait = wait;
      }
    }

    return minWait;
  }

  /**
   * Get current status of all providers.
   */
  getStatus(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const now = Date.now();

    for (const [providerId, state] of this._providers) {
      const keys = state.keys.map((ks) => ({
        key: ks.key.slice(0, 10) + "...",
        requestCount: ks.requestCount,
        rpm: state.config.rpm,
        available: ks.unavailableUntil <= now && ks.requestCount < state.config.rpm,
        unavailableUntil: ks.unavailableUntil > now ? new Date(ks.unavailableUntil).toISOString() : null,
      }));

      result[providerId] = {
        keys,
        rpm: state.config.rpm,
        minIntervalMs: state.config.minIntervalMs,
        models: state.config.models,
        waitTimeMs: this.getWaitTime(providerId),
      };
    }

    return {
      providers: result,
      fallbackProvider: this._fallbackProvider,
    };
  }

  /**
   * Get the fallback provider ID.
   */
  get fallbackProvider(): string {
    return this._fallbackProvider;
  }

  /**
   * Get config for a specific provider.
   */
  getProviderConfig(providerId: string): ProviderConfig | undefined {
    return this._providers.get(providerId)?.config;
  }

  /**
   * Get all provider IDs.
   */
  getProviderIds(): string[] {
    return Array.from(this._providers.keys());
  }

  /**
   * Reset all counters for a provider.
   */
  resetProvider(providerId: string): void {
    const state = this._providers.get(providerId);
    if (!state) return;

    const now = Date.now();
    for (const ks of state.keys) {
      ks.requestCount = 0;
      ks.lastResetTime = now;
      ks.unavailableUntil = 0;
    }

    log.info({ providerId }, "Provider counters reset");
  }

  /**
   * Reset all providers.
   */
  resetAll(): void {
    for (const providerId of this._providers.keys()) {
      this.resetProvider(providerId);
    }
  }
}
