/**
 * LLM Provider interface — defines the contract for all LLM providers.
 */

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ProviderKey {
  id: string;
  label: string;
  apiKey?: string;
  oauth?: OAuthConfig;
  isDefault: boolean;
}

export interface LLMProviderConfig {
  id: string;
  name: string;
  type: "openai" | "anthropic" | "google" | "ollama" | "llamacpp" | "max" | "custom";
  baseUrl: string;
  authType: "apikey" | "oauth";
  apiKey?: string;
  oauth?: OAuthConfig;
  keys?: ProviderKey[];
  models: string[];
  defaultModel: string;
  timeout?: number;
  maxTokens?: number;
  temperature?: number;
  enabled: boolean;
  priority: number;
}

export interface LLMRequestOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  systemPrompt?: string;
}

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly isAvailable: boolean;
  readonly defaultModel?: string;

  generateText(prompt: string, options?: LLMRequestOptions): Promise<string>;
  generateTextStream?(prompt: string, options?: LLMRequestOptions): AsyncGenerator<string>;
  generateJson(prompt: string, options?: LLMRequestOptions): Promise<Record<string, unknown>>;
  generateEmbedding(text: string): Promise<number[]>;
  listModels(): Promise<string[]>;
  healthCheck(): Promise<boolean>;

  // Optional: config management (not all providers support this)
  updateConfig?(config: Partial<LLMProviderConfig>): void;
  addKey?(key: ProviderKey): void;
  removeKey?(keyId: string): boolean;
}
