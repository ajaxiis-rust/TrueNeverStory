/**
 * Social network analysis tools for the world graph.
 * Replaces world_intelligence/graph_analyzer.py.
 * Implements degree, betweenness, and closeness centrality.
 */

import type { GraphStore } from "../services/graph-store";

interface NodeInfo {
  uid: string;
  name: string;
  type: string;
}

interface CentralityReport {
  topDegree: Array<NodeInfo & { degree: number; betweenness: number; closeness: number }>;
  topBetweenness: Array<NodeInfo & { betweenness: number }>;
  topCloseness: Array<NodeInfo & { closeness: number }>;
}

export class GraphAnalyzer {
  private _store: GraphStore;

  constructor(store: GraphStore) {
    this._store = store;
  }

  /**
   * Compute degree, betweenness, and closeness centrality for all nodes.
   */
  centralityReport(topN = 10): CentralityReport {
    const entities = this._store.entityStore.allNodes();
    const nodeUids = entities.map((e) => e.uid);
    const nodeMap = new Map(entities.map((e) => [e.uid, e]));

    // Build adjacency list (bidirectional)
    const adj = new Map<string, Set<string>>();
    for (const uid of nodeUids) {
      adj.set(uid, new Set());
    }
    for (const entity of entities) {
      for (const rel of entity.profile.relationships) {
        const targetRef = rel.target as string;
        const targetNode = this._store.entityStore.getByName(targetRef);
        if (targetNode && adj.has(entity.uid) && adj.has(targetNode.uid)) {
          adj.get(entity.uid)!.add(targetNode.uid);
          adj.get(targetNode.uid)!.add(entity.uid);
        }
      }
    }

    // Degree centrality
    const degreeCentrality = new Map<string, number>();
    for (const uid of nodeUids) {
      const degree = adj.get(uid)?.size ?? 0;
      degreeCentrality.set(uid, nodeUids.length > 1 ? degree / (nodeUids.length - 1) : 0);
    }

    // Betweenness centrality (Brandes algorithm)
    const betweenness = this._computeBetweenness(nodeUids, adj);

    // Closeness centrality
    const closeness = this._computeCloseness(nodeUids, adj);

    // Sort by degree
    const sorted = Array.from(degreeCentrality.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    const topDegree = sorted.map(([uid, degree]) => {
      const node = nodeMap.get(uid);
      return {
        uid,
        name: node?.name ?? uid,
        type: node?.entityType ?? "?",
        degree: Math.round(degree * 1000) / 1000,
        betweenness: Math.round((betweenness.get(uid) ?? 0) * 1000) / 1000,
        closeness: Math.round((closeness.get(uid) ?? 0) * 1000) / 1000,
      };
    });

    // Top betweenness
    const sortedBet = Array.from(betweenness.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    const topBetweenness = sortedBet.map(([uid, score]) => {
      const node = nodeMap.get(uid);
      return {
        uid,
        name: node?.name ?? uid,
        type: node?.entityType ?? "?",
        betweenness: Math.round(score * 1000) / 1000,
      };
    });

    // Top closeness
    const sortedCl = Array.from(closeness.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    const topCloseness = sortedCl.map(([uid, score]) => {
      const node = nodeMap.get(uid);
      return {
        uid,
        name: node?.name ?? uid,
        type: node?.entityType ?? "?",
        closeness: Math.round(score * 1000) / 1000,
      };
    });

    return { topDegree, topBetweenness, topCloseness };
  }

  /**
   * Brandes algorithm for betweenness centrality.
   */
  private _computeBetweenness(
    nodes: string[],
    adj: Map<string, Set<string>>,
  ): Map<string, number> {
    const betweenness = new Map<string, number>();
    for (const n of nodes) betweenness.set(n, 0);

    for (const s of nodes) {
      // BFS from s
      const stack: string[] = [];
      const predecessors = new Map<string, string[]>();
      const sigma = new Map<string, number>();
      const distance = new Map<string, number>();
      const queue: string[] = [s];

      for (const n of nodes) {
        predecessors.set(n, []);
        sigma.set(n, 0);
        distance.set(n, -1);
      }
      sigma.set(s, 1);
      distance.set(s, 0);

      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);
        for (const w of adj.get(v) ?? []) {
          // First time visiting w?
          if ((distance.get(w) ?? -1) < 0) {
            distance.set(w, (distance.get(v) ?? 0) + 1);
            queue.push(w);
          }
          // Shortest path to w via v?
          if ((distance.get(w) ?? 0) === (distance.get(v) ?? 0) + 1) {
            sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
            predecessors.get(w)!.push(v);
          }
        }
      }

      // Back-propagation
      const delta = new Map<string, number>();
      for (const n of nodes) delta.set(n, 0);

      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of predecessors.get(w) ?? []) {
          const contrib = ((sigma.get(v) ?? 0) / (sigma.get(w) ?? 1)) * (1 + (delta.get(w) ?? 0));
          delta.set(v, (delta.get(v) ?? 0) + contrib);
        }
        if (w !== s) {
          betweenness.set(w, (betweenness.get(w) ?? 0) + (delta.get(w) ?? 0));
        }
      }
    }

    // Normalize
    const n = nodes.length;
    if (n > 2) {
      const norm = 1 / ((n - 1) * (n - 2));
      for (const k of betweenness.keys()) {
        betweenness.set(k, (betweenness.get(k) ?? 0) * norm);
      }
    }

    return betweenness;
  }

  /**
   * Closeness centrality: 1 / average shortest path length.
   */
  private _computeCloseness(
    nodes: string[],
    adj: Map<string, Set<string>>,
  ): Map<string, number> {
    const closeness = new Map<string, number>();
    for (const n of nodes) closeness.set(n, 0);

    for (const s of nodes) {
      // BFS
      const dist = new Map<string, number>();
      const queue: string[] = [s];
      dist.set(s, 0);

      while (queue.length > 0) {
        const v = queue.shift()!;
        for (const w of adj.get(v) ?? []) {
          if (!dist.has(w)) {
            dist.set(w, (dist.get(v) ?? 0) + 1);
            queue.push(w);
          }
        }
      }

      // Average distance
      let totalDist = 0;
      let reachable = 0;
      for (const d of dist.values()) {
        if (d > 0) {
          totalDist += d;
          reachable++;
        }
      }

      if (reachable > 0 && totalDist > 0) {
        closeness.set(s, reachable / totalDist);
      }
    }

    return closeness;
  }

  communityDetection(): Record<string, number> {
    const communities = new Map<string, number>();
    const visited = new Set<string>();
    let commId = 0;

    const entities = this._store.entityStore.allNodes();
    for (const entity of entities) {
      if (visited.has(entity.uid)) continue;
      const queue = [entity.uid];
      visited.add(entity.uid);
      while (queue.length > 0) {
        const current = queue.shift()!;
        communities.set(current, commId);
        const rels = this._store.entityStore.get(current)?.profile.relationships ?? [];
        for (const rel of rels) {
          const target = this._store.entityStore.resolveUid(rel.target as string);
          if (target && !visited.has(target)) {
            visited.add(target);
            queue.push(target);
          }
        }
      }
      commId++;
    }

    return Object.fromEntries(communities);
  }

  getPathStats(): Record<string, unknown> {
    const entities = this._store.entityStore.allNodes();
    let totalPaths = 0;
    let foundPaths = 0;

    const sample = entities.slice(0, Math.min(20, entities.length));
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        totalPaths++;
        const path = this._store.findPath(sample[i]!.uid, sample[j]!.uid);
        if (path) foundPaths++;
      }
    }

    return {
      totalNodes: entities.length,
      totalEdges: this._store.edgeCount,
      connectivity: totalPaths > 0 ? foundPaths / totalPaths : 0,
    };
  }
}
