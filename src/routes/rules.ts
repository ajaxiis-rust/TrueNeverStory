/**
 * Rules Engine routes — manage social/economic rules for worlds.
 */

import { Hono } from "hono";
import { RulesEngine, type RulesConfig } from "../rules/rules-engine";
import { getLogger } from "../utils/logger";
import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";

const log = getLogger("rules-route");
const rules = new Hono();

const SOCIAL_DIR = join(import.meta.dir, "..", "rules", "social");
const ECONOMY_DIR = join(import.meta.dir, "..", "rules", "economy");

/**
 * GET /api/rules — List available rules.
 */
rules.get("/rules", async (c) => {
  const socialRules = existsSync(SOCIAL_DIR)
    ? readdirSync(SOCIAL_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
    : [];
  const economyRules = existsSync(ECONOMY_DIR)
    ? readdirSync(ECONOMY_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
    : [];

  return c.json({ social: socialRules, economy: economyRules });
});

/**
 * GET /api/rules/:id — Get specific rule details.
 */
rules.get("/rules/:id", async (c) => {
  try {
    const engine = new RulesEngine({ primary: c.req.param("id") });
    return c.json({ rule: engine.getRules() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
  }
});

/**
 * POST /api/rules/preview — Preview merged rules with modifiers.
 */
rules.post("/rules/preview", async (c) => {
  const body = await c.req.json().catch(() => ({})) as RulesConfig;
  try {
    const engine = new RulesEngine(body);
    return c.json({ merged: engine.getRules() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

/**
 * POST /api/rules/check — Check if an action is allowed.
 */
rules.post("/rules/check", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { config: RulesConfig; action: string; superiorClass?: string; subordinateClass?: string };
  try {
    const engine = new RulesEngine(body.config);
    const result: Record<string, unknown> = {
      allowed: engine.canAct(body.action),
      penalty: engine.getPenalty(body.action),
    };

    if (body.superiorClass && body.subordinateClass) {
      result.canCommand = engine.canCommand(body.superiorClass, body.subordinateClass);
    }

    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

export { rules as rulesRouter };
