/**
 * Plugin Manager — plugin loading, unloading, and lifecycle management.
 */

import { Plugin } from "./plugin-interface";
import { getLogger } from "../utils/logger";

const log = getLogger("plugin-manager");

export interface PluginCapabilities {
  agents: number;
  routes: number;
  hooks: number;
}

export class PluginManager {
  private _plugins: Map<string, Plugin> = new Map();

  register(plugin: Plugin): void {
    if (this._plugins.has(plugin.id)) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }

    this._plugins.set(plugin.id, plugin);
    log.info(`Plugin registered: ${plugin.id} v${plugin.version}`);

    if (plugin.onRegister) {
      plugin.onRegister();
    }
  }

  unregister(pluginId: string): void {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (plugin.onUnregister) {
      plugin.onUnregister();
    }

    this._plugins.delete(pluginId);
    log.info(`Plugin unregistered: ${pluginId}`);
  }

  get(pluginId: string): Plugin | undefined {
    return this._plugins.get(pluginId);
  }

  list(): Plugin[] {
    return Array.from(this._plugins.values());
  }

  getCapabilities(pluginId: string): PluginCapabilities {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    return {
      agents: plugin.agents.length,
      routes: plugin.routes.length,
      hooks: plugin.hooks.length,
    };
  }

  getAgents(): Plugin["agents"][number][] {
    const agents: Plugin["agents"][number][] = [];
    for (const plugin of this._plugins.values()) {
      agents.push(...plugin.agents);
    }
    return agents;
  }

  getRoutes(): Plugin["routes"][number][] {
    const routes: Plugin["routes"][number][] = [];
    for (const plugin of this._plugins.values()) {
      routes.push(...plugin.routes);
    }
    return routes;
  }
}
