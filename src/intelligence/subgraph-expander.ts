/**
 * Subgraph expansion around an entity.
 * Replaces world_intelligence/subgraph_expander.ts.
 */

import type { GraphStore } from "../services/graph-store";
import { SceneGenerator } from "./scene-generator";
import { RuleChecker } from "./rule-checker";
import { getLogger } from "../utils/logger";

const log = getLogger("subgraph-expander");

export class SubgraphExpander {
  private _store: GraphStore;
  private _sceneGen: SceneGenerator;
  private _ruleChecker: RuleChecker;

  constructor(store: GraphStore) {
    this._store = store;
    this._sceneGen = new SceneGenerator(store);
    this._ruleChecker = new RuleChecker(store);
  }

  async expandAsync(
    centerUid: string,
    depth = 2,
    completeLayers = true,
    checkRules = true,
    generateScene = true,
  ): Promise<Record<string, unknown>> {
    const entity = this._store.entityStore.get(centerUid);
    if (!entity) return { error: "Entity not found" };

    const neighbors = this._store.getNeighbors(centerUid, depth);
    const subNodes = [centerUid, ...Array.from(neighbors.keys())];

    const report: Record<string, unknown> = {
      nodesInSubgraph: subNodes.length,
      completed: [] as string[],
      ruleConflicts: [] as RuleViolation[],
      scene: null as Record<string, unknown> | null,
    };

    // Check rules
    if (checkRules) {
      report.ruleConflicts = await this._ruleChecker.checkAll();
    }

    // Generate scene
    if (generateScene) {
      report.scene = this._sceneGen.generateSceneFromCluster(centerUid);
    }

    return report;
  }
}

interface RuleViolation {
  entityUid: string;
  ruleName: string;
  description: string;
  severity: string;
}
