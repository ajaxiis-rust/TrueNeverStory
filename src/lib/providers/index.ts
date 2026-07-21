/**
 * LLM Providers — multi-provider support with per-agent model assignment.
 */

export type { LLMProvider, LLMProviderConfig, LLMRequestOptions, ProviderKey, OAuthConfig } from "./llm-provider";
export { isLocalProvider } from "./llm-provider";
export { OpenAIProvider } from "./openai-provider";
export { AnthropicProvider } from "./anthropic-provider";
export { GoogleProvider } from "./google-provider";
export { OllamaProvider } from "./ollama-provider";
export { LlamaCppProvider } from "./llamacpp-provider";
export {
  getProviderManager,
  resetProviderManager,
  DEFAULT_AGENTS,
  type AgentModelAssignment,
  type ProviderManagerState,
} from "./provider-manager";
