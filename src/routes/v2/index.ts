/**
 * API v2 — enhanced endpoints with plugin support and registry.
 */

import { Hono } from "hono";
import { agentsRouter } from "../agents";
import { worldsRouter } from "../worlds";
import { settingsRouter } from "../settings";
import { rulesRouter } from "../rules";
import { featureFlagsRouter } from "../feature-flags";
import { getAgentRegistry } from "../../services/agent-registry";

const v2 = new Hono();

v2.route("/", agentsRouter);
v2.route("/", worldsRouter);
v2.route("/", settingsRouter);
v2.route("/", rulesRouter);
v2.route("/", featureFlagsRouter);

/**
 * GET /api/v2/agents — Enhanced agent list with registry info.
 */
v2.get("/agents", async (c) => {
  const registry = await getAgentRegistry();
  return c.json({
    agents: registry.getByPriority(),
    stats: registry.getStats(),
    version: "v2",
  });
});

export { v2 as v2Router };
