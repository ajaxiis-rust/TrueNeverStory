import { getLogger } from '@/utils/logger';

const logger = getLogger('EmotionalPass');

/**
 * Эмоциональная дуга, извлечённая из текста
 */
export interface EmotionalArc {
  /** ID дуги */
  id: string;

  /** Исходный текст */
  source_text: string;

  /** Уровень напряжения (0-1) */
  tension_level: number;

  /** Эмоции в тексте */
  emotions: string[];

  /** Переходы настроения */
  mood_transitions: string[];

  /** Кривая напряжения (массив значений 0-1) */
  tension_curve: number[];

  /** Доминирующая эмоция */
  dominant_emotion: string;
}

/**
 * Входные данные для Emotional pass
 */
export interface EmotionalInput {
  /** Текст для анализа */
  text: string;

  /** Источник (для ID) */
  source_id: string;
}

/**
 * Результат Emotional pass
 */
export interface EmotionalOutput {
  /** Извлечённые дуги */
  arcs: EmotionalArc[];

  /** Ошибки */
  errors: string[];
}

/**
 * Ключевые слова для эмоций
 */
const EMOTION_KEYWORDS: Record<string, string[]> = {
  fear: ['afraid', 'fear', 'terror', 'horror', 'frightened', 'scared', 'dread', 'anxious', 'worried', 'panic'],
  joy: ['happy', 'joy', 'glad', 'delighted', 'pleased', 'cheerful', 'merry', 'elated', 'thrilled', 'ecstatic'],
  anger: ['angry', 'fury', 'rage', 'wrath', 'furious', 'enraged', 'irate', 'livid', 'seething', 'outraged'],
  hope: ['hope', 'hopeful', 'optimistic', 'faith', 'trust', 'believe', 'expect', 'anticipate', 'dream', 'wish'],
  sadness: ['sad', 'sorrow', 'grief', 'mourning', 'lament', 'weep', 'cry', 'tear', 'mournful', 'heartbroken'],
  surprise: ['surprise', 'astonished', 'amazed', 'shocked', 'stunned', 'unexpected', 'sudden', 'startled'],
  disgust: ['disgust', 'revolt', 'repulse', 'nausea', 'sickening', 'vile', 'foul', 'loathsome'],
  love: ['love', 'adore', 'cherish', 'devotion', 'affection', 'passion', 'romance', 'tender', 'gentle'],
};

/**
 * Интенсивности эмоций (слова-усилители)
 */
const INTENSIFIERS: Record<string, number> = {
  very: 1.5,
  extremely: 2.0,
  utterly: 2.0,
  absolutely: 2.0,
  deeply: 1.8,
  profoundly: 2.0,
  slightly: 0.5,
  somewhat: 0.7,
  barely: 0.3,
  hardly: 0.3,
};

/**
 * Маркеры напряжения
 */
const TENSION_MARKERS: Record<string, number> = {
  fight: 0.8,
  battle: 0.9,
  kill: 0.9,
  death: 0.9,
  threat: 0.7,
  danger: 0.7,
  escape: 0.8,
  chase: 0.8,
  scream: 0.7,
  blood: 0.8,
  wound: 0.7,
  fire: 0.6,
  storm: 0.5,
  darkness: 0.4,
  silence: 0.3,
  whisper: 0.2,
  smile: 0.1,
  laugh: 0.1,
  peace: 0.1,
  calm: 0.1,
};

export class EmotionalPass {
  /**
   * Анализ текста на эмоциональные дуги
   */
  analyze(input: EmotionalInput): EmotionalOutput {
    const arcs: EmotionalArc[] = [];
    const errors: string[] = [];

    if (!input.text.trim()) {
      return { arcs, errors };
    }

    try {
      const sentences = this.splitSentences(input.text);
      const emotions = this.extractEmotions(input.text);
      const tensionLevel = this.calculateTension(input.text);
      const moodTransitions = this.detectMoodTransitions(sentences);
      const tensionCurve = this.buildTensionCurve(sentences);
      const dominantEmotion = this.getDominantEmotion(input.text);

      const arc: EmotionalArc = {
        id: input.source_id,
        source_text: input.text.substring(0, 500),
        tension_level: Math.round(tensionLevel * 100) / 100,
        emotions,
        mood_transitions: moodTransitions,
        tension_curve: tensionCurve,
        dominant_emotion: dominantEmotion,
      };

      arcs.push(arc);
      logger.info(`Analyzed ${input.source_id}: tension=${tensionLevel}, emotion=${dominantEmotion}, emotions=${emotions.join(',')}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to analyze ${input.source_id}: ${msg}`);
      logger.error(`Emotional pass error: ${msg}`);
    }

    return { arcs, errors };
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
   * Извлечь эмоции из текста
   */
  private extractEmotions(text: string): string[] {
    const lowerText = text.toLowerCase();
    const emotions: string[] = [];

    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      const found = keywords.some(kw => lowerText.includes(kw));
      if (found) {
        emotions.push(emotion);
      }
    }

    return emotions;
  }

  /**
   * Рассчитать уровень напряжения
   */
  private calculateTension(text: string): number {
    const lowerText = text.toLowerCase();
    let totalTension = 0;
    let count = 0;

    for (const [marker, tension] of Object.entries(TENSION_MARKERS)) {
      if (lowerText.includes(marker)) {
        totalTension += tension;
        count++;
      }
    }

    // Усилители
    for (const [intensifier, multiplier] of Object.entries(INTENSIFIERS)) {
      if (lowerText.includes(intensifier)) {
        totalTension *= multiplier;
        break;
      }
    }

    const baseTension = count > 0 ? totalTension / count : 0.3;
    return Math.max(0, Math.min(1, baseTension));
  }

  /**
   * Обнаружить переходы настроения
   */
  private detectMoodTransitions(sentences: string[]): string[] {
    const transitions: string[] = [];
    let prevMood = 'neutral';

    for (const sentence of sentences) {
      const currentMood = this.inferSentenceMood(sentence);
      if (currentMood !== prevMood) {
        transitions.push(`${prevMood} → ${currentMood}`);
        prevMood = currentMood;
      }
    }

    return transitions;
  }

  /**
   * Определить настроение предложения
   */
  private inferSentenceMood(sentence: string): string {
    const lower = sentence.toLowerCase();

    const positiveWords = ['happy', 'joy', 'love', 'hope', 'peace', 'calm', 'gentle', 'kind', 'bright', 'light'];
    const negativeWords = ['sad', 'fear', 'anger', 'death', 'dark', 'pain', 'suffer', 'evil', 'cursed'];

    const positiveCount = positiveWords.filter(w => lower.includes(w)).length;
    const negativeCount = negativeWords.filter(w => lower.includes(w)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Построить кривую напряжения
   */
  private buildTensionCurve(sentences: string[]): number[] {
    return sentences.map(sentence => {
      const lower = sentence.toLowerCase();
      let tension = 0.3;

      for (const [marker, value] of Object.entries(TENSION_MARKERS)) {
        if (lower.includes(marker)) {
          tension = Math.max(tension, value);
        }
      }

      return Math.round(tension * 100) / 100;
    });
  }

  /**
   * Определить доминирующую эмоцию
   */
  private getDominantEmotion(text: string): string {
    const lowerText = text.toLowerCase();
    const scores: Record<string, number> = {};

    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      scores[emotion] = 0;
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          scores[emotion]++;
        }
      }
    }

    let maxScore = 0;
    let dominant = 'neutral';

    for (const [emotion, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        dominant = emotion;
      }
    }

    return dominant;
  }
}
