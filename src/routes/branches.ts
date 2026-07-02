/**
 * Branch management routes.
 * Replaces world_explorer/routes/branches.py.
 */
import { Hono } from "hono";
import type { GraphStore } from "../services/graph-store";

const branches = new Hono();

let _graphStore: GraphStore | null = null;

export function initBranches(graphStore: GraphStore): void {
  _graphStore = graphStore;
}

/**
 * POST /branch/create — Create a new branch.
 */
branches.post("/branch/create", async (c) => {
  const name = c.req.query("name") ?? "";
  const fromBranch = c.req.query("from_branch") ?? "main";
  if (!name) return c.json({ error: "name is required" }, 400);
  if (!_graphStore) return c.json({ error: "GraphStore not initialized" }, 503);

  try {
    _graphStore.branches.create(name, fromBranch);
    return c.json({ status: "created", branch: name });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

/**
 * POST /branch/switch — Switch to a different branch.
 */
branches.post("/branch/switch", async (c) => {
  const name = c.req.query("name") ?? "";
  if (!name) return c.json({ error: "name is required" }, 400);
  if (!_graphStore) return c.json({ error: "GraphStore not initialized" }, 503);

  try {
    _graphStore.branches.switch(name);
    return c.json({ active_branch: name });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

/**
 * POST /branch/merge — Merge a branch into main.
 */
branches.post("/branch/merge", async (c) => {
  const name = c.req.query("name") ?? "";
  if (!name) return c.json({ error: "name is required" }, 400);
  if (!_graphStore) return c.json({ error: "GraphStore not initialized" }, 503);

  try {
    _graphStore.branches.mergeIntoMain(name);
    return c.json({ status: "merged" });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

/**
 * GET /branch/list — List all branches.
 */
branches.get("/branch/list", async (c) => {
  if (!_graphStore) return c.json({ error: "GraphStore not initialized" }, 503);
  const branchList = _graphStore.branches.listBranches();
  return c.json({ branches: branchList, active: _graphStore.branches.active });
});

export { branches as branchesRouter };
