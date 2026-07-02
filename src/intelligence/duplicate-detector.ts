/**
 * Duplicate entity detection.
 * Replaces world_intelligence/duplicate_detector.ts.
 */

import type { UnifiedEntityStore } from "../store/entity-store";
import type { VectorIndex } from "../memory/faiss-index";
import { getLogger } from "../utils/logger";

const log = getLogger("duplicate-detector");

interface DuplicatePair {
  uid1: string;
  name1: string;
  uid2: string;
  name2: string;
  similarity: number;
}

export class DuplicateDetector {
  private _store: UnifiedEntityStore;
  private _vectorIndex: VectorIndex;
  private _threshold: number;

  constructor(store: UnifiedEntityStore, vectorIndex: VectorIndex, threshold = 0.85) {
    this._store = store;
    this._vectorIndex = vectorIndex;
    this._threshold = threshold;
  }

  async findDuplicates(): Promise<DuplicatePair[]> {
    const entities = this._store.allNodes();
    if (entities.length === 0) return [];

    const pairs: DuplicatePair[] = [];

    for (const entity of entities) {
      // Search for similar entities by name
      const nameEmbedding = this._simpleEmbed(entity.name);
      const results = await this._vectorIndex.search(nameEmbedding, 5);

      for (const result of results) {
        if (result.score < this._threshold) continue;
        if (result.id === String(entity.uid)) continue;

        const other = this._store.get(result.id);
        if (!other) continue;
        if (other.entityType !== entity.entityType) continue;

        pairs.push({
          uid1: entity.uid,
          name1: entity.name,
          uid2: other.uid,
          name2: other.name,
          similarity: result.score,
        });
      }
    }

    // Deduplicate pairs
    const seen = new Set<string>();
    return pairs.filter((p) => {
      const key = [p.uid1, p.uid2].sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private _simpleEmbed(text: string): number[] {
    const embedding: number[] = [];
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < 384; i++) {
      hash = ((hash << 13) ^ hash) | 0;
      embedding.push(((hash & 0x7fffffff) / 0x7fffffff) * 2 - 1);
    }
    return embedding;
  }
}
