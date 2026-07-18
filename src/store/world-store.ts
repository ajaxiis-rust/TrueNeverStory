/**
 * WorldStore — unified SQLite storage for world data.
 * Migrates JSON files to SQLite with transaction support.
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { existsSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { getLogger } from "../utils/logger";

const log = getLogger("world-store");

export interface QuestData {
  id: string;
  title: string;
  description: string;
  giver: string;
  objectives: string[];
  status: string;
  created_at: string;
}

interface QuestRow {
  id: string;
  title: string;
  description: string;
  giver: string;
  objectives: string | null;
  status: string;
  created_at: string;
}

interface NPCMemoryRow {
  id: string;
  timestamp: string;
  description: string;
  importance: number;
  emotion: string;
  involved_entities: string | null;
  location: string;
  consolidated: number;
}

interface WorldFrameRow {
  key: string;
  value: string;
}

interface CountRow {
  count: number;
}

export interface NPCMemoryData {
  id: string;
  timestamp: string;
  description: string;
  importance: number;
  emotion: string;
  involved_entities: string[];
  location: string;
  consolidated: boolean;
}

export interface NPCProfileData {
  uid: string;
  short_term: NPCMemoryData[];
  long_term_episodic: NPCMemoryData[];
}

export interface StoryPlannerData {
  arcs: unknown[];
  hooks: unknown[];
  active_quests: string[];
}

export interface WorldFrameData {
  name: string;
  description: string;
  language: string;
  rules: string[];
  [key: string]: unknown;
}

export class WorldStore {
  private db: Database;
  private worldPath: string;
  private worldName: string;

  constructor(worldPath: string) {
    this.worldPath = worldPath;
    this.worldName = worldPath.split("/").pop() ?? "unknown";

    if (!existsSync(worldPath)) {
      mkdirSync(worldPath, { recursive: true });
    }

    this.db = new Database(join(worldPath, "tns.db"));
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA synchronous = NORMAL");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS quests (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        giver TEXT,
        objectives TEXT DEFAULT '[]',
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS npc_memories (
        id TEXT PRIMARY KEY,
        npc_uid TEXT NOT NULL,
        memory_type TEXT NOT NULL DEFAULT 'short_term',
        timestamp TEXT NOT NULL,
        description TEXT NOT NULL,
        importance REAL DEFAULT 0.5,
        emotion TEXT,
        involved_entities TEXT DEFAULT '[]',
        location TEXT,
        consolidated INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_npc_memories_uid ON npc_memories(npc_uid, memory_type)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS story_arcs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        arc_data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS world_frame (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS director_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS villains (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  async migrate(): Promise<{ migrated: string[]; errors: string[] }> {
    const migrated: string[] = [];
    const errors: string[] = [];

    try {
      await this._migrateQuests();
      migrated.push("quests");
    } catch (err) {
      errors.push(`quests: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      await this._migrateNPCProfiles();
      migrated.push("npc_profiles");
    } catch (err) {
      errors.push(`npc_profiles: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      await this._migrateWorldFrame();
      migrated.push("world_frame");
    } catch (err) {
      errors.push(`world_frame: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      await this._migrateStoryPlanner();
      migrated.push("story_planner");
    } catch (err) {
      errors.push(`story_planner: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      await this._migrateDirectorState();
      migrated.push("director_state");
    } catch (err) {
      errors.push(`director_state: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      await this._migrateVillains();
      migrated.push("villains");
    } catch (err) {
      errors.push(`villains: ${err instanceof Error ? err.message : String(err)}`);
    }

    log.info({ migrated, errors }, "Migration complete");
    return { migrated, errors };
  }

  private _readJson<T>(filename: string): T | null {
    const path = join(this.worldPath, filename);
    if (!existsSync(path)) return null;
    try {
      const data = readFileSync(path, "utf-8");
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  private async _migrateQuests(): Promise<void> {
    const data = this._readJson<Record<string, QuestData>>("quests.json");
    if (!data) return;

    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO quests (id, title, description, giver, objectives, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = this.db.transaction(() => {
      for (const quest of Object.values(data)) {
        insert.run(
          quest.id,
          quest.title,
          quest.description,
          quest.giver,
          JSON.stringify(quest.objectives),
          quest.status,
          quest.created_at
        );
      }
    });

    tx();
    log.info({ count: Object.keys(data).length }, "Migrated quests");
  }

  private async _migrateNPCProfiles(): Promise<void> {
    const data = this._readJson<Record<string, NPCProfileData>>("npc_profiles.json");
    if (!data) return;

    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO npc_memories (id, npc_uid, memory_type, timestamp, description, importance, emotion, involved_entities, location, consolidated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = this.db.transaction(() => {
      for (const [name, profile] of Object.entries(data)) {
        const npcUid = profile.uid ?? `Character:${name}`;

        for (const mem of profile.short_term ?? []) {
          insert.run(
            mem.id,
            npcUid,
            "short_term",
            mem.timestamp,
            mem.description,
            mem.importance,
            mem.emotion,
            JSON.stringify(mem.involved_entities),
            mem.location,
            mem.consolidated ? 1 : 0
          );
        }

        for (const mem of profile.long_term_episodic ?? []) {
          insert.run(
            mem.id,
            npcUid,
            "long_term_episodic",
            mem.timestamp,
            mem.description,
            mem.importance,
            mem.emotion,
            JSON.stringify(mem.involved_entities),
            mem.location,
            mem.consolidated ? 1 : 0
          );
        }
      }
    });

    tx();
    log.info({ npcCount: Object.keys(data).length }, "Migrated NPC profiles");
  }

  private async _migrateWorldFrame(): Promise<void> {
    const data = this._readJson<WorldFrameData>("world_frame.json");
    if (!data) return;

    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO world_frame (key, value, updated_at) VALUES (?, ?, datetime('now'))`
    );

    const tx = this.db.transaction(() => {
      for (const [key, value] of Object.entries(data)) {
        insert.run(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    });

    tx();
    log.info("Migrated world frame");
  }

  private async _migrateStoryPlanner(): Promise<void> {
    const data = this._readJson<StoryPlannerData>("story_planner.json");
    if (!data) return;

    const insert = this.db.prepare(
      `INSERT INTO story_arcs (arc_data) VALUES (?)`
    );

    const tx = this.db.transaction(() => {
      insert.run(JSON.stringify(data));
    });

    tx();
    log.info("Migrated story planner");
  }

  private async _migrateDirectorState(): Promise<void> {
    const data = this._readJson<Record<string, unknown>>("director_state.json");
    if (!data) return;

    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO director_state (key, value, updated_at) VALUES (?, ?, datetime('now'))`
    );

    const tx = this.db.transaction(() => {
      for (const [key, value] of Object.entries(data)) {
        insert.run(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    });

    tx();
    log.info("Migrated director state");
  }

  private async _migrateVillains(): Promise<void> {
    const data = this._readJson<Record<string, unknown>>("villains.json");
    if (!data) return;

    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO villains (id, data, updated_at) VALUES (?, ?, datetime('now'))`
    );

    const tx = this.db.transaction(() => {
      for (const [id, villain] of Object.entries(data)) {
        insert.run(id, JSON.stringify(villain));
      }
    });

    tx();
    log.info("Migrated villains");
  }

  // ── Quest CRUD ──

  getQuests(): QuestData[] {
    const rows = this.db.query("SELECT * FROM quests ORDER BY created_at DESC").all() as QuestRow[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      giver: r.giver,
      objectives: JSON.parse(r.objectives ?? "[]"),
      status: r.status,
      created_at: r.created_at,
    }));
  }

  getQuest(id: string): QuestData | null {
    const row = this.db.query("SELECT * FROM quests WHERE id = ?").get(id) as QuestRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      giver: row.giver,
      objectives: JSON.parse(row.objectives ?? "[]"),
      status: row.status,
      created_at: row.created_at,
    };
  }

  upsertQuest(quest: QuestData): void {
    this.db.run(
      `INSERT OR REPLACE INTO quests (id, title, description, giver, objectives, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [quest.id, quest.title, quest.description, quest.giver, JSON.stringify(quest.objectives), quest.status, quest.created_at]
    );
  }

  deleteQuest(id: string): boolean {
    const result = this.db.run("DELETE FROM quests WHERE id = ?", [id]);
    return result.changes > 0;
  }

  // ── NPC Memory CRUD ──

  getNPCMemories(npcUid: string, type?: string): NPCMemoryData[] {
    const query = type
      ? "SELECT * FROM npc_memories WHERE npc_uid = ? AND memory_type = ? ORDER BY timestamp DESC"
      : "SELECT * FROM npc_memories WHERE npc_uid = ? ORDER BY timestamp DESC";
    const params = type ? [npcUid, type] : [npcUid];
    const rows = this.db.query(query).all(...params) as NPCMemoryRow[];
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      description: r.description,
      importance: r.importance,
      emotion: r.emotion,
      involved_entities: JSON.parse(r.involved_entities ?? "[]"),
      location: r.location,
      consolidated: r.consolidated === 1,
    }));
  }

  addNPCMemory(npcUid: string, memory: NPCMemoryData, type = "short_term"): void {
    this.db.run(
      `INSERT OR REPLACE INTO npc_memories (id, npc_uid, memory_type, timestamp, description, importance, emotion, involved_entities, location, consolidated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [memory.id, npcUid, type, memory.timestamp, memory.description, memory.importance, memory.emotion, JSON.stringify(memory.involved_entities), memory.location, memory.consolidated ? 1 : 0]
    );
  }

  // ── World Frame CRUD ──

  getWorldFrame(): Record<string, string> {
    const rows = this.db.query("SELECT key, value FROM world_frame").all() as WorldFrameRow[];
    const frame: Record<string, string> = {};
    for (const row of rows) {
      frame[row.key] = row.value;
    }
    return frame;
  }

  setWorldFrame(key: string, value: string): void {
    this.db.run(
      `INSERT OR REPLACE INTO world_frame (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [key, value]
    );
  }

  // ── Stats ──

  getStats(): Record<string, number> {
    const quests = (this.db.query("SELECT COUNT(*) as count FROM quests").get() as CountRow).count;
    const memories = (this.db.query("SELECT COUNT(*) as count FROM npc_memories").get() as CountRow).count;
    const worldFrame = (this.db.query("SELECT COUNT(*) as count FROM world_frame").get() as CountRow).count;
    return { quests, memories, worldFrame };
  }

  close(): void {
    this.db.close();
  }
}
