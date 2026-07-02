import type { NPCRuntime } from "./npc-runtime";
import type { EpisodicMemory } from "../models/npc-state";

export interface MemoryCluster {
  topic: string;
  memories: EpisodicMemory[];
  avgImportance: number;
}

export class MemoryEngine {
  private _runtime: NPCRuntime;

  constructor(runtime: NPCRuntime) {
    this._runtime = runtime;
  }

  async search(name: string, query: string): Promise<EpisodicMemory[]> {
    const memories = await this._getDedupedMemories(name);
    const queryLower = query.toLowerCase();
    return memories.filter(m =>
      m.description.toLowerCase().includes(queryLower)
    );
  }

  async searchByEmotion(name: string, emotion: string): Promise<EpisodicMemory[]> {
    const memories = await this._getDedupedMemories(name);
    return memories.filter(m => m.emotion === emotion);
  }

  async searchByLocation(name: string, location: string): Promise<EpisodicMemory[]> {
    const memories = await this._getDedupedMemories(name);
    return memories.filter(m =>
      m.location.toLowerCase().includes(location.toLowerCase())
    );
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
