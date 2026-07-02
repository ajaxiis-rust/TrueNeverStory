/**
 * Memory management routes.
 * Replaces world_explorer/routes/memory.py + api.py memory endpoints.
 */
import { Hono } from "hono";
import type { WebSocketManager } from "../services/websocket-manager";
import type { WorldMemory } from "../memory/world-memory";
import { getLogger } from "../utils/logger";

const log = getLogger("memory-route");

const memory = new Hono();

let _wsManager: WebSocketManager | null = null;
let _worldMemory: WorldMemory | null = null;

export function initMemory(wsManager: WebSocketManager, worldMemory?: WorldMemory): void {
  _wsManager = wsManager;
  _worldMemory = worldMemory ?? null;
}

/**
 * POST /memory/forget — Forget old, low-importance memories.
 */
memory.post("/memory/forget", async (c) => {
  const olderThan = Number(c.req.query("older_than") ?? "30");
  const minImportance = Number(c.req.query("min_importance") ?? "0.2");

  if (!_worldMemory) {
    return c.json({ error: "WorldMemory not initialized" }, 503);
  }

  try {
    const removed = await _worldMemory.forgetOldEntries(olderThan, minImportance);
    return c.json({ removed, older_than: olderThan, min_importance: minImportance });
  } catch (err) {
    log.error({ err }, "Failed to forget entries");
    return c.json({ error: "Failed to forget entries" }, 500);
  }
});

/**
 * POST /memory/summarise — Summarise memories with a tag or node UID.
 */
memory.post("/memory/summarise", async (c) => {
  const tag = c.req.query("tag");
  const nodeUid = c.req.query("node_uid");
  if (!tag && !nodeUid) {
    return c.json({ error: "Provide tag or node_uid" }, 400);
  }

  if (!_worldMemory) {
    return c.json({ error: "WorldMemory not initialized" }, 503);
  }

  try {
    const query = tag ?? nodeUid!;
    const results = await _worldMemory.retrieve({ query, topK: 50, minImportance: 0 });
    const consolidated = 0;
    return c.json({ consolidated, found: results.length });
  } catch (err) {
    log.error({ err }, "Failed to summarise memories");
    return c.json({ error: "Failed to summarise" }, 500);
  }
});

/**
 * GET /memory/export — Export all memories.
 */
memory.get("/memory/export", async (c) => {
  const fmt = c.req.query("fmt") ?? "json";

  if (!_worldMemory) {
    return c.json({ data: [], format: fmt });
  }

  try {
    const buffer = await _worldMemory.exportMemories();
    return c.json({ data: JSON.parse(buffer.toString()), format: fmt });
  } catch (err) {
    log.error({ err }, "Failed to export memories");
    return c.json({ data: [], format: fmt });
  }
});

/**
 * POST /memory/import — Import memories from file.
 */
memory.post("/memory/import", async (c) => {
  if (!_worldMemory) {
    return c.json({ error: "WorldMemory not initialized" }, 503);
  }

  try {
    const body = await c.req.json();
    const data = Buffer.from(JSON.stringify(body.data ?? []));
    await _worldMemory.importMemories(data);
    return c.json({ status: "imported", count: (body.data as unknown[])?.length ?? 0 });
  } catch (err) {
    log.error({ err }, "Failed to import memories");
    return c.json({ error: "Failed to import" }, 500);
  }
});

/**
 * POST /memory/update/:entryId — Update a memory entry.
 */
memory.post("/memory/update/:entryId", async (c) => {
  const entryId = c.req.param("entryId");

  if (!_worldMemory) {
    return c.json({ error: "WorldMemory not initialized" }, 503);
  }

  try {
    const body = await c.req.json();
    const newContent = body.content as string;
    if (!newContent) {
      return c.json({ error: "content is required" }, 400);
    }
    const newId = await _worldMemory.updateMemory(entryId, newContent);
    if (!newId) {
      return c.json({ error: "Entry not found" }, 404);
    }
    return c.json({ status: "updated", new_entry_id: newId });
  } catch (err) {
    log.error({ err }, "Failed to update memory");
    return c.json({ error: "Failed to update" }, 500);
  }
});

/**
 * GET /memory/stats — Get memory system statistics.
 */
memory.get("/memory/stats", async (c) => {
  if (!_worldMemory) {
    return c.json({ activeEntries: 0, faissIndexSize: 0, partitionCount: 0 });
  }

  try {
    const stats = await _worldMemory.getStats();
    return c.json(stats);
  } catch (err) {
    return c.json({ activeEntries: 0, faissIndexSize: 0, partitionCount: 0 });
  }
});

/**
 * POST /memory/rebuild — Rebuild the FAISS vector index.
 */
memory.post("/memory/rebuild", async (c) => {
  if (!_worldMemory) {
    return c.json({ error: "WorldMemory not initialized" }, 503);
  }

  try {
    await _worldMemory.faissIndex.rebuild();
    return c.json({ status: "rebuilt" });
  } catch (err) {
    log.error({ err }, "Failed to rebuild index");
    return c.json({ error: "Failed to rebuild" }, 500);
  }
});

/**
 * GET /memory/retrieve — Semantic search over memories.
 */
memory.get("/memory/retrieve", async (c) => {
  const query = c.req.query("q");
  const topK = Number(c.req.query("top_k") ?? "10");

  if (!query) {
    return c.json({ error: "q parameter is required" }, 400);
  }

  if (!_worldMemory) {
    return c.json({ results: [] });
  }

  try {
    const results = await _worldMemory.retrieve({ query, topK });
    return c.json({ results });
  } catch (err) {
    log.error({ err }, "Failed to retrieve memories");
    return c.json({ results: [] });
  }
});

export { memory as memoryRouter };
