/**
 * World Isolator — worker-based world isolation with resource monitoring.
 */

import { getLogger } from "../utils/logger";

const log = getLogger("world-isolator");

export interface WorldIsolatorConfig {
  defaultMemoryLimitMB: number;
  defaultCpuPercent: number;
  defaultTokenBudget: number;
}

export interface WorldInstance {
  id: string;
  status: "running" | "stopped" | "error";
  memoryLimitMB: number;
  cpuPercent: number;
  tokenBudget: number;
  memoryUsedMB: number;
  tokensUsed: number;
  memoryExceeded: boolean;
  tokensExceeded: boolean;
  createdAt: Date;
}

const DEFAULT_CONFIG: WorldIsolatorConfig = {
  defaultMemoryLimitMB: 256,
  defaultCpuPercent: 50,
  defaultTokenBudget: 10000,
};

export class WorldIsolator {
  private _config: WorldIsolatorConfig;
  private _worlds: Map<string, WorldInstance> = new Map();

  constructor(config: Partial<WorldIsolatorConfig> = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  createWorld(id: string, overrides?: Partial<Pick<WorldInstance, "memoryLimitMB" | "cpuPercent" | "tokenBudget">>): WorldInstance {
    if (this._worlds.has(id)) {
      throw new Error(`World already exists: ${id}`);
    }

    const world: WorldInstance = {
      id,
      status: "running",
      memoryLimitMB: overrides?.memoryLimitMB ?? this._config.defaultMemoryLimitMB,
      cpuPercent: overrides?.cpuPercent ?? this._config.defaultCpuPercent,
      tokenBudget: overrides?.tokenBudget ?? this._config.defaultTokenBudget,
      memoryUsedMB: 0,
      tokensUsed: 0,
      memoryExceeded: false,
      tokensExceeded: false,
      createdAt: new Date(),
    };

    this._worlds.set(id, world);
    log.info(`World created: ${id}`);
    return world;
  }

  destroyWorld(id: string): void {
    if (!this._worlds.has(id)) {
      throw new Error(`World not found: ${id}`);
    }
    this._worlds.delete(id);
    log.info(`World destroyed: ${id}`);
  }

  listWorlds(): WorldInstance[] {
    return Array.from(this._worlds.values());
  }

  getStatus(id: string): WorldInstance {
    const world = this._worlds.get(id);
    if (!world) throw new Error(`World not found: ${id}`);
    return world;
  }

  trackMemory(id: string, mb: number): void {
    const world = this._worlds.get(id);
    if (!world) throw new Error(`World not found: ${id}`);
    world.memoryUsedMB += mb;
    world.memoryExceeded = world.memoryUsedMB > world.memoryLimitMB;
  }

  trackTokens(id: string, tokens: number): void {
    const world = this._worlds.get(id);
    if (!world) throw new Error(`World not found: ${id}`);
    world.tokensUsed += tokens;
    world.tokensExceeded = world.tokensUsed > world.tokenBudget;
  }

  resetUsage(id: string): void {
    const world = this._worlds.get(id);
    if (!world) throw new Error(`World not found: ${id}`);
    world.memoryUsedMB = 0;
    world.tokensUsed = 0;
    world.memoryExceeded = false;
    world.tokensExceeded = false;
  }
}
