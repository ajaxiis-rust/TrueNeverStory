/**
 * Deterministic memory scoring engine.
 * Replaces world_core/memory/scoring.ts.
 */

interface ScoringWeights {
  importance: number;
  recency: number;
  access: number;
  emotion: number;
  relevance: number;
}

interface ScorableEntry {
  timestamp: Date;
  importance: number;
  metadata: {
    importance?: number;
    access_count?: number;
    emotional_valence?: number;
    story_relevance?: number;
  };
}

export class MemoryScoringEngine {
  private _weights: ScoringWeights;
  private _halfLife: number;

  constructor(weights: ScoringWeights, halfLifeDays: number) {
    this._weights = weights;
    this._halfLife = halfLifeDays;
  }

  computeScore(entry: ScorableEntry, currentTime: Date): number {
    const days = (currentTime.getTime() - entry.timestamp.getTime()) / (24 * 60 * 60 * 1000);
    const recency = Math.exp(-days / this._halfLife);
    const imp = entry.metadata.importance ?? entry.importance;
    const accesses = Math.min((entry.metadata.access_count ?? 0) / 10, 1);
    const emotion = Math.abs(entry.metadata.emotional_valence ?? 0);
    const relevance = entry.metadata.story_relevance ?? 0.5;

    const score =
      this._weights.importance * imp +
      this._weights.recency * recency +
      this._weights.access * accesses +
      this._weights.emotion * emotion +
      this._weights.relevance * relevance;

    return Math.max(0, Math.min(1, score));
  }

  computeSalience(entry: ScorableEntry, currentTime: Date): number {
    const days = (currentTime.getTime() - entry.timestamp.getTime()) / (24 * 60 * 60 * 1000);
    const baseImportance = entry.metadata.importance ?? entry.importance;
    const decay = Math.pow(2, -days / this._halfLife);
    const accessCount = entry.metadata.access_count ?? 0;
    const accessBoost = Math.log1p(accessCount) * 0.1;
    return Math.max(0, Math.min(1, baseImportance * decay + accessBoost));
  }
}
