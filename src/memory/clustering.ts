/**
 * Clustering engine for memory consolidation and summarization.
 * Replaces world_core/memory/clustering.py.
 */

import { WorldMemoryEntry } from "../models/memory";
import type { LLMClient } from "../lib/llm-client";
import { getLogger } from "../utils/logger";

const log = getLogger("clustering");

export interface ClusterResult {
  count: number;
  avgImportance: number;
  timeRange: { oldest: string; newest: string } | null;
  sources: string[];
  totalAccesses: number;
}

export class ClusterEngine {
  private _similarityThreshold: number;
  private _minClusterSize: number;
  mergeThreshold: number;
  private _enableLlmMerge: boolean;

  constructor(
    similarityThreshold = 0.85,
    minClusterSize = 3,
    mergeThreshold = 5,
    enableLlmMerge = true,
  ) {
    this._similarityThreshold = similarityThreshold;
    this._minClusterSize = minClusterSize;
    this.mergeThreshold = mergeThreshold;
    this._enableLlmMerge = enableLlmMerge;
  }

  async findClusters(entries: WorldMemoryEntry[]): Promise<WorldMemoryEntry[][]> {
    if (entries.length < this._minClusterSize) return [];

    const valid = entries.filter((e) => e.embedding !== null && e.embedding!.length > 0);
    if (valid.length < this._minClusterSize) return [];

    return this._simpleClustering(valid);
  }

  private async _simpleClustering(entries: WorldMemoryEntry[]): Promise<WorldMemoryEntry[][]> {
    const clusters: WorldMemoryEntry[][] = [];
    const assigned = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      if (assigned.has(entry.id)) continue;

      const cluster: WorldMemoryEntry[] = [entry];
      assigned.add(entry.id);

      for (let j = i + 1; j < entries.length; j++) {
        const other = entries[j]!;
        if (assigned.has(other.id)) continue;

        const sim = this._cosineSimilarity(entry.embedding!, other.embedding!);
        if (sim >= this._similarityThreshold) {
          cluster.push(other);
          assigned.add(other.id);
        }
      }

      if (cluster.length >= this._minClusterSize) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  private _cosineSimilarity(vec1: number[], vec2: number[]): number {
    const len = Math.min(vec1.length, vec2.length);
    let dot = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < len; i++) {
      dot += vec1[i]! * vec2[i]!;
      norm1 += vec1[i]! * vec1[i]!;
      norm2 += vec2[i]! * vec2[i]!;
    }
    if (norm1 === 0 || norm2 === 0) return 0;
    return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  async mergeCluster(cluster: WorldMemoryEntry[], llm?: LLMClient): Promise<WorldMemoryEntry | null> {
    if (cluster.length < 2) return null;

    if (!this._enableLlmMerge || !llm) {
      return cluster.reduce((best, e) => e.importance > best.importance ? e : best);
    }

    const texts = cluster.map((e) => e.content);
    const combined = texts.map((t) => `- ${t}`).join("\n");

    const prompt = `Summarise the following related memories into a single, concise statement (max 100 words). Preserve key facts but remove redundancy.\n\nMemories:\n${combined}\n\nSummary:`;

    let summary: string;
    try {
      summary = await llm.generateText(prompt, { temperature: 0.3, maxTokens: 150 });
    } catch (err) {
      log.warn({ err }, "LLM summary generation failed, using fallback");
      summary = `Related memories: ${texts.slice(0, 3).join(", ")}`;
    }

    const maxImportance = Math.max(...cluster.map((e) => e.importance));

    return new WorldMemoryEntry({
      id: `cluster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content: summary.trim(),
      timestamp: new Date().toISOString(),
      source_type: "summary",
      source_id: "cluster_summary",
      importance: maxImportance,
      tags: ["summary"],
      metadata: {
        immutable: true,
        cluster_representative: true,
      },
    });
  }

  async getClusterSummary(cluster: WorldMemoryEntry[]): Promise<ClusterResult> {
    if (!cluster.length) {
      return { count: 0, avgImportance: 0, timeRange: null, sources: [], totalAccesses: 0 };
    }

    const timestamps = cluster.map((e) => e.timestamp);
    const oldest = timestamps.reduce((a, b) => a < b ? a : b);
    const newest = timestamps.reduce((a, b) => a > b ? a : b);

    return {
      count: cluster.length,
      avgImportance: cluster.reduce((s, e) => s + e.importance, 0) / cluster.length,
      timeRange: { oldest: oldest.toISOString(), newest: newest.toISOString() },
      sources: [...new Set(cluster.map((e) => e.sourceType))],
      totalAccesses: cluster.reduce((s, e) => s + e.metadata.accessCount, 0),
    };
  }
}
