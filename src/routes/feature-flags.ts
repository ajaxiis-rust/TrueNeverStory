/**
 * Feature Flags routes — manage A/B testing and gradual rollout.
 */

import { Hono } from "hono";
import { getFeatureFlagManager } from "../lib/feature-flags";
import { getLogger } from "../utils/logger";

const log = getLogger("feature-flags-route");
const flags = new Hono();

/**
 * GET /api/feature-flags — List all feature flags.
 */
flags.get("/feature-flags", async (c) => {
  const manager = getFeatureFlagManager();
  return c.json({ flags: manager.getAll(), exposures: manager.getExposures() });
});

/**
 * GET /api/feature-flags/:id — Get single flag.
 */
flags.get("/feature-flags/:id", async (c) => {
  const manager = getFeatureFlagManager();
  const flag = manager.get(c.req.param("id"));
  if (!flag) return c.json({ error: "Flag not found" }, 404);
  return c.json({ flag });
});

/**
 * POST /api/feature-flags — Create new flag.
 */
flags.post("/feature-flags", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const manager = getFeatureFlagManager();
  try {
    const flag = manager.create(body);
    return c.json({ status: "created", flag });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

/**
 * PUT /api/feature-flags/:id — Update flag.
 */
flags.put("/feature-flags/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const manager = getFeatureFlagManager();
  const updated = manager.update(c.req.param("id"), body);
  if (!updated) return c.json({ error: "Flag not found" }, 404);
  return c.json({ status: "updated", flag: manager.get(c.req.param("id")) });
});

/**
 * DELETE /api/feature-flags/:id — Delete flag.
 */
flags.delete("/feature-flags/:id", async (c) => {
  const manager = getFeatureFlagManager();
  const deleted = manager.delete(c.req.param("id"));
  if (!deleted) return c.json({ error: "Flag not found" }, 404);
  return c.json({ status: "deleted" });
});

/**
 * POST /api/feature-flags/:id/check — Check if flag is enabled for context.
 */
flags.post("/feature-flags/:id/check", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { userId?: string; [key: string]: unknown };
  const manager = getFeatureFlagManager();
  const flagId = c.req.param("id");

  const enabled = manager.isEnabled(flagId, body);
  const variant = manager.getVariant(flagId, body);
  const payload = manager.getVariantPayload(flagId, body);

  if (enabled && variant) {
    manager.trackExposure(flagId, variant, body.userId);
  }

  return c.json({ flagId, enabled, variant, payload });
});

export { flags as featureFlagsRouter };
