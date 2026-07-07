/**
 * Health check and system routes.
 */
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  return c.json({
    status: "ok",
    engine_ready: true,
    uptime: process.uptime(),
    version: "v0.21.0",
  });
});

health.get("/system-check", async (c) => {
  return c.json({
    ok: true,
    message: "System operational",
    node_version: process.version,
    platform: process.platform,
  });
});

export { health as healthRouter };
