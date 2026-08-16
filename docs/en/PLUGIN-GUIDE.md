# Plugin Development Guide

This guide explains how to create plugins for TrueNeverStory.

## Plugin Interface

A plugin must implement the `Plugin` interface:

```typescript
import { Plugin } from "../plugins/plugin-interface";

const myPlugin: Plugin = {
  id: "my-plugin",           // Unique identifier
  name: "My Plugin",         // Human-readable name
  version: "1.0.0",          // Semantic version
  description: "Does stuff", // Optional description
  author: "Your Name",       // Optional author

  // Agents provided by this plugin
  agents: [
    {
      id: "my-agent",
      name: "My Agent",
      description: "An agent that does things",
      config: { temperature: 0.7 },
    },
  ],

  // Routes provided by this plugin
  routes: [
    { path: "/my-endpoint", method: "GET" },
    { path: "/my-endpoint", method: "POST" },
  ],

  // Hooks this plugin subscribes to
  hooks: ["onTurnStart", "onWorldCreate"],

  // Lifecycle callbacks
  onRegister: () => {
    console.log("Plugin registered!");
  },

  onUnregister: () => {
    console.log("Plugin unregistered!");
  },
};
```

## Plugin Lifecycle

1. **Registration:** `pluginManager.register(plugin)` — calls `onRegister` hook
2. **Active:** Plugin agents and routes are available
3. **Unregistration:** `pluginManager.unregister(pluginId)` — calls `onUnregister` hook

## Available Hooks

| Hook | When it fires |
|------|---------------|
| `onTurnStart` | Before each turn processing |
| `onTurnEnd` | After each turn processing |
| `onWorldCreate` | When a new world is created |
| `onWorldDestroy` | When a world is destroyed |
| `onEntityAdd` | When a new entity is added |

## Example: Researcher Addon Plugin

```typescript
import { Plugin } from "../plugins/plugin-interface";

export const researcherAddon: Plugin = {
  id: "researcher-addon",
  name: "Researcher Addon",
  version: "1.0.0",
  description: "Enhanced research capabilities",
  agents: [
    {
      id: "deep-researcher",
      name: "Deep Researcher",
      description: "Performs deep research with citations",
    },
  ],
  routes: [
    { path: "/research/deep", method: "POST" },
  ],
  hooks: ["onTurnStart"],
};
```

## Registering a Plugin

```typescript
import { pluginManager } from "../routes/plugins";
import { myPlugin } from "./my-plugin";

pluginManager.register(myPlugin);
```

## API Management

- `GET /api/plugins` — List all plugins
- `GET /api/plugins/:id` — Get plugin details
- `GET /api/plugins/:id/capabilities` — Get capabilities
- `GET /api/plugins/agents/all` — Get all plugin agents
- `GET /api/plugins/routes/all` — Get all plugin routes

## Best Practices

1. **Unique IDs:** Use descriptive, unique plugin IDs (e.g., `my-org/my-plugin`)
2. **Version:** Follow semantic versioning (MAJOR.MINOR.PATCH)
3. **Minimal hooks:** Only subscribe to hooks you need
4. **Cleanup:** Implement `onUnregister` to clean up resources
5. **Error handling:** Plugin errors should not crash the host
