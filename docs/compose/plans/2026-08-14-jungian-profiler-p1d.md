# Jungian Profiler — Phase 1D: Persistence (Task 1.4)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [ ]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S14, S15; impl-спека `spec-profiler-persistence.md`.

**Acceptance (1D):** `PlayerProfileStore` пишет/читает jungian-профиль (roundtrip) и behavioral metrics (с дробными агрегатами). Миграция идемпотентна (`PRAGMA table_info`).

**Files:**
- Modify: `src/lib/player-profile-store.ts`
- Modify: `src/lib/__tests__/player-profile-store.test.ts`

---

## Task 1.4: Persistence — jungian-колонки + behavioral metrics

**Covers:** S14, S15
**Interfaces:**
- Consumes: `JungianProfile`, `AxisProfile` from `../services/jungian-profiler`; `RawAggregates`, `AxisSignals` from `../services/metrics-collector`
- Produces: `upsertJungianProfile(playerId, profile): void`; `getJungianProfile(playerId): JungianProfile | null`; `upsertBehavioralMetrics(playerId, aggregates, totalTurns, signals): void`; `getBehavioralMetrics(playerId): { aggregates; totalTurns; signals } | null`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/__tests__/player-profile-store.test.ts (create if missing)
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PlayerProfileStore } from './player-profile-store';
import { createDefaultProfile } from '../services/jungian-profiler';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

let store: PlayerProfileStore;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `tns-test-${Date.now()}-${Math.random()}.db`);
  store = new PlayerProfileStore(dbPath);
});
afterEach(() => { store.close(); rmSync(dbPath, { force: true }); });

describe('PlayerProfileStore — jungian', () => {
  test('upsert + get roundtrip preserves all fields', () => {
    const p = createDefaultProfile();
    p.extraversion.preference = 0.3; p.extraversion.range = 0.2;
    p.thinking.preference = 0.75; p.confidence = 0.42; p.source = 'blended';
    store.upsertJungianProfile('player1', p);
    const got = store.getJungianProfile('player1')!;
    expect(got.extraversion.preference).toBeCloseTo(0.3, 5);
    expect(got.extraversion.range).toBeCloseTo(0.2, 5);
    expect(got.thinking.preference).toBeCloseTo(0.75, 5);
    expect(got.confidence).toBeCloseTo(0.42, 5);
    expect(got.source).toBe('blended');
  });
  test('get for unknown player → null', () => {
    expect(store.getJungianProfile('nobody')).toBeNull();
  });
  test('behavioral metrics roundtrip with fractional aggregates', () => {
    const agg = { dialogueInitiated: 4.5, dialogueCount: 9.2, dialogueTotalWords: 100.0,
      avoidedDialogues: 0.9, explorationActions: 3.3, riskTakingActions: 2.1,
      planningActions: 1.8, combatInitiated: 5.0, inputTotalChars: 250.5, expressiveActions: 1.1 };
    const signals = { extraversion: 0.62, intuition: 0.4, thinking: 0.7, judging: 0.55 };
    store.upsertBehavioralMetrics('player1', agg, 25, signals);
    const got = store.getBehavioralMetrics('player1')!;
    expect(got.aggregates.dialogueInitiated).toBeCloseTo(4.5, 5);
    expect(got.totalTurns).toBe(25);
    expect(got.signals.thinking).toBeCloseTo(0.7, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/__tests__/player-profile-store.test.ts`
Expected: FAIL — `upsertJungianProfile is not a function`

- [ ] **Step 3: Write minimal implementation (modify player-profile-store.ts)**

```typescript
// Imports (top of file):
import type { JungianProfile, AxisProfile } from '../services/jungian-profiler';
import type { RawAggregates, AxisSignals } from '../services/metrics-collector';

// Helper (in class):
private addColumnIfMissing(table: string, col: string, def: string): void {
  const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === col)) {
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}

// In constructor, AFTER player_style_profiles CREATE TABLE:
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

// New methods (add to PlayerProfileStore class):
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
  const ax = (p: unknown, r: unknown): AxisProfile => ({ preference: p as number, range: r as number });
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
```

- [ ] **Step 4: Fix `upsertProfile` data-loss (preserve jungian columns)**

> **Data-loss fix:** existing `upsertProfile()` uses `INSERT OR REPLACE INTO player_style_profiles` with 16 columns, which REPLACEs the whole row and wipes the newly-added `jungian_*` columns back to their defaults. Change it to `INSERT ... ON CONFLICT(player_id) DO UPDATE SET` so only the 16 style columns are touched and jungian columns survive.

```sql
-- Replace:
INSERT OR REPLACE INTO player_style_profiles
  (player_id, avg_sentence_len, sensory_bias, register_score, dialogue_ratio,
   preferred_motifs, anti_patterns, sample_snippets, confidence,
   narrative_distance, action_orientation, emotional_expressiveness,
   preferred_pace, literary_sophistication, message_count_used, last_updated)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

-- With:
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/lib/__tests__/player-profile-store.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/lib/player-profile-store.ts src/lib/__tests__/player-profile-store.test.ts
git commit -m "feat(profiler): persistence — jungian columns + behavioral metrics"
```

**Phase 1D DONE.** Переходи к `2026-08-14-jungian-profiler-p1e.md`.
