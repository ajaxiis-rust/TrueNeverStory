import { getLogger } from '@/utils/logger';
import type { QuestTemplate } from './types';

const logger = getLogger('MetadataPass');

/**
 * Метаданные для RAG-поиска
 */
export interface TemplateMetadata {
  /** ID шаблона */
  template_id: string;

  /** Теги для поиска */
  tags: string[];

  /** Применимые позиции */
  applicable_positions: string[];

  /** Сложность */
  difficulty: string;

  /** Моральная неоднозначность (0-1) */
  moral_ambiguity: number;

  /** Настроение */
  mood: string;

  /** Архетип */
  archetype: string;
}

/**
 * Входные данные для Metadata pass
 */
export interface MetadataInput {
  /** Шаблон для обогащения метаданными */
  template: QuestTemplate;

  /** Дополнительный контекст (опционально) */
  context?: string;
}

/**
 * Результат Metadata pass
 */
export interface MetadataOutput {
  /** Обогащённые метаданные */
  metadata: TemplateMetadata;

  /** Ошибки */
  errors: string[];
}

/**
 * Ключевые слова для тегов
 */
const TAG_KEYWORDS: Record<string, string[]> = {
  water: ['water', 'sea', 'river', 'ocean', 'lake', 'rain', 'flood'],
  landscape: ['mountain', 'hill', 'valley', 'forest', 'desert', 'plain'],
  family: ['family', 'son', 'daughter', 'father', 'mother', 'brother', 'sister', 'child'],
  royalty: ['king', 'queen', 'prince', 'princess', 'throne', 'crown', 'kingdom'],
  conflict: ['battle', 'war', 'fight', 'enemy', 'army', 'sword', 'shield'],
  miracle: ['miracle', 'sign', 'wonder', 'divine', 'supernatural'],
  journey: ['journey', 'travel', 'path', 'road', 'way', 'quest'],
  wisdom: ['wisdom', 'wise', 'counsel', 'advice', 'teach', 'learn', 'proverb'],
  justice: ['judge', 'judgment', 'justice', 'law', 'verdict', 'trial'],
  sacrifice: ['sacrifice', 'give up', 'offering', 'cost', 'price'],
};

/**
 * Позиции по умолчанию для архетипов
 */
const DEFAULT_POSITIONS: Record<string, string[]> = {
  escape: ['leader', 'follower'],
  judgment: ['judge', 'leader'],
  inheritance: ['leader', 'follower', 'heir'],
  wisdom: ['follower', 'wise_one'],
  loyalty: ['follower', 'mentor'],
  political: ['leader', 'tyrant'],
  endurance: ['follower'],
  rescue: ['leader', 'savior'],
  liberation: ['leader', 'savior', 'follower'],
  rise_fall_rise: ['leader', 'tyrant', 'follower'],
};

export class MetadataPass {
  /**
   * Обогатить шаблон метаданными
   */
  enrich(input: MetadataInput): MetadataOutput {
    const errors: string[] = [];

    try {
      const template = input.template;

      // Объединить существующие теги с извлечёнными
      const extractedTags = this.extractTags(template.template_text, input.context);
      const allTags = [...new Set([...template.tags, ...extractedTags])];

      // Определить позиции (если не заданы)
      const positions = template.applicable_positions.length > 0
        ? template.applicable_positions
        : DEFAULT_POSITIONS[template.archetype] ?? ['follower'];

      // Определить сложность (если не задана)
      const difficulty = template.difficulty || this.inferDifficulty(template);

      // Определить моральную неоднозначность (если не задана)
      const moralAmbiguity = template.moral_ambiguity || this.inferMoralAmbiguity(template);

      const metadata: TemplateMetadata = {
        template_id: template.id,
        tags: allTags,
        applicable_positions: positions,
        difficulty,
        moral_ambiguity: Math.round(moralAmbiguity * 100) / 100,
        mood: template.mood,
        archetype: template.archetype,
      };

      logger.info(`Enriched ${template.id}: tags=${allTags.length}, positions=${positions.length}`);
      return { metadata, errors };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to enrich ${input.template.id}: ${msg}`);
      logger.error(`Metadata pass error: ${msg}`);

      return {
        metadata: {
          template_id: input.template.id,
          tags: input.template.tags,
          applicable_positions: input.template.applicable_positions,
          difficulty: input.template.difficulty,
          moral_ambiguity: input.template.moral_ambiguity,
          mood: input.template.mood,
          archetype: input.template.archetype,
        },
        errors,
      };
    }
  }

  /**
   * Извлечь теги из текста
   */
  private extractTags(text: string, context?: string): string[] {
    const combinedText = context ? `${text} ${context}` : text;
    const lowerText = combinedText.toLowerCase();
    const tags: string[] = [];

    for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
      const found = keywords.some(kw => lowerText.includes(kw));
      if (found) {
        tags.push(tag);
      }
    }

    return tags;
  }

  /**
   * Определить сложность
   */
  private inferDifficulty(template: QuestTemplate): string {
    let score = 0;

    // Длина текста
    if (template.template_text.length > 500) score += 2;
    else if (template.template_text.length > 200) score += 1;

    // Количество переменных
    if (template.variables.length > 5) score += 1;

    // Количество позиций
    if (template.applicable_positions.length > 3) score += 1;

    // Моральная неоднозначность
    if (template.moral_ambiguity > 0.7) score += 1;

    if (score >= 4) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  /**
   * Определить моральную неоднозначность
   */
  private inferMoralAmbiguity(template: QuestTemplate): number {
    let score = 0.3;

    // Архетипы с высокой неоднозначностью
    if (template.archetype === 'political') score += 0.2;
    if (template.archetype === 'judgment') score += 0.15;
    if (template.archetype === 'endurance') score += 0.1;

    // Количество переменных (больше = сложнее)
    if (template.variables.length > 4) score += 0.1;

    return Math.max(0, Math.min(1, score));
  }
}
