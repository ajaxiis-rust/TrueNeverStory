/**
 * Agent Registry — dynamic agent registration, lookup, and lifecycle management.
 * Replaces hardcoded agent lists with a plugin-friendly registry.
 */

import { readJsonFileSync, atomicWriteJson } from "../lib/atomic-io";
import { getConfig } from "../config/env";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";
import { TaskPriority } from "../models/director";
import type { Agent, AgentConfig, AgentContext, AgentResponse } from "./agent-interface";

const log = getLogger("agent-registry");

export interface RegisteredAgent {
  id: string;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  source: "builtin" | "config" | "api" | "plugin";
  agent?: Agent;
}

export interface AgentRegistryConfig {
  autoLoadFromConfig?: boolean;
  configPath?: string;
}

const DEFAULT_CONFIG: AgentRegistryConfig = {
  autoLoadFromConfig: true,
};

export class AgentRegistry {
  private _agents: Map<string, RegisteredAgent> = new Map();
  private _config: AgentRegistryConfig;
  private _configPath: string;

  constructor(config?: AgentRegistryConfig) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    const cfg = getConfig();
    this._configPath = this._config.configPath ?? join(cfg.CONF_PATH, "registry.json");
  }

  async init(): Promise<void> {
    if (this._config.autoLoadFromConfig) {
      await this._loadFromConfig();
    }
    log.info({ count: this._agents.size }, "Agent registry initialized");
  }

  register(agent: Agent, source: RegisteredAgent["source"] = "builtin"): void {
    const entry: RegisteredAgent = {
      id: agent.id,
      name: agent.name,
      description: "",
      priority: agent.priority,
      enabled: true,
      source,
      agent,
    };
    this._agents.set(agent.id, entry);
    log.info({ id: agent.id, source }, "Agent registered");
  }

  registerFromConfig(config: {
    id: string;
    name: string;
    description?: string;
    priority?: number;
    enabled?: boolean;
  }): void {
    const existing = this._agents.get(config.id);
    if (existing && existing.source === "builtin") {
      existing.name = config.name ?? existing.name;
      existing.description = config.description ?? existing.description;
      existing.priority = config.priority ?? existing.priority;
      existing.enabled = config.enabled ?? existing.enabled;
      return;
    }

    const entry: RegisteredAgent = {
      id: config.id,
      name: config.name,
      description: config.description ?? "",
      priority: config.priority ?? 5,
      enabled: config.enabled ?? true,
      source: "config",
    };
    this._agents.set(config.id, entry);
  }

  unregister(id: string): boolean {
    const removed = this._agents.delete(id);
    if (removed) {
      log.info({ id }, "Agent unregistered");
    }
    return removed;
  }

  get(id: string): RegisteredAgent | undefined {
    return this._agents.get(id);
  }

  getEnabled(): RegisteredAgent[] {
    return Array.from(this._agents.values()).filter((a) => a.enabled);
  }

  list(): RegisteredAgent[] {
    return Array.from(this._agents.values());
  }

  getByPriority(): RegisteredAgent[] {
    return Array.from(this._agents.values())
      .filter((a) => a.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  has(id: string): boolean {
    return this._agents.has(id);
  }

  enable(id: string): boolean {
    const agent = this._agents.get(id);
    if (!agent) return false;
    agent.enabled = true;
    log.info({ id }, "Agent enabled");
    return true;
  }

  disable(id: string): boolean {
    const agent = this._agents.get(id);
    if (!agent) return false;
    agent.enabled = false;
    log.info({ id }, "Agent disabled");
    return true;
  }

  update(id: string, updates: Partial<Pick<RegisteredAgent, "name" | "description" | "priority" | "enabled">>): boolean {
    const agent = this._agents.get(id);
    if (!agent) return false;
    if (updates.name !== undefined) agent.name = updates.name;
    if (updates.description !== undefined) agent.description = updates.description;
    if (updates.priority !== undefined) agent.priority = updates.priority;
    if (updates.enabled !== undefined) agent.enabled = updates.enabled;
    log.info({ id }, "Agent updated");
    return true;
  }

  getStats() {
    const all = this._agents.size;
    const enabled = Array.from(this._agents.values()).filter((a) => a.enabled).length;
    const sources: Record<string, number> = {};
    for (const agent of this._agents.values()) {
      sources[agent.source] = (sources[agent.source] ?? 0) + 1;
    }
    return { all, enabled, disabled: all - enabled, sources };
  }

  async _loadFromConfig(): Promise<void> {
    if (!existsSync(this._configPath)) return;

    try {
      const data = readJsonFileSync<{ agents?: Array<{ id: string; name: string; description?: string; priority?: number; enabled?: boolean }> }>(this._configPath);
      if (!data?.agents) return;

      for (const config of data.agents) {
        this.registerFromConfig(config);
      }
      log.info({ count: data.agents.length }, "Loaded agents from config");
    } catch (err) {
      log.warn({ err }, "Failed to load agents from config");
    }
  }

  async saveToConfig(): Promise<void> {
    const dir = join(getConfig().CONF_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const agents = Array.from(this._agents.values())
      .filter((a) => a.source !== "builtin")
      .map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        priority: a.priority,
        enabled: a.enabled,
      }));

    await atomicWriteJson(this._configPath, { agents });
    log.info({ count: agents.length }, "Saved agents to config");
  }
}

let _registry: AgentRegistry | null = null;

export async function getAgentRegistry(config?: AgentRegistryConfig): Promise<AgentRegistry> {
  if (!_registry) {
    _registry = new AgentRegistry(config);
    await _registry.init();
  }
  return _registry;
}

export function resetAgentRegistry(): void {
  _registry = null;
}
