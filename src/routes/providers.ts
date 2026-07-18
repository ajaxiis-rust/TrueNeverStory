/**
 * Provider management routes — multi-provider LLM support with agent assignments.
 * IMPORTANT: Specific routes (models, health, assignments, agents, assign, reset)
 * MUST come before /:id routes to avoid Hono matching conflicts.
 */

import { Hono } from "hono";
import {
  getProviderManager,
  resetProviderManager,
  DEFAULT_AGENTS,
  type LLMProviderConfig,
  type ProviderKey,
} from "../lib/providers";
import { loadAgentConfig, loadAllAgentConfigs, saveAgentConfig } from "../services/agent-config";
import { getLogger } from "../utils/logger";

const log = getLogger("providers-route");
const providers = new Hono();

// ── List routes (before /:id) ──

providers.get("/providers", async (c) => {
  const manager = await getProviderManager();
  const providerList = manager.getProviders();
  const result = providerList.map(p => {
    const config = manager.getProviderConfig(p.id);
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      isAvailable: p.isAvailable,
      keys: config?.keys?.map(k => ({ id: k.id, label: k.label, isDefault: k.isDefault })) ?? [],
    };
  });
  return c.json({ providers: result, defaultProviderId: manager.getDefaultProvider()?.id });
});

providers.post("/providers", async (c) => {
  const body = await c.req.json().catch(() => ({})) as LLMProviderConfig;
  if (!body.id || !body.baseUrl) return c.json({ error: "id and baseUrl are required" }, 400);
  if (!body.authType) body.authType = "apikey";
  const manager = await getProviderManager();
  try {
    const provider = await manager.addProvider(body);
    return c.json({ status: "added", provider: { id: provider.id, name: provider.name } });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ── Specific paths (BEFORE /:id) ──

providers.get("/providers/models", async (c) => {
  const manager = await getProviderManager();
  const models = await manager.listAllModels();
  return c.json({ models });
});

providers.post("/providers/health", async (c) => {
  const manager = await getProviderManager();
  manager.healthCheckAll().catch(() => {});
  return c.json({ status: "health check started" });
});

providers.get("/providers/assignments", async (c) => {
  const manager = await getProviderManager();
  const assignments = manager.getAssignments();
  return c.json({ assignments });
});

providers.get("/providers/agents", async (c) => {
  const manager = await getProviderManager();
  const agents = manager.getAgentList();
  return c.json({ agents });
});

providers.post("/providers/assign", async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    agentId: string; providerId: string; modelId: string;
    temperature?: number; maxTokens?: number;
  };
  if (!body.agentId || !body.providerId) return c.json({ error: "agentId and providerId are required" }, 400);
  const manager = await getProviderManager();
  const success = manager.assignAgent(body.agentId, body.providerId, body.modelId, {
    temperature: body.temperature, maxTokens: body.maxTokens,
  });
  if (!success) return c.json({ error: "Invalid provider" }, 400);

  // Sync to agent config file
  try {
    const current = loadAgentConfig(body.agentId);
    await saveAgentConfig(body.agentId, {
      ...current,
      providerId: body.providerId,
      modelId: body.modelId,
      temperature: body.temperature ?? current.temperature,
      maxTokens: body.maxTokens ?? current.maxTokens,
    });
  } catch (err) {
    log.debug({ err }, "Failed to sync agent assignment to config");
  }

  return c.json({ status: "assigned" });
});

providers.delete("/providers/assign/:agentId", async (c) => {
  const manager = await getProviderManager();
  manager.assignAgent(c.req.param("agentId"), "", "");

  // Sync removal to agent config file
  try {
    const current = loadAgentConfig(c.req.param("agentId"));
    await saveAgentConfig(c.req.param("agentId"), { ...current, providerId: "", modelId: "" });
  } catch (err) {
    log.debug({ err }, "Failed to sync agent config removal");
  }

  return c.json({ status: "removed" });
});

providers.post("/providers/sync-from-agents", async (c) => {
  try {
    const manager = await getProviderManager();
    const agentConfigs = loadAllAgentConfigs();
    let synced = 0;
    for (const cfg of agentConfigs) {
      if (cfg.providerId) {
        manager.assignAgent(cfg.id, cfg.providerId, cfg.modelId, {
          temperature: cfg.temperature,
          maxTokens: cfg.maxTokens,
        });
        synced++;
      }
    }
    return c.json({ status: "synced", count: synced });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

providers.get("/providers/reset", async (c) => {
  resetProviderManager();
  await getProviderManager();
  return c.json({ status: "reset" });
});

// ── Parameterized routes (AFTER specific paths) ──

providers.get("/providers/:id", async (c) => {
  const manager = await getProviderManager();
  const provider = manager.getProvider(c.req.param("id"));
  if (!provider) return c.json({ error: "Provider not found" }, 404);
  const config = manager.getProviderConfig(c.req.param("id"));
  const models = await provider.listModels();
  return c.json({
    id: provider.id, name: provider.name, type: provider.type,
    isAvailable: provider.isAvailable, models,
    keys: config?.keys?.map(k => ({ id: k.id, label: k.label, isDefault: k.isDefault })) ?? [],
  });
});

providers.put("/providers/:id", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Partial<LLMProviderConfig>;
  const manager = await getProviderManager();
  const success = await manager.updateProvider(c.req.param("id"), body);
  if (!success) return c.json({ error: "Provider not found" }, 404);
  return c.json({ status: "updated" });
});

providers.delete("/providers/:id", async (c) => {
  const manager = await getProviderManager();
  const success = manager.removeProvider(c.req.param("id"));
  if (!success) return c.json({ error: "Provider not found" }, 404);
  return c.json({ status: "removed" });
});

providers.post("/providers/:id/default", async (c) => {
  const manager = await getProviderManager();
  const success = manager.setDefaultProvider(c.req.param("id"));
  if (!success) return c.json({ error: "Provider not found" }, 404);
  return c.json({ status: "default_set" });
});

providers.post("/providers/:id/keys", async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    label: string; apiKey?: string;
    oauth?: { clientId: string; clientSecret: string; authUrl: string; tokenUrl: string; scopes: string[] };
  };
  if (!body.label) return c.json({ error: "label is required" }, 400);
  const manager = await getProviderManager();
  const providerId = c.req.param("id");
  const key: ProviderKey = {
    id: `${providerId}-${body.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
    label: body.label, apiKey: body.apiKey, oauth: body.oauth, isDefault: false,
  };
  const success = manager.addKeyToProvider(providerId, key);
  if (!success) return c.json({ error: "Provider not found or unsupported" }, 404);
  return c.json({ status: "added", key: { id: key.id, label: key.label } });
});

providers.delete("/providers/:id/keys/:keyId", async (c) => {
  const manager = await getProviderManager();
  const success = manager.removeKeyFromProvider(c.req.param("id"), c.req.param("keyId"));
  if (!success) return c.json({ error: "Provider or key not found" }, 404);
  return c.json({ status: "removed" });
});

// ── Rate Limit Settings ──
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function getRateLimitPath(): string {
  const confPath = join(process.cwd(), "conf", "providers.json");
  return confPath;
}

function loadRateLimitFromProviders(): Record<string, unknown> {
  try {
    const data = JSON.parse(readFileSync(getRateLimitPath(), "utf-8"));
    return data.rateLimit ?? { rpm: 45, maxConcurrent: 3, maxQueueSize: 50 };
  } catch { return { rpm: 45, maxConcurrent: 3, maxQueueSize: 50 }; }
}

function saveRateLimitToProviders(rateLimit: Record<string, unknown>): void {
  const path = getRateLimitPath();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(readFileSync(path, "utf-8")); } catch (e) { log.debug({ err: e, path }, "Failed to read rate limit config"); }
  data.rateLimit = rateLimit;
  writeFileSync(path, JSON.stringify(data, null, 2));
}

providers.get("/providers/rate-limit", async (c) => {
  return c.json(loadRateLimitFromProviders());
});

providers.put("/providers/rate-limit", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const current = loadRateLimitFromProviders();
  const merged = { ...current, ...body };

  if (typeof merged.rpm === "number") merged.rpm = Math.max(1, Math.min(500, merged.rpm));
  if (typeof merged.maxConcurrent === "number") merged.maxConcurrent = Math.max(1, Math.min(16, merged.maxConcurrent));
  if (typeof merged.maxQueueSize === "number") merged.maxQueueSize = Math.max(5, Math.min(200, merged.maxQueueSize));

  saveRateLimitToProviders(merged);
  return c.json({ status: "saved", rateLimit: merged });
});

// ── Per-Provider Rate Limit Status ──

providers.get("/providers/rate-limit/status", async (c) => {
  const { NarrativeService } = await import("../services/narrative-service");
  // Access providerRateLimiter from the global narrative service instance
  // This is set during server startup in index.ts
  const providerRateLimiter = globalThis.__narrativeService?.providerRateLimiter;
  if (!providerRateLimiter) return c.json({ error: "Provider rate limiter not initialized" }, 500);
  return c.json(providerRateLimiter.getStatus());
});

providers.post("/providers/rate-limit/reset", async (c) => {
  const providerRateLimiter = globalThis.__narrativeService?.providerRateLimiter;
  if (!providerRateLimiter) return c.json({ error: "Provider rate limiter not initialized" }, 500);
  const body = await c.req.json().catch(() => ({})) as { providerId?: string };
  if (body.providerId) {
    providerRateLimiter.resetProvider(body.providerId);
  } else {
    providerRateLimiter.resetAll();
  }
  return c.json({ status: "reset" });
});

providers.post("/providers/rate-limit/switch", async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    agentId: string;
    providerId: string;
    modelId: string;
  };
  if (!body.agentId || !body.providerId) return c.json({ error: "agentId and providerId are required" }, 400);

  try {
    const current = loadAgentConfig(body.agentId);
    await saveAgentConfig(body.agentId, {
      ...current,
      providerId: body.providerId,
      modelId: body.modelId ?? current.modelId,
    });
    return c.json({ status: "switched", agentId: body.agentId, providerId: body.providerId, modelId: body.modelId });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export { providers as providersRouter };
