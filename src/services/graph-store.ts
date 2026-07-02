/**
 * GraphStore — in-memory graph backed by UnifiedEntityStore.
 * Replaces world_explorer/store.py (NetworkX → adjacency map).
 */

import { type UnifiedEntityStore } from "../store/entity-store";
import { EntityNode, type LayerDict } from "../models/entity";
import { BranchManager } from "./branch-manager";
import { getLogger } from "../utils/logger";

const log = getLogger("graph-store");

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  strength?: number;
  attributes?: Record<string, unknown>;
}

export interface GraphSummary {
  nodes: number;
  edges: number;
  nodeTypes: Record<string, number>;
  activeBranch: string;
}

export class GraphStore {
  private _entityStore: UnifiedEntityStore;
  private _branches: BranchManager;
  private _edges: Map<string, GraphEdge[]> = new Map(); // uid → outgoing edges
  private _reverseEdges: Map<string, GraphEdge[]> = new Map(); // uid → incoming edges
  private _booted = false;

  constructor(entityStore: UnifiedEntityStore, dbPath: string) {
    this._entityStore = entityStore;
    this._branches = new BranchManager(dbPath);
  }

  async boot(): Promise<void> {
    if (this._booted) return;

    // Build graph edges from entity relationships
    const entities = this._entityStore.allNodes();
    for (const entity of entities) {
      const rels = entity.profile.relationships;
      for (const rel of rels) {
        const targetRef = rel.target as string;
        const targetNode = this._entityStore.getByName(targetRef);
        if (targetNode) {
          const edge: GraphEdge = {
            source: entity.uid,
            target: targetNode.uid,
            type: (rel.type as string) ?? "knows",
            strength: rel.strength as number,
          };
          this._addEdge(edge);
        }
      }
    }

    log.info(`Graph booted: ${entities.length} nodes, ${this.edgeCount} edges`);
    this._booted = true;
  }

  private _addEdge(edge: GraphEdge): void {
    const out = this._edges.get(edge.source) ?? [];
    out.push(edge);
    this._edges.set(edge.source, out);

    const inEdges = this._reverseEdges.get(edge.target) ?? [];
    inEdges.push(edge);
    this._reverseEdges.set(edge.target, inEdges);
  }

  get entityStore(): UnifiedEntityStore {
    return this._entityStore;
  }

  get branches(): BranchManager {
    return this._branches;
  }

  get nodeCount(): number {
    return this._entityStore.count();
  }

  get edgeCount(): number {
    let count = 0;
    for (const edges of this._edges.values()) {
      count += edges.length;
    }
    return count;
  }

  getNodeTypes(): Record<string, number> {
    return this._entityStore.countByType();
  }

  getNeighbors(uid: string, depth = 1, direction: "out" | "in" | "both" = "out"): Map<string, number> {
    const lengths = new Map<string, number>();
    const visited = new Set<string>();
    const queue: Array<{ uid: string; dist: number }> = [{ uid, dist: 0 }];
    visited.add(uid);

    while (queue.length > 0) {
      const { uid: current, dist } = queue.shift()!;
      if (dist > depth) continue;

      if (dist > 0) {
        lengths.set(current, dist);
      }

      if (direction === "out" || direction === "both") {
        const outEdges = this._edges.get(current) ?? [];
        for (const edge of outEdges) {
          if (!visited.has(edge.target)) {
            visited.add(edge.target);
            queue.push({ uid: edge.target, dist: dist + 1 });
          }
        }
      }

      if (direction === "in" || direction === "both") {
        const inEdges = this._reverseEdges.get(current) ?? [];
        for (const edge of inEdges) {
          if (!visited.has(edge.source)) {
            visited.add(edge.source);
            queue.push({ uid: edge.source, dist: dist + 1 });
          }
        }
      }
    }

    return lengths;
  }

  findPath(source: string, target: string): string[] | null {
    if (source === target) return [source];

    const visited = new Map<string, string>(); // uid → parent
    const queue: string[] = [source];
    visited.set(source, "");

    while (queue.length > 0) {
      const current = queue.shift()!;

      const outEdges = this._edges.get(current) ?? [];
      for (const edge of outEdges) {
        if (!visited.has(edge.target)) {
          visited.set(edge.target, current);
          if (edge.target === target) {
            // Reconstruct path
            const path: string[] = [];
            let node: string | undefined = target;
            while (node && node !== "") {
              path.unshift(node);
              node = visited.get(node);
            }
            return path;
          }
          queue.push(edge.target);
        }
      }

      const inEdges = this._reverseEdges.get(current) ?? [];
      for (const edge of inEdges) {
        if (!visited.has(edge.source)) {
          visited.set(edge.source, current);
          if (edge.source === target) {
            const path: string[] = [];
            let node: string | undefined = target;
            while (node && node !== "") {
              path.unshift(node);
              node = visited.get(node);
            }
            return path;
          }
          queue.push(edge.source);
        }
      }
    }

    return null;
  }

  getSummary(): GraphSummary {
    return {
      nodes: this.nodeCount,
      edges: this.edgeCount,
      nodeTypes: this.getNodeTypes(),
      activeBranch: this._branches.active,
    };
  }

  addEdge(source: string, target: string, type = "knows", strength?: number): void {
    const edge: GraphEdge = { source, target, type, strength };
    this._addEdge(edge);
  }

  removeEdge(source: string, target: string): boolean {
    const out = this._edges.get(source);
    if (out) {
      const idx = out.findIndex((e) => e.target === target);
      if (idx !== -1) {
        out.splice(idx, 1);
        const inEdges = this._reverseEdges.get(target);
        if (inEdges) {
          const inIdx = inEdges.findIndex((e) => e.source === source);
          if (inIdx !== -1) inEdges.splice(inIdx, 1);
        }
        return true;
      }
    }
    return false;
  }

  getEdgesBetween(uidA: string, uidB: string): GraphEdge[] {
    const outA = this._edges.get(uidA) ?? [];
    const outB = this._edges.get(uidB) ?? [];
    const results: GraphEdge[] = [];
    for (const e of outA) {
      if (e.target === uidB) results.push(e);
    }
    for (const e of outB) {
      if (e.target === uidA) results.push(e);
    }
    return results;
  }

  getOutgoingEdges(uid: string): GraphEdge[] {
    return this._edges.get(uid) ?? [];
  }
}
