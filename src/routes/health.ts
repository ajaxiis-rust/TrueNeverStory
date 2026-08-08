/**
 * Health check and system routes.
 */
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("health-route");

let version = "0.0.0";
try {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
  version = pkg.version;
} catch (err) { log.debug({ err }, 'package.json version read skipped, using fallback'); }

const health = new Hono();

health.get("/health", async (c) => {
  return c.json({
    status: "ok",
    engine_ready: true,
    uptime: process.uptime(),
    version: "v" + version,
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
