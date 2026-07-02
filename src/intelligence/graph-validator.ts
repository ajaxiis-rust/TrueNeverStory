/**
 * GraphValidator — self-healing graph validator.
 * Replaces world_explorer/graph_validator.py.
 *
 * Checks: missing targets, orphans, duplicates, implicit edges.
 * Auto-heals by adding placeholder nodes and repairing edges.
 */

import type { GraphStore, GraphEdge } from "../services/graph-store";
import type { UnifiedEntityStore } from "../store/entity-store";
import { getLogger } from "../utils/logger";

const log = getLogger("graph-validator");

const DEAD_REF_TYPE = "dead_ref";
const LOST_ITEMS_UID = "__LOST_ITEMS__";

export interface AuditReport {
  missingTargets: string[];
  orphans: string[];
  duplicates: Array<{ label: string; uids: string[] }>;
  implicitEdges: Array<{
    source: string;
    target: string;
    type: string;
    sourceField: string;
  }>;
}

export interface GraphValidatorDeps {
  graphStore: GraphStore;
  entityStore: UnifiedEntityStore;
  autoHeal?: boolean;
}

export class GraphValidator {
  private _graph: GraphStore;
  private _entityStore: UnifiedEntityStore;
  private _autoHeal: boolean;
  healLog: string[] = [];

  constructor(deps: GraphValidatorDeps) {
    this._graph = deps.graphStore;
    this._entityStore = deps.entityStore;
    this._autoHeal = deps.autoHeal ?? true;
  }

  audit(): AuditReport {
    const report: AuditReport = {
      missingTargets: this._findMissingTargets(),
      orphans: this._findOrphans(),
      duplicates: this._findDuplicates(),
      implicitEdges: this._findImplicitEdges(),
    };
    if (this._autoHeal) {
      this._heal(report);
    }
    return report;
  }

  private _findMissingTargets(): string[] {
    const missing: string[] = [];
    const allUids = new Set(this._entityStore.allNodes().map((n) => n.uid));
    for (const node of this._entityStore.allNodes()) {
      const edges = this._graph.getOutgoingEdges(node.uid);
      for (const edge of edges) {
        if (!allUids.has(edge.target)) {
          missing.push(`${edge.source} -> ${edge.target} (type=${edge.type})`);
        }
      }
    }
    return missing;
  }

  private _findOrphans(): string[] {
    const orphans: string[] = [];
    const allUids = new Set(this._entityStore.allNodes().map((n) => n.uid));
    for (const node of this._entityStore.allNodes()) {
      const outgoing = this._graph.getOutgoingEdges(node.uid);
      // Check if any other node points to this one
      let hasIncoming = false;
      for (const otherUid of allUids) {
        if (otherUid === node.uid) continue;
        const edges = this._graph.getOutgoingEdges(otherUid);
        if (edges.some((e) => e.target === node.uid)) {
          hasIncoming = true;
          break;
        }
      }
      if (outgoing.length === 0 && !hasIncoming) {
        orphans.push(node.uid);
      }
    }
    return orphans;
  }

  private _findDuplicates(): Array<{ label: string; uids: string[] }> {
    const nameMap = new Map<string, string[]>();
    for (const node of this._entityStore.allNodes()) {
      const label = node.name.toLowerCase();
      const list = nameMap.get(label) ?? [];
      list.push(node.uid);
      nameMap.set(label, list);
    }
    const dupes: Array<{ label: string; uids: string[] }> = [];
    for (const [label, uids] of nameMap) {
      if (uids.length > 1) {
        dupes.push({ label, uids });
      }
    }
    return dupes;
  }

  private _findImplicitEdges(): Array<{
    source: string;
    target: string;
    type: string;
    sourceField: string;
  }> {
    const implicit: Array<{
      source: string;
      target: string;
      type: string;
      sourceField: string;
    }> = [];
    for (const node of this._entityStore.allNodes()) {
      if (node.entityType !== "Character") continue;
      const profile = node.profile;
      const outgoing = this._graph.getOutgoingEdges(node.uid);
      const existingTargets = new Set(outgoing.map((e) => e.target));

      for (const layer of ["l2", "l3"] as const) {
        const layerData = profile.getLayer(layer);
        const affs = (layerData.affiliations as string[]) ?? [];
        for (const aff of affs) {
          const target = this._entityStore.getByName(aff);
          if (target && !existingTargets.has(target.uid)) {
            implicit.push({
              source: node.uid,
              target: target.uid,
              type: "member_of",
              sourceField: "affiliations",
            });
          }
        }

        const loc = (layerData.current_location as string) ?? null;
        if (loc) {
          const target = this._entityStore.getByName(loc);
          if (target && !existingTargets.has(target.uid)) {
            implicit.push({
              source: node.uid,
              target: target.uid,
              type: "located_at",
              sourceField: "current_location",
            });
          }
        }
      }
    }
    return implicit;
  }

  private _heal(report: AuditReport): void {
    this.healLog = [];

    for (const item of report.missingTargets) {
      const parts = item.split(" -> ");
      if (parts.length !== 2) continue;
      const u = parts[0]!;
      const rest = parts[1]!;
      const v = rest.split(" (")[0]!;
      this._graph.addEdge(u, v, DEAD_REF_TYPE);
      this.healLog.push(`Added DEAD_REF edge for missing target: ${v}`);
    }

    if (report.orphans.length > 0) {
      for (const uid of report.orphans) {
        if (uid !== LOST_ITEMS_UID) {
          this._graph.addEdge(LOST_ITEMS_UID, uid, "collects");
          this.healLog.push(`Connected orphan ${uid} to ${LOST_ITEMS_UID}`);
        }
      }
    }

    for (const dup of report.duplicates) {
      const keep = dup.uids[0]!;
      for (let i = 1; i < dup.uids.length; i++) {
        const uid = dup.uids[i]!;
        const outgoing = this._graph.getOutgoingEdges(uid);
        for (const edge of outgoing) {
          this._graph.addEdge(keep, edge.target, edge.type);
        }
        this.healLog.push(`Merged duplicate ${uid} into ${keep}`);
      }
    }

    for (const edge of report.implicitEdges) {
      this._graph.addEdge(edge.source, edge.target, edge.type);
      this.healLog.push(`Added implicit edge ${edge.source} -> ${edge.target} (${edge.type})`);
    }

    if (this.healLog.length > 0) {
      log.info(`Graph healed: ${this.healLog.length} repairs`);
    }
  }
}
