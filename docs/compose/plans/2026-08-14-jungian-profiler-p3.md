# Jungian Profiler — Phase 3: NPC Psychotypes (Tasks 3.1–3.2)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [x]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S8, S8.1; impl-спека `spec-profiler-integration.md` §7.

**Acceptance (P3a):** `assignNpcPsychotype` детерминирован по (role, faction, worldSystem, seed). `npc_perception` хранит `perceivedPlayerType` (roundtrip). `computePerceivedPlayerType` сдвигает оси ±0.2.

**Files:**
- Modify: `src/services/jungian-profiler.ts`
- Modify: `src/services/jungian-profiler.test.ts`
- Modify: `src/lib/player-profile-store.ts`
- Modify: `src/lib/__tests__/player-profile-store.test.ts`

---

## Task 3.1: assignNpcPsychotype (pure, deterministic + jitter)

**Covers:** S8, S8.1
**Interfaces (Produces):** `assignNpcPsychotype(role, faction?, worldSystem?, seed?): JungianProfile`; `computePerceivedPlayerType(player, npc): JungianProfile`

- [x] **Step 1: Write failing test**

```typescript
// append to src/services/jungian-profiler.test.ts
import { createDefaultProfile, assignNpcPsychotype, computePerceivedPlayerType } from './jungian-profiler';

describe('assignNpcPsychotype', () => {
  test('craftsman → S+J (thinking high, judging high, intuition low)', () => {
    const p = assignNpcPsychotype('craftsman');
    expect(p.thinking.preference).toBeGreaterThan(0.6);
    expect(p.judging.preference).toBeGreaterThan(0.6);
    expect(p.intuition.preference).toBeLessThan(0.5);
  });
  test('wanderer → N+F+P (intuition high, thinking low, judging low)', () => {
    const p = assignNpcPsychotype('wanderer');
    expect(p.intuition.preference).toBeGreaterThan(0.6);
    expect(p.thinking.preference).toBeLessThan(0.5);
    expect(p.judging.preference).toBeLessThan(0.5);
  });
  test('deterministic with same seed', () => {
    expect(assignNpcPsychotype('guard', undefined, undefined, 42)).toEqual(assignNpcPsychotype('guard', undefined, undefined, 42));
  });
  test('anarchy world → P bias (judging lowered)', () => {
    const feudal = assignNpcPsychotype('craftsman', undefined, 'feudalism');
    const anarchy = assignNpcPsychotype('craftsman', undefined, 'anarchy');
    expect(anarchy.judging.preference).toBeLessThan(feudal.judging.preference);
  });
});

describe('computePerceivedPlayerType', () => {
  test('ISTP smith sees INTJ player as colder (thinking shifted +)', () => {
    const player = createDefaultProfile();
    player.thinking.preference = 0.75; player.extraversion.preference = 0.3;
    const npc = assignNpcPsychotype('craftsman'); // T-high
    const perceived = computePerceivedPlayerType(player, npc);
    expect(perceived.thinking.preference).toBeGreaterThan(player.thinking.preference);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL — `assignNpcPsychotype is not exported`

- [x] **Step 3: Write minimal implementation (append to jungian-profiler.ts)**

```typescript
// append to src/services/jungian-profiler.ts

const ROLE_BIAS: Record<string, { intuition: number; thinking: number; judging: number }> = {
  craftsman:  { intuition: 0.3, thinking: 0.75, judging: 0.7 },
  guard:      { intuition: 0.3, thinking: 0.6,  judging: 0.75 },
  merchant:   { intuition: 0.35, thinking: 0.7, judging: 0.6 },
  scholar:    { intuition: 0.8, thinking: 0.8,  judging: 0.55 },
  wanderer:   { intuition: 0.8, thinking: 0.3,  judging: 0.3 },
  healer:     { intuition: 0.55, thinking: 0.35, judging: 0.6 },
};

function seededJitter(seed: number): () => number {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function assignNpcPsychotype(
  role: string,
  faction?: string,
  worldSystem?: string,
  seed: number = 0,
): JungianProfile {
  const base = ROLE_BIAS[role.toLowerCase()] ?? { intuition: 0.5, thinking: 0.5, judging: 0.5 };
  const rand = seededJitter(seed + role.length);
  const jitter = () => (rand() - 0.5) * 0.2;

  let intuition = base.intuition + jitter();
  let thinking = base.thinking + jitter();
  let judging = base.judging + jitter();
  // Faction bias — keyword match over arbitrary worldFrame.factions names (design S8).
  const f = (faction ?? '').toLowerCase();
  if (/(bandit|разбой)/.test(f)) judging -= 0.15;                                    // P (perceiving)
  if (/(inquisition|инквиз)/.test(f)) judging += 0.15;                               // J (judging)
  if (/(guild|гильдия|trade|торгов)/.test(f)) { intuition -= 0.1; thinking += 0.1; } // S+T (sensing+thinking)
  if (worldSystem === 'feudalism') judging += 0.1;
  if (worldSystem === 'anarchy') judging -= 0.15;

  const clamp = (x: number) => Math.max(0.05, Math.min(0.95, x));
  return {
    extraversion: { preference: 0.5 + jitter(), range: 0.1 },
    intuition:    { preference: clamp(intuition), range: 0.1 },
    thinking:     { preference: clamp(thinking), range: 0.1 },
    judging:      { preference: clamp(judging), range: 0.1 },
    confidence: 1,
    axisConfidence: { extraversion: 0.7, intuition: 0.7, thinking: 0.7, judging: 0.7 },
    source: 'default',
  };
}

export function computePerceivedPlayerType(player: JungianProfile, npc: JungianProfile): JungianProfile {
  const shift = (p: number, n: number): number => Math.max(0.05, Math.min(0.95, p + (n - 0.5) * 0.4));
  const axis = (a: { preference: number; range: number }, n: { preference: number; range: number }) =>
    ({ preference: shift(a.preference, n.preference), range: a.range });
  return {
    extraversion: axis(player.extraversion, npc.extraversion),
    intuition: axis(player.intuition, npc.intuition),
    thinking: axis(player.thinking, npc.thinking),
    judging: axis(player.judging, npc.judging),
    confidence: player.confidence,
    axisConfidence: player.axisConfidence,
    source: player.source,
  };
}
```

> **Хранение (world-gen):** результат `assignNpcPsychotype` пишется в `entity.profile.l3.psychotype` (JSON) при генерации мира через `UnifiedEntityStore` (`src/store/entity-store.ts` — JSON-file store, файл `entities.json`). `UnifiedEntityStore` — НЕ SQLite-таблица `entities`; SQLite-таблица `entities` живёт отдельно в `SQLiteStore` (`src/lib/sqlite-store.ts`).

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS

- [x] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(profiler): assignNpcPsychotype + computePerceivedPlayerType (Phase 3)"
```

---

## Task 3.2: npc_perception таблица + perceivedPlayerType

**Covers:** S8.1
**Interfaces (Produces):** `upsertNpcPerception(npcId, playerId, perceived, interactionCount, interactionHistory?): void`; `getNpcPerception(npcId, playerId): { perceived: JungianProfile; interactionCount: number; interactionHistory: Array<{ ts: number; type: string; tension: number }> } | null`

- [x] **Step 1: Write failing test**

```typescript
// append to src/lib/__tests__/player-profile-store.test.ts
describe('PlayerProfileStore — npc_perception', () => {
  test('roundtrip perceivedPlayerType + interactionCount', () => {
    const perceived = createDefaultProfile();
    perceived.thinking.preference = 0.9;
    store.upsertNpcPerception('npc-bran', 'player1', perceived, 4);
    const got = store.getNpcPerception('npc-bran', 'player1')!;
    expect(got.perceived.thinking.preference).toBeCloseTo(0.9, 5);
    expect(got.interactionCount).toBe(4);
  });
  test('unknown npc/player → null', () => {
    expect(store.getNpcPerception('x', 'y')).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/__tests__/player-profile-store.test.ts`
Expected: FAIL — `upsertNpcPerception is not a function`

- [x] **Step 3: Write minimal implementation (add to player-profile-store.ts)**

```typescript
// In constructor, after player_behavioral_metrics:
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

// methods:
upsertNpcPerception(npcId: string, playerId: string, perceived: JungianProfile, interactionCount: number, interactionHistory: Array<{ ts: number; type: string; tension: number }> = []): void {
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

getNpcPerception(npcId: string, playerId: string): { perceived: JungianProfile; interactionCount: number; interactionHistory: Array<{ ts: number; type: string; tension: number }> } | null {
  const row = this.db.prepare(`SELECT * FROM npc_perception WHERE npc_id = ? AND player_id = ?`).get(npcId, playerId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const ax = (p: unknown, r: unknown) => ({ preference: p as number, range: r as number });
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/__tests__/player-profile-store.test.ts`
Expected: PASS

- [x] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/lib/player-profile-store.ts src/lib/__tests__/player-profile-store.test.ts
git commit -m "feat(profiler): npc_perception table + perceivedPlayerType persistence"
```

**Phase 3A DONE.** Переходи к `2026-08-14-jungian-profiler-p3b.md`.
