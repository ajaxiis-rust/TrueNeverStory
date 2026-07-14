import { getLogger } from '@/utils/logger';
import type { QuestTemplate } from './types';

const logger = getLogger('Linter');

/**
 * Уровень проблемы
 */
export type IssueLevel = 'error' | 'warning';

/**
 * Проблема, найденная линтером
 */
export interface LintIssue {
  /** Уровень проблемы */
  level: IssueLevel;

  /** Тип проблемы */
  type: string;

  /** Описание проблемы */
  message: string;

  /** ID шаблона */
  template_id: string;
}

/**
 * Результат линтинга
 */
export interface LintResult {
  /** Все найденные проблемы */
  issues: LintIssue[];

  /** Количество ошибок */
  error_count: number;

  /** Количество предупреждений */
  warning_count: number;

  /** Шаблоны, прошедшие валидацию */
  valid_templates: QuestTemplate[];

  /** Шаблоны с ошибками (не могут быть использованы) */
  invalid_templates: QuestTemplate[];
}

/**
 * Клише в тексте
 */
const CLICHES: string[] = [
  'delved deep',
  'tapestry',
  'weaving',
  'mosaic',
  'palpable tension',
  'air crackled',
  'heart pounded',
  'blood ran cold',
  'chills down the spine',
  'time stood still',
  'world turned upside down',
  'perfect storm',
  'perfect storm',
  'tip of the iceberg',
  'elephant in the room',
];

/**
 * Обязательные переменные для шаблонов
 */
const REQUIRED_VARIABLES: string[] = ['current_hero'];

export class Linter {
  /**
   * Проверить массив шаблонов
   */
  lint(templates: QuestTemplate[]): LintResult {
    const issues: LintIssue[] = [];
    const validTemplates: QuestTemplate[] = [];
    const invalidTemplates: QuestTemplate[] = [];
    const seenIds = new Set<string>();

    for (const template of templates) {
      const templateIssues = this.lintSingle(template);

      // Проверка на дубликаты
      if (seenIds.has(template.id)) {
        templateIssues.push({
          level: 'warning',
          type: 'duplicate_id',
          message: `Duplicate template ID: ${template.id}`,
          template_id: template.id,
        });
      }
      seenIds.add(template.id);

      // Проверка на ошибки (не предупреждения)
      const hasErrors = templateIssues.some(issue => issue.level === 'error');

      if (hasErrors) {
        invalidTemplates.push(template);
      } else {
        validTemplates.push(template);
      }

      issues.push(...templateIssues);
    }

    const errorCount = issues.filter(i => i.level === 'error').length;
    const warningCount = issues.filter(i => i.level === 'warning').length;

    logger.info(`Linted ${templates.length} templates: ${errorCount} errors, ${warningCount} warnings`);

    return {
      issues,
      error_count: errorCount,
      warning_count: warningCount,
      valid_templates: validTemplates,
      invalid_templates: invalidTemplates,
    };
  }

  /**
   * Проверить один шаблон
   */
  private lintSingle(template: QuestTemplate): LintIssue[] {
    const issues: LintIssue[] = [];

    // Проверка обязательных полей
    if (!template.id || template.id.trim() === '') {
      issues.push({
        level: 'error',
        type: 'empty_field',
        message: 'Template ID is required',
        template_id: template.id,
      });
    }

    if (!template.archetype || template.archetype.trim() === '') {
      issues.push({
        level: 'error',
        type: 'empty_field',
        message: 'Archetype is required',
        template_id: template.id,
      });
    }

    if (!template.template_text || template.template_text.trim() === '') {
      issues.push({
        level: 'error',
        type: 'empty_field',
        message: 'Template text is required',
        template_id: template.id,
      });
    }

    if (!template.mood || template.mood.trim() === '') {
      issues.push({
        level: 'warning',
        type: 'empty_field',
        message: 'Mood is recommended',
        template_id: template.id,
      });
    }

    if (!template.difficulty || template.difficulty.trim() === '') {
      issues.push({
        level: 'warning',
        type: 'empty_field',
        message: 'Difficulty is recommended',
        template_id: template.id,
      });
    }

    // Проверка переменных
    if (!template.variables || template.variables.length === 0) {
      issues.push({
        level: 'error',
        type: 'missing_variables',
        message: 'Template must have at least one variable',
        template_id: template.id,
      });
    }

    // Проверка на наличие обязательных переменных
    if (template.variables && template.variables.length > 0) {
      const hasHero = template.variables.some(v =>
        v.includes('hero') || v.includes('leader') || v.includes('protagonist'),
      );
      if (!hasHero) {
        issues.push({
          level: 'warning',
          type: 'missing_hero_variable',
          message: 'Template should have a hero/leader variable',
          template_id: template.id,
        });
      }
    }

    // Проверка длины шаблона
    if (template.template_text && template.template_text.split(/\s+/).length > 500) {
      issues.push({
        level: 'warning',
        type: 'too_long',
        message: `Template text is ${template.template_text.split(/\s+/).length} words (recommended: <500)`,
        template_id: template.id,
      });
    }

    // Проверка на клише
    if (template.template_text) {
      const lowerText = template.template_text.toLowerCase();
      const foundCliches = CLICHES.filter(cliche => lowerText.includes(cliche));
      if (foundCliches.length > 0) {
        issues.push({
          level: 'warning',
          type: 'cliche',
          message: `Found clichés: ${foundCliches.join(', ')}`,
          template_id: template.id,
        });
      }
    }

    // Проверка диапазона моральной неоднозначности
    if (template.moral_ambiguity < 0 || template.moral_ambiguity > 1) {
      issues.push({
        level: 'error',
        type: 'invalid_range',
        message: `Moral ambiguity must be between 0 and 1, got ${template.moral_ambiguity}`,
        template_id: template.id,
      });
    }

    return issues;
  }
}
