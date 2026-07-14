/**
 * Квест-шаблон, извлечённый из литературного источника
 */
export interface QuestTemplate {
  /** Уникальный ID (например, "Exodus.14") */
  id: string;

  /** Книга источника */
  source_book: string;

  /** Глава источника */
  source_chapter: number;

  /** Архетип (escape, judgment, inheritance, wisdom, loyalty, political, endurance, rescue) */
  archetype: string;

  /** Позиции в мире, для которых применим шаблон */
  applicable_positions: string[];

  /** Переменные шаблона ([current_hero], [obstacle] и т.д.) */
  variables: string[];

  /** Шаблон текста с переменными */
  template_text: string;

  /** Настроение (epic, dark, hopeful, tense, neutral) */
  mood: string;

  /** Сложность (low, medium, high) */
  difficulty: string;

  /** Моральная неоднозначность (0-1) */
  moral_ambiguity: number;

  /** Теги для RAG-поиска */
  tags: string[];

  /** Дата создания */
  created_at: number;
}

/**
 * Входные данные для Dramaturgic pass
 */
export interface DramaturgicInput {
  /** Текст главы/стиха */
  text: string;

  /** Книга источника */
  source_book: string;

  /** Глава источника */
  source_chapter: number;
}

/**
 * Результат Dramaturgic pass
 */
export interface DramaturgicOutput {
  /** Извлечённые квест-шаблоны */
  templates: QuestTemplate[];

  /** Ошибки парсинга */
  errors: string[];
}

/**
 * Фильтр для запроса шаблонов
 */
export interface QuestTemplateFilter {
  /** Позиция в мире */
  position?: string;

  /** Архетип */
  archetype?: string;

  /** Настроение */
  mood?: string;

  /** Сложность */
  difficulty?: string;

  /** Лимит результатов */
  limit?: number;
}
