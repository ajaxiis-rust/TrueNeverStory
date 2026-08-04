import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { getLogger } from '@/utils/logger';
import type { QuestTemplate, QuestTemplateFilter } from './types';

const logger = getLogger('LiteraryCompilerDB');

// ── V2 Types ──────────────────────────────────────────────────────────────────

export interface SceneTemplate {
  id: string;
  source_book: string;
  source_chapter: number;
  source_chunk_ids: string[];
  archetype_primary: string;
  archetype_secondary: string | null;
  applicable_positions: string[];
  variables: string[];
  template_text: string;
  beat_sequence: string[];
  mood: string;
  difficulty: string;
  moral_ambiguity: number;
  tension_curve: number[];
  tags: string[];
  domain: string;
  scale: number;
  embedding_id: string | null;
  quality_score: number;
  use_count: number;
  last_used_at: number | null;
  created_at: number;
}

export interface StylePattern {
  id: string;
  source_author_or_era: string;
  source_chunk_ids: string[];
  avg_sentence_len: number;
  sentence_len_variance: number;
  sensory_ratio: number;
  register: string;
  pacing: string;
  tone: string;
  preferred_constructions: string[];
  forbidden_phrases: string[];
  example_snippets: string[];
  quality_score: number;
  created_at: number;
}

export interface TemplateStyleLink {
  template_id: string;
  style_id: string;
  weight: number;
}

export interface ChunkIndex {
  chunk_id: string;
  source_book: string;
  source_chapter: number;
  text: string;
  token_est: number;
  char_start: number;
  char_end: number;
  embedding_ref: string | null;
  dict_hits: number;
  pre_score: number;
  cluster_id: number | null;
  created_at: number;
}

export interface PlayerStyleProfile {
  player_id: string;
  avg_sentence_len: number;
  sensory_bias: number;
  register_score: number;
  dialogue_ratio: number;
  preferred_motifs: string[];
  anti_patterns: string[];
  sample_snippets: string[];
  confidence: number;
  message_count_used: number;
  last_updated: number;
}

export interface RetrievalCacheEntry {
  cache_key: string;
  template_id: string;
  style_id: string | null;
  hits: number;
  expires_at: number;
}

export class LiteraryCompilerDB {
  readonly db: Database;

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

  createV2Tables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scene_templates (
        id TEXT PRIMARY KEY,
        source_book TEXT NOT NULL,
        source_chapter INTEGER NOT NULL,
        source_chunk_ids TEXT NOT NULL DEFAULT '[]',
        archetype_primary TEXT NOT NULL,
        archetype_secondary TEXT,
        applicable_positions TEXT NOT NULL DEFAULT '[]',
        variables TEXT NOT NULL DEFAULT '[]',
        template_text TEXT NOT NULL,
        beat_sequence TEXT NOT NULL DEFAULT '[]',
        mood TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        moral_ambiguity REAL NOT NULL DEFAULT 0,
        tension_curve TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        domain TEXT NOT NULL DEFAULT 'general',
        scale REAL NOT NULL DEFAULT 1.0,
        embedding_id TEXT,
        quality_score REAL NOT NULL DEFAULT 0.5,
        use_count INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS style_patterns (
        id TEXT PRIMARY KEY,
        source_author_or_era TEXT NOT NULL,
        source_chunk_ids TEXT NOT NULL DEFAULT '[]',
        avg_sentence_len REAL NOT NULL DEFAULT 0,
        sentence_len_variance REAL NOT NULL DEFAULT 0,
        sensory_ratio REAL NOT NULL DEFAULT 0,
        register TEXT NOT NULL DEFAULT 'neutral',
        pacing TEXT NOT NULL DEFAULT 'medium',
        tone TEXT NOT NULL DEFAULT 'neutral',
        preferred_constructions TEXT NOT NULL DEFAULT '[]',
        forbidden_phrases TEXT NOT NULL DEFAULT '[]',
        example_snippets TEXT NOT NULL DEFAULT '[]',
        quality_score REAL NOT NULL DEFAULT 0.5,
        created_at INTEGER DEFAULT (unixepoch())
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS template_style_links (
        template_id TEXT NOT NULL,
        style_id TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        PRIMARY KEY (template_id, style_id)
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunk_index (
        chunk_id TEXT PRIMARY KEY,
        source_book TEXT NOT NULL,
        source_chapter INTEGER NOT NULL,
        text TEXT NOT NULL,
        token_est INTEGER NOT NULL DEFAULT 0,
        char_start INTEGER NOT NULL DEFAULT 0,
        char_end INTEGER NOT NULL DEFAULT 0,
        embedding_ref TEXT,
        dict_hits INTEGER NOT NULL DEFAULT 0,
        pre_score REAL NOT NULL DEFAULT 0,
        cluster_id INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_style_profiles (
        player_id TEXT PRIMARY KEY,
        avg_sentence_len REAL NOT NULL DEFAULT 0,
        sensory_bias REAL NOT NULL DEFAULT 0,
        register_score REAL NOT NULL DEFAULT 0,
        dialogue_ratio REAL NOT NULL DEFAULT 0,
        preferred_motifs TEXT NOT NULL DEFAULT '[]',
        anti_patterns TEXT NOT NULL DEFAULT '[]',
        sample_snippets TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 0,
        message_count_used INTEGER NOT NULL DEFAULT 0,
        last_updated INTEGER DEFAULT (unixepoch())
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS retrieval_cache (
        cache_key TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        style_id TEXT,
        hits INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER NOT NULL
      );
    `);

    // Indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scene_archetype ON scene_templates(archetype_primary);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scene_domain ON scene_templates(domain);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scene_quality ON scene_templates(quality_score);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_style_register ON style_patterns(register);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_style_tone ON style_patterns(tone);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunk_book ON chunk_index(source_book, source_chapter);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunk_cluster ON chunk_index(cluster_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_cache_template ON retrieval_cache(template_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_cache_expires ON retrieval_cache(expires_at);`);
  }

  createV2FTS(): void {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS scene_fts
      USING fts5(
        id,
        archetype_primary,
        mood,
        tags,
        template_text,
        content=scene_templates,
        content_rowid=rowid
      );
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts
      USING fts5(
        chunk_id,
        source_book,
        text,
        content=chunk_index,
        content_rowid=rowid
      );
    `);
  }

  // ── V2 Insert Methods ──────────────────────────────────────────────────────

  insertSceneTemplate(template: SceneTemplate): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO scene_templates
      (id, source_book, source_chapter, source_chunk_ids, archetype_primary, archetype_secondary,
       applicable_positions, variables, template_text, beat_sequence, mood, difficulty,
       moral_ambiguity, tension_curve, tags, domain, scale, embedding_id, quality_score,
       use_count, last_used_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      template.id,
      template.source_book,
      template.source_chapter,
      JSON.stringify(template.source_chunk_ids),
      template.archetype_primary,
      template.archetype_secondary,
      JSON.stringify(template.applicable_positions),
      JSON.stringify(template.variables),
      template.template_text,
      JSON.stringify(template.beat_sequence),
      template.mood,
      template.difficulty,
      template.moral_ambiguity,
      JSON.stringify(template.tension_curve),
      JSON.stringify(template.tags),
      template.domain,
      template.scale,
      template.embedding_id,
      template.quality_score,
      template.use_count,
      template.last_used_at,
      template.created_at,
    );
  }

  insertStylePattern(pattern: StylePattern): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO style_patterns
      (id, source_author_or_era, source_chunk_ids, avg_sentence_len, sentence_len_variance,
       sensory_ratio, register, pacing, tone, preferred_constructions, forbidden_phrases,
       example_snippets, quality_score, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      pattern.id,
      pattern.source_author_or_era,
      JSON.stringify(pattern.source_chunk_ids),
      pattern.avg_sentence_len,
      pattern.sentence_len_variance,
      pattern.sensory_ratio,
      pattern.register,
      pattern.pacing,
      pattern.tone,
      JSON.stringify(pattern.preferred_constructions),
      JSON.stringify(pattern.forbidden_phrases),
      JSON.stringify(pattern.example_snippets),
      pattern.quality_score,
      pattern.created_at,
    );
  }

  insertTemplateStyleLink(link: TemplateStyleLink): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO template_style_links (template_id, style_id, weight)
      VALUES (?, ?, ?)
    `).run(link.template_id, link.style_id, link.weight);
  }

  insertChunkIndex(chunk: ChunkIndex): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunk_index
      (chunk_id, source_book, source_chapter, text, token_est, char_start, char_end,
       embedding_ref, dict_hits, pre_score, cluster_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      chunk.chunk_id,
      chunk.source_book,
      chunk.source_chapter,
      chunk.text,
      chunk.token_est,
      chunk.char_start,
      chunk.char_end,
      chunk.embedding_ref,
      chunk.dict_hits,
      chunk.pre_score,
      chunk.cluster_id,
      chunk.created_at,
    );
  }

  // ── V2 Query Methods ───────────────────────────────────────────────────────

  getSceneTemplatesByArchetype(archetype: string): SceneTemplate[] {
    const rows = this.db.prepare(
      'SELECT * FROM scene_templates WHERE archetype_primary = ? ORDER BY quality_score DESC'
    ).all(archetype) as Record<string, unknown>[];
    return rows.map(row => this.rowToSceneTemplate(row));
  }

  getTopTemplates(keys: string[], limit = 10): SceneTemplate[] {
    if (keys.length === 0) return [];
    const placeholders = keys.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT * FROM scene_templates
      WHERE archetype_primary IN (${placeholders})
         OR domain IN (${placeholders})
         OR tags LIKE ?
      ORDER BY quality_score DESC, use_count DESC
      LIMIT ?
    `).all(...keys, ...keys, `%${keys[0]}%`, limit) as Record<string, unknown>[];
    return rows.map(row => this.rowToSceneTemplate(row));
  }

  // ── V2 Row Mappers ─────────────────────────────────────────────────────────

  private rowToSceneTemplate(row: Record<string, unknown>): SceneTemplate {
    return {
      id: row.id as string,
      source_book: row.source_book as string,
      source_chapter: row.source_chapter as number,
      source_chunk_ids: JSON.parse(row.source_chunk_ids as string),
      archetype_primary: row.archetype_primary as string,
      archetype_secondary: row.archetype_secondary as string | null,
      applicable_positions: JSON.parse(row.applicable_positions as string),
      variables: JSON.parse(row.variables as string),
      template_text: row.template_text as string,
      beat_sequence: JSON.parse(row.beat_sequence as string),
      mood: row.mood as string,
      difficulty: row.difficulty as string,
      moral_ambiguity: row.moral_ambiguity as number,
      tension_curve: JSON.parse(row.tension_curve as string),
      tags: JSON.parse(row.tags as string),
      domain: row.domain as string,
      scale: row.scale as number,
      embedding_id: row.embedding_id as string | null,
      quality_score: row.quality_score as number,
      use_count: row.use_count as number,
      last_used_at: row.last_used_at as number | null,
      created_at: row.created_at as number,
    };
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

  getStyleForTemplate(templateId: string): Record<string, unknown> | null {
    const link = this.db.prepare(
      'SELECT style_id FROM template_style_links WHERE template_id = ? LIMIT 1'
    ).get(templateId) as { style_id: string } | undefined;

    if (!link) return null;

    return this.db.prepare(
      'SELECT * FROM style_patterns WHERE id = ?'
    ).get(link.style_id) as Record<string, unknown> | undefined ?? null;
  }

  close(): void {
    this.db.close();
  }
}
