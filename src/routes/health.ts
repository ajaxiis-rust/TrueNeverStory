/**
 * Health check and system routes.
 */
import { Hono } from "hono";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

const health = new Hono();

health.get("/health", async (c) => {
  return c.json({
    status: "ok",
    engine_ready: true,
    uptime: process.uptime(),
    version: "v" + pkg.version,
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
