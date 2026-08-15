import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { JungianProfile, AxisProfile } from '../services/jungian-profiler';
import type { RawAggregates, AxisSignals } from '../services/metrics-collector';

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

    const jungianCols: [string, string][] = [
      ['jungian_extraversion_pref', 'REAL NOT NULL DEFAULT 0.5'],
      ['jungian_extraversion_range', 'REAL NOT NULL DEFAULT 0.1'],
      ['jungian_intuition_pref', 'REAL NOT NULL DEFAULT 0.5'],
      ['jungian_intuition_range', 'REAL NOT NULL DEFAULT 0.1'],
      ['jungian_thinking_pref', 'REAL NOT NULL DEFAULT 0.5'],
      ['jungian_thinking_range', 'REAL NOT NULL DEFAULT 0.1'],
      ['jungian_judging_pref', 'REAL NOT NULL DEFAULT 0.5'],
      ['jungian_judging_range', 'REAL NOT NULL DEFAULT 0.1'],
      ['jungian_confidence', 'REAL NOT NULL DEFAULT 0'],
      ['jungian_conf_extraversion', 'REAL NOT NULL DEFAULT 0'],
      ['jungian_conf_intuition', 'REAL NOT NULL DEFAULT 0'],
      ['jungian_conf_thinking', 'REAL NOT NULL DEFAULT 0'],
      ['jungian_conf_judging', 'REAL NOT NULL DEFAULT 0'],
      ['jungian_source', "TEXT NOT NULL DEFAULT 'default'"],
      ['detected_themes', "TEXT NOT NULL DEFAULT '[]'"],
    ];
    for (const [col, def] of jungianCols) this.addColumnIfMissing('player_style_profiles', col, def);

    this.addColumnIfMissing('player_style_profiles', 'closest_author', 'TEXT');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_behavioral_metrics (
        player_id TEXT PRIMARY KEY,
        total_turns INTEGER NOT NULL DEFAULT 0,
        dialogue_initiated REAL NOT NULL DEFAULT 0, dialogue_count REAL NOT NULL DEFAULT 0,
        dialogue_total_words REAL NOT NULL DEFAULT 0, avoided_dialogues REAL NOT NULL DEFAULT 0,
        exploration_actions REAL NOT NULL DEFAULT 0, risk_taking_actions REAL NOT NULL DEFAULT 0,
        planning_actions REAL NOT NULL DEFAULT 0, combat_initiated REAL NOT NULL DEFAULT 0,
        input_total_chars REAL NOT NULL DEFAULT 0, expressive_actions REAL NOT NULL DEFAULT 0,
        signal_extraversion REAL NOT NULL DEFAULT 0.5, signal_intuition REAL NOT NULL DEFAULT 0.5,
        signal_thinking REAL NOT NULL DEFAULT 0.5, signal_judging REAL NOT NULL DEFAULT 0.5,
        last_updated INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS npc_perception (
        npc_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        perceived_extraversion_pref REAL NOT NULL DEFAULT 0.5,
        perceived_intuition_pref REAL NOT NULL DEFAULT 0.5,
        perceived_thinking_pref REAL NOT NULL DEFAULT 0.5,
        perceived_judging_pref REAL NOT NULL DEFAULT 0.5,
        interaction_count INTEGER NOT NULL DEFAULT 0,
        interaction_history TEXT NOT NULL DEFAULT '[]',
        last_updated INTEGER NOT NULL,
        PRIMARY KEY (npc_id, player_id)
      )
    `);
  }

  private addColumnIfMissing(table: string, col: string, def: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some(c => c.name === col)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
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
      INSERT INTO player_style_profiles
      (player_id, avg_sentence_len, sensory_bias, register_score, dialogue_ratio,
       preferred_motifs, anti_patterns, sample_snippets, confidence,
       narrative_distance, action_orientation, emotional_expressiveness,
       preferred_pace, literary_sophistication, message_count_used, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        avg_sentence_len = excluded.avg_sentence_len,
        sensory_bias = excluded.sensory_bias,
        register_score = excluded.register_score,
        dialogue_ratio = excluded.dialogue_ratio,
        preferred_motifs = excluded.preferred_motifs,
        anti_patterns = excluded.anti_patterns,
        sample_snippets = excluded.sample_snippets,
        confidence = excluded.confidence,
        narrative_distance = excluded.narrative_distance,
        action_orientation = excluded.action_orientation,
        emotional_expressiveness = excluded.emotional_expressiveness,
        preferred_pace = excluded.preferred_pace,
        literary_sophistication = excluded.literary_sophistication,
        message_count_used = excluded.message_count_used,
        last_updated = excluded.last_updated
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

  upsertJungianProfile(playerId: string, p: JungianProfile): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO player_style_profiles (player_id, jungian_extraversion_pref, jungian_extraversion_range,
        jungian_intuition_pref, jungian_intuition_range, jungian_thinking_pref, jungian_thinking_range,
        jungian_judging_pref, jungian_judging_range, jungian_confidence,
        jungian_conf_extraversion, jungian_conf_intuition, jungian_conf_thinking, jungian_conf_judging,
        jungian_source, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        jungian_extraversion_pref=excluded.jungian_extraversion_pref,
        jungian_extraversion_range=excluded.jungian_extraversion_range,
        jungian_intuition_pref=excluded.jungian_intuition_pref,
        jungian_intuition_range=excluded.jungian_intuition_range,
        jungian_thinking_pref=excluded.jungian_thinking_pref,
        jungian_thinking_range=excluded.jungian_thinking_range,
        jungian_judging_pref=excluded.jungian_judging_pref,
        jungian_judging_range=excluded.jungian_judging_range,
        jungian_confidence=excluded.jungian_confidence,
        jungian_conf_extraversion=excluded.jungian_conf_extraversion,
        jungian_conf_intuition=excluded.jungian_conf_intuition,
        jungian_conf_thinking=excluded.jungian_conf_thinking,
        jungian_conf_judging=excluded.jungian_conf_judging,
        jungian_source=excluded.jungian_source, last_updated=excluded.last_updated
    `).run(playerId, p.extraversion.preference, p.extraversion.range, p.intuition.preference, p.intuition.range,
      p.thinking.preference, p.thinking.range, p.judging.preference, p.judging.range, p.confidence,
      p.axisConfidence.extraversion, p.axisConfidence.intuition, p.axisConfidence.thinking, p.axisConfidence.judging,
      p.source, now);
  }

  getJungianProfile(playerId: string): JungianProfile | null {
    const row = this.db.prepare(`SELECT * FROM player_style_profiles WHERE player_id = ?`).get(playerId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const ax = (pref: unknown, rng: unknown): AxisProfile => ({ preference: pref as number, range: rng as number });
    return {
      extraversion: ax(row.jungian_extraversion_pref, row.jungian_extraversion_range),
      intuition: ax(row.jungian_intuition_pref, row.jungian_intuition_range),
      thinking: ax(row.jungian_thinking_pref, row.jungian_thinking_range),
      judging: ax(row.jungian_judging_pref, row.jungian_judging_range),
      confidence: row.jungian_confidence as number,
      axisConfidence: { extraversion: row.jungian_conf_extraversion as number, intuition: row.jungian_conf_intuition as number,
        thinking: row.jungian_conf_thinking as number, judging: row.jungian_conf_judging as number },
      source: row.jungian_source as JungianProfile['source'],
    };
  }

  upsertClosestAuthor(playerId: string, name: string | null): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO player_style_profiles (player_id, closest_author, last_updated)
      VALUES (?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET closest_author = excluded.closest_author
    `).run(playerId, name, now);
  }

  getClosestAuthor(playerId: string): string | null {
    const row = this.db.prepare(`SELECT closest_author FROM player_style_profiles WHERE player_id = ?`)
      .get(playerId) as { closest_author: string | null } | undefined;
    return row?.closest_author ?? null;
  }

  upsertBehavioralMetrics(playerId: string, agg: RawAggregates, totalTurns: number, signals: AxisSignals): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`INSERT INTO player_behavioral_metrics (player_id, total_turns, dialogue_initiated, dialogue_count,
      dialogue_total_words, avoided_dialogues, exploration_actions, risk_taking_actions, planning_actions,
      combat_initiated, input_total_chars, expressive_actions, signal_extraversion, signal_intuition,
      signal_thinking, signal_judging, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET total_turns=excluded.total_turns, dialogue_initiated=excluded.dialogue_initiated,
      dialogue_count=excluded.dialogue_count, dialogue_total_words=excluded.dialogue_total_words,
      avoided_dialogues=excluded.avoided_dialogues, exploration_actions=excluded.exploration_actions,
      risk_taking_actions=excluded.risk_taking_actions, planning_actions=excluded.planning_actions,
      combat_initiated=excluded.combat_initiated, input_total_chars=excluded.input_total_chars,
      expressive_actions=excluded.expressive_actions, signal_extraversion=excluded.signal_extraversion,
      signal_intuition=excluded.signal_intuition, signal_thinking=excluded.signal_thinking,
      signal_judging=excluded.signal_judging, last_updated=excluded.last_updated
    `).run(playerId, totalTurns, agg.dialogueInitiated, agg.dialogueCount, agg.dialogueTotalWords, agg.avoidedDialogues,
      agg.explorationActions, agg.riskTakingActions, agg.planningActions, agg.combatInitiated, agg.inputTotalChars,
      agg.expressiveActions, signals.extraversion, signals.intuition, signals.thinking, signals.judging, now);
  }

  getBehavioralMetrics(playerId: string): { aggregates: RawAggregates; totalTurns: number; signals: AxisSignals } | null {
    const row = this.db.prepare(`SELECT * FROM player_behavioral_metrics WHERE player_id = ?`).get(playerId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      aggregates: {
        dialogueInitiated: row.dialogue_initiated as number, dialogueCount: row.dialogue_count as number,
        dialogueTotalWords: row.dialogue_total_words as number, avoidedDialogues: row.avoided_dialogues as number,
        explorationActions: row.exploration_actions as number, riskTakingActions: row.risk_taking_actions as number,
        planningActions: row.planning_actions as number, combatInitiated: row.combat_initiated as number,
        inputTotalChars: row.input_total_chars as number, expressiveActions: row.expressive_actions as number,
      },
      totalTurns: row.total_turns as number,
      signals: { extraversion: row.signal_extraversion as number, intuition: row.signal_intuition as number,
        thinking: row.signal_thinking as number, judging: row.signal_judging as number },
    };
  }

  upsertNpcPerception(
    npcId: string,
    playerId: string,
    perceived: JungianProfile,
    interactionCount: number,
    interactionHistory: Array<{ ts: number; type: string; tension: number }> = [],
  ): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`INSERT INTO npc_perception (npc_id, player_id, perceived_extraversion_pref,
      perceived_intuition_pref, perceived_thinking_pref, perceived_judging_pref, interaction_count, interaction_history, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(npc_id, player_id) DO UPDATE SET
        perceived_extraversion_pref=excluded.perceived_extraversion_pref,
        perceived_intuition_pref=excluded.perceived_intuition_pref,
        perceived_thinking_pref=excluded.perceived_thinking_pref,
        perceived_judging_pref=excluded.perceived_judging_pref,
        interaction_count=excluded.interaction_count, interaction_history=excluded.interaction_history, last_updated=excluded.last_updated
    `).run(npcId, playerId, perceived.extraversion.preference, perceived.intuition.preference,
      perceived.thinking.preference, perceived.judging.preference, interactionCount, JSON.stringify(interactionHistory), now);
  }

  getNpcPerception(npcId: string, playerId: string): {
    perceived: JungianProfile; interactionCount: number; interactionHistory: Array<{ ts: number; type: string; tension: number }>;
  } | null {
    const row = this.db.prepare(`SELECT * FROM npc_perception WHERE npc_id = ? AND player_id = ?`).get(npcId, playerId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const ax = (p: unknown, r: unknown): AxisProfile => ({ preference: p as number, range: r as number });
    return {
      perceived: {
        extraversion: ax(row.perceived_extraversion_pref, 0.1),
        intuition: ax(row.perceived_intuition_pref, 0.1),
        thinking: ax(row.perceived_thinking_pref, 0.1),
        judging: ax(row.perceived_judging_pref, 0.1),
        confidence: 0.5, axisConfidence: { extraversion: 0.5, intuition: 0.5, thinking: 0.5, judging: 0.5 }, source: 'blended',
      },
      interactionCount: row.interaction_count as number,
      interactionHistory: JSON.parse(String(row.interaction_history ?? '[]')) as Array<{ ts: number; type: string; tension: number }>,
    };
  }

  close(): void {
    this.db.close();
  }
}
