/**
 * Memory optimizer for pruning, clustering, and lifecycle management.
 * Replaces world_core/memory/optimizer.py.
 */

import type { WorldMemoryEntry, MemoryConfig } from "../models/memory";
import type { MemoryScoringEngine } from "./scoring";
import type { ClusterEngine } from "./clustering";
import { getLogger } from "../utils/logger";

const log = getLogger("optimizer");

export interface IOptimizableMemory {
  activeEntries: Map<string, WorldMemoryEntry>;
  deleteEntry(entryId: string): Promise<void>;
  addMemory(entry: WorldMemoryEntry): Promise<string>;
  partitionMgr: { archiveOldPartitions(): Promise<number> };
  llm: unknown;
  config: MemoryConfig;
  faissIndex: { fragmentationRatio(): number; rebuild(): void } | null;
}

export interface OptimizerStats {
  prunedCount: number;
  mergedCount: number;
  archivedCount: number;
  lastRun: string | null;
  running: boolean;
}

export class MemoryOptimizer {
  private _memory: IOptimizableMemory;
  private _intervalMs: number;
  private _scoring: MemoryScoringEngine;
  private _cluster: ClusterEngine;
  private _minKeepScore: number;
  private _minKeepDays: number;
  private _running = false;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _stats: OptimizerStats = {
    prunedCount: 0,
    mergedCount: 0,
    archivedCount: 0,
    lastRun: null,
    running: false,
  };

  constructor(
    memory: IOptimizableMemory,
    intervalHours: number,
    scoring: MemoryScoringEngine,
    cluster: ClusterEngine,
    minKeepScore: number,
    minKeepDays: number,
  ) {
    this._memory = memory;
    this._intervalMs = intervalHours * 3600 * 1000;
    this._scoring = scoring;
    this._cluster = cluster;
    this._minKeepScore = minKeepScore;
    this._minKeepDays = minKeepDays;
  }

  async start(): Promise<void> {
    if (this._running) return;
    this._running = true;
    this._stats.running = true;
    this._timer = setInterval(() => this._run(), this._intervalMs);
    log.info("MemoryOptimizer started");
  }

  async stop(): Promise<void> {
    this._running = false;
    this._stats.running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    log.info("MemoryOptimizer stopped");
  }

  async runManual(): Promise<OptimizerStats> {
    await this._run();
    return this.getStats();
  }

  private async _run(): Promise<void> {
    log.info("Running memory optimization...");
    const now = new Date();

    const pruned = await this._pruneLowScoreEntries(now);
    this._stats.prunedCount += pruned;
    log.info({ pruned }, "Pruned low-score entries");

    const merged = await this._clusterAndMerge();
    this._stats.mergedCount += merged;
    log.info({ merged }, "Merged entries into summaries");

    const archived = await this._memory.partitionMgr.archiveOldPartitions();
    this._stats.archivedCount += archived;
    if (archived > 0) log.info({ archived }, "Archived old partitions");

    await this._checkIndexRebuild();

    this._stats.lastRun = now.toISOString();
    log.info("Optimization complete");
  }

  private async _pruneLowScoreEntries(now: Date): Promise<number> {
    const toPrune: string[] = [];

    for (const [eid, entry] of this._memory.activeEntries) {
      if (entry.metadata.immutable) continue;

      const ageDays = (now.getTime() - entry.timestamp.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays < this._minKeepDays) continue;

      const score = this._scoring.computeScore(entry, now);
      if (score < this._minKeepScore) {
        toPrune.push(eid);
      }
    }

    for (const eid of toPrune) {
      await this._memory.deleteEntry(eid);
    }

    return toPrune.length;
  }

  private async _clusterAndMerge(): Promise<number> {
    const entriesToCluster = Array.from(this._memory.activeEntries.values()).filter((e) => e.needsClustering);
    if (!entriesToCluster.length) return 0;

    const clusters = await this._cluster.findClusters(entriesToCluster);
    if (!clusters.length) return 0;

    let mergedCount = 0;

    for (const cluster of clusters) {
      if (cluster.length < this._cluster.mergeThreshold) continue;
      if (cluster.some((e) => e.metadata.immutable)) continue;

      const summaryEntry = await this._cluster.mergeCluster(cluster, this._memory.llm as import("../lib/llm-client").LLMClient);
      if (summaryEntry) {
        await this._memory.addMemory(summaryEntry);
        for (const e of cluster) {
          await this._memory.deleteEntry(e.id);
        }
        mergedCount += cluster.length;
      }
    }

    for (const entry of entriesToCluster) {
      entry.needsClustering = false;
    }

    return mergedCount;
  }

  private _checkIndexRebuild(): void {
    const idx = this._memory.faissIndex;
    if (!idx) return;

    const fragmentation = idx.fragmentationRatio();
    if (fragmentation > this._memory.config.faissRebuildFragmentationThreshold) {
      log.info({ fragmentation }, "Rebuilding FAISS index");
      idx.rebuild();
    }
  }

  getStats(): OptimizerStats {
    return { ...this._stats };
  }
}
