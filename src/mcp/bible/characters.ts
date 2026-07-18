import { Database } from 'bun:sqlite';
import { BibleParser } from './parser';
import { getDictionary } from './name-dictionary';
import { getLogger } from '@/utils/logger';
import type { BibleCharacter, BibleCharacterEdge, BibleCharacterMention } from './types';

const logger = getLogger('CharacterDB');

export class CharacterDB {
  private db: Database;

  constructor(parser: BibleParser) {
    this.db = parser.db;
  }

  createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bible_characters (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL,
        hebrew_name TEXT,
        greek_name TEXT,
        russian_name TEXT,
        aliases TEXT NOT NULL DEFAULT '[]',
        significance TEXT NOT NULL,
        testament TEXT NOT NULL,
        description TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bible_character_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_character TEXT NOT NULL REFERENCES bible_characters(id),
        to_character TEXT NOT NULL REFERENCES bible_characters(id),
        relation TEXT NOT NULL,
        context TEXT,
        UNIQUE(from_character, to_character, relation)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bible_character_mentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id TEXT NOT NULL REFERENCES bible_characters(id),
        verse_id TEXT NOT NULL REFERENCES bible_verses(id),
        role TEXT NOT NULL DEFAULT 'mentioned',
        UNIQUE(character_id, verse_id)
      )
    `);

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_char_edges_from ON bible_character_edges(from_character)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_char_edges_to ON bible_character_edges(to_character)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_char_mentions_char ON bible_character_mentions(character_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_char_mentions_verse ON bible_character_mentions(verse_id)');

    logger.info('Character tables created');
  }

  insertCharacter(char: BibleCharacter): void {
    this.db.query(`
      INSERT OR REPLACE INTO bible_characters
      (id, canonical_name, hebrew_name, greek_name, russian_name, aliases, significance, testament, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      char.id, char.canonical_name, char.hebrew_name, char.greek_name,
      char.russian_name, JSON.stringify(char.aliases), char.significance,
      char.testament, char.description,
    );
  }

  getById(id: string): BibleCharacter | null {
    const row = this.db.query('SELECT * FROM bible_characters WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToCharacter(row);
  }

  search(query: string, limit = 20): BibleCharacter[] {
    const rows = this.db.query(`
      SELECT * FROM bible_characters
      WHERE canonical_name LIKE ? OR russian_name LIKE ? OR aliases LIKE ?
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit) as Record<string, unknown>[];
    return rows.map(r => this.rowToCharacter(r));
  }

  getAll(): BibleCharacter[] {
    const rows = this.db.query('SELECT * FROM bible_characters ORDER BY canonical_name').all() as Record<string, unknown>[];
    return rows.map(r => this.rowToCharacter(r));
  }

  insertEdge(from: string, to: string, relation: string, context?: { verse?: string; note?: string }): void {
    this.db.query(`
      INSERT OR IGNORE INTO bible_character_edges (from_character, to_character, relation, context)
      VALUES (?, ?, ?, ?)
    `).run(from, to, relation, context ? JSON.stringify(context) : null);
  }

  getEdges(characterId: string): BibleCharacterEdge[] {
    const rows = this.db.query(`
      SELECT * FROM bible_character_edges
      WHERE from_character = ? OR to_character = ?
    `).all(characterId, characterId) as Record<string, unknown>[];
    return rows.map(r => ({
      id: r.id as number,
      from_character: r.from_character as string,
      to_character: r.to_character as string,
      relation: r.relation as BibleCharacterEdge['relation'],
      context: r.context ? JSON.parse(r.context as string) : null,
    }));
  }

  insertMention(characterId: string, verseId: string, role: string): void {
    this.db.query(`
      INSERT OR IGNORE INTO bible_character_mentions (character_id, verse_id, role)
      VALUES (?, ?, ?)
    `).run(characterId, verseId, role);
  }

  getMentions(characterId: string): BibleCharacterMention[] {
    const rows = this.db.query(`
      SELECT * FROM bible_character_mentions WHERE character_id = ?
    `).all(characterId) as Record<string, unknown>[];
    return rows.map(r => ({
      id: r.id as number,
      character_id: r.character_id as string,
      verse_id: r.verse_id as string,
      role: r.role as BibleCharacterMention['role'],
    }));
  }

  getVerseCharacters(verseId: string): BibleCharacter[] {
    const rows = this.db.query(`
      SELECT c.* FROM bible_characters c
      JOIN bible_character_mentions m ON c.id = m.character_id
      WHERE m.verse_id = ?
    `).all(verseId) as Record<string, unknown>[];
    return rows.map(r => this.rowToCharacter(r));
  }

  getTables(): string[] {
    const rows = this.db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    return rows.map(r => r.name);
  }

  close(): void {
    // DB is shared with parser, don't close here
  }

  private rowToCharacter(row: Record<string, unknown>): BibleCharacter {
    return {
      id: row.id as string,
      canonical_name: row.canonical_name as string,
      hebrew_name: row.hebrew_name as string | null,
      greek_name: row.greek_name as string | null,
      russian_name: row.russian_name as string | null,
      aliases: JSON.parse(row.aliases as string),
      significance: row.significance as BibleCharacter['significance'],
      testament: row.testament as BibleCharacter['testament'],
      description: row.description as string | null,
    };
  }

  extractFromText(parser: BibleParser): { charactersFound: number; mentionsCreated: number } {
    const dictionary = getDictionary();
    const verses = this.db.query('SELECT id, text FROM bible_verses').all() as Array<{ id: string; text: string }>;

    let charactersFound = 0;
    let mentionsCreated = 0;

    for (const entry of dictionary) {
      this.insertCharacter({
        id: entry.canonical,
        canonical_name: entry.variants.en[0] ?? entry.canonical,
        hebrew_name: entry.variants.he?.[0] ?? null,
        greek_name: entry.variants.el?.[0] ?? null,
        russian_name: entry.variants.ru[0] ?? entry.canonical,
        aliases: entry.variants.en.concat(entry.variants.ru),
        significance: entry.significance,
        testament: entry.testament,
        description: entry.description,
      });
      charactersFound++;
    }

    for (const verse of verses) {
      for (const entry of dictionary) {
        const allVariants = [...entry.variants.en, ...entry.variants.ru];
        for (const variant of allVariants) {
          if (verse.text.includes(variant)) {
            this.insertMention(entry.canonical, verse.id, 'mentioned');
            mentionsCreated++;
            break;
          }
        }
      }
    }

    logger.info(`Extracted ${charactersFound} characters, ${mentionsCreated} mentions`);
    return { charactersFound, mentionsCreated };
  }
}
