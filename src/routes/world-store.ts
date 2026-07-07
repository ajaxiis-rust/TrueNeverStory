/**
 * World Store routes — migration and management.
 */

import { Hono } from "hono";
import { WorldStore } from "../store/world-store";
import { getConfig } from "../config/env";
import { join } from "node:path";
import { getActiveWorld } from "../services/agent-config";
import { getLogger } from "../utils/logger";

const log = getLogger("world-store-route");
const store = new Hono();

function getWorldPath(world?: string): string {
  const cfg = getConfig();
  const w = world ?? getActiveWorld();
  return join(cfg.WORLDS_ROOT, w);
}

/**
 * POST /api/world-store/migrate — Migrate JSON files to SQLite.
 */
store.post("/world-store/migrate", async (c) => {
  const world = c.req.query("world") ?? getActiveWorld();
  const worldPath = getWorldPath(world);

  try {
    const worldStore = new WorldStore(worldPath);
    const result = await worldStore.migrate();
    worldStore.close();

    return c.json({
      status: "migrated",
      world,
      ...result,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * GET /api/world-store/stats — Get migration stats.
 */
store.get("/world-store/stats", async (c) => {
  const world = c.req.query("world") ?? getActiveWorld();
  const worldPath = getWorldPath(world);

  try {
    const worldStore = new WorldStore(worldPath);
    const stats = worldStore.getStats();
    worldStore.close();

    return c.json({ world, stats });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * GET /api/world-store/quests — Get quests from SQLite.
 */
store.get("/world-store/quests", async (c) => {
  const world = c.req.query("world") ?? getActiveWorld();
  const worldPath = getWorldPath(world);

  try {
    const worldStore = new WorldStore(worldPath);
    const quests = worldStore.getQuests();
    worldStore.close();

    return c.json({ world, quests });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * GET /api/world-store/npc-memories/:uid — Get NPC memories.
 */
store.get("/world-store/npc-memories/:uid", async (c) => {
  const world = c.req.query("world") ?? getActiveWorld();
  const uid = c.req.param("uid");
  const type = c.req.query("type");
  const worldPath = getWorldPath(world);

  try {
    const worldStore = new WorldStore(worldPath);
    const memories = worldStore.getNPCMemories(uid, type);
    worldStore.close();

    return c.json({ world, uid, memories });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * GET /api/world-store/frame — Get world frame from SQLite.
 */
store.get("/world-store/frame", async (c) => {
  const world = c.req.query("world") ?? getActiveWorld();
  const worldPath = getWorldPath(world);

  try {
    const worldStore = new WorldStore(worldPath);
    const frame = worldStore.getWorldFrame();
    worldStore.close();

    return c.json({ world, frame });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export { store as worldStoreRouter };
