/**
 * Navigator — graph query interface.
 * Replaces world_explorer/navigator.py.
 */
import { UnifiedEntityStore } from "../store/entity-store";

export class Navigator {
  constructor(private store: UnifiedEntityStore) {}

  getEntity(uid: string, layers?: string[]): Record<string, unknown> | null {
    const node = this.store.get(uid);
    if (!node) return null;
    const data: Record<string, unknown> = {
      uid: node.uid,
      name: node.name,
      entity_type: node.entityType,
    };
    if (layers) {
      data.profile = node.profile.getEffectiveData(layers);
    } else {
      data.profile = node.profile.toDict();
    }
    return data;
  }

  getNeighbors(uid: string, depth = 1, direction = "out", layers?: string[]): unknown {
    const node = this.store.get(uid);
    if (!node) return { neighbors: [] };

    const neighbors: unknown[] = [];
    const seen = new Set<string>();

    if (direction === "out" || direction === "both") {
      for (const rel of node.profile.relationships) {
        const targetNode = this.store.getByName(rel.target as string);
        if (targetNode && !seen.has(targetNode.uid)) {
          seen.add(targetNode.uid);
          const data: Record<string, unknown> = {
            uid: targetNode.uid,
            name: targetNode.name,
            entity_type: targetNode.entityType,
            relationship: rel,
          };
          if (layers) data.profile = targetNode.profile.getEffectiveData(layers);
          neighbors.push(data);
        }
      }
    }

    if (direction === "in" || direction === "both") {
      for (const otherNode of this.store.allNodes()) {
        for (const rel of otherNode.profile.relationships) {
          const targetRef = rel.target as string;
          const targetN = this.store.getByName(targetRef);
          if (targetN?.uid === uid && !seen.has(otherNode.uid)) {
            seen.add(otherNode.uid);
            const data: Record<string, unknown> = {
              uid: otherNode.uid,
              name: otherNode.name,
              entity_type: otherNode.entityType,
              relationship: rel,
            };
            if (layers) data.profile = otherNode.profile.getEffectiveData(layers);
            neighbors.push(data);
          }
        }
      }
    }

    return { neighbors, depth, direction };
  }

  findPath(source: string, target: string, layers?: string[]): unknown {
    // BFS path finding — bidirectional (follows both outgoing and incoming relationships)
    const sourceNode = this.store.getByName(source);
    const targetNode = this.store.getByName(target);
    if (!sourceNode || !targetNode) {
      return { error: "Entity not found", source, target };
    }
    if (sourceNode.uid === targetNode.uid) {
      return { path: [sourceNode.uid], length: 0 };
    }

    // Build adjacency: uid → Set of neighbor uids (both directions)
    const allNodes = this.store.allNodes();
    const adj = new Map<string, Set<string>>();
    for (const node of allNodes) {
      adj.set(node.uid, new Set());
    }
    for (const node of allNodes) {
      for (const rel of node.profile.relationships) {
        const targetRef = rel.target as string;
        const targetN = this.store.getByName(targetRef);
        if (targetN) {
          adj.get(node.uid)?.add(targetN.uid);
          adj.get(targetN.uid)?.add(node.uid);
        }
      }
    }

    // BFS
    const queue: Array<{ uid: string; path: string[] }> = [{ uid: sourceNode.uid, path: [sourceNode.uid] }];
    const visited = new Set<string>([sourceNode.uid]);

    while (queue.length > 0) {
      const { uid, path } = queue.shift()!;
      const neighbors = adj.get(uid);
      if (!neighbors) continue;

      for (const neighborUid of neighbors) {
        if (visited.has(neighborUid)) continue;
        visited.add(neighborUid);

        const newPath = [...path, neighborUid];
        if (neighborUid === targetNode.uid) {
          return { path: newPath, length: newPath.length - 1 };
        }
        queue.push({ uid: neighborUid, path: newPath });
      }
    }

    return { path: [], length: -1, error: "No path found" };
  }

  searchByName(query: string, entityType?: string, limit = 20): unknown[] {
    return this.store.search(query, entityType, limit).map((node) => ({
      uid: node.uid,
      name: node.name,
      entity_type: node.entityType,
      summary: node.profile.summary,
    }));
  }

  semanticSearch(query: string, topK = 10): unknown[] {
    // Fallback to text search for now — semantic search via MAX Serve
    return this.searchByName(query, undefined, topK);
  }
}
