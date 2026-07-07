/**
 * Agent configuration routes — per-agent settings, prompts, and model assignment.
 * IMPORTANT: Specific routes (providers) MUST come before /:id routes.
 */

import { Hono } from "hono";
import {
  loadAgentConfig,
  saveAgentConfig,
  loadAllAgentConfigs,
  resetAgentConfig,
  getActiveWorld,
  getWorldLanguage,
  type AgentConfig,
} from "../services/agent-config";
import { getProviderManager } from "../lib/providers";
import { getAgentRegistry } from "../services/agent-registry";
import { getLogger } from "../utils/logger";

const log = getLogger("agents-route");
const agents = new Hono();

/** Rate limit for agent config writes: max 30 per minute per IP */
const writeAttempts = new Map<string, { count: number; resetAt: number }>();
const WRITE_MAX = 30;
const WRITE_WINDOW = 60_000;

function checkWriteLimit(ip: string): boolean {
  const now = Date.now();
  const entry = writeAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    writeAttempts.set(ip, { count: 1, resetAt: now + WRITE_WINDOW });
    return true;
  }
  if (entry.count >= WRITE_MAX) return false;
  entry.count++;
  return true;
}

/**
 * GET /api/agents — List all agents with configs.
 */
agents.get("/agents", async (c) => {
  const configs = loadAllAgentConfigs();
  return c.json({ agents: configs });
});

/**
 * GET /api/agents/providers/options — Get provider/model options for assignment.
 * MUST come before /:id to avoid Hono matching "providers" as agent id.
 */
agents.get("/agents/providers/options", async (c) => {
  const manager = await getProviderManager();
  const providers = manager.getProviders();
  const models = await manager.listAllModels();

  const options = providers.map(p => ({
    id: p.id,
    name: p.name,
    models: models[p.id] || [],
  }));

  return c.json({ providers: options });
});

/**
 * GET /api/agents/:id — Get single agent config.
 */
agents.get("/agents/:id", async (c) => {
  const config = loadAgentConfig(c.req.param("id"));
  return c.json({ agent: config });
});

/**
 * PUT /api/agents/:id — Update agent config.
 */
agents.put("/agents/:id", async (c) => {
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  if (!checkWriteLimit(ip)) {
    log.warn({ ip, agentId: c.req.param("id") }, "Agent config write rate limit exceeded");
    return c.json({ error: "Rate limit exceeded for config writes" }, 429);
  }

  const body = await c.req.json().catch(() => ({})) as Partial<AgentConfig>;
  const agentId = c.req.param("id");
  const current = loadAgentConfig(agentId);
  const updated = { ...current, ...body };

  // Merge prompts separately to avoid overwriting
  if (body.prompts) {
    updated.prompts = { ...current.prompts, ...body.prompts };
    log.info({ agentId, ip, promptKeys: Object.keys(body.prompts) }, "Agent prompts updated");
  }

  await saveAgentConfig(agentId, updated);

  // Sync to provider-manager assignments
  if (updated.providerId || updated.modelId) {
    try {
      const manager = await getProviderManager();
      manager.assignAgent(agentId, updated.providerId || manager.getDefaultProvider()?.id || "", updated.modelId || "", {
        temperature: updated.temperature,
        maxTokens: updated.maxTokens,
      });
    } catch (err) {
      log.debug({ err }, "Failed to sync agent config");
    }
  }

  return c.json({ status: "saved", agent: updated });
});

/**
 * PUT /api/agents/:id/prompts — Update only prompts for an agent.
 */
agents.put("/agents/:id/prompts", async (c) => {
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  if (!checkWriteLimit(ip)) {
    log.warn({ ip, agentId: c.req.param("id") }, "Agent prompts write rate limit exceeded");
    return c.json({ error: "Too many writes, wait a minute and try again" }, 429);
  }

  const body = await c.req.json().catch(() => ({})) as Partial<AgentConfig["prompts"]>;
  const agentId = c.req.param("id");
  const current = loadAgentConfig(agentId);
  current.prompts = { ...current.prompts, ...body };
  log.info({ agentId, ip, promptKeys: Object.keys(body) }, "Agent prompts updated directly");
  await saveAgentConfig(agentId, current);
  return c.json({ status: "saved", prompts: current.prompts });
});

/**
 * GET /api/agents/:id/prompts/:lang — Get agent prompts for a specific language.
 * Query params: world (optional, defaults to active world)
 */
agents.get("/agents/:id/prompts/:lang", async (c) => {
  const agentId = c.req.param("id");
  const lang = c.req.param("lang");
  const world = c.req.query("world") ?? getActiveWorld();
  const config = loadAgentConfig(agentId, world, lang);
  return c.json({ agentId, language: lang, world, prompts: config.prompts });
});

/**
 * PUT /api/agents/:id/prompts/:lang — Upsert agent prompts for a specific language.
 * Query params: world (optional, defaults to active world)
 */
agents.put("/agents/:id/prompts/:lang", async (c) => {
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  if (!checkWriteLimit(ip)) {
    log.warn({ ip, agentId: c.req.param("id") }, "Agent prompts write rate limit exceeded");
    return c.json({ error: "Too many writes, wait a minute and try again" }, 429);
  }

  const agentId = c.req.param("id");
  const lang = c.req.param("lang");
  const world = c.req.query("world") ?? getActiveWorld();
  const body = await c.req.json().catch(() => ({})) as Partial<AgentConfig["prompts"]>;
  const current = loadAgentConfig(agentId, world, lang);
  current.prompts = { ...current.prompts, ...body };
  log.info({ agentId, ip, lang, world, promptKeys: Object.keys(body) }, "Agent prompts updated for language");
  await saveAgentConfig(agentId, current, world, lang);
  return c.json({ status: "saved", language: lang, world, prompts: current.prompts });
});

/**
 * POST /api/agents/:id/reset — Reset agent to defaults.
 */
agents.post("/agents/:id/reset", async (c) => {
  try {
    const config = await resetAgentConfig(c.req.param("id"));
    return c.json({ status: "reset", agent: config });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
  }
});

/**
 * GET /api/agents/registry — List all registered agents.
 */
agents.get("/agents/registry", async (c) => {
  const registry = await getAgentRegistry();
  return c.json({ agents: registry.list(), stats: registry.getStats() });
});

/**
 * GET /api/agents/registry/stats — Get registry statistics.
 */
agents.get("/agents/registry/stats", async (c) => {
  const registry = await getAgentRegistry();
  return c.json(registry.getStats());
});

/**
 * GET /api/agents/registry/:id — Get single registered agent.
 */
agents.get("/agents/registry/:id", async (c) => {
  const registry = await getAgentRegistry();
  const agent = registry.get(c.req.param("id"));
  if (!agent) return c.json({ error: "Agent not found" }, 404);
  return c.json({ agent });
});

/**
 * PUT /api/agents/registry/:id — Update registered agent.
 */
agents.put("/agents/registry/:id", async (c) => {
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  if (!checkWriteLimit(ip)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  const body = await c.req.json().catch(() => ({})) as { name?: string; description?: string; priority?: number; enabled?: boolean };
  const registry = await getAgentRegistry();
  const updated = registry.update(c.req.param("id"), body);
  if (!updated) return c.json({ error: "Agent not found" }, 404);
  return c.json({ status: "updated", agent: registry.get(c.req.param("id")) });
});

/**
 * POST /api/agents/registry/:id/enable — Enable an agent.
 */
agents.post("/agents/registry/:id/enable", async (c) => {
  const registry = await getAgentRegistry();
  const enabled = registry.enable(c.req.param("id"));
  if (!enabled) return c.json({ error: "Agent not found" }, 404);
  return c.json({ status: "enabled" });
});

/**
 * POST /api/agents/registry/:id/disable — Disable an agent.
 */
agents.post("/agents/registry/:id/disable", async (c) => {
  const registry = await getAgentRegistry();
  const disabled = registry.disable(c.req.param("id"));
  if (!disabled) return c.json({ error: "Agent not found" }, 404);
  return c.json({ status: "disabled" });
});

/**
 * DELETE /api/agents/registry/:id — Unregister an agent.
 */
agents.delete("/agents/registry/:id", async (c) => {
  const registry = await getAgentRegistry();
  const removed = registry.unregister(c.req.param("id"));
  if (!removed) return c.json({ error: "Agent not found" }, 404);
  return c.json({ status: "removed" });
});

export { agents as agentsRouter };
