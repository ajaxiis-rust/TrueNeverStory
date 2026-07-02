/**
 * Provider Manager — manages multiple LLM providers and agent assignments.
 * Supports multiple API keys per provider and OAuth authentication.
 */

import type { LLMProvider, LLMProviderConfig, ProviderKey } from "./llm-provider";
import { OpenAIProvider } from "./openai-provider";
import { AnthropicProvider } from "./anthropic-provider";
import { GoogleProvider } from "./google-provider";
import { OllamaProvider } from "./ollama-provider";
import { LlamaCppProvider } from "./llamacpp-provider";
import { readJsonFileSync, atomicWriteJson } from "../atomic-io";
import { getConfig } from "../../config/env";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface AgentModelAssignment {
  agentId: string;
  agentName: string;
  providerId: string;
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  enabled: boolean;
}

export interface ProviderManagerState {
  providers: LLMProviderConfig[];
  assignments: AgentModelAssignment[];
  defaultProviderId: string;
}

const PROVIDERS_FILE = "providers.json";

// Default agents in the system
export const DEFAULT_AGENTS = [
  { id: "director", name: "Director" },
  { id: "narrator", name: "Narrator" },
  { id: "scene", name: "Scene Generator" },
  { id: "npc", name: "NPC Agent" },
  { id: "chronicler", name: "Chronicler" },
  { id: "story-planner", name: "Story Planner" },
  { id: "social-sim", name: "Social Simulator" },
  { id: "villain", name: "Villain Manager" },
];

class ProviderManager {
  private _providers: Map<string, LLMProvider> = new Map();
  private _providerConfigs: Map<string, LLMProviderConfig> = new Map();
  private _assignments: Map<string, AgentModelAssignment> = new Map();
  private _defaultProviderId = "";
  private _statePath = "";
  private _initialized = false;

  async init(): Promise<void> {
    if (this._initialized) return;

    const cfg = getConfig();
    this._statePath = join(cfg.CONF_PATH, "providers.json");

    // Load saved state
    const state = this._loadState();

    // Create providers from saved config
    for (const config of state.providers) {
      this._createProvider(config);
    }

    // If no providers configured, create defaults from env
    if (this._providers.size === 0) {
      await this._createDefaultProviders();
    }

    // Load assignments
    for (const assignment of state.assignments) {
      this._assignments.set(assignment.agentId, assignment);
    }

    // Set default provider
    this._defaultProviderId = state.defaultProviderId || this._getDefaultProviderId();

    // Assign default models to unassigned agents
    this._assignDefaults();

    this._initialized = true;

    // Save defaults to providers.json if empty
    if (this._providerConfigs.size > 0 && !existsSync(this._statePath)) {
      this._saveState();
    }

    // Fire-and-forget health check — don't block startup
    this.healthCheckAll().catch(() => {});
  }

  private _loadState(): ProviderManagerState {
    if (existsSync(this._statePath)) {
      const data = readJsonFileSync<ProviderManagerState>(this._statePath);
      if (data) return data;
    }
    return { providers: [], assignments: [], defaultProviderId: "" };
  }

  private _saveState(): void {
    const configs: LLMProviderConfig[] = [];
    for (const [id, config] of this._providerConfigs) {
      configs.push(config);
    }

    const state: ProviderManagerState = {
      providers: configs,
      assignments: Array.from(this._assignments.values()),
      defaultProviderId: this._defaultProviderId,
    };
    atomicWriteJson(this._statePath, state);
  }

  private _createProvider(config: LLMProviderConfig): LLMProvider {
    let provider: LLMProvider;

    switch (config.type) {
      case "anthropic":
        provider = new AnthropicProvider(config);
        break;
      case "google":
        provider = new GoogleProvider(config);
        break;
      case "ollama":
        provider = new OllamaProvider(config);
        break;
      case "llamacpp":
        provider = new LlamaCppProvider(config);
        break;
      case "openai":
      default:
        provider = new OpenAIProvider(config);
        break;
    }

    this._providers.set(config.id, provider);
    this._providerConfigs.set(config.id, config);
    return provider;
  }

  private async _createDefaultProviders(): Promise<void> {
    const cfg = getConfig();

    // Create Ollama provider if configured
    if (cfg.WORLD_LLM_BASE_URL.includes("11434")) {
      this._createProvider({
        id: "ollama",
        name: "Ollama",
        type: "ollama",
        authType: "apikey",
        baseUrl: cfg.WORLD_LLM_BASE_URL.replace("/v1", ""),
        models: [],
        defaultModel: cfg.WORLD_LLM_MODEL,
        enabled: true,
        priority: 1,
      });
    }
    // Create llama.cpp provider
    else if (cfg.WORLD_LLM_BASE_URL.includes("5001")) {
      this._createProvider({
        id: "llamacpp",
        name: "llama.cpp",
        type: "llamacpp",
        authType: "apikey",
        baseUrl: cfg.WORLD_LLM_BASE_URL,
        apiKey: cfg.WORLD_LLM_API_KEY,
        models: [],
        defaultModel: cfg.WORLD_LLM_MODEL,
        enabled: true,
        priority: 1,
      });
    }
    // Google Gemini
    else if (cfg.WORLD_LLM_BASE_URL.includes("googleapis.com")) {
      this._createProvider({
        id: "google",
        name: "Google Gemini",
        type: "google",
        authType: "apikey",
        baseUrl: cfg.WORLD_LLM_BASE_URL,
        apiKey: cfg.WORLD_LLM_API_KEY,
        models: [],
        defaultModel: cfg.WORLD_LLM_MODEL || "gemini-2.0-flash",
        enabled: true,
        priority: 1,
      });
    }
    // Generic OpenAI-compatible
    else {
      this._createProvider({
        id: "default",
        name: "Default LLM",
        type: "openai",
        authType: "apikey",
        baseUrl: cfg.WORLD_LLM_BASE_URL,
        apiKey: cfg.WORLD_LLM_API_KEY,
        models: [],
        defaultModel: cfg.WORLD_LLM_MODEL,
        enabled: true,
        priority: 1,
      });
    }
  }

  private _getDefaultProviderId(): string {
    const providers = Array.from(this._providers.values());
    if (providers.length === 0) return "";
    const enabled = providers.filter(p => p.isAvailable);
    if (enabled.length > 0 && enabled[0]) return enabled[0].id;
    if (providers[0]) return providers[0].id;
    return "";
  }

  private _assignDefaults(): void {
    for (const agent of DEFAULT_AGENTS) {
      if (!this._assignments.has(agent.id)) {
        this._assignments.set(agent.id, {
          agentId: agent.id,
          agentName: agent.name,
          providerId: this._defaultProviderId,
          modelId: "",
          enabled: true,
        });
      }
    }
  }

  // ── Public API ──

  getProvider(id: string): LLMProvider | undefined {
    return this._providers.get(id);
  }

  getProviderConfig(id: string): LLMProviderConfig | undefined {
    return this._providerConfigs.get(id);
  }

  getProviders(): LLMProvider[] {
    return Array.from(this._providers.values());
  }

  getDefaultProvider(): LLMProvider | undefined {
    return this._providers.get(this._defaultProviderId);
  }

  getAssignment(agentId: string): AgentModelAssignment | undefined {
    return this._assignments.get(agentId);
  }

  getAssignments(): AgentModelAssignment[] {
    return Array.from(this._assignments.values());
  }

  async addProvider(config: LLMProviderConfig): Promise<LLMProvider> {
    // Merge keys if provider already exists
    const existing = this._providerConfigs.get(config.id);
    if (existing && config.keys) {
      config.keys = [...(existing.keys ?? []), ...config.keys];
    }

    const provider = this._createProvider(config);
    // Don't block on health check — it's fire-and-forget
    provider.healthCheck().catch(() => {});
    this._saveState();
    return provider;
  }

  async updateProvider(id: string, updates: Partial<LLMProviderConfig>): Promise<boolean> {
    const provider = this._providers.get(id);
    if (!provider) return false;

    if (provider.updateConfig) {
      provider.updateConfig(updates);
    }

    // Update stored config
    const config = this._providerConfigs.get(id);
    if (config) {
      Object.assign(config, updates);
    }

    await provider.healthCheck();
    this._saveState();
    return true;
  }

  removeProvider(id: string): boolean {
    const removed = this._providers.delete(id);
    this._providerConfigs.delete(id);
    if (removed && this._defaultProviderId === id) {
      this._defaultProviderId = this._getDefaultProviderId();
    }
    if (removed) this._saveState();
    return removed;
  }

  setDefaultProvider(id: string): boolean {
    if (!this._providers.has(id)) return false;
    this._defaultProviderId = id;
    this._saveState();
    return true;
  }

  assignAgent(agentId: string, providerId: string, modelId: string, options?: {
    temperature?: number;
    maxTokens?: number;
  }): boolean {
    if (!this._providers.has(providerId)) return false;

    const existing = this._assignments.get(agentId);
    this._assignments.set(agentId, {
      agentId,
      agentName: existing?.agentName ?? agentId,
      providerId,
      modelId,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      enabled: true,
    });

    this._saveState();
    return true;
  }

  addKeyToProvider(providerId: string, key: ProviderKey): boolean {
    const provider = this._providers.get(providerId);
    if (!provider || !provider.addKey) return false;

    provider.addKey(key);

    // Update stored config
    const config = this._providerConfigs.get(providerId);
    if (config) {
      if (!config.keys) config.keys = [];
      config.keys.push(key);
    }

    this._saveState();
    return true;
  }

  removeKeyFromProvider(providerId: string, keyId: string): boolean {
    const provider = this._providers.get(providerId);
    if (!provider || !provider.removeKey) return false;

    const result = provider.removeKey(keyId);

    // Update stored config
    const config = this._providerConfigs.get(providerId);
    if (config?.keys) {
      const idx = config.keys.findIndex(k => k.id === keyId);
      if (idx >= 0) config.keys.splice(idx, 1);
    }

    this._saveState();
    return result;
  }

  getProviderForAgent(agentId: string): LLMProvider | undefined {
    const assignment = this._assignments.get(agentId);
    if (!assignment) return this.getDefaultProvider();
    return this._providers.get(assignment.providerId) ?? this.getDefaultProvider();
  }

  getModelForAgent(agentId: string): string {
    const assignment = this._assignments.get(agentId);
    if (!assignment?.modelId) {
      const provider = this.getDefaultProvider();
      if (!provider) return "";
      const config = this._providerConfigs.get(provider.id);
      return config?.defaultModel ?? "";
    }
    return assignment.modelId;
  }

  getOptionsForAgent(agentId: string): { temperature?: number; maxTokens?: number } {
    const assignment = this._assignments.get(agentId);
    return {
      temperature: assignment?.temperature,
      maxTokens: assignment?.maxTokens,
    };
  }

  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [id, provider] of this._providers) {
      results[id] = await provider.healthCheck();
    }
    return results;
  }

  async listAllModels(): Promise<Record<string, string[]>> {
    const results: Record<string, string[]> = {};
    const promises: Promise<void>[] = [];
    for (const [id, provider] of this._providers) {
      promises.push(
        Promise.race([
          provider.listModels().then(m => { results[id] = m; }),
          new Promise<void>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
        ]).catch(() => { results[id] = []; }),
      );
    }
    await Promise.allSettled(promises);
    return results;
  }

  getAgentList(): Array<{ id: string; name: string; assigned: boolean }> {
    return DEFAULT_AGENTS.map(agent => ({
      id: agent.id,
      name: agent.name,
      assigned: this._assignments.has(agent.id),
    }));
  }
}

// Singleton
let _manager: ProviderManager | null = null;

export async function getProviderManager(): Promise<ProviderManager> {
  if (!_manager) {
    _manager = new ProviderManager();
    await _manager.init();
  }
  return _manager;
}

export function resetProviderManager(): void {
  _manager = null;
}
