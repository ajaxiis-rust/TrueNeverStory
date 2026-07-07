/**
 * Plugin API routes
 */

import { Hono } from "hono";
import { PluginManager } from "../plugins/plugin-manager";

const app = new Hono();
const manager = new PluginManager();

app.get("/", (c) => {
  const plugins = manager.list();
  return c.json(plugins.map((p) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    description: p.description,
    agents: p.agents.length,
    routes: p.routes.length,
    hooks: p.hooks.length,
  })));
});

app.get("/:id", (c) => {
  const plugin = manager.get(c.req.param("id"));
  if (!plugin) return c.json({ error: "Plugin not found" }, 404);
  return c.json(plugin);
});

app.get("/:id/capabilities", (c) => {
  const caps = manager.getCapabilities(c.req.param("id"));
  return c.json(caps);
});

app.get("/agents/all", (c) => {
  return c.json(manager.getAgents());
});

app.get("/routes/all", (c) => {
  return c.json(manager.getRoutes());
});

export default app;
export { manager as pluginManager };
