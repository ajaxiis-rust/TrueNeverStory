import { BibleParser } from '../bible/parser';
import { SearchVersesInput, GetPatternInput, GetArchetypeInput } from '../schemas';
import { getLogger } from '@/utils/logger';

const logger = getLogger('BibleMCPTools');

export class BibleMCPTools {
  constructor(private parser: BibleParser) {}

  /**
   * Search verses by text, book, or reference.
   */
  async searchVerses(input: SearchVersesInput): Promise<{
    verses: Array<{
      id: string;
      book: string;
      chapter: number;
      verse: number;
      text: string;
    }>;
    total: number;
  }> {
    const verses = this.parser.search(input.query, {
      book: input.book,
      chapter: input.chapter,
      limit: input.limit ?? 10,
    });

    return {
      verses: verses.map(v => ({
        id: v.id,
        book: v.book,
        chapter: v.chapter,
        verse: v.verse,
        text: v.text,
      })),
      total: verses.length,
    };
  }

  /**
   * Get narrative patterns by archetype, mood, or function.
   */
  async getPattern(input: GetPatternInput): Promise<{
    patterns: Array<{
      id: string;
      name: string;
      archetype: string;
      description: string;
      verses: string[];
      narrativeFunctions: string[];
      mood: string;
    }>;
    total: number;
  }> {
    const patterns = this.parser.getPatterns({
      archetype: input.archetype,
      mood: input.mood,
      narrativeFunction: input.narrativeFunction,
    });

    return {
      patterns: patterns.map(p => ({
        id: p.id,
        name: p.name,
        archetype: p.archetype,
        description: p.description,
        verses: p.verses,
        narrativeFunctions: p.narrativeFunctions,
        mood: p.mood,
      })),
      total: patterns.length,
    };
  }

  /**
   * Get archetype details by name.
   */
  async getArchetype(input: GetArchetypeInput): Promise<{
    archetype: string;
    patterns: Array<{
      id: string;
      name: string;
      description: string;
      mood: string;
    }>;
    relatedVerses: Array<{
      id: string;
      book: string;
      text: string;
    }>;
  }> {
    const patterns = this.parser.getPatterns({ archetype: input.name });

    // Find verses referenced by these patterns
    const verseIds = new Set<string>();
    for (const pattern of patterns) {
      for (const verseId of pattern.verses) {
        verseIds.add(verseId);
      }
    }

    const verses = Array.from(verseIds)
      .map(id => this.parser.getVerse(id))
      .filter((v): v is NonNullable<typeof v> => v !== null);

    return {
      archetype: input.name,
      patterns: patterns.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        mood: p.mood,
      })),
      relatedVerses: verses.map(v => ({
        id: v.id,
        book: v.book,
        text: v.text,
      })),
    };
  }

  /**
   * Get all available books.
   */
  async getBooks(): Promise<{
    books: string[];
    total: number;
  }> {
    const books = this.parser.getBooks();
    return { books, total: books.length };
  }
}
