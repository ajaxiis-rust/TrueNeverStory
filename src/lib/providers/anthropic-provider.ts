/**
 * Anthropic Claude LLM Provider.
 * Supports multiple API keys with round-robin load balancing.
 */

import type { LLMProvider, LLMProviderConfig, LLMRequestOptions, ProviderKey } from "./llm-provider";

export class AnthropicProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "anthropic";

  private _config: LLMProviderConfig;
  private _available = false;
  private _currentKeyIndex = 0;

  constructor(config: LLMProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this._config = config;

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
    }
  }

  get isAvailable(): boolean {
    return this._available && this._config.enabled;
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

  private _getHeaders(): Record<string, string> {
    const key = this._getNextKey();
    return {
      "Content-Type": "application/json",
      "x-api-key": key?.apiKey ?? this._config.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    };
  }

  async generateText(prompt: string, options: LLMRequestOptions = {}): Promise<string> {
    const body: Record<string, unknown> = {
      model: this._config.defaultModel,
      max_tokens: options.maxTokens ?? this._config.maxTokens ?? 4096,
      temperature: options.temperature ?? this._config.temperature ?? 0.7,
      messages: [
        { role: "user", content: prompt },
      ],
    };

    if (options.systemPrompt) {
      body.system = options.systemPrompt;
    }

    const response = await fetch(`${this._config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: this._getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout((this._config.timeout ?? 120) * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    return data.content?.[0]?.text ?? "";
  }

  async generateJson(prompt: string, options: LLMRequestOptions = {}): Promise<Record<string, unknown>> {
    const text = await this.generateText(prompt, { ...options, jsonMode: false });
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
    throw new Error("Anthropic does not support embeddings API");
  }

  async listModels(): Promise<string[]> {
    return this._config.models;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this._config.baseUrl}/v1/models`, {
        headers: this._getHeaders(),
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
}
