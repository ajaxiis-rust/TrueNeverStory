/**
 * Entity routes — graph queries, search, neighbors, paths.
 * Replaces entity-related endpoints from world_explorer/api.py.
 */
import { Hono } from "hono";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Navigator } from "../services/navigator";
import type { GraphStore } from "../services/graph-store";

const entities = new Hono();

let _nav: Navigator | null = null;
let _graphStore: GraphStore | null = null;

export function initEntities(nav: Navigator, graphStore: GraphStore): void {
  _nav = nav;
  _graphStore = graphStore;
}

/**
 * GET /entity/:uid — Get entity details.
 */
entities.get("/entity/:uid", async (c) => {
  const uid = c.req.param("uid");
  const layers = c.req.query("layers")?.split(",") ?? undefined;
  if (!_nav) return c.json({ error: "Navigator not initialized" }, 503);
  const data = _nav.getEntity(uid, layers);
  if (!data) return c.json({ error: "not found" }, 404);
  return c.json(data);
});

/**
 * GET /neighbors/:uid — Get entity neighbors with depth traversal.
 */
entities.get("/neighbors/:uid", async (c) => {
  const uid = c.req.param("uid");
  const depth = Number(c.req.query("depth") ?? "1");
  const direction = (c.req.query("direction") ?? "out") as "out" | "in" | "both";
  const layers = c.req.query("layers")?.split(",") ?? undefined;
  if (!_nav) return c.json({ error: "Navigator not initialized" }, 503);

  const neighbors = _nav.getNeighbors(uid, depth, direction, layers);
  return c.json(neighbors);
});

/**
 * GET /path — Find shortest path between entities.
 */
entities.get("/path", async (c) => {
  const source = c.req.query("source") ?? "";
  const target = c.req.query("target") ?? "";
  const layers = c.req.query("layers")?.split(",") ?? undefined;
  if (!_nav) return c.json({ error: "Navigator not initialized" }, 503);

  const path = _nav.findPath(source, target, layers);
  return c.json(path);
});

/**
 * GET /search — Search entities by name or semantic similarity.
 */
entities.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const semantic = c.req.query("semantic") === "true";
  const topK = Number(c.req.query("top_k") ?? "10");
  const entityType = c.req.query("entity_type") ?? undefined;
  const page = Number(c.req.query("page") ?? "1");
  const pageSize = Math.min(Number(c.req.query("page_size") ?? "20"), 100);

  if (!_nav) return c.json({ error: "Navigator not initialized" }, 503);

  let results: unknown[];
  if (semantic) {
    results = _nav.semanticSearch(q, topK);
  } else {
    results = _nav.searchByName(q, entityType, topK);
  }

  const total = results.length;
  const start = (page - 1) * pageSize;
  const paged = results.slice(start, start + pageSize);

  return c.json({ results: paged, total, page, page_size: pageSize });
});

/**
 * GET /graph/summary — Get graph statistics.
 */
entities.get("/graph/summary", async (c) => {
  if (!_graphStore) return c.json({ error: "GraphStore not initialized" }, 503);
  return c.json(_graphStore.getSummary());
});

/**
 * GET /graph/d3 — Get graph data in d3-force format.
 * Query param: mode=relationships|crafting
 */
entities.get("/graph/d3", async (c) => {
  try {
    if (!_graphStore) return c.json({ error: "GraphStore not initialized" }, 503);
    const mode = c.req.query("mode") ?? "relationships";

    if (mode === "crafting") {
      const recipesPath = join(process.cwd(), "src", "data", "recipes.json");
      if (!existsSync(recipesPath)) return c.json({ nodes: [], links: [] });

      const raw = JSON.parse(readFileSync(recipesPath, "utf-8"));
      const recipes = raw.recipes ?? [];
      const nodeMap = new Map<string, { id: string; name: string; nameRu: string; type: string; group: string }>();
      const links: Array<{ source: string; target: string; label: string; strength: number }> = [];

      for (const r of recipes) {
        if (!nodeMap.has(r.result)) {
          nodeMap.set(r.result, { id: r.result, name: r.name, nameRu: r.nameRu, type: "result", group: r.category });
        }
        for (const ing of r.ingredients) {
          if (!nodeMap.has(ing)) {
            nodeMap.set(ing, { id: ing, name: ing, nameRu: ing, type: "ingredient", group: r.category });
          }
          links.push({ source: ing, target: r.result, label: r.name, strength: r.difficulty === "easy" ? 0.8 : r.difficulty === "medium" ? 0.5 : 0.3 });
        }
      }

      return c.json({ nodes: Array.from(nodeMap.values()), links });
    }

    // Default: relationships
    const allNodes = _graphStore.entityStore.allNodes();
    const nodeMap = new Map<string, { id: string; name: string; type: string; group: number }>();
    const typeToGroup: Record<string, number> = { Character: 0, Location: 1, Item: 2, Faction: 3, WorldRule: 4, Unknown: 5 };
    const links: Array<{ source: string; target: string; label: string; strength: number }> = [];

    for (const ent of allNodes) {
      const group = typeToGroup[ent.entityType] ?? 5;
      nodeMap.set(ent.uid, { id: ent.uid, name: ent.name, type: ent.entityType, group });
    }

    for (const ent of allNodes) {
      const rels = ent.profile.relationships;
      for (const rel of rels) {
        const targetName = rel.target as string;
        const targetNode = _graphStore.entityStore.getByName(targetName);
        if (targetNode && nodeMap.has(targetNode.uid)) {
          links.push({
            source: ent.uid,
            target: targetNode.uid,
            label: (rel.type as string) ?? "knows",
            strength: (rel.strength as number) ?? 0.5,
          });
        }
      }
    }

    return c.json({ nodes: Array.from(nodeMap.values()), links });
  } catch (err) {
    return c.json({ error: "Failed to build graph data" }, 500);
  }
});

export { entities as entitiesRouter };
