import { getLogger } from '@/utils/logger';

const logger = getLogger('StylisticPass');

/**
 * Стилистический паттерн, извлечённый из текста
 */
export interface StylisticPattern {
  /** ID паттерна */
  id: string;

  /** Исходный текст */
  source_text: string;

  /** Длина предложений (средняя) */
  avg_sentence_length: number;

  /** Сенсорные маркеры */
  sensory_markers: string[];

  /** Темп (fast, slow, mixed) */
  pacing: string;

  /** Тон (dark, light, ironic, epic, neutral) */
  tone: string;

  /** Синтаксические конструкции */
  syntax_patterns: string[];

  /** Лексическое богатство (уникальные слова / общее количество) */
  lexical_richness: number;
}

/**
 * Входные данные для Stylistic pass
 */
export interface StylisticInput {
  /** Текст для анализа */
  text: string;

  /** Источник (для ID) */
  source_id: string;
}

/**
 * Результат Stylistic pass
 */
export interface StylisticOutput {
  /** Извлечённые паттерны */
  patterns: StylisticPattern[];

  /** Ошибки */
  errors: string[];
}

/**
 * Ключевые слова для сенсорных маркеров
 */
const SENSORY_KEYWORDS: Record<string, string[]> = {
  sight: ['saw', 'looked', 'gazed', 'watched', 'visible', 'bright', 'dark', 'light', 'shadow', 'color', 'red', 'blue', 'green', 'golden', 'silver'],
  sound: ['heard', 'listened', 'voice', 'sound', 'whisper', 'shout', 'cry', 'laugh', 'silence', 'thunder', 'wind', 'rain'],
  smell: ['smelled', 'scent', 'fragrance', 'stench', 'aroma', 'perfume', 'smoke', 'dust'],
  touch: ['felt', 'touched', 'cold', 'warm', 'hot', 'rough', 'smooth', 'soft', 'hard', 'wet', 'dry'],
  taste: ['tasted', 'sweet', 'bitter', 'sour', 'salty', 'delicious', 'bland'],
};

/**
 * Ключевые слова для тона
 */
const TONE_KEYWORDS: Record<string, string[]> = {
  dark: ['death', 'dark', 'shadow', 'evil', 'cursed', 'doom', 'grief', 'pain', 'suffer', 'destroy'],
  light: ['hope', 'joy', 'light', 'bright', 'happy', 'love', 'peace', 'gentle', 'kind', 'warm'],
  ironic: ['fool', 'irony', 'paradox', 'ironic', 'contrary', 'unexpected', 'absurd', 'ridiculous'],
  epic: ['great', 'mighty', 'powerful', 'legend', 'hero', 'battle', 'victory', 'glory', 'triumph', 'conquer'],
};

/**
 * Синтаксические паттерны
 */
const SYNTAX_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'compound', regex: /\b(and|but|or|nor)\b/gi },
  { name: 'complex', regex: /\b(although|because|since|while|when|if|unless)\b/gi },
  { name: 'passive', regex: /\b(was|were|been|being)\s+\w+ed\b/gi },
  { name: 'dialogue', regex: /"[^"]+"|'[^']+'/g },
  { name: 'exclamation', regex: /!/g },
  { name: 'question', regex: /\?/g },
];

export class StylisticPass {
  /**
   * Анализ текста на стилистические паттерны
   */
  analyze(input: StylisticInput): StylisticOutput {
    const patterns: StylisticPattern[] = [];
    const errors: string[] = [];

    if (!input.text.trim()) {
      return { patterns, errors };
    }

    try {
      const sentences = this.splitSentences(input.text);
      const words = this.splitWords(input.text);

      const avgSentenceLength = sentences.length > 0
        ? words.length / sentences.length
        : 0;

      const sensoryMarkers = this.extractSensoryMarkers(input.text);
      const pacing = this.inferPacing(sentences, words);
      const tone = this.inferTone(input.text);
      const syntaxPatterns = this.extractSyntaxPatterns(input.text);
      const lexicalRichness = this.calculateLexicalRichness(words);

      const pattern: StylisticPattern = {
        id: input.source_id,
        source_text: input.text.substring(0, 500),
        avg_sentence_length: Math.round(avgSentenceLength * 10) / 10,
        sensory_markers: sensoryMarkers,
        pacing,
        tone,
        syntax_patterns: syntaxPatterns,
        lexical_richness: Math.round(lexicalRichness * 100) / 100,
      };

      patterns.push(pattern);
      logger.info(`Analyzed ${input.source_id}: pacing=${pacing}, tone=${tone}, lexical_richness=${lexicalRichness}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to analyze ${input.source_id}: ${msg}`);
      logger.error(`Stylistic pass error: ${msg}`);
    }

    return { patterns, errors };
  }

  /**
   * Разбить текст на предложения
   */
  private splitSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);
  }

  /**
   * Разбить текст на слова
   */
  private splitWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  /**
   * Извлечь сенсорные маркеры
   */
  private extractSensoryMarkers(text: string): string[] {
    const lowerText = text.toLowerCase();
    const markers: string[] = [];

    for (const [sense, keywords] of Object.entries(SENSORY_KEYWORDS)) {
      const found = keywords.some(kw => lowerText.includes(kw));
      if (found) {
        markers.push(sense);
      }
    }

    return markers;
  }

  /**
   * Определить темп
   */
  private inferPacing(sentences: string[], words: string[]): string {
    if (sentences.length === 0) return 'mixed';

    const avgWordsPerSentence = words.length / sentences.length;
    const shortSentences = sentences.filter(s => s.split(/\s+/).length < 8).length;
    const longSentences = sentences.filter(s => s.split(/\s+/).length > 20).length;

    const shortRatio = shortSentences / sentences.length;
    const longRatio = longSentences / sentences.length;

    if (shortRatio > 0.6) return 'fast';
    if (longRatio > 0.6) return 'slow';
    return 'mixed';
  }

  /**
   * Определить тон
   */
  private inferTone(text: string): string {
    const lowerText = text.toLowerCase();
    const scores: Record<string, number> = {};

    for (const [tone, keywords] of Object.entries(TONE_KEYWORDS)) {
      scores[tone] = 0;
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          scores[tone]++;
        }
      }
    }

    let maxScore = 0;
    let inferredTone = 'neutral';

    for (const [tone, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        inferredTone = tone;
      }
    }

    return inferredTone;
  }

  /**
   * Извлечь синтаксические паттерны
   */
  private extractSyntaxPatterns(text: string): string[] {
    const patterns: string[] = [];

    for (const { name, regex } of SYNTAX_PATTERNS) {
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        patterns.push(name);
      }
    }

    return patterns;
  }

  /**
   * Рассчитать лексическое богатство
   */
  private calculateLexicalRichness(words: string[]): number {
    if (words.length === 0) return 0;

    const uniqueWords = new Set(words);
    return uniqueWords.size / words.length;
  }
}
