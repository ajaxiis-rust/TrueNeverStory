/**
 * Full enrichment pipeline for world intelligence.
 * Replaces world_intelligence/pipeline.ts.
 */

import type { GraphStore } from "../services/graph-store";
import type { VectorIndex } from "../memory/faiss-index";
import { DuplicateDetector } from "./duplicate-detector";
import { Recommender } from "./recommender";
import { GraphAnalyzer } from "./graph-analyzer";
import { RelationshipRepairer } from "./relationship-repairer";
import { getLogger } from "../utils/logger";

const log = getLogger("intelligence-pipeline");

interface PipelineReport {
  duplicates: number;
  suggestions: number;
  centrality: Record<string, unknown>;
  repairs: number;
  timestamp: string;
}

export class IntelligencePipeline {
  private _store: GraphStore;
  private _vectorIndex: VectorIndex;
  private _duplicateDetector: DuplicateDetector;
  private _recommender: Recommender;
  private _analyzer: GraphAnalyzer;
  private _repairer: RelationshipRepairer;

  constructor(store: GraphStore, vectorIndex: VectorIndex) {
    this._store = store;
    this._vectorIndex = vectorIndex;
    this._duplicateDetector = new DuplicateDetector(store.entityStore, vectorIndex);
    this._recommender = new Recommender(store);
    this._analyzer = new GraphAnalyzer(store);
    this._repairer = new RelationshipRepairer(store.entityStore);
  }

  async runFull(): Promise<PipelineReport> {
    log.info("Starting full intelligence pipeline");

    const duplicates = await this._duplicateDetector.findDuplicates();
    const suggestions = this._recommender.suggestMissingRelationships(20);
    const centrality = this._analyzer.centralityReport(10) as unknown as Record<string, unknown>;
    const repairs = this._repairer.repairRelationships();

    const report: PipelineReport = {
      duplicates: duplicates.length,
      suggestions: suggestions.length,
      centrality,
      repairs: repairs.length,
      timestamp: new Date().toISOString(),
    };

    log.info({
      duplicates: report.duplicates,
      suggestions: report.suggestions,
      repairs: report.repairs,
    }, "Intelligence pipeline complete");

    return report;
  }
}
