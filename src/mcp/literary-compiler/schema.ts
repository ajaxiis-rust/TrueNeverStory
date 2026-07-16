import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { getLogger } from '@/utils/logger';
import type { QuestTemplate, QuestTemplateFilter } from './types';

const logger = getLogger('LiteraryCompilerDB');

export class LiteraryCompilerDB {
  private db: Database;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');

    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bible_quest_templates (
        id TEXT PRIMARY KEY,
        source_book TEXT NOT NULL,
        source_chapter INTEGER NOT NULL,
        archetype TEXT NOT NULL,
        applicable_positions TEXT NOT NULL,
        variables TEXT NOT NULL,
        template_text TEXT NOT NULL,
        mood TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        moral_ambiguity REAL NOT NULL,
        tags TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      );
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS bible_quest_templates_fts
      USING fts5(
        id,
        archetype,
        mood,
        tags,
        template_text,
        content=bible_quest_templates,
        content_rowid=rowid
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS archetype_llm_cache (
        cache_key TEXT PRIMARY KEY,
        archetype TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        created_at INTEGER DEFAULT (unixepoch())
      );
    `);
  }

  insertTemplate(template: Omit<QuestTemplate, 'created_at'>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO bible_quest_templates
      (id, source_book, source_chapter, archetype, applicable_positions, variables, template_text, mood, difficulty, moral_ambiguity, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      template.id,
      template.source_book,
      template.source_chapter,
      template.archetype,
      JSON.stringify(template.applicable_positions),
      JSON.stringify(template.variables),
      template.template_text,
      template.mood,
      template.difficulty,
      template.moral_ambiguity,
      JSON.stringify(template.tags),
    );
  }

  getTemplate(id: string): QuestTemplate | null {
    const row = this.db.prepare('SELECT * FROM bible_quest_templates WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToTemplate(row);
  }

  queryTemplates(filter: QuestTemplateFilter = {}): QuestTemplate[] {
    let query = 'SELECT * FROM bible_quest_templates WHERE 1=1';
    const params: unknown[] = [];

    if (filter.position) {
      query += ' AND applicable_positions LIKE ?';
      params.push(`%${filter.position}%`);
    }

    if (filter.archetype) {
      query += ' AND archetype = ?';
      params.push(filter.archetype);
    }

    if (filter.mood) {
      query += ' AND mood = ?';
      params.push(filter.mood);
    }

    if (filter.difficulty) {
      query += ' AND difficulty = ?';
      params.push(filter.difficulty);
    }

    query += ' ORDER BY created_at DESC';

    if (filter.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }

    const rows = this.db.prepare(query).all(...params as string[]) as Record<string, unknown>[];
    return rows.map(row => this.rowToTemplate(row));
  }

  searchTemplates(text: string, limit = 10): QuestTemplate[] {
    const rows = this.db.prepare(`
      SELECT t.* FROM bible_quest_templates t
      JOIN bible_quest_templates_fts fts ON t.rowid = fts.rowid
      WHERE bible_quest_templates_fts MATCH ?
      LIMIT ?
    `).all(text, limit) as Record<string, unknown>[];

    return rows.map(row => this.rowToTemplate(row));
  }

  deleteTemplate(id: string): void {
    this.db.prepare('DELETE FROM bible_quest_templates WHERE id = ?').run(id);
  }

  getTemplateCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM bible_quest_templates').get() as { count: number };
    return result.count;
  }

  getTables(): string[] {
    const rows = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    return rows.map(r => r.name);
  }

  private rowToTemplate(row: Record<string, unknown>): QuestTemplate {
    return {
      id: row.id as string,
      source_book: row.source_book as string,
      source_chapter: row.source_chapter as number,
      archetype: row.archetype as string,
      applicable_positions: JSON.parse(row.applicable_positions as string),
      variables: JSON.parse(row.variables as string),
      template_text: row.template_text as string,
      mood: row.mood as string,
      difficulty: row.difficulty as string,
      moral_ambiguity: row.moral_ambiguity as number,
      tags: JSON.parse(row.tags as string),
      created_at: row.created_at as number,
    };
  }

  getArchetypeCache(): Array<{ cache_key: string; archetype: string; confidence: number }> {
    return this.db.prepare('SELECT cache_key, archetype, confidence FROM archetype_llm_cache').all() as Array<{ cache_key: string; archetype: string; confidence: number }>;
  }

  insertArchetypeCache(cacheKey: string, archetype: string, confidence: number): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO archetype_llm_cache (cache_key, archetype, confidence) VALUES (?, ?, ?)'
    ).run(cacheKey, archetype, confidence);
  }

  close(): void {
    this.db.close();
  }
}
