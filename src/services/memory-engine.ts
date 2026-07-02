/**
 * Memory Engine — semantic search over NPC episodic memories with weighted scoring.
 * Replaces simple String.includes() with multi-signal relevance ranking.
 */

import type { NPCRuntime } from "./npc-runtime";
import type { EpisodicMemory } from "../models/npc-state";

export interface MemoryCluster {
  topic: string;
  memories: EpisodicMemory[];
  avgImportance: number;
}

interface ScoredMemory {
  memory: EpisodicMemory;
  score: number;
}

export class MemoryEngine {
  private _runtime: NPCRuntime;

  constructor(runtime: NPCRuntime) {
    this._runtime = runtime;
  }

  async search(name: string, query: string, limit = 10): Promise<EpisodicMemory[]> {
    const memories = await this._getDedupedMemories(name);
    if (memories.length === 0) return [];

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    const scored: ScoredMemory[] = [];
    const now = Date.now();

    for (const mem of memories) {
      let score = 0;
      const descLower = mem.description.toLowerCase();
      let hasKeywordMatch = false;

      for (const word of queryWords) {
        if (descLower.includes(word)) {
          score += 2;
          hasKeywordMatch = true;
        }
      }

      if (descLower.includes(queryLower)) {
        score += 5;
        hasKeywordMatch = true;
      }

      if (!hasKeywordMatch) continue;

      if (mem.importance > 0.7) score += 1.5;
      else if (mem.importance > 0.4) score += 0.5;

      const ageMs = now - new Date(mem.timestamp).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < 1) score += 2;
      else if (ageDays < 7) score += 1;
      else if (ageDays < 30) score += 0.5;

      if (mem.emotion && queryLower.includes(mem.emotion)) score += 3;

      if (mem.involvedEntities.some(e => queryLower.includes(e.toLowerCase()))) score += 2;

      if (mem.location && queryLower.includes(mem.location.toLowerCase())) score += 1.5;

      scored.push({ memory: mem, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.memory);
  }

  async searchByEmotion(name: string, emotion: string): Promise<EpisodicMemory[]> {
    const memories = await this._getDedupedMemories(name);
    return memories
      .filter(m => m.emotion === emotion)
      .sort((a, b) => b.importance - a.importance);
  }

  async searchByLocation(name: string, location: string): Promise<EpisodicMemory[]> {
    const memories = await this._getDedupedMemories(name);
    const locLower = location.toLowerCase();
    return memories
      .filter(m => m.location.toLowerCase().includes(locLower))
      .sort((a, b) => b.importance - a.importance);
  }

  async clusterMemories(name: string): Promise<MemoryCluster[]> {
    const memories = await this._getDedupedMemories(name);
    const clusters = new Map<string, EpisodicMemory[]>();

    for (const mem of memories) {
      const words = mem.description.toLowerCase().split(/\s+/);
      const topic = this._extractTopic(words);
      const existing = clusters.get(topic) ?? [];
      existing.push(mem);
      clusters.set(topic, existing);
    }

    return Array.from(clusters.entries()).map(([topic, mems]) => ({
      topic,
      memories: mems,
      avgImportance: mems.reduce((sum, m) => sum + m.importance, 0) / mems.length,
    }));
  }

  private async _getDedupedMemories(name: string): Promise<EpisodicMemory[]> {
    const memories = await this._runtime.getMemories(name, 100);
    const seen = new Set<string>();
    const result: EpisodicMemory[] = [];
    for (const m of memories) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        result.push(m);
      }
    }
    return result;
  }

  private _extractTopic(words: string[]): string {
    const stopWords = new Set(["the", "a", "an", "in", "at", "to", "for", "of", "with", "on", "and", "or", "but"]);
    const meaningful = words.filter(w => !stopWords.has(w) && w.length > 3);
    return meaningful[0] ?? "general";
  }

  async getRecentContext(name: string, limit = 5): Promise<string> {
    const memories = await this._runtime.getMemories(name, limit);
    return memories.map(m => `${m.description} (${m.emotion})`).join("\n");
  }
}
