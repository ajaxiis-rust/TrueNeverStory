/**
 * TrueNeverStory — Advanced LLM client with provider support and response caching.
 * Supports multiple LLM providers with per-agent model assignment.
 */

import { getConfig } from "../config/env";
import { getSettings } from "../services/settings";
import { sha256Short } from "../utils/hash";
import { getLogger } from "../utils/logger";
import { getProviderManager, type LLMProvider } from "./providers";
import { loadAgentConfig } from "../services/agent-config";
import { parseJsonWithRetry } from "./json-retry";

const log = getLogger("llm-client");

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

class LRUCache {
  private _cache: Map<string, CacheEntry> = new Map();
  private _maxSize: number;
  private _hits = 0;
  private _misses = 0;

  constructor(maxSize = 256) {
    this._maxSize = maxSize;
  }

  get(key: string): unknown | null {
    const entry = this._cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      this._hits++;
      this._cache.delete(key);
      this._cache.set(key, entry);
      return entry.value;
    }
    this._misses++;
    return null;
  }

  put(key: string, value: unknown, ttlMs = 5 * 60 * 1000): void {
    this._cache.delete(key);
    this._cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this._cache.size > this._maxSize) {
      const first = this._cache.keys().next().value;
      if (first) this._cache.delete(first);
    }
  }

  get stats() {
    return { hits: this._hits, misses: this._misses, size: this._cache.size };
  }
}

export interface LLMClientOptions {
  agentId?: string;
  providerId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class LLMClient {
  private _cache = new LRUCache(256);
  private _agentId?: string;
  private _providerId?: string;
  private _model?: string;
  private _temperature?: number;
  private _maxTokens?: number;
  private _fallbackBaseUrl: string;
  private _fallbackApiKey: string;
  private _fallbackModel: string;
  private _maxRetries: number;

  constructor(options?: LLMClientOptions) {
    const cfg = getConfig();
    const s = getSettings();

    this._agentId = options?.agentId;
    this._providerId = options?.providerId;
    this._model = options?.model;
    this._temperature = options?.temperature;
    this._maxTokens = options?.maxTokens;

    this._fallbackBaseUrl = s.llmBaseUrl || cfg.WORLD_LLM_BASE_URL;
    this._fallbackApiKey = s.llmApiKey || cfg.WORLD_LLM_API_KEY;
    this._fallbackModel = s.llmModel || cfg.WORLD_LLM_MODEL;
    this._maxRetries = s.llmMaxRetries || cfg.WORLD_LLM_MAX_RETRIES;
  }

  private async _getProvider(): Promise<LLMProvider | undefined> {
    const manager = await getProviderManager();

    // Try agent-specific provider first (read from config file each time)
    if (this._agentId) {
      const agentCfg = loadAgentConfig(this._agentId);
      if (agentCfg.providerId) {
        const provider = manager.getProvider(agentCfg.providerId);
        if (provider) return provider;
      }
    }

    // Try explicit provider
    if (this._providerId) {
      const provider = manager.getProvider(this._providerId);
      if (provider) return provider;
    }

    // Fallback to default
    return manager.getDefaultProvider();
  }

  private _getModel(provider?: LLMProvider): string {
    if (this._model) return this._model;

    // Read from agent config file
    if (this._agentId) {
      const agentCfg = loadAgentConfig(this._agentId);
      if (agentCfg.modelId) return agentCfg.modelId;
    }

    if (provider?.defaultModel) {
      return provider.defaultModel;
    }

    return this._fallbackModel;
  }

  private _getTemperature(): number {
    if (this._temperature !== undefined) return this._temperature;
    // Read from agent config file
    if (this._agentId) {
      const agentCfg = loadAgentConfig(this._agentId);
      if (agentCfg.temperature) return agentCfg.temperature;
    }
    return getSettings().llmTemperature || getConfig().WORLD_LLM_TEMPERATURE;
  }

  private _getMaxTokens(): number {
    if (this._maxTokens !== undefined) return this._maxTokens;
    // Read from agent config file
    if (this._agentId) {
      const agentCfg = loadAgentConfig(this._agentId);
      if (agentCfg.maxTokens) return agentCfg.maxTokens;
    }
    return getSettings().llmMaxTokens || getConfig().WORLD_LLM_MAX_TOKENS;
  }

  async generateText(
    prompt: string,
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean; systemPrompt?: string; timeout?: number } = {},
  ): Promise<string> {
    const provider = await this._getProvider();
    const temp = options.temperature ?? this._getTemperature();
    const maxTok = options.maxTokens ?? this._getMaxTokens();
    const model = this._getModel(provider);

    const cacheKey = await sha256Short(`${model}|${temp}|${options.jsonMode ?? false}|${prompt}`);
    const cached = this._cache.get(cacheKey);
    if (cached !== null) return cached as string;

    // Use provider if available
    if (provider) {
      try {
        const result = await provider.generateText(prompt, {
          temperature: temp,
          maxTokens: maxTok,
          jsonMode: options.jsonMode,
          systemPrompt: options.systemPrompt,
          timeout: options.timeout,
        });

        this._cache.put(cacheKey, result);
        return result;
      } catch (err) {
        log.warn({ provider: provider.id, err }, "Provider failed, falling back to direct");
      }
    }

    // Fallback to direct API call
    return this._generateTextDirect(prompt, { temperature: temp, maxTokens: maxTok, jsonMode: options.jsonMode, timeout: options.timeout });
  }

  async *generateTextStream(
    prompt: string,
    options: { temperature?: number; maxTokens?: number; systemPrompt?: string } = {},
  ): AsyncGenerator<string> {
    const provider = await this._getProvider();
    const temp = options.temperature ?? this._getTemperature();
    const maxTok = options.maxTokens ?? this._getMaxTokens();

    if (provider?.generateTextStream) {
      yield* provider.generateTextStream(prompt, {
        temperature: temp,
        maxTokens: maxTok,
        systemPrompt: options.systemPrompt,
      });
      return;
    }

    // Fallback: non-streaming, yield full text at once
    const text = await this.generateText(prompt, options);
    yield text;
  }

  private async _generateTextDirect(
    prompt: string,
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean; timeout?: number },
  ): Promise<string> {
    const temp = options.temperature ?? this._getTemperature();
    const maxTok = options.maxTokens ?? this._getMaxTokens();

    const body: Record<string, unknown> = {
      model: this._model || this._fallbackModel,
      messages: [
        { role: "system", content: "Respond only in English." },
        { role: "user", content: prompt },
      ],
      temperature: temp,
      max_tokens: maxTok,
    };
    if (options.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), (options.timeout ?? 300) * 1000);

        const res = await fetch(`${this._fallbackBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this._fallbackApiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`LLM API error ${res.status}: ${text}`);
        }

        const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content ?? "";
        const cacheKey = await sha256Short(`${this._fallbackModel}|${temp}|${options.jsonMode ?? false}|${prompt}`);
        this._cache.put(cacheKey, content);
        return content;
      } catch (err) {
        if (attempt === this._maxRetries) throw err;
        const delay = Math.min(1000 * 2 ** attempt, 10000);
        log.warn({ attempt, delay, err }, "LLM request failed, retrying");
        await Bun.sleep(delay);
      }
    }

    throw new Error("LLM request failed after max retries");
  }

  async generateJson(
    prompt: string,
    options: { temperature?: number; maxTokens?: number; timeout?: number } = {},
  ): Promise<Record<string, unknown>> {
    const text = await this.generateText(prompt, { ...options, jsonMode: true });

    // Use retry-capable parser: if JSON parse fails, re-prompt with stricter instructions
    const retryGenerateText = async (retryPrompt: string): Promise<string> => {
      return this.generateText(retryPrompt, { ...options, jsonMode: true });
    };

    return parseJsonWithRetry(text, retryGenerateText, prompt, 2);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const provider = await this._getProvider();

    // Try provider embedding
    if (provider && provider.isAvailable) {
      try {
        return await provider.generateEmbedding(text);
      } catch {
        // Fall through to direct
      }
    }

    // Direct embedding API call
    const cfg = getConfig();
    const s = getSettings();
    const baseUrl = cfg.WORLD_EMBEDDING_BASE_URL || this._fallbackBaseUrl;
    const model = cfg.WORLD_EMBEDDING_MODEL;
    const apiKey = cfg.WORLD_EMBEDDING_API_KEY || this._fallbackApiKey;

    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: text }),
    });

    if (!res.ok) {
      throw new Error(`Embedding API error ${res.status}`);
    }

    const data = await res.json() as { data?: Array<{ embedding?: number[] }> };
    return data.data?.[0]?.embedding ?? [];
  }

  get cacheStats() {
    return this._cache.stats;
  }
}
