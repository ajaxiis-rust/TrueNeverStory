import type { LiteraryCompilerDB, SceneTemplate } from './schema';

export interface RetrievalKeys {
  archetype?: string;
  mood?: string;
  domain?: string;
  position?: string;
  queryText?: string;
}

export interface RankedTemplate {
  template: SceneTemplate;
  score: number;
}

const WEIGHTS = {
  archetype: 0.40,
  mood: 0.15,
  domain: 0.15,
  quality: 0.10,
  freshness: 0.05,
  tagsOverlap: 0.15,
} as const;

export function computeRetrievalScore(keys: RetrievalKeys, template: SceneTemplate): number {
  const archetypeMatch = keys.archetype && keys.archetype === template.archetype_primary ? 1 : 0;
  const moodMatch = keys.mood && keys.mood === template.mood ? 1 : 0.05;
  const domainMatch = keys.domain && keys.domain === template.domain ? 1 : 0.05;
  const qualityNorm = Math.max(0, Math.min(1, template.quality_score));
  const freshness = 1 / (1 + template.use_count);
  const tagsOverlap = keys.domain && template.tags.includes(keys.domain) ? 1 : 0;

  return (
    WEIGHTS.archetype * archetypeMatch +
    WEIGHTS.mood * moodMatch +
    WEIGHTS.domain * domainMatch +
    WEIGHTS.quality * qualityNorm +
    WEIGHTS.freshness * freshness +
    WEIGHTS.tagsOverlap * tagsOverlap
  );
}

export async function searchTemplates(
  db: LiteraryCompilerDB,
  keys: RetrievalKeys,
  limit = 10,
): Promise<RankedTemplate[]> {
  let candidates: SceneTemplate[] = [];

  if (keys.archetype) {
    candidates = db.getSceneTemplatesByArchetype(keys.archetype);
  }

  if (candidates.length === 0 && keys.queryText) {
    candidates = db.getTopTemplates([keys.queryText], limit * 3);
  }

  if (candidates.length === 0) {
    const searchKeys = [keys.archetype, keys.mood, keys.domain].filter(Boolean) as string[];
    if (searchKeys.length > 0) {
      candidates = db.getTopTemplates(searchKeys, limit * 3);
    }
  }

  const ranked: RankedTemplate[] = candidates.map((template) => ({
    template,
    score: computeRetrievalScore(keys, template),
  }));

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}
