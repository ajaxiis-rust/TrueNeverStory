/**
 * Agent monitoring routes — aggregated metrics for the dashboard.
 */
import { Hono } from "hono";
import { loadAllAgentConfigs } from "../services/agent-config";
import { getProviderManager, type AgentModelAssignment } from "../lib/providers";
import { getLogger } from "../utils/logger";

const log = getLogger("monitoring-route");
const monitoring = new Hono();

/** In-memory invocation counters (reset on server restart) */
const invocations = new Map<string, { count: number; errors: number; lastUsed: number; latencySum: number }>();

export function trackInvocation(agentId: string, latencyMs: number, isError = false): void {
  const entry = invocations.get(agentId) ?? { count: 0, errors: 0, lastUsed: 0, latencySum: 0 };
  entry.count++;
  if (isError) entry.errors++;
  entry.lastUsed = Date.now();
  entry.latencySum += latencyMs;
  invocations.set(agentId, entry);
}

/**
 * GET /monitoring/dashboard — aggregated dashboard data.
 */
monitoring.get("/monitoring/dashboard", async (c) => {
  const agents = loadAllAgentConfigs();
  let providers: { id: string; name: string; isAvailable: boolean }[] = [];
  let assignments: AgentModelAssignment[] = [];

  try {
    const manager = await getProviderManager();
    providers = manager.getProviders().map((p) => ({
      id: p.id,
      name: p.name,
      isAvailable: p.isAvailable,
    }));
    assignments = manager.getAssignments();
  } catch {
    log.warn("Could not load provider data");
  }

  const assignmentMap = new Map<string, AgentModelAssignment>();
  for (const a of assignments) {
    assignmentMap.set(a.agentId, a);
  }

  const agentData = agents.map((a) => {
    const stats = invocations.get(a.id) ?? { count: 0, errors: 0, lastUsed: 0, latencySum: 0 };
    const assignment = assignmentMap.get(a.id);
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      enabled: a.enabled,
      providerId: a.providerId || null,
      modelId: a.modelId || null,
      temperature: a.temperature,
      maxTokens: a.maxTokens,
      priority: a.priority,
      assignment: assignment?.modelId || null,
      invocations: stats.count,
      errors: stats.errors,
      lastUsed: stats.lastUsed ? new Date(stats.lastUsed).toISOString() : null,
      avgLatency: stats.count > 0 ? Math.round(stats.latencySum / stats.count) : 0,
    };
  });

  const totalInvocations = agentData.reduce((s, a) => s + a.invocations, 0);
  const totalErrors = agentData.reduce((s, a) => s + a.errors, 0);
  const enabledCount = agentData.filter((a) => a.enabled).length;

  return c.json({
    agents: agentData,
    providers,
    summary: {
      totalAgents: agentData.length,
      enabledAgents: enabledCount,
      disabledAgents: agentData.length - enabledCount,
      totalInvocations,
      totalErrors,
      providers: providers.length,
      providersOnline: providers.filter((p) => p.isAvailable).length,
    },
  });
});

/**
 * GET /monitoring/stats — lightweight stats for polling.
 */
monitoring.get("/monitoring/stats", async (c) => {
  const agents = loadAllAgentConfigs();
  const enabledCount = agents.filter((a) => a.enabled).length;
  const totalInvocations = Array.from(invocations.values()).reduce((s, e) => s + e.count, 0);
  const totalErrors = Array.from(invocations.values()).reduce((s, e) => s + e.errors, 0);

  return c.json({
    totalAgents: agents.length,
    enabledAgents: enabledCount,
    totalInvocations,
    totalErrors,
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

export { monitoring as monitoringRouter };
