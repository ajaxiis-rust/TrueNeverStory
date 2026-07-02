/**
 * Graph-based recommendations for missing relationships.
 * Replaces world_intelligence/recommender.ts.
 */

import type { GraphStore } from "../services/graph-store";

interface RelationshipSuggestion {
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  commonNeighbors: number;
  score: number;
}

export class Recommender {
  private _store: GraphStore;

  constructor(store: GraphStore) {
    this._store = store;
  }

  suggestMissingRelationships(topK = 20): RelationshipSuggestion[] {
    const entities = this._store.entityStore.allNodes();
    const suggestions: RelationshipSuggestion[] = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i]!;
        const b = entities[j]!;

        // Check if edge exists
        const relsA = a.profile.relationships;
        const hasEdge = relsA.some(
          (r) => (r.target as string) === b.name || (r.target as string) === b.uid,
        );
        if (hasEdge) continue;

        // Count common neighbors
        const neighborsA = new Set(
          relsA.map((r) => r.target as string),
        );
        const neighborsB = new Set(
          b.profile.relationships.map((r) => r.target as string),
        );
        let common = 0;
        for (const n of neighborsA) {
          if (neighborsB.has(n)) common++;
        }

        if (common >= 2) {
          suggestions.push({
            source: a.uid,
            target: b.uid,
            sourceName: a.name,
            targetName: b.name,
            commonNeighbors: common,
            score: common / (Math.max(relsA.length, b.profile.relationships.length) + 1),
          });
        }
      }
    }

    suggestions.sort((a, b) => b.score - a.score);
    return suggestions.slice(0, topK);
  }
}
