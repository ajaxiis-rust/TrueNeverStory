/**
 * Ollama LLM Provider.
 */

import type { LLMProvider, LLMProviderConfig, LLMRequestOptions } from "./llm-provider";

export class OllamaProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "ollama";

  private _config: LLMProviderConfig;
  private _available = false;

  constructor(config: LLMProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this._config = config;
  }

  get isAvailable(): boolean {
    return this._available && this._config.enabled;
  }

  async generateText(prompt: string, options: LLMRequestOptions = {}): Promise<string> {
    const body: Record<string, unknown> = {
      model: this._config.defaultModel,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? this._config.temperature ?? 0.7,
        num_predict: options.maxTokens ?? this._config.maxTokens ?? 4096,
      },
    };

    if (options.systemPrompt) {
      body.system = options.systemPrompt;
    }

    const response = await fetch(`${this._config.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout((options?.timeout ?? this._config.timeout ?? 300) * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${text}`);
    }

    const data = await response.json() as { response?: string };
    return data.response ?? "";
  }

  async generateJson(prompt: string, options: LLMRequestOptions = {}): Promise<Record<string, unknown>> {
    const jsonPrompt = `${prompt}\n\nRespond with valid JSON only, no markdown.`;
    const text = await this.generateText(jsonPrompt, options);
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match?.[1]) {
        return JSON.parse(match[1].trim()) as Record<string, unknown>;
      }
      throw new Error("Failed to parse JSON from Ollama response");
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this._config.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this._config.defaultModel,
        prompt: text,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding error ${response.status}`);
    }

    const data = await response.json() as { embedding?: number[] };
    return data.embedding ?? [];
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this._config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return this._config.models;

      const data = await response.json() as { models?: Array<{ name?: string }> };
      return (data.models ?? []).map((m) => m.name ?? "") ?? this._config.models;
    } catch {
      return this._config.models;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this._config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
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
}
