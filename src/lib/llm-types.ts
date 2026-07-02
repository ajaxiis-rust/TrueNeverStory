/**
 * Shared types for LLM API responses.
 */

// OpenAI-compatible response types
export interface OpenAIChatResponse {
  choices: Array<{ message: { content: string }; finish_reason: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface OpenAIModelListResponse {
  data: Array<{ id: string; object: string; owned_by?: string }>;
}

export interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { prompt_tokens: number; total_tokens: number };
}

// Ollama response types
export interface OllamaModelListResponse {
  models: Array<{ name: string; size: number; modified_at: string }>;
}

export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  context?: number[];
}

// Anthropic response types
export interface AnthropicMessageResponse {
  content: Array<{ type: string; text: string }>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

// Provider config interface
export interface ProviderConfig {
  id: string;
  type: string;
  baseUrl: string;
  apiKey?: string;
  models: string[];
  defaultModel?: string;
  isAvailable?: boolean;
}

// Provider with config access
export interface ProviderWithConfig extends ProviderConfig {
  updateConfig?(updates: Partial<ProviderConfig>): void;
  addKey?(key: string): string;
  removeKey?(keyId: string): boolean;
}
