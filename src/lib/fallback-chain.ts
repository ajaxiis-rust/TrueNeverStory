/**
 * Fallback Chain — tries multiple LLM providers in priority order with circuit breakers.
 * When primary provider fails, automatically falls back to next available provider.
 */

import { CircuitBreaker, CircuitOpenError, type CircuitBreakerConfig } from "./circuit-breaker";
import type { LLMProvider, LLMRequestOptions } from "./providers/llm-provider";
import { getLogger } from "../utils/logger";

const log = getLogger("fallback-chain");

export interface FallbackChainConfig {
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  maxRetriesPerProvider?: number;
}

interface ProviderEntry {
  id: string;
  provider: LLMProvider;
  circuitBreaker: CircuitBreaker;
  priority: number;
  enabled: boolean;
}

export class FallbackChain {
  private _providers: ProviderEntry[] = [];
  private _config: FallbackChainConfig;

  constructor(config?: FallbackChainConfig) {
    this._config = config ?? {};
  }

  addProvider(provider: LLMProvider, priority: number = 0): void {
    const existing = this._providers.find((e) => e.id === provider.id);
    if (existing) {
      existing.priority = priority;
      existing.enabled = true;
      return;
    }

    const entry: ProviderEntry = {
      id: provider.id,
      provider,
      circuitBreaker: new CircuitBreaker(provider.id, this._config.circuitBreaker),
      priority,
      enabled: true,
    };

    this._providers.push(entry);
    this._providers.sort((a, b) => b.priority - a.priority);

    log.info({ id: provider.id, priority }, "Provider added to fallback chain");
  }

  removeProvider(id: string): boolean {
    const idx = this._providers.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this._providers.splice(idx, 1);
    log.info({ id }, "Provider removed from fallback chain");
    return true;
  }

  enableProvider(id: string): void {
    const entry = this._providers.find((e) => e.id === id);
    if (entry) entry.enabled = true;
  }

  disableProvider(id: string): void {
    const entry = this._providers.find((e) => e.id === id);
    if (entry) entry.enabled = false;
  }

  getProvider(id: string): LLMProvider | undefined {
    return this._providers.find((e) => e.id === id)?.provider;
  }

  getAvailableProviders(): LLMProvider[] {
    return this._providers
      .filter((e) => e.enabled && e.circuitBreaker.canExecute())
      .map((e) => e.provider);
  }

  getStats() {
    return this._providers.map((e) => ({
      id: e.id,
      priority: e.priority,
      enabled: e.enabled,
      available: e.circuitBreaker.canExecute(),
      circuitState: e.circuitBreaker.stats.state,
      failures: e.circuitBreaker.stats.failures,
    }));
  }

  async generateText(
    prompt: string,
    options?: LLMRequestOptions,
  ): Promise<{ result: string; provider: string }> {
    const errors: Array<{ provider: string; error: unknown }> = [];

    for (const entry of this._providers) {
      if (!entry.enabled) continue;
      if (!entry.circuitBreaker.canExecute()) {
        log.debug({ id: entry.id }, "Skipping provider (circuit open)");
        continue;
      }

      try {
        const result = await entry.circuitBreaker.execute(() =>
          entry.provider.generateText(prompt, options),
        );
        log.info({ id: entry.id, promptLen: prompt.length }, "Fallback chain: success");
        return { result, provider: entry.id };
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          log.debug({ id: entry.id }, "Circuit open, trying next provider");
          continue;
        }
        log.warn({ id: entry.id, err }, "Provider failed in fallback chain");
        errors.push({ provider: entry.id, error: err });
      }
    }

    const providerList = errors.map((e) => e.provider).join(", ");
    throw new FallbackChainError(
      `All providers failed in fallback chain: ${providerList}`,
      errors,
    );
  }

  async generateJson(
    prompt: string,
    options?: LLMRequestOptions,
  ): Promise<{ result: Record<string, unknown>; provider: string }> {
    const errors: Array<{ provider: string; error: unknown }> = [];

    for (const entry of this._providers) {
      if (!entry.enabled) continue;
      if (!entry.circuitBreaker.canExecute()) continue;

      try {
        const result = await entry.circuitBreaker.execute(() =>
          entry.provider.generateJson(prompt, options),
        );
        return { result, provider: entry.id };
      } catch (err) {
        if (err instanceof CircuitOpenError) continue;
        log.warn({ id: entry.id, err }, "Provider failed in fallback chain (json)");
        errors.push({ provider: entry.id, error: err });
      }
    }

    const providerList = errors.map((e) => e.provider).join(", ");
    throw new FallbackChainError(
      `All providers failed in fallback chain: ${providerList}`,
      errors,
    );
  }
}

export class FallbackChainError extends Error {
  errors: Array<{ provider: string; error: unknown }>;

  constructor(message: string, errors: Array<{ provider: string; error: unknown }>) {
    super(message);
    this.name = "FallbackChainError";
    this.errors = errors;
  }
}
