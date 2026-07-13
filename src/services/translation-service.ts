import { LLMQueue } from '@/lib/llm-queue';
import { getLogger } from '@/utils/logger';

const logger = getLogger('TranslationService');

// ─── Supported Languages ─────────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES = {
  en: 'English',
  ru: 'Russian',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  ja: 'Japanese',
  zh: 'Chinese',
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

// ─── Translation Service ─────────────────────────────────────────────────────

export class TranslationService {
  constructor(private llmQueue: LLMQueue) {}

  /**
   * Translate text from English to target language.
   * All internal operations use English; translation happens at output boundary.
   */
  async translate(
    text: string,
    targetLang: LanguageCode,
    context?: string,
  ): Promise<string> {
    if (targetLang === 'en') return text;
    if (!SUPPORTED_LANGUAGES[targetLang]) {
      logger.warn(`Unsupported language: ${targetLang}, returning original`);
      return text;
    }

    const langName = SUPPORTED_LANGUAGES[targetLang];

    const prompt = `Translate the following game narrative from English to ${langName}.
Preserve the literary style, mood, and tone. Do not add explanations.
${context ? `Context: ${context}` : ''}

Text to translate:
${text}

Return ONLY the translated text, no explanation.`;

    const translated = await this.llmQueue.generateText(prompt, 1, 0.3, 'translation');

    // Verify translation is reasonable length
    if (translated.length < text.length * 0.3 || translated.length > text.length * 3) {
      logger.warn(`Translation length unexpected: ${translated.length} vs ${text.length}`);
      return text;
    }

    return translated;
  }

  /**
   * Translate a complete game response.
   */
  async translateResponse(
    response: {
      narrative: string;
      heartbeatMessage?: string;
      [key: string]: unknown;
    },
    targetLang: LanguageCode,
  ): Promise<typeof response> {
    if (targetLang === 'en') return response;

    const translated = { ...response };

    if (response.narrative) {
      translated.narrative = await this.translate(response.narrative, targetLang);
    }

    if (response.heartbeatMessage) {
      translated.heartbeatMessage = await this.translate(response.heartbeatMessage, targetLang);
    }

    return translated;
  }

  /**
   * Batch translate multiple strings.
   */
  async translateBatch(
    texts: string[],
    targetLang: LanguageCode,
  ): Promise<string[]> {
    if (targetLang === 'en') return texts;

    // Translate in parallel
    const translations = await Promise.all(
      texts.map(text => this.translate(text, targetLang))
    );

    return translations;
  }

  /**
   * Detect language of input text (simple heuristic).
   */
  detectLanguage(text: string): LanguageCode {
    // Simple detection based on character ranges
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
    if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
    if (/[а-яА-ЯёЁ]/.test(text)) return 'ru';
    if (/[äöüß]/i.test(text)) return 'de';
    if (/[àâæéèêëïîôùûüÿçœæ]/i.test(text)) return 'fr';
    if (/[ñ¿¡]/i.test(text)) return 'es';

    return 'en';
  }
}
