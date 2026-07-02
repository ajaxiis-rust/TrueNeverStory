/**
 * Probability routes — full implementation.
 * Replaces api.py probability endpoints.
 */
import { Hono } from "hono";
import type { ProbabilityEngine } from "../services/probability-engine";
import type { IContextResolver } from "../services/probability-types";
import type { UnifiedEntityStore } from "../store/entity-store";
import { getProfile } from "../services/probability-profiles";
import { ModifierType, ProbabilityModifier } from "../models/probability";

const probability = new Hono();

let _probEngine: ProbabilityEngine | null = null;
let _probResolver: IContextResolver | null = null;
let _entityStore: UnifiedEntityStore | null = null;

export function initProbability(probEngine: ProbabilityEngine, probResolver: IContextResolver, entityStore: UnifiedEntityStore): void {
  _probEngine = probEngine;
  _probResolver = probResolver;
  _entityStore = entityStore;
}

/**
 * GET /probability/:character/:profile — Get success probability.
 */
probability.get("/probability/:character/:profile", async (c) => {
  const character = c.req.param("character");
  const profile = c.req.param("profile");
  const target = c.req.query("target") ?? null;

  if (!_probEngine) {
    return c.json({ character, profile, target, probability: 0.5, note: "probability engine not initialized" });
  }

  try {
    const profileObj = getProfile(profile);
    if (!profileObj) return c.json({ error: `Profile ${profile} not found` }, 404);

    if (!_probResolver) return c.json({ character, profile, probability: 0.5, note: "resolver not initialized" });
    const ctx = await _probResolver.buildContext(character, target, profile);
    const prob = _probEngine.getSuccessChance(profileObj, ctx, character);
    return c.json({ character, profile, probability: prob });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * POST /probability/modifier — Apply a probability modifier.
 */
probability.post("/probability/modifier", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const entity = body.entity as string;
  const parameter = body.parameter as string;
  const value = body.value as number;
  const duration = body.duration_seconds as number | undefined;

  if (!entity || !parameter || value === undefined) {
    return c.json({ error: "entity, parameter, and value are required" }, 400);
  }

  if (!_probEngine) {
    return c.json({ status: "applied", note: "probability engine not initialized" });
  }

  try {
    const uid = entity.includes(":") ? entity : `Character:${entity}`;
    _probEngine.applyModifier(uid, new ProbabilityModifier({
      parameter_name: parameter,
      value,
      modifier_type: ModifierType.ADD,
      duration_seconds: duration ?? null,
      expires_at: duration ? Date.now() / 1000 + duration : null,
      source: "api",
    }));
    return c.json({ status: "applied", entity: uid, parameter, value });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * GET /probability/modifiers/:entity — Get active modifiers.
 */
probability.get("/probability/modifiers/:entity", async (c) => {
  const entity = c.req.param("entity");
  if (!_probEngine) {
    return c.json({ entity, modifiers: [] });
  }

  const uid = entity.includes(":") ? entity : `Character:${entity}`;
  const mods = _probEngine.getAllModifiers(uid);
  return c.json({ entity: uid, modifiers: mods });
});

export { probability as probabilityRouter };
