/**
 * Plugin Interface — type definitions for the plugin system.
 */

export interface PluginAgent {
  id: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface PluginRoute {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  handler?: string;
}

export type PluginHook = "onTurnStart" | "onTurnEnd" | "onWorldCreate" | "onWorldDestroy" | "onEntityAdd";

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  agents: PluginAgent[];
  routes: PluginRoute[];
  hooks: PluginHook[];
  onRegister?: () => void;
  onUnregister?: () => void;
}
