import { GutenbergParser } from '../gutenberg/parser';
import { GetStyleInput, ApplyStyleInput } from '../schemas';
import { getLogger } from '@/utils/logger';

const logger = getLogger('GutenbergMCPTools');

export class GutenbergMCPTools {
  constructor(private parser: GutenbergParser) {}

  /**
   * Search styles by mood, tags, or description.
   */
  async getStylePattern(input: GetStyleInput): Promise<{
    styles: Array<{
      id: string;
      name: string;
      description: string;
      examples: string[];
      vocabulary: string[];
      sentencePatterns: string[];
      moodTags: string[];
    }>;
    total: number;
  }> {
    const styles = this.parser.searchStyles(input.query, {
      mood: input.mood,
      limit: input.limit ?? 5,
    });

    return {
      styles: styles.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        examples: s.examples,
        vocabulary: s.vocabulary,
        sentencePatterns: s.sentencePatterns,
        moodTags: s.moodTags,
      })),
      total: styles.length,
    };
  }

  /**
   * Apply style to text (delexify and return style suggestions).
   */
  async applyStyle(input: ApplyStyleInput): Promise<{
    delexified: string;
    style?: {
      id: string;
      name: string;
      description: string;
      vocabulary: string[];
      sentencePatterns: string[];
    };
    suggestions: string[];
  }> {
    // Delexify the text
    const delexified = this.parser.delexify(input.text);

    // Get style if specified
    let style = undefined;
    if (input.styleId) {
      const s = this.parser.getStyle(input.styleId);
      if (s) {
        style = {
          id: s.id,
          name: s.name,
          description: s.description,
          vocabulary: s.vocabulary,
          sentencePatterns: s.sentencePatterns,
        };
      }
    } else if (input.mood) {
      // Search by mood
      const styles = this.parser.searchStyles(input.mood, { mood: input.mood, limit: 1 });
      if (styles.length > 0) {
        const s = styles[0]!;
        style = {
          id: s.id,
          name: s.name,
          description: s.description,
          vocabulary: s.vocabulary,
          sentencePatterns: s.sentencePatterns,
        };
      }
    }

    // Generate suggestions
    const suggestions: string[] = [];
    if (style) {
      suggestions.push(`Consider using vocabulary: ${style.vocabulary.slice(0, 5).join(', ')}`);
      suggestions.push(`Try sentence patterns: ${style.sentencePatterns.slice(0, 2).join(' | ')}`);
      suggestions.push(`Mood: ${style.description}`);
    }

    return {
      delexified,
      style,
      suggestions,
    };
  }

  /**
   * Get all available styles.
   */
  async getAllStyles(): Promise<{
    styles: Array<{
      id: string;
      name: string;
      description: string;
      moodTags: string[];
    }>;
    total: number;
  }> {
    const styles = this.parser.getAllStyles();
    return {
      styles: styles.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        moodTags: s.moodTags,
      })),
      total: styles.length,
    };
  }
}
