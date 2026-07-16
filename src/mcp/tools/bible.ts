import { BibleParser } from '../bible/parser';
import { CharacterDB } from '../bible/characters';
import { SearchVersesInput, GetPatternInput, GetArchetypeInput, GetCrossRefsInput, GetRelatedVersesInput } from '../schemas';
import { getLogger } from '@/utils/logger';

const logger = getLogger('BibleMCPTools');

export class BibleMCPTools {
  constructor(
    private parser: BibleParser,
    private characterDB: CharacterDB,
  ) {}

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
   * Get cross-references for a verse.
   */
  async getCrossRefs(input: GetCrossRefsInput): Promise<{
    references: Array<{
      fromBook: string;
      fromChapter: number;
      fromVerse: number;
      toBook: string;
      toChapter: number;
      toVerseRange: string;
      votes: number;
    }>;
    total: number;
  }> {
    const refs = this.parser.getCrossRefs({
      book: input.book,
      chapter: input.chapter,
      verse: input.verse,
      minVotes: input.minVotes,
      limit: input.limit ?? 20,
    });

    return {
      references: refs.map(r => ({
        fromBook: r.fromBook,
        fromChapter: r.fromChapter,
        fromVerse: r.fromVerse,
        toBook: r.toBook,
        toChapter: r.toChapter,
        toVerseRange: r.toVerseStart === r.toVerseEnd
          ? `${r.toVerseStart}`
          : `${r.toVerseStart}-${r.toVerseEnd}`,
        votes: r.votes,
      })),
      total: refs.length,
    };
  }

  /**
   * Get related verses via graph traversal.
   */
  async getRelatedVerses(input: GetRelatedVersesInput): Promise<{
    related: Array<{
      fromBook: string;
      fromChapter: number;
      fromVerse: number;
      toBook: string;
      toChapter: number;
      toVerseRange: string;
      votes: number;
    }>;
    total: number;
  }> {
    const refs = this.parser.getRelatedVerses(
      input.book,
      input.chapter,
      input.verse,
      input.depth ?? 1,
    );

    return {
      related: refs.map(r => ({
        fromBook: r.fromBook,
        fromChapter: r.fromChapter,
        fromVerse: r.fromVerse,
        toBook: r.toBook,
        toChapter: r.toChapter,
        toVerseRange: r.toVerseStart === r.toVerseEnd
          ? `${r.toVerseStart}`
          : `${r.toVerseStart}-${r.toVerseEnd}`,
        votes: r.votes,
      })),
      total: refs.length,
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

  async searchCharacters(input: {
    query: string;
    significance?: string;
    testament?: string;
    limit?: number;
  }): Promise<{
    characters: Array<{
      id: string;
      canonical_name: string;
      russian_name: string | null;
      significance: string;
      testament: string;
      description: string | null;
    }>;
    total: number;
  }> {
    const results = this.characterDB.search(input.query, input.limit ?? 20);
    const filtered = results.filter(c => {
      if (input.significance && c.significance !== input.significance) return false;
      if (input.testament && c.testament !== input.testament) return false;
      return true;
    });
    return {
      characters: filtered.map(c => ({
        id: c.id,
        canonical_name: c.canonical_name,
        russian_name: c.russian_name,
        significance: c.significance,
        testament: c.testament,
        description: c.description,
      })),
      total: filtered.length,
    };
  }

  async getCharacter(input: { id: string }): Promise<{
    character: {
      id: string;
      canonical_name: string;
      hebrew_name: string | null;
      greek_name: string | null;
      russian_name: string | null;
      aliases: string[];
      significance: string;
      testament: string;
      description: string | null;
    };
    edges: Array<{
      with: string;
      relation: string;
      context: { verse?: string; note?: string } | null;
    }>;
    mentionCount: number;
  } | null> {
    const char = this.characterDB.getById(input.id);
    if (!char) return null;
    const edges = this.characterDB.getEdges(input.id);
    const mentions = this.characterDB.getMentions(input.id);
    return {
      character: {
        id: char.id,
        canonical_name: char.canonical_name,
        hebrew_name: char.hebrew_name,
        greek_name: char.greek_name,
        russian_name: char.russian_name,
        aliases: char.aliases,
        significance: char.significance,
        testament: char.testament,
        description: char.description,
      },
      edges: edges.map(e => ({
        with: e.from_character === input.id ? e.to_character : e.from_character,
        relation: e.relation,
        context: e.context,
      })),
      mentionCount: mentions.length,
    };
  }

  async getCharacterEdges(input: {
    id: string;
    relation?: string;
  }): Promise<{
    edges: Array<{
      from: string;
      to: string;
      relation: string;
      context: { verse?: string; note?: string } | null;
    }>;
    total: number;
  }> {
    let edges = this.characterDB.getEdges(input.id);
    if (input.relation) {
      edges = edges.filter(e => e.relation === input.relation);
    }
    return {
      edges: edges.map(e => ({
        from: e.from_character,
        to: e.to_character,
        relation: e.relation,
        context: e.context,
      })),
      total: edges.length,
    };
  }

  async getVerseCharacters(input: {
    verseId: string;
  }): Promise<{
    characters: Array<{
      id: string;
      canonical_name: string;
      significance: string;
    }>;
    total: number;
  }> {
    const chars = this.characterDB.getVerseCharacters(input.verseId);
    return {
      characters: chars.map(c => ({
        id: c.id,
        canonical_name: c.canonical_name,
        significance: c.significance,
      })),
      total: chars.length,
    };
  }
}
