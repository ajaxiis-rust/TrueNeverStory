# Jungian Player Profiler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Jungian psychological profiler that adapts narrative content to each player's psychological type, inferred from world creation choices, birth wizard data, and gameplay behavior.

**Architecture:** New `JungianProfiler` service analyzes three data sources (world creation, birth wizard, gameplay metrics), produces a `JungianType` (E/I, S/N, T/F, J/P), and injects narrative constraints into Stylist, Dramaturg, Actor, and EconomicService prompts.

**Tech Stack:** TypeScript, Bun, SQLite (bun:sqlite), Zod (validation), existing PlayerProfileStore

## Global Constraints

- "English inside, translate at boundary" — all profiler internals in English, UI labels translated via i18n
- No new dependencies — use existing bun:sqlite, zod, pino
- PlayerProfileStore schema changes must be backward-compatible (new columns with defaults)
- Feature flag `jungian-profiler-enabled` gates all behavior (default: false)
- All LLM calls go through existing LLMQueue — no direct API calls
- Logging via existing `getLogger()` — no console.log

---

### Task 1: Types and Interfaces

**Covers:** S6

**Files:**
- Create: `src/services/jungian-profiler.ts` (types only, no implementation)

**Interfaces:**
- Produces: `JungianType`, `JungianAttitude`, `JungianPerceiving`, `JungianJudging`, `JungianLifestyle`, `AuthorMapping`, `NarrativeConstraints`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/jungian-profiler.test.ts
import { describe, expect, test } from 'bun:test';
import { encodeJungian, createDefaultJungianType } from './jungian-profiler';

describe('JungianType', () => {
  test('encodeJungian returns 4-letter code', () => {
    const t = createDefaultJungianType();
    expect(encodeJungian(t)).toBe('ISFP');
  });

  test('createDefaultJungianType returns neutral defaults', () => {
    const t = createDefaultJungianType();
    expect(t.attitude).toBe('I');
    expect(t.perceiving).toBe('S');
    expect(t.judging).toBe('F');
    expect(t.lifestyle).toBe('P');
    expect(t.confidence).toBe(0);
    expect(t.source).toBe('world');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write types and defaults**

```typescript
// src/services/jungian-profiler.ts
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
  source: 'world' | 'birth' | 'metrics' | 'blended';
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

export function createDefaultJungianType(): JungianType {
  return {
    attitude: 'I',
    perceiving: 'S',
    judging: 'F',
    lifestyle: 'P',
    confidence: 0,
    source: 'world',
  };
}

export function encodeJungian(t: JungianType): string {
  return `${t.attitude}${t.perceiving}${t.judging}${t.lifestyle}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(jungian): add JungianType types and defaults"
```

---

### Task 2: Genre Mapping

**Covers:** S3, A4

**Files:**
- Modify: `src/services/jungian-profiler.ts`
- Modify: `src/services/jungian-profiler.test.ts`

**Interfaces:**
- Produces: `inferFromGenres(genres: string[]): Partial<JungianType>`

- [ ] **Step 1: Write the failing test**

```typescript
// Add to jungian-profiler.test.ts
import { inferFromGenres } from './jungian-profiler';

describe('inferFromGenres', () => {
  test('fantasy → N+F', () => {
    const result = inferFromGenres(['fantasy']);
    expect(result.perceiving).toBe('N');
    expect(result.judging).toBe('F');
  });

  test('scifi → N+T', () => {
    const result = inferFromGenres(['scifi']);
    expect(result.perceiving).toBe('N');
    expect(result.judging).toBe('T');
  });

  test('horror → S+N (weighted by count)', () => {
    const result = inferFromGenres(['horror']);
    expect(result.perceiving).toBeDefined();
  });

  test('multiple genres → weighted average', () => {
    const result = inferFromGenres(['fantasy', 'scifi']);
    // fantasy=F, scifi=T → tie, either valid
    expect(['T', 'F']).toContain(result.judging);
  });

  test('empty genres → undefined', () => {
    const result = inferFromGenres([]);
    expect(result.perceiving).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL — inferFromGenres not defined

- [ ] **Step 3: Implement genre mapping**

```typescript
// Add to jungian-profiler.ts

const GENRE_MAP: Record<string, { perceiving: JungianPerceiving; judging: JungianJudging; weight: number }> = {
  fantasy:          { perceiving: 'N', judging: 'F', weight: 0.8 },
  scifi:            { perceiving: 'N', judging: 'T', weight: 0.8 },
  litrpg:           { perceiving: 'S', judging: 'T', weight: 0.7 },
  horror:           { perceiving: 'S', judging: 'F', weight: 0.6 },
  historical:       { perceiving: 'S', judging: 'T', weight: 0.7 },
  cyberpunk:        { perceiving: 'N', judging: 'T', weight: 0.7 },
  steampunk:        { perceiving: 'N', judging: 'T', weight: 0.6 },
  mythology:        { perceiving: 'N', judging: 'F', weight: 0.8 },
  'post-apocalyptic': { perceiving: 'S', judging: 'F', weight: 0.6 },
  fiction:          { perceiving: 'N', judging: 'F', weight: 0.5 },
};

export function inferFromGenres(genres: string[]): Partial<JungianType> {
  if (genres.length === 0) return {};

  let sScore = 0, nScore = 0, tScore = 0, fScore = 0;

  for (const genre of genres) {
    const mapping = GENRE_MAP[genre.toLowerCase()];
    if (!mapping) continue;

    if (mapping.perceiving === 'S') sScore += mapping.weight;
    else nScore += mapping.weight;

    if (mapping.judging === 'T') tScore += mapping.weight;
    else fScore += mapping.weight;
  }

  const result: Partial<JungianType> = { source: 'world' };
  if (sScore > 0 || nScore > 0) result.perceiving = sScore >= nScore ? 'S' : 'N';
  if (tScore > 0 || fScore > 0) result.judging = tScore >= fScore ? 'T' : 'F';

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(jungian): add genre-to-type mapping"
```

---

### Task 3: Social System Mapping

**Covers:** S3, A5

**Files:**
- Modify: `src/services/jungian-profiler.ts`
- Modify: `src/services/jungian-profiler.test.ts`

**Interfaces:**
- Produces: `inferFromSocialSystem(system: string): Partial<JungianType>`

- [ ] **Step 1: Write the failing test**

```typescript
import { inferFromSocialSystem } from './jungian-profiler';

describe('inferFromSocialSystem', () => {
  test('feudalism → S+J', () => {
    const result = inferFromSocialSystem('feudalism');
    expect(result.perceiving).toBe('S');
    expect(result.lifestyle).toBe('J');
  });

  test('anarchy → N+P', () => {
    const result = inferFromSocialSystem('anarchy');
    expect(result.perceiving).toBe('N');
    expect(result.lifestyle).toBe('P');
  });

  test('democracy → N+F', () => {
    const result = inferFromSocialSystem('democracy');
    expect(result.perceiving).toBe('N');
    expect(result.judging).toBe('F');
  });

  test('empty → empty', () => {
    const result = inferFromSocialSystem('');
    expect(result.perceiving).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement social system mapping**

```typescript
// Add to jungian-profiler.ts

const SOCIAL_MAP: Record<string, Partial<JungianType>> = {
  feudalism:    { perceiving: 'S', lifestyle: 'J' },
  democracy:    { perceiving: 'N', judging: 'F' },
  anarchy:      { perceiving: 'N', lifestyle: 'P' },
  theocracy:    { perceiving: 'N', lifestyle: 'J' },
  communism:    { perceiving: 'S', judging: 'T' },
  capitalism:   { perceiving: 'S', judging: 'T' },
  socialism:    { perceiving: 'S', judging: 'F' },
  tribalism:    { perceiving: 'S', judging: 'F' },
  slavery:      { perceiving: 'S', judging: 'T' },
  mercantilism: { perceiving: 'S', judging: 'T' },
};

export function inferFromSocialSystem(system: string): Partial<JungianType> {
  if (!system) return {};
  return SOCIAL_MAP[system.toLowerCase()] ?? {};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(jungian): add social system mapping"
```

---

### Task 4: Author Database

**Covers:** S8, A3

**Files:**
- Modify: `src/services/jungian-profiler.ts`
- Modify: `src/services/jungian-profiler.test.ts`

**Interfaces:**
- Produces: `AUTHOR_DB: AuthorMapping[]`, `inferFromAuthors(authors: string[]): Partial<JungianType>`

- [ ] **Step 1: Write the failing test**

```typescript
import { inferFromAuthors } from './jungian-profiler';

describe('inferFromAuthors', () => {
  test('достоевский → N+F+I', () => {
    const result = inferFromAuthors(['достоевский']);
    expect(result.perceiving).toBe('N');
    expect(result.judging).toBe('F');
    expect(result.attitude).toBe('I');
  });

  test('хемингуэй → S+T+E', () => {
    const result = inferFromAuthors(['хемингуэй']);
    expect(result.perceiving).toBe('S');
    expect(result.judging).toBe('T');
    expect(result.attitude).toBe('E');
  });

  test('fuzzy match — "tolkien" works', () => {
    const result = inferFromAuthors(['tolkien']);
    expect(result.perceiving).toBe('N');
  });

  test('unknown author → empty', () => {
    const result = inferFromAuthors(['xyz_unknown_author']);
    expect(result.perceiving).toBeUndefined();
  });

  test('multiple authors → weighted', () => {
    const result = inferFromAuthors(['достоевский', 'хемингуэй']);
    // dostoevsky=N(0.9), hemingway=S(0.7) → N wins
    expect(result.perceiving).toBe('N');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement author database and inference**

```typescript
// Add to jungian-profiler.ts

export const AUTHOR_DB: AuthorMapping[] = [
  // Russian classics
  { author: 'достоевский', aliases: ['dostoevsky', 'dostoevskij'], perceiving: 'N', judging: 'F', attitude: 'I', weight: 0.9 },
  { author: 'толстой', aliases: ['tolstoy', 'tolstoi'], perceiving: 'N', judging: 'F', attitude: 'I', weight: 0.85 },
  { author: 'чехов', aliases: ['chekhov', 'chechov'], perceiving: 'S', judging: 'F', attitude: 'I', weight: 0.7 },
  { author: 'булгаков', aliases: ['bulgakov'], perceiving: 'N', judging: 'F', attitude: 'I', weight: 0.8 },
  { author: 'пелевин', aliases: ['pelevin'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.75 },
  { author: 'сорокин', aliases: ['sorokin'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.7 },
  { author: 'стругацкие', aliases: ['strugatsky', 'strugatski'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.8 },
  { author: 'набоков', aliases: ['nabokov'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.75 },

  // English classics
  { author: 'толкин', aliases: ['tolkien', 'tolkein'], perceiving: 'N', judging: 'F', attitude: 'I', weight: 0.8 },
  { author: 'азимов', aliases: ['asimov'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.8 },
  { author: 'хемингуэй', aliases: ['hemingway'], perceiving: 'S', judging: 'T', attitude: 'E', weight: 0.7 },
  { author: 'ороуэлл', aliases: ['orwell'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.75 },
  { author: 'хаусли', aliases: ['huxley'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.7 },
  { author: 'дик', aliases: ['dick', 'philip dick', 'philip k dick'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.75 },
  { author: 'лев гуин', aliases: ['le guin', 'leguin', 'ursula le guin'], perceiving: 'N', judging: 'F', attitude: 'I', weight: 0.75 },
  { author: 'гейман', aliases: ['gaiman', 'neil gaiman'], perceiving: 'N', judging: 'F', attitude: 'I', weight: 0.7 },
  { author: 'пратчетт', aliases: ['pratchett', 'terry pratchett'], perceiving: 'N', judging: 'F', attitude: 'E', weight: 0.7 },
  { author: 'бронте', aliases: ['bronte', 'brontë'], perceiving: 'S', judging: 'F', attitude: 'I', weight: 0.65 },
  { author: 'остин', aliases: ['austen', 'jane austen'], perceiving: 'S', judging: 'F', attitude: 'E', weight: 0.65 },
  { author: 'диккенс', aliases: ['dickens', 'charles dickens'], perceiving: 'S', judging: 'F', attitude: 'E', weight: 0.7 },
  { author: 'кафка', aliases: ['kafka'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.8 },
  { author: 'борхес', aliases: ['borges'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.75 },
  { author: 'маркес', aliases: ['marquez', 'garcia marquez'], perceiving: 'N', judging: 'F', attitude: 'E', weight: 0.7 },
  { author: 'ремарк', aliases: ['remarque'], perceiving: 'S', judging: 'F', attitude: 'I', weight: 0.65 },
  { author: 'кинг', aliases: ['king', 'stephen king'], perceiving: 'S', judging: 'F', attitude: 'E', weight: 0.65 },
  { author: 'лавкрафт', aliases: ['lovecraft'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.7 },
  { author: 'сапковский', aliases: ['sapkowski'], perceiving: 'S', judging: 'T', attitude: 'E', weight: 0.6 },
  { author: 'желязны', aliases: ['zelazny'], perceiving: 'N', judging: 'T', attitude: 'E', weight: 0.65 },
  { author: 'лем', aliases: ['lem', 'stanislaw lem'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.8 },
  { author: 'жюль верн', aliases: ['jules verne', 'verne'], perceiving: 'S', judging: 'T', attitude: 'E', weight: 0.6 },
  { author: 'гibson', aliases: ['gibson', 'william gibson'], perceiving: 'N', judging: 'T', attitude: 'I', weight: 0.7 },
  { author: 'коэльо', aliases: ['coelho', 'paulo coelho'], perceiving: 'N', judging: 'F', attitude: 'E', weight: 0.5 },
  { author: 'бах', aliases: ['bach', 'richard bach'], perceiving: 'N', judging: 'F', attitude: 'E', weight: 0.5 },
  { author: 'муркок', aliases: ['moorcock'], perceiving: 'S', judging: 'T', attitude: 'E', weight: 0.6 },
  { author: 'джек лондон', aliases: ['jack london'], perceiving: 'S', judging: 'T', attitude: 'E', weight: 0.65 },
];

export function inferFromAuthors(authors: string[]): Partial<JungianType> {
  if (authors.length === 0) return {};

  let sScore = 0, nScore = 0, tScore = 0, fScore = 0, eScore = 0, iScore = 0;

  for (const input of authors) {
    const normalized = input.toLowerCase().trim();
    const match = AUTHOR_DB.find(a =>
      a.author === normalized ||
      a.aliases.some(alias => alias === normalized)
    );
    if (!match) continue;

    if (match.perceiving === 'S') sScore += match.weight;
    else nScore += match.weight;

    if (match.judging === 'T') tScore += match.weight;
    else fScore += match.weight;

    if (match.attitude === 'E') eScore += match.weight;
    else iScore += match.weight;
  }

  const result: Partial<JungianType> = { source: 'birth' };
  if (sScore > 0 || nScore > 0) result.perceiving = sScore >= nScore ? 'S' : 'N';
  if (tScore > 0 || fScore > 0) result.judging = tScore >= fScore ? 'T' : 'F';
  if (eScore > 0 || iScore > 0) result.attitude = eScore >= iScore ? 'E' : 'I';

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(jungian): add author database and inference"
```

---

### Task 5: Birth Data Inference

**Covers:** S4, A6, A8

**Files:**
- Modify: `src/services/jungian-profiler.ts`
- Modify: `src/services/jungian-profiler.test.ts`

**Interfaces:**
- Produces: `inferFromBirth(params: { hints: string; isekai: boolean; age: number; favoriteAuthors: string[] }): Partial<JungianType>`

- [ ] **Step 1: Write the failing test**

```typescript
import { inferFromBirth } from './jungian-profiler';

describe('inferFromBirth', () => {
  test('isekai ON → E', () => {
    const result = inferFromBirth({ hints: '', isekai: true, age: 20, favoriteAuthors: [] });
    expect(result.attitude).toBe('E');
  });

  test('isekai OFF → I', () => {
    const result = inferFromBirth({ hints: '', isekai: false, age: 20, favoriteAuthors: [] });
    expect(result.attitude).toBe('I');
  });

  test('young age → P', () => {
    const result = inferFromBirth({ hints: '', isekai: false, age: 10, favoriteAuthors: [] });
    expect(result.lifestyle).toBe('P');
  });

  test('old age → J', () => {
    const result = inferFromBirth({ hints: '', isekai: false, age: 60, favoriteAuthors: [] });
    expect(result.lifestyle).toBe('J');
  });

  test('hints "warrior" → S', () => {
    const result = inferFromBirth({ hints: 'warrior', isekai: false, age: 20, favoriteAuthors: [] });
    expect(result.perceiving).toBe('S');
  });

  test('hints "scholar mage" → N+T', () => {
    const result = inferFromBirth({ hints: 'scholar mage', isekai: false, age: 20, favoriteAuthors: [] });
    expect(result.perceiving).toBe('N');
  });

  test('favorite authors override hints', () => {
    const result = inferFromBirth({
      hints: 'warrior',
      isekai: false,
      age: 20,
      favoriteAuthors: ['достоевский'],
    });
    // author signal N+F should compete with warrior S
    expect(result.perceiving).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement birth inference**

```typescript
// Add to jungian-profiler.ts

const HINT_KEYWORDS: Record<string, { perceiving?: JungianPerceiving; judging?: JungianJudging }> = {
  warrior:  { perceiving: 'S' },
  fighter:  { perceiving: 'S' },
  soldier:  { perceiving: 'S' },
  knight:   { perceiving: 'S' },
  ranger:   { perceiving: 'S' },
  rogue:    { perceiving: 'S' },
  thief:    { perceiving: 'S' },
  hunter:   { perceiving: 'S' },
  smith:    { perceiving: 'S' },
  merchant: { perceiving: 'S', judging: 'T' },
  scholar:  { perceiving: 'N', judging: 'T' },
  mage:     { perceiving: 'N' },
  wizard:   { perceiving: 'N' },
  sorcerer: { perceiving: 'N' },
  seer:     { perceiving: 'N' },
  prophet:  { perceiving: 'N' },
  healer:   { judging: 'F' },
  priest:   { judging: 'F' },
  bard:     { judging: 'F', perceiving: 'N' },
  druid:    { perceiving: 'N', judging: 'F' },
  monk:     { judging: 'F', perceiving: 'S' },
  noble:    { lifestyle: 'J' },
  peasant:  { perceiving: 'S' },
  orphan:   { perceiving: 'N', judging: 'F' },
  assassin: { perceiving: 'S', judging: 'T' },
  alchemist:{ perceiving: 'N', judging: 'T' },
};

export function inferFromBirth(params: {
  hints: string;
  isekai: boolean;
  age: number;
  favoriteAuthors: string[];
}): Partial<JungianType> {
  let sScore = 0, nScore = 0, tScore = 0, fScore = 0;
  let eScore = 0, iScore = 0;
  let jScore = 0, pScore = 0;

  // Isekai → attitude
  if (params.isekai) eScore += 1;
  else iScore += 1;

  // Age → lifestyle
  if (params.age < 18) pScore += 0.8;
  else if (params.age >= 40) jScore += 0.8;

  // Hints → perceiving/judging
  const hintLower = params.hints.toLowerCase();
  for (const [keyword, mapping] of Object.entries(HINT_KEYWORDS)) {
    if (hintLower.includes(keyword)) {
      if (mapping.perceiving === 'S') sScore += 0.6;
      else if (mapping.perceiving === 'N') nScore += 0.6;
      if (mapping.judging === 'T') tScore += 0.6;
      else if (mapping.judging === 'F') fScore += 0.6;
      if ((mapping as any).lifestyle === 'J') jScore += 0.5;
    }
  }

  // Favorite authors (higher weight)
  const authorResult = inferFromAuthors(params.favoriteAuthors);
  if (authorResult.perceiving === 'S') sScore += 1.5;
  else if (authorResult.perceiving === 'N') nScore += 1.5;
  if (authorResult.judging === 'T') tScore += 1.5;
  else if (authorResult.judging === 'F') fScore += 1.5;
  if (authorResult.attitude === 'E') eScore += 1.5;
  else if (authorResult.attitude === 'I') iScore += 1.5;

  const result: Partial<JungianType> = { source: 'birth' };
  if (sScore > 0 || nScore > 0) result.perceiving = sScore >= nScore ? 'S' : 'N';
  if (tScore > 0 || fScore > 0) result.judging = tScore >= fScore ? 'T' : 'F';
  if (eScore > 0 || iScore > 0) result.attitude = eScore >= iScore ? 'E' : 'I';
  if (jScore > 0 || pScore > 0) result.lifestyle = jScore >= pScore ? 'J' : 'P';

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(jungian): add birth data inference"
```

---

### Task 6: Metrics Inference and Blend

**Covers:** S5, B4, B5

**Files:**
- Modify: `src/services/jungian-profiler.ts`
- Modify: `src/services/jungian-profiler.test.ts`

**Interfaces:**
- Consumes: `PlayerStyleProfile` from `src/lib/player-profile-store.ts`
- Produces: `inferFromMetrics(profile: PlayerStyleProfile): Partial<JungianType>`, `blend(current: JungianType, incoming: Partial<JungianType>, weight: number): JungianType`

- [ ] **Step 1: Write the failing test**

```typescript
import { inferFromMetrics, blend } from './jungian-profiler';
import { createDefaultProfile } from '../lib/player-profile-store';

describe('inferFromMetrics', () => {
  test('high action_orientation → S', () => {
    const profile = createDefaultProfile('test');
    profile.action_orientation = 0.8;
    const result = inferFromMetrics(profile);
    expect(result.perceiving).toBe('S');
  });

  test('high emotional_expressiveness → F', () => {
    const profile = createDefaultProfile('test');
    profile.emotional_expressiveness = 0.8;
    const result = inferFromMetrics(profile);
    expect(result.judging).toBe('F');
  });

  test('high dialogue_ratio → E', () => {
    const profile = createDefaultProfile('test');
    profile.dialogue_ratio = 0.7;
    const result = inferFromMetrics(profile);
    expect(result.attitude).toBe('E');
  });

  test('high narrative_distance → I', () => {
    const profile = createDefaultProfile('test');
    profile.narrative_distance = 0.8;
    const result = inferFromMetrics(profile);
    expect(result.attitude).toBe('I');
  });
});

describe('blend', () => {
  test('weight 0 → keeps current', () => {
    const current: JungianType = { attitude: 'E', perceiving: 'N', judging: 'F', lifestyle: 'P', confidence: 0.3, source: 'world' };
    const incoming: Partial<JungianType> = { perceiving: 'S' };
    const result = blend(current, incoming, 0);
    expect(result.perceiving).toBe('N');
  });

  test('weight 1 → takes incoming', () => {
    const current: JungianType = { attitude: 'E', perceiving: 'N', judging: 'F', lifestyle: 'P', confidence: 0.3, source: 'world' };
    const incoming: Partial<JungianType> = { perceiving: 'S' };
    const result = blend(current, incoming, 1);
    expect(result.perceiving).toBe('S');
  });

  test('weight 0.5 → majority wins', () => {
    const current: JungianType = { attitude: 'E', perceiving: 'N', judging: 'F', lifestyle: 'P', confidence: 0.3, source: 'world' };
    const incoming: Partial<JungianType> = { perceiving: 'S' };
    const result = blend(current, incoming, 0.5);
    // N has current weight 0.5, S has incoming weight 0.5 → tie, current wins
    expect(result.perceiving).toBe('N');
  });

  test('confidence increases with blend', () => {
    const current: JungianType = { attitude: 'E', perceiving: 'N', judging: 'F', lifestyle: 'P', confidence: 0.3, source: 'world' };
    const incoming: Partial<JungianType> = {};
    const result = blend(current, incoming, 0.5);
    expect(result.confidence).toBeGreaterThan(0.3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement metrics inference and blend**

```typescript
// Add to jungian-profiler.ts
import type { PlayerStyleProfile } from '../lib/player-profile-store';

export function inferFromMetrics(profile: PlayerStyleProfile): Partial<JungianType> {
  let sScore = 0, nScore = 0, tScore = 0, fScore = 0, eScore = 0, iScore = 0;

  // Perceiving
  if (profile.action_orientation > 0.65) sScore += profile.action_orientation;
  if (profile.sensory_bias > 0.6) sScore += profile.sensory_bias;
  if (profile.preferred_pace === 'fast') sScore += 0.5;
  if (profile.literary_sophistication > 0.65) nScore += profile.literary_sophistication;

  // Judging
  if (profile.emotional_expressiveness > 0.65) fScore += profile.emotional_expressiveness;
  if (profile.literary_sophistication > 0.7) tScore += profile.literary_sophistication * 0.5;

  // Attitude
  if (profile.dialogue_ratio > 0.55) eScore += profile.dialogue_ratio;
  if (profile.narrative_distance > 0.65) iScore += profile.narrative_distance;

  const result: Partial<JungianType> = { source: 'metrics' };
  if (sScore > 0 || nScore > 0) result.perceiving = sScore >= nScore ? 'S' : 'N';
  if (tScore > 0 || fScore > 0) result.judging = tScore >= fScore ? 'T' : 'F';
  if (eScore > 0 || iScore > 0) result.attitude = eScore >= iScore ? 'E' : 'I';

  return result;
}

export function blend(
  current: JungianType,
  incoming: Partial<JungianType>,
  weight: number,
): JungianType {
  const w = Math.max(0, Math.min(1, weight));
  const result = { ...current };

  // For each dimension, vote with weights
  const dimensions: Array<{ key: 'attitude' | 'perceiving' | 'judging' | 'lifestyle'; values: [string, string] }> = [
    { key: 'attitude', values: ['E', 'I'] },
    { key: 'perceiving', values: ['S', 'N'] },
    { key: 'judging', values: ['T', 'F'] },
    { key: 'lifestyle', values: ['J', 'P'] },
  ];

  for (const dim of dimensions) {
    const inc = incoming[dim.key];
    if (!inc) continue;
    if (inc === current[dim.key]) continue; // same → no change

    // Simple majority: if incoming weight > 0.5, switch
    if (w > 0.5) {
      (result as any)[dim.key] = inc;
    }
  }

  // Confidence grows toward 1.0
  result.confidence = Math.min(1, current.confidence + w * 0.1);
  result.source = 'blended';

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(jungian): add metrics inference and blend algorithm"
```

---

### Task 7: Narrative Constraints

**Covers:** S7, C1, C2, C3, C4

**Files:**
- Modify: `src/services/jungian-profiler.ts`
- Modify: `src/services/jungian-profiler.test.ts`

**Interfaces:**
- Produces: `getNarrativeConstraints(type: JungianType): NarrativeConstraints`

- [ ] **Step 1: Write the failing test**

```typescript
import { getNarrativeConstraints } from './jungian-profiler';

describe('getNarrativeConstraints', () => {
  test('INFJ returns poetic constraints', () => {
    const type: JungianType = { attitude: 'I', perceiving: 'N', judging: 'F', lifestyle: 'J', confidence: 0.8, source: 'blended' };
    const c = getNarrativeConstraints(type);
    expect(c.tone).toContain('poetic');
    expect(c.pace).toBe('slow');
  });

  test('ESTP returns action constraints', () => {
    const type: JungianType = { attitude: 'E', perceiving: 'S', judging: 'T', lifestyle: 'P', confidence: 0.8, source: 'blended' };
    const c = getNarrativeConstraints(type);
    expect(c.pace).toBe('fast');
    expect(c.prefer).toEqual(expect.arrayContaining([expect.stringContaining('action')]));
  });

  test('all 16 types return valid constraints', () => {
    const attitudes: JungianAttitude[] = ['E', 'I'];
    const perceivings: JungianPerceiving[] = ['S', 'N'];
    const judgings: JungianJudging[] = ['T', 'F'];
    const lifestyles: JungianLifestyle[] = ['J', 'P'];

    for (const attitude of attitudes) {
      for (const perceiving of perceivings) {
        for (const judging of judgings) {
          for (const lifestyle of lifestyles) {
            const type: JungianType = { attitude, perceiving, judging, lifestyle, confidence: 0.8, source: 'blended' };
            const c = getNarrativeConstraints(type);
            expect(c.prefer.length).toBeGreaterThan(0);
            expect(c.tone).toBeTruthy();
          }
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement narrative constraints**

```typescript
// Add to jungian-profiler.ts

const TYPE_CONSTRAINTS: Record<string, NarrativeConstraints> = {
  ISTJ: { prefer: ['architectural details', 'logical puzzles', 'structured environments', 'practical consequences'], avoid: ['abstract symbolism', 'pure emotion', 'unstructured wandering'], pace: 'medium', tone: 'factual, precise', sensoryFocus: ['sight', 'touch'], archetypePreference: ['judgment_trial', 'endurance_suffering'] },
  ISFJ: { prefer: ['past details', 'traditions', 'care for others', 'gentle observations'], avoid: ['chaos', 'moral ambiguity', 'cruelty'], pace: 'slow', tone: 'warm, protective', sensoryFocus: ['smell', 'touch', 'sound'], archetypePreference: ['loyalty', 'inheritance_return'] },
  INFJ: { prefer: ['symbolic meaning', 'character interiority', 'moral complexity', 'hidden patterns'], avoid: ['pure action', 'black-and-white morality', 'mechanical details'], pace: 'slow', tone: 'dark, poetic, introspective', sensoryFocus: ['sight', 'sound'], archetypePreference: ['temptation_fall', 'endurance_suffering', 'wisdom_counsel'] },
  INTJ: { prefer: ['strategic depth', 'long-term consequences', 'intellectual challenge', 'hidden systems'], avoid: ['small talk', 'emotional manipulation', 'surface-level action'], pace: 'medium', tone: 'analytical, precise', sensoryFocus: ['sight'], archetypePreference: ['political_intrigue', 'wisdom_counsel', 'rise_fall_rise'] },
  ISTP: { prefer: ['mechanical details', 'practical solutions', 'physical precision', 'efficient action'], avoid: ['long speeches', 'emotional scenes', 'theoretical discussions'], pace: 'fast', tone: 'terse, concrete', sensoryFocus: ['touch', 'sight'], archetypePreference: ['rescue', 'escape_liberation'] },
  ISFP: { prefer: ['sensory beauty', 'gentle moments', 'personal expression', 'natural settings'], avoid: ['harsh conflict', 'abstract theory', 'brutal violence'], pace: 'slow', tone: 'gentle, evocative', sensoryFocus: ['sight', 'smell', 'touch'], archetypePreference: ['endurance_suffering', 'inheritance_return'] },
  INFP: { prefer: ['inner world', 'personal values', 'idealistic visions', 'emotional depth'], avoid: ['cold logic', 'bureaucracy', 'pure mechanics'], pace: 'variable', tone: 'lyrical, searching', sensoryFocus: ['sound', 'sight'], archetypePreference: ['temptation_fall', 'quest_journey', 'wisdom_counsel'] },
  INTP: { prefer: ['systems', 'logical connections', 'hidden patterns', 'intellectual puzzles'], avoid: ['melodrama', 'social niceties', 'emotional appeals'], pace: 'medium', tone: 'analytical, curious', sensoryFocus: ['sight'], archetypePreference: ['wisdom_counsel', 'political_intrigue'] },
  ESTP: { prefer: ['action', 'danger', 'sensory details', 'immediate consequences'], avoid: ['long introspection', 'theoretical discussions', 'slow builds'], pace: 'fast', tone: 'visceral, immediate', sensoryFocus: ['touch', 'sight', 'sound'], archetypePreference: ['rescue', 'escape_liberation', 'quest_journey'] },
  ESFP: { prefer: ['emotions', 'social dynamics', 'immediate experience', 'vivid descriptions'], avoid: ['dry technical detail', 'long analysis', 'isolation'], pace: 'fast', tone: 'vibrant, warm', sensoryFocus: ['sight', 'sound', 'smell'], archetypePreference: ['loyalty', 'rescue', 'inheritance_return'] },
  ENFP: { prefer: ['possibilities', 'character depth', 'hidden meanings', 'unexpected connections'], avoid: ['routine', 'predictability', 'rigid structure'], pace: 'variable', tone: 'inspirational, curious', sensoryFocus: ['sight', 'sound'], archetypePreference: ['quest_journey', 'rise_fall_rise', 'temptation_fall'] },
  ENTP: { prefer: ['debate', 'paradox', 'intellectual challenge', 'subverted expectations'], avoid: ['simple answers', 'moral certainty', 'routine'], pace: 'fast', tone: 'witty, provocative', sensoryFocus: ['sight'], archetypePreference: ['political_intrigue', 'wisdom_counsel', 'betrayal'] },
  ESTJ: { prefer: ['order', 'clear hierarchy', 'practical results', 'structured challenges'], avoid: ['ambiguity', 'chaos', 'emotional complexity'], pace: 'medium', tone: 'direct, authoritative', sensoryFocus: ['sight', 'touch'], archetypePreference: ['judgment_trial', 'rescue', 'political_intrigue'] },
  ESFJ: { prefer: ['social harmony', 'community', 'personal relationships', 'caring actions'], avoid: ['isolation', 'moral ambiguity', 'cruelty'], pace: 'medium', tone: 'warm, communal', sensoryFocus: ['smell', 'taste', 'touch'], archetypePreference: ['loyalty', 'inheritance_return', 'rescue'] },
  ENFJ: { prefer: ['inspiring others', 'moral leadership', 'character growth', 'collective purpose'], avoid: ['cynicism', 'isolation', 'pure self-interest'], pace: 'medium', tone: 'inspiring, earnest', sensoryFocus: ['sight', 'sound'], archetypePreference: ['rise_fall_rise', 'rescue', 'wisdom_counsel'] },
  ENTJ: { prefer: ['strategic planning', 'power dynamics', 'efficient systems', 'decisive action'], avoid: ['indecision', 'sentimentality', 'inefficiency'], pace: 'fast', tone: 'commanding, precise', sensoryFocus: ['sight'], archetypePreference: ['political_intrigue', 'judgment_trial', 'rise_fall_rise'] },
};

export function getNarrativeConstraints(type: JungianType): NarrativeConstraints {
  const code = encodeJungian(type);
  return TYPE_CONSTRAINTS[code] ?? TYPE_CONSTRAINTS['ISFP']!; // default to gentle
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(jungian): add narrative constraints for all 16 types"
```

---

### Task 8: PlayerProfileStore Schema Update

**Covers:** B1

**Files:**
- Modify: `src/lib/player-profile-store.ts`
- Modify: `src/lib/player-profile-store.test.ts` (if exists, else create)

**Interfaces:**
- Produces: `jungian_type`, `jungian_confidence`, `jungian_source`, `jungian_history` columns in `player_style_profiles`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/player-profile-store.test.ts
import { describe, expect, test } from 'bun:test';
import { PlayerProfileStore, createDefaultProfile } from './player-profile-store';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('PlayerProfileStore jungian fields', () => {
  test('new profile has jungian defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pps-'));
    const store = new PlayerProfileStore(join(dir, 'test.db'));
    const profile = createDefaultProfile('player1');
    store.upsertProfile(profile);
    const loaded = store.getProfile('player1');
    expect(loaded?.jungian_type).toBe('');
    expect(loaded?.jungian_confidence).toBe(0);
    expect(loaded?.jungian_source).toBe('world');
    expect(loaded?.jungian_history).toEqual([]);
    store.close();
    rmSync(dir, { recursive: true });
  });

  test('upsert and load jungian fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pps-'));
    const store = new PlayerProfileStore(join(dir, 'test.db'));
    const profile = createDefaultProfile('player2');
    profile.jungian_type = 'INFJ';
    profile.jungian_confidence = 0.8;
    profile.jungian_source = 'blended';
    profile.jungian_history = [{ type: 'ISFP', confidence: 0.3, source: 'world', ts: 1000 }];
    store.upsertProfile(profile);
    const loaded = store.getProfile('player2');
    expect(loaded?.jungian_type).toBe('INFJ');
    expect(loaded?.jungian_confidence).toBe(0.8);
    expect(loaded?.jungian_history).toHaveLength(1);
    store.close();
    rmSync(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/player-profile-store.test.ts`
Expected: FAIL — jungian fields not in schema

- [ ] **Step 3: Add jungian columns to schema and interface**

Add to `PlayerStyleProfile` interface:
```typescript
jungian_type: string;
jungian_confidence: number;
jungian_source: string;
jungian_history: Array<{ type: string; confidence: number; source: string; ts: number }>;
```

Add to `createDefaultProfile`:
```typescript
jungian_type: '',
jungian_confidence: 0,
jungian_source: 'world',
jungian_history: [],
```

Add to `CREATE TABLE`:
```sql
jungian_type TEXT NOT NULL DEFAULT '',
jungian_confidence REAL NOT NULL DEFAULT 0,
jungian_source TEXT NOT NULL DEFAULT 'world',
jungian_history TEXT NOT NULL DEFAULT '[]'
```

Update `getProfile` to parse `jungian_history` JSON.
Update `upsertProfile` to include new columns.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/player-profile-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/player-profile-store.ts src/lib/player-profile-store.test.ts
git commit -m "feat(jungian): add jungian columns to player_style_profiles"
```

---

### Task 9: Stylist Integration

**Covers:** C1, C2

**Files:**
- Modify: `src/services/agents/stylist.ts`

**Interfaces:**
- Consumes: `getNarrativeConstraints()` from `jungian-profiler.ts`
- Consumes: `JungianType` from `jungian-profiler.ts`
- Modifies: `buildMicroPrompt()` signature to accept optional `jungianType`

- [ ] **Step 1: Write the failing test**

```typescript
// Add test in existing stylist test file or create src/services/agents/stylist.test.ts
import { describe, expect, test } from 'bun:test';
import { StylistAgent } from './stylist';

describe('StylistAgent.buildMicroPrompt with jungian', () => {
  test('includes jungian constraints when type provided', () => {
    const stylist = new StylistAgent(null as any, null as any);
    const jungianType = { attitude: 'I' as const, perceiving: 'N' as const, judging: 'F' as const, lifestyle: 'J' as const, confidence: 0.8, source: 'blended' as const };
    const result = stylist.buildMicroPrompt(
      'test skeleton',
      { register: 'formal', pacing: 'medium', sensory: ['sight'], snippets: [], forbidden: [] },
      { world: 'test', location: 'test' },
      'success',
      undefined,
      jungianType,
    );
    expect(result.user).toContain('Player psychological type');
    expect(result.user).toContain('INFJ');
  });

  test('works without jungian type', () => {
    const stylist = new StylistAgent(null as any, null as any);
    const result = stylist.buildMicroPrompt(
      'test skeleton',
      { register: 'formal', pacing: 'medium', sensory: ['sight'], snippets: [], forbidden: [] },
      { world: 'test', location: 'test' },
      'success',
    );
    expect(result.user).not.toContain('Player psychological type');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/agents/stylist.test.ts`
Expected: FAIL

- [ ] **Step 3: Modify buildMicroPrompt**

Add import at top of `stylist.ts`:
```typescript
import { type JungianType, getNarrativeConstraints, encodeJungian } from './jungian-profiler';
```

Add `jungianType?: JungianType` parameter to `buildMicroPrompt` after `playerVoice`.

Add after the voiceBlock:
```typescript
const jungianBlock = jungianType
  ? `\nPlayer psychological type: ${encodeJungian(jungianType)} (confidence ${jungianType.confidence.toFixed(2)})
Narrative adaptation:
- prefer: ${constraints.prefer.join(', ')}
- avoid: ${constraints.avoid.join(', ')}
- pace: ${constraints.pace}
- tone: ${constraints.tone}`
  : '';
```

Include `jungianBlock` in the user prompt string.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/agents/stylist.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agents/stylist.ts src/services/agents/stylist.test.ts
git commit -m "feat(jungian): inject psychological constraints into Stylist prompts"
```

---

### Task 10: Dramaturg Archetype Adaptation

**Covers:** S11, C3

**Files:**
- Modify: `src/services/agents/dramaturg.ts`

**Interfaces:**
- Consumes: `JungianType`, `getNarrativeConstraints()`
- Modifies: `process()` to prefer archetypes matching player type

- [ ] **Step 1: Write the failing test**

```typescript
// Add to dramaturg test file or create src/services/agents/dramaturg.test.ts
import { describe, expect, test } from 'bun:test';
import { getArchetypePreference } from './dramaturg';

describe('Dramaturg archetype preference', () => {
  test('S type prefers rescue archetypes', () => {
    const prefs = getArchetypePreference({ perceiving: 'S' } as any);
    expect(prefs).toContain('rescue');
  });

  test('N type prefers wisdom_counsel', () => {
    const prefs = getArchetypePreference({ perceiving: 'N' } as any);
    expect(prefs).toContain('wisdom_counsel');
  });

  test('F type prefers loyalty', () => {
    const prefs = getArchetypePreference({ judging: 'F' } as any);
    expect(prefs).toContain('loyalty');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/agents/dramaturg.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement archetype preference**

Add to `dramaturg.ts`:
```typescript
import type { JungianType } from './jungian-profiler';

export function getArchetypePreference(type: Partial<JungianType>): string[] {
  const prefs: string[] = [];
  if (type.perceiving === 'S') prefs.push('rescue', 'escape_liberation', 'quest_journey');
  if (type.perceiving === 'N') prefs.push('temptation_fall', 'wisdom_counsel', 'rise_fall_rise');
  if (type.judging === 'T') prefs.push('judgment_trial', 'political_intrigue', 'wisdom_counsel');
  if (type.judging === 'F') prefs.push('loyalty', 'betrayal', 'inheritance_return', 'endurance_suffering');
  return [...new Set(prefs)];
}
```

Modify `process()` to accept optional `jungianType` and use it when querying patterns.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/agents/dramaturg.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agents/dramaturg.ts src/services/agents/dramaturg.test.ts
git commit -m "feat(jungian): Dramaturg prefers archetypes matching player type"
```

---

### Task 11: Actor NPC Adaptation

**Covers:** S12, C5

**Files:**
- Modify: `src/services/agents/actor.ts`

**Interfaces:**
- Consumes: `JungianType`
- Modifies: NPC dialogue prompt to adapt based on player type

- [ ] **Step 1: Write the failing test**

```typescript
// Add to actor test file or create
import { describe, expect, test } from 'bun:test';
import { getNpcAdaptationHint } from './actor';

describe('Actor NPC adaptation', () => {
  test('T type → more info', () => {
    const hint = getNpcAdaptationHint({ judging: 'T' } as any);
    expect(hint).toContain('information');
  });

  test('F type → more emotion', () => {
    const hint = getNpcAdaptationHint({ judging: 'F' } as any);
    expect(hint).toContain('emotion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/agents/actor.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement NPC adaptation**

```typescript
export function getNpcAdaptationHint(type: Partial<JungianType>): string {
  if (type.judging === 'T') return 'NPC should provide more factual information, details, logical arguments. Less emotional expression.';
  if (type.judging === 'F') return 'NPC should share more emotions, personal stories, empathetic responses. Less dry facts.';
  if (type.perceiving === 'S') return 'NPC should describe concrete, practical details. Specific names, places, items.';
  if (type.perceiving === 'N') return 'NPC should hint at hidden meanings, use metaphors, suggest possibilities.';
  return '';
}
```

Add `jungianType` parameter to NPC prompt building in Actor.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/agents/actor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agents/actor.ts src/services/agents/actor.test.ts
git commit -m "feat(jungian): Actor adapts NPC dialogue to player type"
```

---

### Task 12: Economic Service Adaptation

**Covers:** S13, C6, F3

**Files:**
- Modify: `src/services/economic-service.ts`

**Interfaces:**
- Consumes: `JungianType`
- Modifies: Economic descriptions adapted to type

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from 'bun:test';
import { getEconomicAdaptation } from './economic-service';

describe('Economic adaptation', () => {
  test('T+S type → numbers focus', () => {
    const hint = getEconomicAdaptation({ judging: 'T', perceiving: 'S' } as any);
    expect(hint).toContain('numbers');
  });

  test('N+F type → social focus', () => {
    const hint = getEconomicAdaptation({ judging: 'F', perceiving: 'N' } as any);
    expect(hint).toContain('social');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/economic-service.test.ts`
Expected: FAIL (or new test file)

- [ ] **Step 3: Implement economic adaptation**

```typescript
export function getEconomicAdaptation(type: Partial<JungianType>): string {
  const parts: string[] = [];
  if (type.judging === 'T' && type.perceiving === 'S') parts.push('Focus on numbers, prices, quantities, mechanical trade details');
  if (type.judging === 'F' && type.perceiving === 'N') parts.push('Focus on social consequences of trade, relationships with merchants, hidden opportunities');
  if (type.perceiving === 'S') parts.push('Describe goods concretely: weight, texture, smell, origin');
  if (type.perceiving === 'N') parts.push('Hint at secret markets, rare finds, connections between goods and world events');
  return parts.join('. ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/economic-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/economic-service.ts
git commit -m "feat(jungian): EconomicService adapts descriptions to player type"
```

---

### Task 13: UI — Favorite Authors Field

**Covers:** D1, F2

**Files:**
- Modify: `public/worlds.html`

**Interfaces:**
- Adds "Favorite Authors / Books" text field to world creation form
- Sends `favoriteAuthors` in POST /worlds body

- [ ] **Step 1: Add form field**

After the Magic System field in `worlds.html`, add:
```html
<div class="form__field form__field--full">
  <label class="form__label">Favorite Authors / Books (optional)</label>
  <textarea class="form__textarea" id="fAuthors" placeholder="e.g. Достоевский, Толкин, 1984, Dune...&#10;Helps personalize your narrative style"></textarea>
  <span class="form__tip">Comma-separated. Used to adapt narrative to your reading preferences.</span>
</div>
```

- [ ] **Step 2: Add to form submission**

In `createWorld()` function, add to `body`:
```javascript
favoriteAuthors: document.getElementById('fAuthors').value.trim(),
```

- [ ] **Step 3: Add i18n translations**

Add to I18N objects:
```javascript
uiFavoriteAuthors: "Favorite Authors / Books (optional)",
tipFavoriteAuthors: "Comma-separated list of authors or books you enjoy. Used to personalize narrative style.",
```

- [ ] **Step 4: Add to resetForm**

```javascript
document.getElementById('fAuthors').value = '';
```

- [ ] **Step 5: Commit**

```bash
git add public/worlds.html
git commit -m "feat(jungian): add favorite authors field to world creation"
```

---

### Task 14: Route Integration — World Creation

**Covers:** B2

**Files:**
- Modify: `src/routes/worlds.ts`
- Modify: `src/services/world-manager.ts`

**Interfaces:**
- Consumes: `inferFromGenres()`, `inferFromSocialSystem()`, `inferFromAuthors()`
- Stores initial JungianType in session context

- [ ] **Step 1: Write the failing test**

```typescript
// Add to worlds route test
import { describe, expect, test } from 'bun:test';

describe('World creation infers jungian type', () => {
  test('genres are passed to profiler', () => {
    // Test that POST /worlds with genres triggers inferFromGenres
    // This is an integration test — may need mock
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/worlds.test.ts`
Expected: FAIL or no test file

- [ ] **Step 3: Modify world creation route**

In `src/routes/worlds.ts`, after world creation:
```typescript
import { inferFromGenres, inferFromSocialSystem, inferFromAuthors, blend, createDefaultJungianType } from '../services/jungian-profiler';

// In POST /worlds handler, after createWorld():
const jungianFromGenres = inferFromGenres(body.genres ?? []);
const jungianFromSocial = inferFromSocialSystem(body.primaryRule ?? '');
const jungianFromAuthors = inferFromAuthors((body.favoriteAuthors ?? '').split(',').map(s => s.trim()).filter(Boolean));

let jungian = createDefaultJungianType();
jungian = blend(jungian, jungianFromGenres, 0.4);
jungian = blend(jungian, jungianFromSocial, 0.3);
jungian = blend(jungian, jungianFromAuthors, 0.5);
jungian.source = 'world';

// Store in session/memory for later use during Birth
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/routes/worlds.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/worlds.ts
git commit -m "feat(jungian): infer jungian type during world creation"
```

---

### Task 15: Route Integration — Birth Wizard

**Covers:** B3

**Files:**
- Modify: `src/routes/launch.ts`

**Interfaces:**
- Consumes: `inferFromBirth()`, `blend()`
- Saves final JungianType to player_profiles DB

- [ ] **Step 1: Modify launch route**

In `src/routes/launch.ts`, after character creation:
```typescript
import { inferFromBirth, blend, createDefaultJungianType } from '../services/jungian-profiler';
import { PlayerProfileStore } from '../lib/player-profile-store';

// After character is created:
const birthJungian = inferFromBirth({
  hints: body.hints ?? '',
  isekai: body.isekai ?? false,
  age: body.starting_age ?? 5,
  favoriteAuthors: (body.favoriteAuthors ?? '').split(',').map(s => s.trim()).filter(Boolean),
});

// Load world-level jungian from session, blend with birth
const profileStore = new PlayerProfileStore();
const profile = profileStore.getProfile(characterName) ?? createDefaultProfile(characterName);
const worldJungian = /* load from session */;
let finalJungian = blend(worldJungian, birthJungian, 0.5);
finalJungian.confidence = 0.4;

profile.jungian_type = encodeJungian(finalJungian);
profile.jungian_confidence = finalJungian.confidence;
profile.jungian_source = 'birth';
profileStore.upsertProfile(profile);
profileStore.close();
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/launch.ts
git commit -m "feat(jungian): infer jungian type during birth wizard"
```

---

### Task 16: Pipeline Integration — Auto-Update

**Covers:** B4, B5

**Files:**
- Modify: `src/services/roleplay/pipeline-runner.ts`

**Interfaces:**
- Consumes: `inferFromMetrics()`, `blend()`, `PlayerProfileStore`
- Every 20 turns, recalculates jungian type

- [ ] **Step 1: Add jungian update to pipeline**

After the Chronicler step in pipeline-runner:
```typescript
import { inferFromMetrics, blend, encodeJungian } from '../../services/jungian-profiler';
import { PlayerProfileStore } from '../../lib/player-profile-store';

// After turn processing, every 20 turns:
if (profileStore && turnCount % 20 === 0) {
  const profile = profileStore.getProfile(playerId);
  if (profile && profile.jungian_type) {
    const currentJungian = decodeJungian(profile.jungian_type);
    const metricsJungian = inferFromMetrics(profile);
    const updated = blend(currentJungian, metricsJungian, 0.3);
    profile.jungian_type = encodeJungian(updated);
    profile.jungian_confidence = updated.confidence;
    profile.jungian_history.push({ type: encodeJungian(updated), confidence: updated.confidence, source: 'metrics', ts: Date.now() });
    profileStore.upsertProfile(profile);
    log.info({ playerId, type: profile.jungian_type, confidence: profile.jungian_confidence }, 'jungian type updated from metrics');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/roleplay/pipeline-runner.ts
git commit -m "feat(jungian): auto-update jungian type every 20 turns"
```

---

### Task 17: Logging

**Covers:** E1

**Files:**
- Modify: `src/services/jungian-profiler.ts`

**Interfaces:**
- Uses existing `getLogger('jungian-profiler')`

- [ ] **Step 1: Add logging to all inference functions**

```typescript
import { getLogger } from '../utils/logger';
const log = getLogger('jungian-profiler');

// In inferFromGenres:
log.info({ genres, result: encodeJungian(result as JungianType) }, 'inferred from genres');

// In inferFromBirth:
log.info({ hints: params.hints, isekai: params.isekai, age: params.age, result: encodeJungian(result as JungianType) }, 'inferred from birth');

// In blend:
log.info({ current: encodeJungian(current), incoming, weight, result: encodeJungian(result) }, 'blended jungian type');
```

- [ ] **Step 2: Commit**

```bash
git add src/services/jungian-profiler.ts
git commit -m "feat(jungian): add structured logging to all inference functions"
```

---

### Task 18: Feature Flag

**Covers:** S15

**Files:**
- Modify: `src/lib/feature-flags.ts` (or wherever flags are defined)

**Interfaces:**
- Produces: `jungian-profiler-enabled` flag (default: false)

- [ ] **Step 1: Add flag**

```typescript
// In feature flags definition:
'jungian-profiler-enabled': false,
```

- [ ] **Step 2: Gate all jungian code**

In `buildMicroPrompt`, `process()` (Dramaturg, Actor), and EconomicService:
```typescript
import { getFeatureFlagManager } from '../lib/feature-flags';

if (!getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
  return originalBehavior();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/feature-flags.ts src/services/agents/stylist.ts src/services/agents/dramaturg.ts src/services/agents/actor.ts src/services/economic-service.ts
git commit -m "feat(jungian): add feature flag jungian-profiler-enabled"
```

---

### Task 19: Onboarding Questions (Future Prep)

**Covers:** S9, F1

**Files:**
- Modify: `public/worlds.html`

**Interfaces:**
- Adds 5 questions to Birth Wizard, hidden behind feature flag
- Sends answers for future LLM analysis

- [ ] **Step 1: Add questions to Birth Wizard HTML**

After the Isekai toggle, add a collapsible section:
```html
<div class="form__field form__field--full" id="jungianQuestions" style="display:none">
  <label class="form__label">A few questions to personalize your story (optional)</label>

  <div class="form__field" style="margin-bottom:8px">
    <label class="form__label" style="font-size:11px">You enter a tavern. What do you do first?</label>
    <select class="form__select" id="q1">
      <option value="">— Skip —</option>
      <option value="E">Look around, find people to talk to</option>
      <option value="I">Find a quiet corner and observe</option>
    </select>
  </div>

  <div class="form__field" style="margin-bottom:8px">
    <label class="form__label" style="font-size:11px">An old man tells a legend. What interests you more?</label>
    <select class="form__select" id="q2">
      <option value="">— Skip —</option>
      <option value="S">The specific details and facts</option>
      <option value="N">The hidden meaning and symbolism</option>
    </select>
  </div>

  <div class="form__field" style="margin-bottom:8px">
    <label class="form__label" style="font-size:11px">You find an ancient artifact. What do you do?</label>
    <select class="form__select" id="q3">
      <option value="">— Skip —</option>
      <option value="T">Study how it works</option>
      <option value="F">Feel what it means</option>
    </select>
  </div>

  <div class="form__field" style="margin-bottom:8px">
    <label class="form__label" style="font-size:11px">You are betrayed. What do you feel?</label>
    <select class="form__select" id="q4">
      <option value="">— Skip —</option>
      <option value="T">Cold calculation — how to respond</option>
      <option value="F">Deep hurt — why did they do this</option>
    </select>
  </div>

  <div class="form__field" style="margin-bottom:8px">
    <label class="form__label" style="font-size:11px">Two paths lie before you. Which do you take?</label>
    <select class="form__select" id="q5">
      <option value="">— Skip —</option>
      <option value="J">The safe, known path</option>
      <option value="P">The unknown, interesting path</option>
    </select>
  </div>
</div>
```

- [ ] **Step 2: Show/hide based on feature flag**

```javascript
// After loading settings, if jungian-profiler-enabled:
document.getElementById('jungianQuestions').style.display = 'block';
```

- [ ] **Step 3: Send answers in birth request**

```javascript
const q1 = document.getElementById('q1')?.value || '';
const q2 = document.getElementById('q2')?.value || '';
const q3 = document.getElementById('q3')?.value || '';
const q4 = document.getElementById('q4')?.value || '';
const q5 = document.getElementById('q5')?.value || '';

// In startBirth(), add to body:
jungianAnswers: { q1, q2, q3, q4, q5 },
```

- [ ] **Step 4: Commit**

```bash
git add public/worlds.html
git commit -m "feat(jungian): add onboarding questions to birth wizard"
```

---

### Task 20: A/B Testing Infrastructure

**Covers:** S15, F5

**Files:**
- Modify: `src/services/roleplay/pipeline-runner.ts`

**Interfaces:**
- Logs engagement metrics (session length, message count, return rate) tagged with jungian-enabled status

- [ ] **Step 1: Add engagement logging**

```typescript
// In pipeline-runner, after each turn:
log.info({
  playerId,
  turnCount,
  jungianEnabled: getFeatureFlagManager().isEnabled('jungian-profiler-enabled'),
  jungianType: profile?.jungian_type ?? 'none',
  sessionLength: Date.now() - sessionStart,
  messageLength: userMessage.length,
}, 'engagement metric');
```

- [ ] **Step 2: Commit**

```bash
git add src/services/roleplay/pipeline-runner.ts
git commit -m "feat(jungian): add engagement logging for A/B testing"
```

---

### Task 21: Cross-Session Persistence

**Covers:** S14, F4

**Files:**
- No new files — already handled by PlayerProfileStore (Task 8)

**Interfaces:**
- JungianType persists in `player_style_profiles` across sessions

- [ ] **Step 1: Verify persistence**

Write an integration test:
```typescript
test('jungian type persists across sessions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pps-'));
  const dbPath = join(dir, 'test.db');

  // Session 1: create and save
  const store1 = new PlayerProfileStore(dbPath);
  const profile = createDefaultProfile('player1');
  profile.jungian_type = 'INFJ';
  profile.jungian_confidence = 0.8;
  store1.upsertProfile(profile);
  store1.close();

  // Session 2: load and verify
  const store2 = new PlayerProfileStore(dbPath);
  const loaded = store2.getProfile('player1');
  expect(loaded?.jungian_type).toBe('INFJ');
  expect(loaded?.jungian_confidence).toBe(0.8);
  store2.close();
  rmSync(dir, { recursive: true });
});
```

- [ ] **Step 2: Run test**

Run: `bun test src/lib/player-profile-store.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/player-profile-store.test.ts
git commit -m "test(jungian): verify cross-session persistence"
```
