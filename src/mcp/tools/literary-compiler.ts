import type { LiteraryCompilerDB } from '../literary-compiler/schema';
import type { QuestTemplateFilter } from '../literary-compiler/types';
import { getLogger } from '@/utils/logger';

const logger = getLogger('LiteraryCompilerMCPTools');

export class LiteraryCompilerMCPTools {
  constructor(private db: LiteraryCompilerDB) {}

  async getQuestTemplates(input: {
    position?: string;
    archetype?: string;
    mood?: string;
    difficulty?: string;
    limit?: number;
  }): Promise<{
    templates: Array<{
      id: string;
      source_book: string;
      source_chapter: number;
      archetype: string;
      applicable_positions: string[];
      variables: string[];
      template_text: string;
      mood: string;
      difficulty: string;
      moral_ambiguity: number;
      tags: string[];
    }>;
    total: number;
  }> {
    const filter: QuestTemplateFilter = {
      position: input.position,
      archetype: input.archetype,
      mood: input.mood,
      difficulty: input.difficulty,
      limit: input.limit ?? 5,
    };

    const templates = this.db.queryTemplates(filter);

    logger.info(`Query: position=${filter.position}, archetype=${filter.archetype}, found=${templates.length}`);

    return {
      templates: templates.map(t => ({
        id: t.id,
        source_book: t.source_book,
        source_chapter: t.source_chapter,
        archetype: t.archetype,
        applicable_positions: t.applicable_positions,
        variables: t.variables,
        template_text: t.template_text,
        mood: t.mood,
        difficulty: t.difficulty,
        moral_ambiguity: t.moral_ambiguity,
        tags: t.tags,
      })),
      total: templates.length,
    };
  }

  async searchQuestTemplates(input: {
    query: string;
    limit?: number;
  }): Promise<{
    templates: Array<{
      id: string;
      archetype: string;
      template_text: string;
      mood: string;
    }>;
    total: number;
  }> {
    const templates = this.db.searchTemplates(input.query, input.limit ?? 10);

    return {
      templates: templates.map(t => ({
        id: t.id,
        archetype: t.archetype,
        template_text: t.template_text,
        mood: t.mood,
      })),
      total: templates.length,
    };
  }
}
