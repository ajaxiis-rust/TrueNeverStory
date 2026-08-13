# Jungian Player Profiler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Jungian psychological profiler that adapts narrative content to each player's psychological type, inferred from world creation choices, birth wizard data (incl. quiz), and gameplay behavior.

**Architecture:** New `JungianProfiler` service analyzes three data sources (world, birth+quiz, metrics), produces a `JungianType` (E/I, S/N, T/F, J/P), and injects narrative constraints into Stylist, Dramaturg, Actor, and EconomicService — gated by feature flag and `confidence >= 0.45`.

**Tech Stack:** TypeScript, Bun, SQLite (bun:sqlite), Zod, existing PlayerProfileStore / feature-flags / LLMQueue

**Spec:** `docs/compose/specs/2026-08-10-jungian-profiler-design_1.1.md` (v1.1)

## Global Constraints

- "English inside, translate at boundary" — profiler internals in English; UI via i18n
- No new dependencies — bun:sqlite, zod, existing logger
- PlayerProfileStore schema changes backward-compatible (new columns with defaults)
- Feature flag `jungian-profiler-enabled` gates all behavior (default: false)
- Adaptation (constraints / archetypes / NPC / economy) only if `confidence >= 0.45`
- All LLM calls (if any) via existing LLMQueue — no direct API calls
- Logging via `getLogger('jungian-profiler')` — no console.log
- Match real `PlayerStyleProfile` fields and `FeatureFlag` shape in `src/lib/feature-flags.ts`

---

### Task 1: Types and Interfaces

**Covers:** S6

**Files:**
- Create: `src/services/jungian-profiler.ts` (types + defaults only)
- Create: `src/services/jungian-profiler.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from 'bun:test';
import { encodeJungian, createDefaultJungianType, decodeJungian } from './jungian-profiler';

describe('JungianType', () => {
  test('encodeJungian returns 4-letter code', () => {
    const t = createDefaultJungianType();
    expect(encodeJungian(t)).toBe('ISFP'); // default letters only; confidence 0
  });

  test('createDefaultJungianType has confidence 0 and source default', () => {
    const t = createDefaultJungianType();
    expect(t.confidence).toBe(0);
    expect(t.source).toBe('default');
  });

  test('decodeJungian round-trips', () => {
    const code = 'INFJ';
    const t = decodeJungian(code);
    expect(encodeJungian(t)).toBe('INFJ');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

`bun test src/services/jungian-profiler.test.ts`

- [ ] **Step 3: Implement types**

```typescript
export type JungianAttitude = 'E' | 'I';
export type JungianPerceiving = 'S' | 'N';
export type JungianJudging = 'T' | 'F';
export type JungianLifestyle = 'J' | 'P';

export interface JungianType {
  attitude: JungianAttitude;
  perceiving: JungianPerceiving;
  judging: JungianJudging;
  lifestyle: JungianLifestyle;
  confidence: number;
  source: 'world' | 'birth' | 'metrics' | 'blended' | 'default';
}

export interface AuthorMapping {
  author: string;
  aliases: string[];
  perceiving: JungianPerceiving;
  judging: JungianJudging;
  attitude: JungianAttitude;
  weight: number;
}

export interface NarrativeConstraints {
  prefer: string[];
  avoid: string[];
  pace: 'slow' | 'medium' | 'fast' | 'variable';
  tone: string;
  sensoryFocus: string[];
  archetypePreference: string[];
}

/** Neutral letter defaults only — confidence 0 means "do not adapt". */
export function createDefaultJungianType(): JungianType {
  return {
    attitude: 'I',
    perceiving: 'S',
    judging: 'F',
    lifestyle: 'P',
    confidence: 0,
    source: 'default',
  };
}

export function encodeJungian(t: JungianType): string {
  return `${t.attitude}${t.perceiving}${t.judging}${t.lifestyle}`;
}

export function decodeJungian(code: string): JungianType {
  const c = (code || 'ISFP').toUpperCase();
  return {
    attitude: c[0] === 'E' ? 'E' : 'I',
    perceiving: c[1] === 'N' ? 'N' : 'S',
    judging: c[2] === 'T' ? 'T' : 'F',
    lifestyle: c[3] === 'J' ? 'J' : 'P',
    confidence: 0,
    source: 'default',
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(jungian): add JungianType types and defaults"
```

---

### Task 2: Genre Mapping

**Covers:** S3 (v1)

**Files:** Modify `jungian-profiler.ts` + test

- [ ] **Step 1: Failing tests** for fantasy→N+F, scifi→N+T, empty→{}, multi-genre weighted

- [ ] **Step 2: Implement `inferFromGenres(genres: string[]): Partial<JungianType>`**

Use weighted scores (GENRE_MAP as in prior plan). Set `source: 'world'` when any axis is set.

- [ ] **Step 3: PASS + commit** `feat(jungian): genre-to-type mapping`

---

### Task 3: Social System Mapping

**Covers:** S3 (v1)

- [ ] **Implement `inferFromSocialSystem(system: string): Partial<JungianType>`**

SOCIAL_MAP: feudalism→S+J, democracy→N+F, anarchy→N+P, theocracy→N+J, communism/capitalism/mercantilism→S+T, tribalism→S+F, slavery→S+T, socialism→S+F.

- [ ] **Tests + commit** `feat(jungian): social system mapping`

---

### Task 4: Author Database + Normalization

**Covers:** S8

- [ ] **Implement `normalizeAuthorName(input: string): string`**

lowercase, trim, strip punctuation, basic cyrillic transliteration map, NFKD strip diacritics.

- [ ] **Seed `AUTHOR_DB` (30–40 entries)** with aliases including translit forms.

- [ ] **`inferFromAuthors(authors: string[]): Partial<JungianType>`** using normalize + weighted scores.

- [ ] **Tests:** достоевский, hemingway, tolkien fuzzy, unknown→{}, multi weighted.

- [ ] **Commit** `feat(jungian): author DB and normalized inference`

---

### Task 5: Birth + Quiz Inference

**Covers:** S4, S9

```typescript
export function inferFromQuizAnswers(answers: {
  q1?: string; // E|I
  q2?: string; // S|N
  q3?: string; // T|F
  q4?: string; // T|F
  q5?: string; // J|P
}): Partial<JungianType> { /* high weight per answered axis */ }

export function inferFromBirth(params: {
  hints: string;
  isekai: boolean;
  age: number;
  favoriteAuthors: string[];
  quizAnswers?: { q1?: string; q2?: string; q3?: string; q4?: string; q5?: string };
}): Partial<JungianType>
```

- HINT_KEYWORDS map (warrior→S, scholar→N+T, healer→F, …)
- isekai: weak E/I (±0.4 weight)
- age: <18 → P; ≥40 → J
- authors via `inferFromAuthors` (higher weight)
- quiz via `inferFromQuizAnswers` (highest weight on answered axes)
- `source: 'birth'`

- [ ] **Tests** for isekai, age, hints, authors override, quiz poles
- [ ] **Commit** `feat(jungian): birth and quiz inference`

---

### Task 6: Metrics Inference + Blend

**Covers:** S5, S6 confidence

**Files:** `jungian-profiler.ts` + test

#### `inferFromMetrics(profile: PlayerStyleProfile): Partial<JungianType>`

Use **real** fields from `src/lib/player-profile-store.ts`:

```typescript
import type { PlayerStyleProfile } from '../lib/player-profile-store';

export function inferFromMetrics(profile: PlayerStyleProfile): Partial<JungianType> {
  let s = 0, n = 0, t = 0, f = 0, e = 0, i = 0, j = 0, p = 0;

  if (profile.action_orientation > 0.7) s += 0.8;
  if (profile.emotional_expressiveness > 0.7) f += 0.8;
  if (profile.literary_sophistication > 0.7 && profile.sensory_bias < 0.4) n += 0.7;
  if (profile.literary_sophistication > 0.7 && profile.register_score > 0.6) t += 0.7;
  if (profile.dialogue_ratio > 0.6) e += 0.8;
  if (profile.narrative_distance > 0.7) i += 0.8;
  if (profile.preferred_pace === 'fast') { s += 0.4; p += 0.3; }
  if (profile.preferred_pace === 'slow') { n += 0.4; j += 0.3; }
  if (profile.sensory_bias > 0.6) s += 0.6;

  const motifs = (profile.preferred_motifs || []).map(m => m.toLowerCase());
  if (motifs.some(m => /myster|secret|symbol|dream|fate/.test(m))) n += 0.5;

  const result: Partial<JungianType> = { source: 'metrics' };
  if (s + n > 0) result.perceiving = s >= n ? 'S' : 'N';
  if (t + f > 0) result.judging = t >= f ? 'T' : 'F';
  if (e + i > 0) result.attitude = e >= i ? 'E' : 'I';
  if (j + p > 0) result.lifestyle = j >= p ? 'J' : 'P';
  return result;
}
```

#### `blend(current, incoming, weight): JungianType`

```typescript
export function blend(
  current: JungianType,
  incoming: Partial<JungianType>,
  weight: number, // 0–1 how much to trust incoming
): JungianType {
  const axes = {
    attitude: pick(current.attitude, incoming.attitude, weight),
    perceiving: pick(current.perceiving, incoming.perceiving, weight),
    judging: pick(current.judging, incoming.judging, weight),
    lifestyle: pick(current.lifestyle, incoming.lifestyle, weight),
  };

  const filled =
    (incoming.attitude ? 1 : 0) +
    (incoming.perceiving ? 1 : 0) +
    (incoming.judging ? 1 : 0) +
    (incoming.lifestyle ? 1 : 0);
  const signalStrength = filled / 4;
  const confidence = Math.min(
    0.95,
    current.confidence + weight * (1 - current.confidence) * Math.max(signalStrength, 0.25),
  );

  return {
    ...axes,
    confidence,
    source: current.source === 'default' && incoming.source
      ? (incoming.source as JungianType['source'])
      : 'blended',
  };
}

function pick<T extends string>(cur: T, next: T | undefined, weight: number): T {
  if (!next) return cur;
  // For v1: if weight >= 0.5 prefer incoming when present; else keep current
  return weight >= 0.5 ? next : cur;
}
```

- [ ] **Tests:** metrics thresholds; blend monotonic confidence; empty incoming no-op
- [ ] **Commit** `feat(jungian): metrics inference and blend with confidence formula`

---

### Task 7: getNarrativeConstraints (16 types)

**Covers:** S7

```typescript
const CONSTRAINTS: Record<string, NarrativeConstraints> = {
  ISTJ: { prefer: [...], avoid: [...], pace: 'medium', tone: 'factual', sensoryFocus: [...], archetypePreference: [...] },
  // ... all 16 from Spec S7
};

export function getNarrativeConstraints(type: JungianType): NarrativeConstraints | null {
  if (type.confidence < 0.45) return null;
  return CONSTRAINTS[encodeJungian(type)] ?? CONSTRAINTS['ISFP'];
}
```

- [ ] **Tests:** INFJ / ESTP / INTP content; low confidence → null
- [ ] **Commit** `feat(jungian): narrative constraints for all 16 types`

---

### Task 8: PlayerProfileStore schema

**Covers:** S10, S14

**Files:** `src/lib/player-profile-store.ts` + test

Add columns (migration-friendly `ALTER` if table exists, or include in CREATE):

```sql
jungian_type TEXT,
jungian_confidence REAL NOT NULL DEFAULT 0,
jungian_source TEXT NOT NULL DEFAULT 'default',
jungian_history TEXT NOT NULL DEFAULT '[]'
```

Extend `PlayerStyleProfile` interface + `createDefaultProfile` + upsert/get serialization.

- [ ] **Tests:** upsert/load jungian fields; history JSON round-trip
- [ ] **Commit** `feat(jungian): jungian columns on player_style_profiles`

---

### Task 9: Stylist integration

**Covers:** S7, C1

**Files:** `src/services/agents/stylist.ts`

- Import `JungianType`, `getNarrativeConstraints`, `encodeJungian`
- Extend `buildMicroPrompt(... , jungianType?: JungianType)`
- If constraints non-null, append English block:

```
Player psychological type: INFJ (confidence 0.82)
Narrative adaptation:
- prefer: ...
- avoid: ...
- pace: ...
- tone: ...
```

- Gate: only if feature flag enabled **and** constraints !== null
- [ ] **Tests** with/without type; low confidence omits block
- [ ] **Commit** `feat(jungian): inject constraints into Stylist micro-prompt`

---

### Task 10: Dramaturg archetype preference

**Covers:** S11

```typescript
export function getArchetypePreference(type: Partial<JungianType>): string[] {
  if (!type || (type as JungianType).confidence !== undefined && (type as JungianType).confidence! < 0.45) {
    // callers should pass full type; if confidence known and low, empty
  }
  const prefs: string[] = [];
  if (type.perceiving === 'S') prefs.push('rescue', 'escape_liberation', 'quest_journey');
  if (type.perceiving === 'N') prefs.push('temptation_fall', 'wisdom_counsel', 'rise_fall_rise');
  if (type.judging === 'T') prefs.push('judgment_trial', 'political_intrigue', 'wisdom_counsel');
  if (type.judging === 'F') prefs.push('loyalty', 'betrayal', 'inheritance_return', 'endurance_suffering');
  return [...new Set(prefs)];
}
```

Soft-bias pattern ranking in `process()` when flag on and confidence ok.

- [ ] **Commit** `feat(jungian): Dramaturg archetype preference by type`

---

### Task 11: Actor NPC adaptation

**Covers:** S12

```typescript
export function getNpcAdaptationHint(type: Partial<JungianType> & { confidence?: number }): string {
  if (type.confidence !== undefined && type.confidence < 0.45) return '';
  if (type.judging === 'T') return 'NPC should provide more factual information, details, logical arguments. Less emotional expression.';
  if (type.judging === 'F') return 'NPC should share more emotions, personal stories, empathetic responses. Less dry facts.';
  if (type.perceiving === 'S') return 'NPC should describe concrete, practical details. Specific names, places, items.';
  if (type.perceiving === 'N') return 'NPC should hint at hidden meanings, use metaphors, suggest possibilities.';
  return '';
}
```

Inject into NPC prompt builder when flag enabled.

- [ ] **Commit** `feat(jungian): Actor adapts NPC dialogue to player type`

---

### Task 12: Economic Service adaptation

**Covers:** S13

```typescript
export function getEconomicAdaptation(type: Partial<JungianType> & { confidence?: number }): string {
  if (type.confidence !== undefined && type.confidence < 0.45) return '';
  const parts: string[] = [];
  if (type.judging === 'T' && type.perceiving === 'S') parts.push('Focus on numbers, prices, quantities, mechanical trade details');
  if (type.judging === 'F' && type.perceiving === 'N') parts.push('Focus on social consequences of trade, relationships with merchants, hidden opportunities');
  if (type.perceiving === 'S') parts.push('Describe goods concretely: weight, texture, smell, origin');
  if (type.perceiving === 'N') parts.push('Hint at secret markets, rare finds, connections between goods and world events');
  return parts.join('. ');
}
```

- [ ] **Commit** `feat(jungian): EconomicService adapts descriptions to player type`

---

### Task 13: UI — Favorite Authors + Quiz

**Covers:** S8, S9, F2

**Files:** `public/worlds.html` (and birth UI if separate)

1. Textarea **Favorite Authors / Books** → `favoriteAuthors` in POST body
2. Optional quiz block (5 selects), hidden unless flag or always shown as optional
3. i18n keys for all 7 languages (EN base + RU/DE/FR/ES/JA/ZH stubs)
4. Send `jungianAnswers: { q1..q5 }` on birth

- [ ] **Commit** `feat(jungian): authors field and optional onboarding quiz UI`

---

### Task 14: Route — World creation

**Covers:** S3, B2

**Files:** `src/routes/worlds.ts`

After world create:

```typescript
let jungian = createDefaultJungianType();
jungian = blend(jungian, inferFromGenres(body.genres ?? []), 0.4);
jungian = blend(jungian, inferFromSocialSystem(body.primaryRule ?? body.socialSystem ?? ''), 0.3);
jungian = blend(jungian, inferFromAuthors(splitAuthors(body.favoriteAuthors)), 0.5);
jungian.source = 'world';
// store in session / world metadata for birth
```

- [ ] **Commit** `feat(jungian): infer type during world creation`

---

### Task 15: Route — Birth wizard

**Covers:** S4, S9, S10

**Files:** `src/routes/launch.ts`

```typescript
const birth = inferFromBirth({
  hints: body.hints ?? '',
  isekai: !!body.isekai,
  age: Number(body.starting_age ?? body.age ?? 20),
  favoriteAuthors: splitAuthors(body.favoriteAuthors),
  quizAnswers: body.jungianAnswers,
});
const worldJungian = loadWorldJungian(session) ?? createDefaultJungianType();
let final = blend(worldJungian, birth, 0.55);
final.source = 'birth';
// upsert PlayerProfileStore jungian_* fields
```

- [ ] **Commit** `feat(jungian): infer and persist type at birth`

---

### Task 16: Pipeline — auto-update every 20 turns

**Covers:** S10, S5

**Files:** `src/services/roleplay/pipeline-runner.ts`

After turn processing, if flag enabled and `turnCount % 20 === 0`:

```typescript
const profile = profileStore.getProfile(playerId);
if (profile?.jungian_type) {
  const current = { ...decodeJungian(profile.jungian_type), confidence: profile.jungian_confidence, source: profile.jungian_source as any };
  const metricsPartial = inferFromMetrics(profile);
  const updated = blend(current, metricsPartial, 0.35);
  // append history, upsert
}
```

- [ ] **Commit** `feat(jungian): refresh type from metrics every 20 turns`

---

### Task 17: Logging

**Covers:** E1

In all `infer*` and `blend`: structured `log.info({ ... }, 'jungian inference')` with axes + confidence. No PII beyond player_id.

- [ ] **Commit** `feat(jungian): structured logging for inference`

---

### Task 18: Feature flag

**Covers:** S15

**Files:** `src/lib/feature-flags.ts`, `conf/feature-flags.json`

Add to `DEFAULT_FLAGS`:

```typescript
{
  id: 'jungian-profiler-enabled',
  name: 'Jungian Profiler',
  description: 'Adapt narrative to inferred Jungian player type',
  enabled: false,
  percentage: 0,
  conditions: [],
  variants: [
    { id: 'control', name: 'Off', weight: 50 },
    { id: 'treatment', name: 'On', weight: 50 },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
```

Gate Stylist / Dramaturg / Actor / Economy / pipeline update via `getFeatureFlagManager().isEnabled('jungian-profiler-enabled')` (use the real API from `feature-flags.ts`).

- [ ] **Commit** `feat(jungian): feature flag jungian-profiler-enabled`

---

### Task 19: Engagement logging (A/B)

**Covers:** S15

In pipeline-runner after turn:

```typescript
log.info({
  playerId,
  turnCount,
  jungianEnabled: flagOn,
  jungianType: profile?.jungian_type ?? 'none',
  jungianConfidence: profile?.jungian_confidence ?? 0,
  sessionLengthMs: Date.now() - sessionStart,
}, 'engagement metric');
```

- [ ] **Commit** `feat(jungian): engagement metrics for A/B`

---

### Task 20: Cross-session persistence test

**Covers:** S14

Integration test: write profile with jungian fields → reopen store → assert same type/confidence.

- [ ] **Commit** `test(jungian): cross-session persistence`

---

### Task 21: E2E smoke (optional but recommended)

World (fantasy + feudalism) → birth (scholar + dostoevsky + quiz N/F) → assert type encodes to N/F-leaning → 20 synthetic metric updates → confidence increases → `getNarrativeConstraints` non-null.

- [ ] **Commit** `test(jungian): e2e world→birth→metrics path`

---

## Implementation order (summary)

1. Types → 2 Genres → 3 Social → 4 Authors → 5 Birth/Quiz → 6 Metrics+Blend → 7 Constraints  
8 Store → 18 Flag → 9 Stylist → 10 Dramaturg → 11 Actor → 12 Economy  
13 UI → 14 Worlds route → 15 Launch → 16 Pipeline → 17 Log → 19 Engagement → 20–21 Tests

## Out of scope (v1)

- World description length / rules-count / magic-style inference (Spec S3 v1.1+)
- AUTHOR_DB beyond seed ~40
- Public export of Jungian type
- LLM free-text personality essay classifier
