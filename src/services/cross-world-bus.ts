/**
 * Cross-World Bus — cross-world event communication with portals.
 */

import { getLogger } from "../utils/logger";

const log = getLogger("cross-world-bus");

export interface CrossWorldConfig {
  enabled: boolean;
  allowPortals?: boolean;
  allowSharedMemory?: boolean;
  allowTradeRoutes?: boolean;
  isolationLevel?: "full" | "portals_only" | "read_only" | "disabled";
}

export interface CrossWorldEvent {
  type: string;
  data: Record<string, unknown>;
  source?: string;
  timestamp?: Date;
}

export type CrossWorldHandler = (event: CrossWorldEvent) => Promise<void> | void;

export interface Portal {
  id: string;
  world1: string;
  world2: string;
  createdAt: Date;
  active: boolean;
}

function uuid(): string {
  return crypto.randomUUID();
}

export class CrossWorldBus {
  private _config: CrossWorldConfig;
  private _handlers: Map<string, CrossWorldHandler[]> = new Map();
  private _portals: Map<string, Portal> = new Map();
  private _eventLog: CrossWorldEvent[] = [];
  private _maxLogSize: number;

  constructor(config: CrossWorldConfig, maxLogSize = 1000) {
    this._config = {
      allowPortals: true,
      allowSharedMemory: false,
      allowTradeRoutes: false,
      isolationLevel: "full",
      ...config,
    };
    this._maxLogSize = maxLogSize;
  }

  get config(): CrossWorldConfig {
    return { ...this._config };
  }

  subscribe(worldId: string, handler: CrossWorldHandler): void {
    const list = this._handlers.get(worldId) ?? [];
    list.push(handler);
    this._handlers.set(worldId, list);
  }

  unsubscribe(worldId: string, handler: CrossWorldHandler): void {
    const list = this._handlers.get(worldId);
    if (list) {
      this._handlers.set(worldId, list.filter((h) => h !== handler));
    }
  }

  async publish(worldId: string, event: CrossWorldEvent, usePortal = false): Promise<void> {
    if (!this._config.enabled) return;
    if (this._config.isolationLevel === "disabled") return;

    const fullEvent = { ...event, source: worldId, timestamp: new Date() };
    this._eventLog.push(fullEvent);
    if (this._eventLog.length > this._maxLogSize) {
      this._eventLog.shift();
    }

    const handlers = this._handlers.get(worldId) ?? [];
    for (const handler of handlers) {
      await handler(fullEvent);
    }

    if (usePortal && this._config.allowPortals !== false) {
      for (const portal of this._portals.values()) {
        if (!portal.active) continue;
        let targetWorld: string | null = null;
        if (portal.world1 === worldId) targetWorld = portal.world2;
        else if (portal.world2 === worldId) targetWorld = portal.world1;

        if (targetWorld) {
          const targetHandlers = this._handlers.get(targetWorld) ?? [];
          for (const handler of targetHandlers) {
            await handler(fullEvent);
          }
        }
      }
    }
  }

  async broadcast(event: CrossWorldEvent): Promise<void> {
    if (!this._config.enabled) return;
    if (this._config.isolationLevel === "disabled") return;

    const fullEvent = { ...event, source: "broadcast", timestamp: new Date() };
    this._eventLog.push(fullEvent);

    for (const [, handlers] of this._handlers) {
      for (const handler of handlers) {
        await handler(fullEvent);
      }
    }
  }

  createPortal(world1: string, world2: string): Portal {
    if (this._config.allowPortals === false) {
      throw new Error("Portals are disabled");
    }

    const portal: Portal = {
      id: uuid(),
      world1,
      world2,
      createdAt: new Date(),
      active: true,
    };

    this._portals.set(portal.id, portal);
    log.info(`Portal created: ${world1} <-> ${world2}`);
    return portal;
  }

  destroyPortal(portalId: string): void {
    if (!this._portals.has(portalId)) {
      throw new Error(`Portal not found: ${portalId}`);
    }
    this._portals.delete(portalId);
    log.info(`Portal destroyed: ${portalId}`);
  }

  listPortals(): Portal[] {
    return Array.from(this._portals.values());
  }

  getEventLog(limit?: number): CrossWorldEvent[] {
    return limit ? this._eventLog.slice(-limit) : [...this._eventLog];
  }
}
