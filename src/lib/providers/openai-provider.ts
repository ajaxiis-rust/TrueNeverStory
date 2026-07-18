/**
 * OpenAI-compatible LLM Provider.
 * Works with OpenAI, Azure OpenAI, and any OpenAI-compatible API.
 * Supports API key and OAuth authentication with multiple keys.
 */

import type { LLMProvider, LLMProviderConfig, LLMRequestOptions, ProviderKey } from "./llm-provider";
import type { ProviderRateLimiter } from "../provider-rate-limiter";
import { getLogger } from "../../utils/logger";

const log = getLogger("openai-provider");

interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
}

interface ModelListResponse {
  data?: Array<{ id?: string; object?: string; owned_by?: string }>;
}

export class OpenAIProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "openai";

  private _config: LLMProviderConfig;
  private _available = false;
  private _currentKeyIndex = 0;
  private _rateLimiter: ProviderRateLimiter | null = null;

  constructor(config: LLMProviderConfig, rateLimiter?: ProviderRateLimiter) {
    this.id = config.id;
    this.name = config.name;
    this._config = config;
    this._rateLimiter = rateLimiter ?? null;

    // Initialize keys array if not present
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
      if (config.oauth) {
        this._config.keys.push({
          id: `${config.id}-oauth`,
          label: "OAuth",
          oauth: config.oauth,
          isDefault: !config.apiKey,
        });
      }
    }
  }

  get isAvailable(): boolean {
    return this._available && this._config.enabled;
  }

  get defaultModel(): string {
    return this._config.defaultModel;
  }

  get keys(): ProviderKey[] {
    return this._config.keys ?? [];
  }

  private _getNextKey(): ProviderKey | undefined {
    const keys = this._config.keys ?? [];
    if (keys.length === 0) return undefined;

    // Round-robin through keys
    const key = keys[this._currentKeyIndex % keys.length];
    this._currentKeyIndex = (this._currentKeyIndex + 1) % keys.length;
    return key;
  }

  private async _getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // If rate limiter is available, use it to get the next key
    let key: ProviderKey | undefined;
    if (this._rateLimiter) {
      const apiKey = this._rateLimiter.acquireKey(this.id);
      if (apiKey) {
        // Find the key object by API key value
        key = this._config.keys?.find(k => k.apiKey === apiKey);
      }
    }
    if (!key) {
      key = this._getNextKey();
    }
    if (!key) return headers;

    if (key.apiKey) {
      headers["Authorization"] = `Bearer ${key.apiKey}`;
    } else if (key.oauth) {
      const token = await this._getOAuthToken(key.oauth);
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private async _getOAuthToken(oauth: NonNullable<ProviderKey["oauth"]>): Promise<string | null> {
    // Check if we have a valid cached token
    if (oauth.accessToken && oauth.expiresAt && Date.now() < oauth.expiresAt - 60000) {
      return oauth.accessToken;
    }

    // Try refresh token first
    if (oauth.refreshToken) {
      try {
        const response = await fetch(oauth.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: oauth.refreshToken,
            client_id: oauth.clientId,
            client_secret: oauth.clientSecret,
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = await response.json() as OAuthTokenResponse;
          oauth.accessToken = data.access_token;
          oauth.refreshToken = data.refresh_token ?? oauth.refreshToken;
          oauth.expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
          return oauth.accessToken ?? null;
        }
      } catch (e) { log.debug({ err: e }, "Failed to refresh OAuth token"); }
    }

    // No valid token available - OAuth flow must be completed via UI
    return null;
  }

  private get _model(): string {
    return this._config.defaultModel;
  }

  async generateText(prompt: string, options: LLMRequestOptions = {}): Promise<string> {
    const headers = await this._getAuthHeaders();
    const body: Record<string, unknown> = {
      model: this._model,
      messages: [
        ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      temperature: options.temperature ?? this._config.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? this._config.maxTokens ?? 4096,
    };

    if (options.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this._config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout((options?.timeout ?? this._config.timeout ?? 300) * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      // Mark key as unavailable on rate limit
      if (response.status === 429 && this._rateLimiter) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "60", 10);
        const apiKey = headers["Authorization"]?.replace("Bearer ", "") ?? "";
        this._rateLimiter.markUnavailable(this.id, apiKey, retryAfter * 1000);
      }
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
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
      throw new Error("Failed to parse JSON from LLM response");
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const headers = await this._getAuthHeaders();
    const response = await fetch(`${this._config.baseUrl}/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this._config.models.find(m => m.includes("embedding")) ?? this._model,
        input: text,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error ${response.status}`);
    }

    const data = await response.json() as EmbeddingResponse;
    return data.data?.[0]?.embedding ?? [];
  }

  async listModels(): Promise<string[]> {
    try {
      const headers = await this._getAuthHeaders();
      const response = await fetch(`${this._config.baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return this._config.models;

      const data = await response.json() as ModelListResponse;
      const models = (data.data ?? []).map((m) => {
        let id = m.id ?? "";
        // Strip "models/" prefix from Google Gemini API response
        if (id.startsWith("models/")) id = id.slice(7);
        return id;
      });
      return models.length > 0 ? models : this._config.models;
    } catch {
      return this._config.models;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const headers = await this._getAuthHeaders();
      const response = await fetch(`${this._config.baseUrl}/models`, {
        headers,
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

  setOAuthTokens(accessToken: string, refreshToken?: string, expiresIn?: number): void {
    const oauthKey = this._config.keys?.find(k => k.oauth);
    if (oauthKey?.oauth) {
      oauthKey.oauth.accessToken = accessToken;
      if (refreshToken) oauthKey.oauth.refreshToken = refreshToken;
      oauthKey.oauth.expiresAt = Date.now() + (expiresIn ?? 3600) * 1000;
    }
  }

  async *generateTextStream(prompt: string, options: LLMRequestOptions = {}): AsyncGenerator<string> {
    const headers = await this._getAuthHeaders();
    const body: Record<string, unknown> = {
      model: this._model,
      messages: [
        ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      temperature: options.temperature ?? this._config.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? this._config.maxTokens ?? 4096,
      stream: true,
    };

    const response = await fetch(`${this._config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout((options?.timeout ?? this._config.timeout ?? 300) * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
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
