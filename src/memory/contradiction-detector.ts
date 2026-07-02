/**
 * Contradiction detection between new and existing memories.
 * Replaces world_core/memory/contradiction.ts.
 */

import type { LLMClient } from "../lib/llm-client";
import { getLogger } from "../utils/logger";

const log = getLogger("contradiction");

export interface ContradictionResult {
  entryId: string;
  contradictedId: string;
  type: "supersedes" | "conflicts";
  description: string;
}

export class ContradictionDetector {
  private _llm: LLMClient;
  private _simThreshold: number;
  private _log: ContradictionResult[] = [];

  constructor(llm: LLMClient, similarityThreshold = 0.85) {
    this._llm = llm;
    this._simThreshold = similarityThreshold;
  }

  async checkAndHandle(
    newContent: string,
    existingEntries: Array<{ id: string; content: string }>,
  ): Promise<ContradictionResult[]> {
    if (existingEntries.length === 0) return [];

    const results: ContradictionResult[] = [];
    const candidates = existingEntries.slice(0, 10);

    const prompt = `You are checking for contradictions between a new memory and existing memories.

New memory: "${newContent}"

Existing memories:
${candidates.map((e, i) => `[${i}] ${e.content}`).join("\n")}

For each existing memory that contradicts the new one, return a JSON array of objects:
[{"index": 0, "type": "supersedes", "reason": "..."}]

If no contradictions, return [].`;

    try {
      const result = await this._llm.generateJson(prompt, { temperature: 0.2 });
      if (!Array.isArray(result)) return [];

      for (const item of result) {
        const idx = item.index as number;
        if (idx >= 0 && idx < candidates.length) {
          const cand = candidates[idx]!;
          results.push({
            entryId: "", // will be set by caller
            contradictedId: cand.id,
            type: item.type ?? "supersedes",
            description: item.reason ?? "Contradiction detected",
          });
          this._log.push({
            ...results[results.length - 1]!,
            entryId: "new",
          });
        }
      }
    } catch (err) {
      log.debug({ err }, "Contradiction check failed");
    }

    return results;
  }

  getStatistics(): { contradictionsFound: number } {
    return { contradictionsFound: this._log.length };
  }
}
