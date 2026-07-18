/**
 * llama.cpp Server LLM Provider.
 * Uses the OpenAI-compatible API from llama.cpp server.
 */

import type { LLMProvider, LLMProviderConfig, LLMRequestOptions } from "./llm-provider";
import { getLogger } from "../../utils/logger";

const log = getLogger("llamacpp-provider");

export class LlamaCppProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "llamacpp";

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

  private get _headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this._config.apiKey) {
      headers["Authorization"] = `Bearer ${this._config.apiKey}`;
    }
    return headers;
  }

  async generateText(prompt: string, options: LLMRequestOptions = {}): Promise<string> {
    const body: Record<string, unknown> = {
      model: this._config.defaultModel,
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
      headers: this._headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout((options?.timeout ?? this._config.timeout ?? 300) * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`llama.cpp API error ${response.status}: ${text}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
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
      throw new Error("Failed to parse JSON from llama.cpp response");
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this._config.baseUrl}/embeddings`, {
      method: "POST",
      headers: this._headers,
      body: JSON.stringify({
        model: this._config.models.find(m => m.includes("embedding")) ?? this._config.defaultModel,
        input: text,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`llama.cpp embedding error ${response.status}`);
    }

    const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
    return data.data?.[0]?.embedding ?? [];
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this._config.baseUrl}/models`, {
        headers: this._headers,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return this._config.models;

      const data = await response.json() as { data?: Array<{ id?: string }> };
      return (data.data ?? []).map((m) => m.id ?? "") ?? this._config.models;
    } catch {
      return this._config.models;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this._config.baseUrl}/models`, {
        headers: this._headers,
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

  async *generateTextStream(prompt: string, options: LLMRequestOptions = {}): AsyncGenerator<string> {
    const body: Record<string, unknown> = {
      model: this._config.defaultModel,
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
      headers: this._headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout((options?.timeout ?? this._config.timeout ?? 300) * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`llama.cpp API error ${response.status}: ${text}`);
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
