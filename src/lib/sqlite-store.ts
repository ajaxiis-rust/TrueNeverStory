import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { vectorToBlob, blobToVector, cosineSimilarity, reciprocalRankFusion, type RankedItem } from './vector-ops';
import { batchCosineFlat, flattenBuffers } from './mojo-ffi';
import { seedUITranslations } from './ui-translation-seeder';

export interface EntityData {
  uid: string;
  name: string;
  entityType?: string;
  summary?: string;
  tags?: string;
  description?: string;
  profile?: string;
}

export interface EmbeddingResult {
  entityUid: string | null;
  score: number;
  source: string;
}

export interface MemoryOpts {
  role?: string;
  sessionId?: string;
  importance?: number;
  tags?: string;
}

export interface MemoryResult {
  id: number;
  content: string;
  score: number;
  role?: string;
  sessionId?: string;
}

export interface SearchResult {
  id: string;
  name?: string;
  score: number;
  source: 'fts' | 'vector' | 'hybrid';
}

export interface AgentPromptConfig {
  systemPrompt: string;
  userTemplate: string;
  outputFormat: string;
}

export class SQLiteStore {
  readonly db: Database;

  constructor(dbPath: string) {
    mkdirSync(dbPath, { recursive: true });
    this.db = new Database(join(dbPath, 'tns.db'));
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA synchronous = NORMAL');
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        uid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        entity_type TEXT,
        summary TEXT,
        tags TEXT,
        description TEXT,
        profile TEXT,
        _search TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
        name, summary, tags, description,
        content=entities,
        content_rowid=rowid
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_uid TEXT,
        vector BLOB NOT NULL,
        dim INTEGER NOT NULL,
        source TEXT DEFAULT 'entity',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        role TEXT,
        session_id TEXT,
        importance REAL DEFAULT 0.5,
        vector BLOB,
        dim INTEGER,
        tags TEXT,
        _search TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content, tags,
        content=memories,
        content_rowid=id
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        world TEXT NOT NULL DEFAULT 'default',
        agent_id TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        system_prompt TEXT NOT NULL DEFAULT '',
        user_template TEXT NOT NULL DEFAULT '',
        output_format TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(world, agent_id, language)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ui_translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language TEXT NOT NULL,
        page TEXT NOT NULL DEFAULT 'global',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(language, page, key)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_prompts_lookup
        ON agent_prompts(world, agent_id, language);
      CREATE INDEX IF NOT EXISTS idx_ui_translations_lookup
        ON ui_translations(language, page);
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
        INSERT INTO entities_fts(rowid, name, summary, tags, description)
        VALUES (new.rowid, new.name, new.summary, new.tags, new.description);
      END;

      CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
        INSERT INTO entities_fts(entities_fts, rowid, name, summary, tags, description)
        VALUES ('delete', old.rowid, old.name, old.summary, old.tags, old.description);
      END;

      CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
        INSERT INTO entities_fts(entities_fts, rowid, name, summary, tags, description)
        VALUES ('delete', old.rowid, old.name, old.summary, old.tags, old.description);
        INSERT INTO entities_fts(rowid, name, summary, tags, description)
        VALUES (new.rowid, new.name, new.summary, new.tags, new.description);
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, tags)
        VALUES (new.id, new.content, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags)
        VALUES ('delete', old.id, old.content, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags)
        VALUES ('delete', old.id, old.content, old.tags);
        INSERT INTO memories_fts(rowid, content, tags)
        VALUES (new.id, new.content, new.tags);
      END;
    `);

    seedUITranslations(this.db);
  }


  private sanitizeFtsQuery(query: string): string {
    return query.replace(/[^\w\s\u0400-\u04FF]/g, ' ').trim();
  }

  private buildSearchText(...fields: (string | null | undefined)[]): string {
    return fields.filter(Boolean).join(' ').toLowerCase();
  }

  upsertEntity(entity: EntityData): void {
    const searchText = this.buildSearchText(entity.name, entity.summary, entity.tags, entity.description);
    this.db.run(`
      INSERT INTO entities (uid, name, entity_type, summary, tags, description, profile, _search, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(uid) DO UPDATE SET
        name = excluded.name,
        entity_type = excluded.entity_type,
        summary = excluded.summary,
        tags = excluded.tags,
        description = excluded.description,
        profile = excluded.profile,
        _search = excluded._search,
        updated_at = datetime('now')
    `, [
      entity.uid,
      entity.name,
      entity.entityType ?? null,
      entity.summary ?? null,
      entity.tags ?? null,
      entity.description ?? null,
      entity.profile ?? null,
      searchText
    ]);
  }

  getEntity(uid: string): EntityData | undefined {
    const row = this.db.query('SELECT * FROM entities WHERE uid = ?').get(uid) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      uid: row.uid as string,
      name: row.name as string,
      entityType: row.entity_type as string | undefined,
      summary: row.summary as string | undefined,
      tags: row.tags as string | undefined,
      description: row.description as string | undefined,
      profile: row.profile as string | undefined,
    };
  }

  searchEntitiesFTS(query: string, limit = 10): EntityData[] {
    const safeQuery = this.sanitizeFtsQuery(query);
    if (!safeQuery) return [];
    const tokens = safeQuery.split(/\s+/).filter(Boolean);
    const ftsQuery = tokens.join(" OR ");

    let rows = this.db.query(`
      SELECT e.uid, e.name, e.entity_type, e.summary, e.tags, e.description, e.profile
      FROM entities_fts fts
      JOIN entities e ON e.rowid = fts.rowid
      WHERE entities_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as Record<string, unknown>[];

    if (rows.length === 0) {
      const pattern = `%${safeQuery.toLowerCase()}%`;
      rows = this.db.query(`
        SELECT * FROM entities
        WHERE _search LIKE ?
        LIMIT ?
      `).all(pattern, limit) as Record<string, unknown>[];
    }

    return rows.map(row => ({
      uid: row.uid as string,
      name: row.name as string,
      entityType: row.entity_type as string | undefined,
      summary: row.summary as string | undefined,
      tags: row.tags as string | undefined,
      description: row.description as string | undefined,
      profile: row.profile as string | undefined,
    }));
  }

  storeEmbedding(entityUid: string, vector: Float32Array, source = 'entity'): void {
    this.db.run(`
      INSERT INTO embeddings (entity_uid, vector, dim, source)
      VALUES (?, ?, ?, ?)
    `, [entityUid, vectorToBlob(vector), vector.length, source]);
  }

  searchDense(queryVector: Float32Array, topK = 10): EmbeddingResult[] {
    const dim = queryVector.length;
    const rows = this.db.query('SELECT entity_uid, vector, dim, source FROM embeddings WHERE dim = ?').all(dim) as {
      entity_uid: string | null;
      vector: Buffer;
      dim: number;
      source: string;
    }[];

    if (rows.length === 0) {
      return [];
    }

    const flatDb = flattenBuffers(rows.map(r => r.vector), dim);
    const scores = batchCosineFlat(queryVector, flatDb, rows.length, dim);

    const results: EmbeddingResult[] = rows.map((row, i) => ({
      entityUid: row.entity_uid,
      score: scores[i]!,
      source: row.source,
    }));

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  addMemory(content: string, vector: Float32Array, opts: MemoryOpts = {}): number {
    const searchText = this.buildSearchText(content, opts.tags, opts.role);
    const result = this.db.run(`
      INSERT INTO memories (content, role, session_id, importance, vector, dim, tags, _search)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      content,
      opts.role ?? null,
      opts.sessionId ?? null,
      opts.importance ?? 0.5,
      vectorToBlob(vector),
      vector.length,
      opts.tags ?? null,
      searchText
    ]);
    return Number(result.lastInsertRowid);
  }

  searchMemoriesFTS(query: string, limit = 10): MemoryResult[] {
    const safeQuery = this.sanitizeFtsQuery(query);
    if (!safeQuery) return [];
    const tokens = safeQuery.split(/\s+/).filter(Boolean);
    const ftsQuery = tokens.join(" OR ");

    let rows = this.db.query(`
      SELECT m.id, m.content, m.role, m.session_id
      FROM memories_fts fts
      JOIN memories m ON m.id = fts.rowid
      WHERE memories_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as Record<string, unknown>[];

    if (rows.length === 0) {
      const pattern = `%${safeQuery.toLowerCase()}%`;
      rows = this.db.query(`
        SELECT id, content, role, session_id FROM memories
        WHERE _search LIKE ?
        LIMIT ?
      `).all(pattern, limit) as Record<string, unknown>[];
    }

    return rows.map(row => ({
      id: row.id as number,
      content: row.content as string,
      score: 1.0,
      role: row.role as string | undefined,
      sessionId: row.session_id as string | undefined,
    }));
  }

  searchMemoriesDense(queryVector: Float32Array, topK = 10): MemoryResult[] {
    const dim = queryVector.length;
    const rows = this.db.query('SELECT id, content, role, session_id, vector, dim FROM memories WHERE vector IS NOT NULL AND dim = ?').all(dim) as {
      id: number;
      content: string;
      role: string | null;
      session_id: string | null;
      vector: Buffer;
      dim: number;
    }[];

    if (rows.length === 0) {
      return [];
    }

    const flatDb = flattenBuffers(rows.map(r => r.vector), dim);
    const scores = batchCosineFlat(queryVector, flatDb, rows.length, dim);

    const results: MemoryResult[] = rows.map((row, i) => ({
      id: row.id,
      content: row.content,
      score: scores[i]!,
      role: row.role ?? undefined,
      sessionId: row.session_id ?? undefined,
    }));

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  hybridSearch(
    query: string,
    queryVector: Float32Array,
    topK = 10
  ): SearchResult[] {
    const ftsResults: RankedItem[] = this.searchEntitiesFTS(query, topK * 2).map((e, i) => ({
      id: e.uid,
      name: e.name,
      score: 1 / (i + 1),
      source: 'fts' as const,
    }));

    const vecResults: RankedItem[] = this.searchDense(queryVector, topK * 2).map((r, i) => ({
      id: r.entityUid ?? `emb-${i}`,
      score: r.score,
      source: 'vector' as const,
    }));

    const fused = reciprocalRankFusion([ftsResults, vecResults]);

    return fused.slice(0, topK).map(r => ({
      id: r.id,
      name: r.name as string | undefined,
      score: r.score,
      source: 'hybrid' as const,
    }));
  }

  entityCount(): number {
    const row = this.db.query('SELECT COUNT(*) as count FROM entities').get() as { count: number };
    return row.count;
  }

  embeddingCount(): number {
    const row = this.db.query('SELECT COUNT(*) as count FROM embeddings').get() as { count: number };
    return row.count;
  }

  memoryCount(): number {
    const row = this.db.query('SELECT COUNT(*) as count FROM memories').get() as { count: number };
    return row.count;
  }

  deleteEmbedding(entityUid: string): void {
    this.db.run('DELETE FROM embeddings WHERE entity_uid = ?', [entityUid]);
  }

  deleteEntityByUid(uid: string): void {
    this.db.run('DELETE FROM entities WHERE uid = ?', [uid]);
  }

  embeddingFragmentationRatio(): number {
    const total = this.embeddingCount();
    if (total === 0) return 0;
    const orphaned = this.db.query(
      `SELECT COUNT(*) as count FROM embeddings e
       LEFT JOIN entities ent ON e.entity_uid = ent.uid
       WHERE ent.uid IS NULL`
    ).get() as { count: number };
    return orphaned.count / total;
  }

  getOrphanedEmbeddingUids(): string[] {
    const rows = this.db.query(
      `SELECT e.entity_uid FROM embeddings e
       LEFT JOIN entities ent ON e.entity_uid = ent.uid
       WHERE ent.uid IS NULL`
    ).all() as { entity_uid: string }[];
    return rows.map(r => r.entity_uid);
  }

  vacuum(): void {
    this.db.run('VACUUM');
  }

  // ── Agent Prompts ──

  getAgentPrompts(world: string, agentId: string, language: string): AgentPromptConfig | undefined {
    const row = this.db.query(
      'SELECT system_prompt, user_template, output_format FROM agent_prompts WHERE world = ? AND agent_id = ? AND language = ?'
    ).get(world, agentId, language) as Record<string, string> | undefined;
    if (!row) return undefined;
    return {
      systemPrompt: row.system_prompt ?? '',
      userTemplate: row.user_template ?? '',
      outputFormat: row.output_format ?? '',
    };
  }

  upsertAgentPrompts(world: string, agentId: string, language: string, prompts: AgentPromptConfig): void {
    this.db.run(`
      INSERT INTO agent_prompts (world, agent_id, language, system_prompt, user_template, output_format, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(world, agent_id, language) DO UPDATE SET
        system_prompt = excluded.system_prompt,
        user_template = excluded.user_template,
        output_format = excluded.output_format,
        updated_at = datetime('now')
    `, [world, agentId, language, prompts.systemPrompt, prompts.userTemplate, prompts.outputFormat]);
  }

  // ── UI Translations ──

  getTranslations(language: string, page?: string): Record<string, string> {
    if (page) {
      const rows = this.db.query(
        'SELECT key, value FROM ui_translations WHERE language = ? AND page = ?'
      ).all(language, page) as { key: string; value: string }[];
      return Object.fromEntries(rows.map(r => [r.key, r.value]));
    }
    const rows = this.db.query(
      'SELECT key, value FROM ui_translations WHERE language = ?'
    ).all(language) as { key: string; value: string }[];
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  upsertTranslations(language: string, page: string, entries: Record<string, string>): void {
    const stmt = this.db.query(`
      INSERT INTO ui_translations (language, page, key, value, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(language, page, key) DO UPDATE SET
        value = excluded.value, updated_at = datetime('now')
    `);
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(entries)) {
        stmt.run(language, page, key, value);
      }
    })();
  }

  deleteTranslation(language: string, page: string, key: string): void {
    this.db.run(
      'DELETE FROM ui_translations WHERE language = ? AND page = ? AND key = ?',
      [language, page, key]
    );
  }

  close(): void {
    this.db.close();
  }
}
