/**
 * Google Gemini LLM Provider.
 * Uses the OpenAI-compatible endpoint at generativelanguage.googleapis.com.
 * Supports API key authentication with multiple keys.
 */

import type { LLMProvider, LLMProviderConfig, LLMRequestOptions, ProviderKey } from "./llm-provider";
import type { ProviderRateLimiter } from "../provider-rate-limiter";
import { getLogger } from "../../utils/logger";

const log = getLogger("google-provider");

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface ModelListResponse {
  data?: Array<{ id?: string; object?: string }>;
}

const GOOGLE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

export class GoogleProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "google";

  private _config: LLMProviderConfig;
  private _available = false;
  private _currentKeyIndex = 0;
  private _rateLimiter: ProviderRateLimiter | null = null;

  constructor(config: LLMProviderConfig, rateLimiter?: ProviderRateLimiter) {
    this.id = config.id;
    this.name = config.name;
    this._config = config;
    this._rateLimiter = rateLimiter ?? null;

    if (!this._config.keys) {
      this._config.keys = [];
      if (config.apiKey) {
        this._config.keys.push({
          id: `${config.id}-default`,
          label: "Default",
          apiKey: config.apiKey,
          isDefault: true,
        });
      }
    }

    if (this._config.models.length === 0) {
      this._config.models = [...GOOGLE_MODELS];
    }
  }

  get isAvailable(): boolean {
    return this._available && this._config.enabled;
  }

  get defaultModel(): string {
    return this._config.defaultModel || "gemini-2.0-flash";
  }

  get keys(): ProviderKey[] {
    return this._config.keys ?? [];
  }

  private _getNextKey(): ProviderKey | undefined {
    const keys = this._config.keys ?? [];
    if (keys.length === 0) return undefined;
    const key = keys[this._currentKeyIndex % keys.length];
    this._currentKeyIndex = (this._currentKeyIndex + 1) % keys.length;
    return key;
  }

  private _getApiKey(): string {
    // If rate limiter is available, use it to get the next key
    if (this._rateLimiter) {
      const key = this._rateLimiter.acquireKey(this.id);
      if (key) return key;
    }
    // Fallback to local round-robin
    const key = this._getNextKey();
    return key?.apiKey ?? this._config.apiKey ?? "";
  }

  private get _baseUrl(): string {
    return this._config.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai";
  }

  private get _model(): string {
    return this._config.defaultModel || "gemini-2.0-flash";
  }

  async generateText(prompt: string, options: LLMRequestOptions = {}): Promise<string> {
    const apiKey = this._getApiKey();
    const body: Record<string, unknown> = {
      model: this._model,
      messages: [
        ...(options.systemPrompt ? [{ role: "user", content: options.systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      temperature: options.temperature ?? this._config.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? this._config.maxTokens ?? 8192,
    };

    if (options.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this._baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout((options?.timeout ?? this._config.timeout ?? 300) * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      // Mark key as unavailable on rate limit
      if (response.status === 429 && this._rateLimiter) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "60", 10);
        this._rateLimiter.markUnavailable(this.id, apiKey, retryAfter * 1000);
      }
      throw new Error(`Google Gemini API error ${response.status}: ${text}`);
    }

    const data = await response.json() as ChatCompletionResponse;
    return data.choices?.[0]?.message?.content ?? "";
  }

  async generateJson(prompt: string, options: LLMRequestOptions = {}): Promise<Record<string, unknown>> {
    const text = await this.generateText(prompt, { ...options, jsonMode: true });
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match?.[1]) {
        return JSON.parse(match[1].trim()) as Record<string, unknown>;
      }
      throw new Error("Failed to parse JSON from Google Gemini response");
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const apiKey = this._getApiKey();
    const model = this._config.models.find(m => m.includes("embedding")) ?? "text-embedding-004";
    const response = await fetch(`${this._baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Google embedding API error ${response.status}`);
    }

    const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
    return data.data?.[0]?.embedding ?? [];
  }

  async listModels(): Promise<string[]> {
    try {
      const apiKey = this._getApiKey();
      const response = await fetch(`${this._baseUrl}/models`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return this._config.models;

      const data = await response.json() as ModelListResponse;
      const models = (data.data ?? [])
        .map((m) => m.id ?? "")
        .filter((id) => id.includes("gemini") || id.includes("gemma"))
        .map((id) => id.startsWith("models/") ? id.slice(7) : id);

      return models.length > 0 ? models : this._config.models;
    } catch {
      return this._config.models;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const apiKey = this._getApiKey();
      const response = await fetch(`${this._baseUrl}/models`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      });
      this._available = response.ok;
      return response.ok;
    } catch {
      this._available = false;
      return false;
    }
  }

  updateConfig(config: Partial<LLMProviderConfig>): void {
    this._config = { ...this._config, ...config };
  }

  addKey(key: ProviderKey): void {
    if (!this._config.keys) this._config.keys = [];
    this._config.keys.push(key);
  }

  removeKey(keyId: string): boolean {
    if (!this._config.keys) return false;
    const idx = this._config.keys.findIndex(k => k.id === keyId);
    if (idx < 0) return false;
    this._config.keys.splice(idx, 1);
    return true;
  }

  async *generateTextStream(prompt: string, options: LLMRequestOptions = {}): AsyncGenerator<string> {
    const apiKey = this._getApiKey();
    const body: Record<string, unknown> = {
      model: this._model,
      messages: [
        ...(options.systemPrompt ? [{ role: "user", content: options.systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      temperature: options.temperature ?? this._config.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? this._config.maxTokens ?? 8192,
      stream: true,
    };

    const response = await fetch(`${this._baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout((options?.timeout ?? this._config.timeout ?? 300) * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Gemini API error ${response.status}: ${text}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch (e) { log.debug({ err: e }, "Failed to parse SSE chunk"); }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
