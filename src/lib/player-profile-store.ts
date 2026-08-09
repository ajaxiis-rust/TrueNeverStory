import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
  narrative_distance: number;
  action_orientation: number;
  emotional_expressiveness: number;
  preferred_pace: string;
  literary_sophistication: number;
  message_count_used: number;
  last_updated: number;
}

export function createDefaultProfile(playerId: string): PlayerStyleProfile {
  const now = Math.floor(Date.now() / 1000);
  return {
    player_id: playerId,
    avg_sentence_len: 15.0,
    sensory_bias: 0.5,
    register_score: 0.5,
    dialogue_ratio: 0.3,
    preferred_motifs: [],
    anti_patterns: [],
    sample_snippets: [],
    confidence: 0.0,
    narrative_distance: 0.5,
    action_orientation: 0.5,
    emotional_expressiveness: 0.5,
    preferred_pace: 'medium',
    literary_sophistication: 0.5,
    message_count_used: 0,
    last_updated: now,
  };
}

export class PlayerProfileStore {
  private db: Database;

  constructor(dbPath = 'data/player-profiles.db') {
    const dir = dirname(dbPath);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA synchronous=NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_style_profiles (
        player_id           TEXT PRIMARY KEY,
        avg_sentence_len    REAL NOT NULL DEFAULT 15.0,
        sensory_bias        REAL NOT NULL DEFAULT 0.5,
        register_score      REAL NOT NULL DEFAULT 0.5,
        dialogue_ratio      REAL NOT NULL DEFAULT 0.3,
        preferred_motifs    TEXT NOT NULL DEFAULT '[]',
        anti_patterns       TEXT NOT NULL DEFAULT '[]',
        sample_snippets     TEXT NOT NULL DEFAULT '[]',
        confidence          REAL NOT NULL DEFAULT 0.0,
        narrative_distance    REAL NOT NULL DEFAULT 0.5,
        action_orientation    REAL NOT NULL DEFAULT 0.5,
        emotional_expressiveness REAL NOT NULL DEFAULT 0.5,
        preferred_pace        TEXT NOT NULL DEFAULT 'medium',
        literary_sophistication REAL NOT NULL DEFAULT 0.5,
        message_count_used  INTEGER NOT NULL DEFAULT 0,
        last_updated        INTEGER NOT NULL
      )
    `);
  }

  getProfile(playerId: string): PlayerStyleProfile | null {
    const row = this.db
      .prepare('SELECT * FROM player_style_profiles WHERE player_id = ?')
      .get(playerId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      player_id: row.player_id as string,
      avg_sentence_len: row.avg_sentence_len as number,
      sensory_bias: row.sensory_bias as number,
      register_score: row.register_score as number,
      dialogue_ratio: row.dialogue_ratio as number,
      preferred_motifs: JSON.parse(row.preferred_motifs as string),
      anti_patterns: JSON.parse(row.anti_patterns as string),
      sample_snippets: JSON.parse(row.sample_snippets as string),
      confidence: row.confidence as number,
      narrative_distance: row.narrative_distance as number,
      action_orientation: row.action_orientation as number,
      emotional_expressiveness: row.emotional_expressiveness as number,
      preferred_pace: row.preferred_pace as string,
      literary_sophistication: row.literary_sophistication as number,
      message_count_used: row.message_count_used as number,
      last_updated: row.last_updated as number,
    };
  }

  upsertProfile(profile: PlayerStyleProfile): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO player_style_profiles
      (player_id, avg_sentence_len, sensory_bias, register_score, dialogue_ratio,
       preferred_motifs, anti_patterns, sample_snippets, confidence,
       narrative_distance, action_orientation, emotional_expressiveness,
       preferred_pace, literary_sophistication, message_count_used, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.player_id,
      profile.avg_sentence_len,
      profile.sensory_bias,
      profile.register_score,
      profile.dialogue_ratio,
      JSON.stringify(profile.preferred_motifs),
      JSON.stringify(profile.anti_patterns),
      JSON.stringify(profile.sample_snippets),
      profile.confidence,
      profile.narrative_distance,
      profile.action_orientation,
      profile.emotional_expressiveness,
      profile.preferred_pace,
      profile.literary_sophistication,
      profile.message_count_used,
      profile.last_updated,
    );
  }

  close(): void {
    this.db.close();
  }
}
