/**
 * Maintenance routes — full implementation.
 * Replaces api.py maintenance endpoints.
 */
import { Hono } from "hono";

interface MaintenanceDeps {
  worldMemory?: {
    optimizer?: { runFullMaintenance?: () => Promise<unknown>; getStats?: () => Record<string, unknown> };
    triggerConsolidation?: () => Promise<void>;
    clearOldEntries?: () => Promise<number>;
    getStats?: () => Promise<Record<string, unknown>>;
    rebuildFaissIndex?: () => Promise<void>;
    cleanOrphanedEmbeddings?: () => Promise<number>;
  };
}

const maintenance = new Hono();

let _deps: MaintenanceDeps | null = null;

export function initMaintenance(deps: MaintenanceDeps): void {
  _deps = deps;
}

maintenance.post("/maintenance/run", async (c) => {
  const full = c.req.query("full") !== "false";

  if (!_deps?.worldMemory) {
    return c.json({ status: "error", error: "WorldMemory not initialized" }, 503);
  }

  try {
    if (full) {
      const report = await _deps.worldMemory.optimizer?.runFullMaintenance?.();
      return c.json({ status: "complete", full: true, report });
    } else {
      await _deps.worldMemory.triggerConsolidation?.();
      const removed = await _deps.worldMemory.clearOldEntries?.();
      return c.json({ status: "complete", full: false, old_entries_removed: removed ?? 0 });
    }
  } catch (err) {
    return c.json({ status: "error", error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

maintenance.get("/maintenance/status", async (c) => {
  if (!_deps?.worldMemory) {
    return c.json({ memory: {}, maintenance: {} });
  }

  try {
    const stats = await _deps.worldMemory.getStats?.() ?? {};
    const optimizerStats = _deps.worldMemory.optimizer?.getStats?.() ?? {};
    return c.json({ memory: stats, maintenance: optimizerStats });
  } catch {
    return c.json({ memory: {}, maintenance: {} });
  }
});

maintenance.post("/maintenance/rebuild-index", async (c) => {
  if (!_deps?.worldMemory) {
    return c.json({ status: "error", error: "WorldMemory not initialized" }, 503);
  }

  try {
    await _deps.worldMemory.rebuildFaissIndex?.();
    const stats = await _deps.worldMemory.getStats?.() ?? {};
    return c.json({ status: "rebuilt", index_size: stats.faiss_index_size ?? 0 });
  } catch (err) {
    return c.json({ status: "error", error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

maintenance.post("/maintenance/clean-orphans", async (c) => {
  if (!_deps?.worldMemory) {
    return c.json({ status: "error", error: "WorldMemory not initialized" }, 503);
  }

  try {
    const removed = await _deps.worldMemory.cleanOrphanedEmbeddings?.();
    return c.json({ status: "cleaned", orphans_removed: removed ?? 0 });
  } catch (err) {
    return c.json({ status: "error", error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export { maintenance as maintenanceRouter };
