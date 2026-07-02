/**
 * Pain signal tracking for recurring failures.
 * Replaces world_core/memory/pain_signals.ts.
 */

import { getLogger } from "../utils/logger";

const log = getLogger("pain-signals");

interface PainEntry {
  id: string;
  description: string;
  keywords: string[];
  timestamp: Date;
  sourceId: string;
  importance: number;
}

export class PainSignalManager {
  private _painCache: Map<string, string[]> = new Map();
  private _entries: Map<string, PainEntry> = new Map();

  async recordPain(
    description: string,
    keywords: string[],
    sourceId: string,
    importance = 0.8,
  ): Promise<string> {
    const id = `pain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: PainEntry = {
      id,
      description,
      keywords,
      timestamp: new Date(),
      sourceId,
      importance,
    };

    this._entries.set(id, entry);
    for (const kw of keywords) {
      const lower = kw.toLowerCase();
      const list = this._painCache.get(lower) ?? [];
      list.push(id);
      this._painCache.set(lower, list);
    }

    log.info({ id, keywords }, "Recorded pain signal");
    return id;
  }

  async getWarnings(contextText: string, topK = 3): Promise<Array<{ content: string; score: number; painId: string }>> {
    const words = contextText.toLowerCase().split(/\s+/);
    const scoreMap = new Map<string, number>();

    for (const word of words) {
      const painIds = this._painCache.get(word);
      if (painIds) {
        for (const pid of painIds) {
          scoreMap.set(pid, (scoreMap.get(pid) ?? 0) + 1);
        }
      }
    }

    const results: Array<{ content: string; score: number; painId: string }> = [];
    for (const [painId, score] of scoreMap) {
      const entry = this._entries.get(painId);
      if (entry) {
        results.push({ content: entry.description, score, painId });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  getStatistics(): { painSignalsRecorded: number } {
    return { painSignalsRecorded: this._entries.size };
  }
}
