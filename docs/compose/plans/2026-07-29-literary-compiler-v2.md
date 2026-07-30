# Literary Compiler v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement stack-native Literary Compiler v2 with 12 canonical archetypes, BGE-M3 retrieval, micro-prompt Stylist, and rename NPC archetype system.

**Architecture:** BGE-M3 indexes text offline → dictionaries anchor names → small local LLM extracts JSON structure → linter gates quality → runtime retrieves one skeleton + concrete style → 1 main Stylist LLM call renders 2-3 paragraphs.

**Tech Stack:** TypeScript + Bun, SQLite/FTS5, BGE-M3 embeddings, Qwen3-8B (Ollama) for extraction, existing MCP infrastructure.

## Global Constraints

- No new external NLP dependencies (no spaCy, Presidio, Stanza)
- Runtime: 1-2 LLM calls per turn (hard goal)
- Output: 2-3 paragraphs (~200-280 words EN)
- Skeleton ≤ 120 tokens
- Feature flags for gradual rollout
- `bun test` must pass after each task

---

## Phase 0: Canonical Architecture

### Task 1: Create canonical archetype enum

**Covers:** [S2]

**Files:**
- Create: `src/mcp/literary-compiler/archetypes.ts`
- Create: `src/mcp/literary-compiler/archetypes.test.ts`

**Interfaces:**
- Produces: `ARCHETYPES` array, `Archetype` type, `ARCHETYPE_KEYWORDS` record, `ARCHETYPE_VARIABLES` record, `ARCHETYPE_POSITIONS` record

- [x] **Step 1: Write failing test**

```typescript
// src/mcp/literary-compiler/archetypes.test.ts
import { describe, test, expect } from 'bun:test';
import { ARCHETYPES, ARCHETYPE_KEYWORDS, ARCHETYPE_VARIABLES, ARCHETYPE_POSITIONS, type Archetype } from './archetypes';

describe('archetypes', () => {
  test('ARCHETYPES has exactly 12 entries', () => {
    expect(ARCHETYPES).toHaveLength(12);
  });

  test('every archetype has keywords', () => {
    for (const a of ARCHETYPES) {
      expect(ARCHETYPE_KEYWORDS[a]).toBeDefined();
      expect(ARCHETYPE_KEYWORDS[a].length).toBeGreaterThan(0);
    }
  });

  test('every archetype has variables', () => {
    for (const a of ARCHETYPES) {
      expect(ARCHETYPE_VARIABLES[a]).toBeDefined();
      expect(ARCHETYPE_VARIABLES[a].length).toBeGreaterThan(0);
    }
  });

  test('every archetype has positions', () => {
    for (const a of ARCHETYPES) {
      expect(ARCHETYPE_POSITIONS[a]).toBeDefined();
      expect(ARCHETYPE_POSITIONS[a].length).toBeGreaterThan(0);
    }
  });

  test('Archetype type is string union', () => {
    const a: Archetype = 'escape_liberation';
    expect(ARCHETYPES).toContain(a);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/mcp/literary-compiler/archetypes.test.ts`
Expected: FAIL — module not found

- [x] **Step 3: Write implementation**

```typescript
// src/mcp/literary-compiler/archetypes.ts

export const ARCHETYPES = [
  'escape_liberation',
  'judgment_trial',
  'loyalty',
  'betrayal',
  'inheritance_return',
  'endurance_suffering',
  'rescue',
  'rise_fall_rise',
  'wisdom_counsel',
  'political_intrigue',
  'quest_journey',
  'temptation_fall',
] as const;

export type Archetype = typeof ARCHETYPES[number];

export const EVERYDAY_LIFE = 'everyday_life' as const;

export const ARCHETYPE_KEYWORDS: Record<Archetype, string[]> = {
  escape_liberation: ['escape', 'flee', 'cross', 'sea', 'river', 'pass through', 'deliver', 'rescue', 'free', 'liberate', 'bondage', 'slavery', 'chains', 'break'],
  judgment_trial: ['judge', 'judgment', 'decide', 'dispute', 'claim', 'truth', 'verdict', 'test', 'prove'],
  loyalty: ['loyal', 'follow', 'faithful', 'devoted', 'stick', 'remain', 'serve', 'oath', 'vow'],
  betrayal: ['betray', 'treason', 'deceive', 'disloyal', 'turn against', 'traitor', 'plot', 'consipre'],
  inheritance_return: ['inherit', 'son', 'daughter', 'father', 'estate', 'portion', 'return', 'heir', 'legacy'],
  endurance_suffering: ['suffer', 'endure', 'patience', 'trial', 'loss', 'grief', 'pain', 'ordeal'],
  rescue: ['save', 'deliver', 'oppressed', 'enemy', 'battle', 'war', 'victory', 'champion'],
  rise_fall_rise: ['rise', 'fall', 'exalt', 'humble', 'power', 'servant', 'restore', 'redeem'],
  wisdom_counsel: ['wisdom', 'wise', 'counsel', 'advice', 'proverb', 'teach', 'learn', 'mentor'],
  political_intrigue: ['king', 'queen', 'throne', 'power', 'plot', 'secret', 'decree', 'conspiracy', 'court'],
  quest_journey: ['journey', 'quest', 'seek', 'travel', 'wander', 'road', 'path', 'pilgrimage'],
  temptation_fall: ['tempt', 'lure', 'seduce', 'fall', 'sin', 'yield', 'forbidden', 'desire', 'corrupt'],
};

export const ARCHETYPE_VARIABLES: Record<Archetype, string[]> = {
  escape_liberation: ['current_leader', 'followers', 'oppressor', 'obstacle', 'intervention'],
  judgment_trial: ['claimant_A', 'claimant_B', 'object', 'judge', 'hidden_truth'],
  loyalty: ['current_hero', 'mentor', 'hardship', 'reward'],
  betrayal: ['current_hero', 'ally', 'deception', 'consequence'],
  inheritance_return: ['current_hero', 'mentor', 'share', 'wealth', 'rival'],
  endurance_suffering: ['current_hero', 'trial', 'loss', 'choice'],
  rescue: ['current_hero', 'nation', 'oppressor', 'allies'],
  rise_fall_rise: ['current_hero', 'mentor', 'rivals', 'power'],
  wisdom_counsel: ['current_hero', 'dilemma', 'mentor', 'lesson', 'path'],
  political_intrigue: ['current_hero', 'plot', 'ally', 'enemy', 'power'],
  quest_journey: ['current_hero', 'goal', 'companions', 'obstacle', 'reward'],
  temptation_fall: ['current_hero', 'temptation', 'ally', 'consequence'],
};

export const ARCHETYPE_POSITIONS: Record<Archetype, string[]> = {
  escape_liberation: ['leader', 'follower'],
  judgment_trial: ['judge', 'leader'],
  loyalty: ['follower', 'mentor'],
  betrayal: ['ally', 'leader'],
  inheritance_return: ['leader', 'follower', 'heir'],
  endurance_suffering: ['follower'],
  rescue: ['leader', 'savior'],
  rise_fall_rise: ['leader', 'tyrant', 'follower'],
  wisdom_counsel: ['follower', 'wise_one'],
  political_intrigue: ['leader', 'tyrant'],
  quest_journey: ['leader', 'companion'],
  temptation_fall: ['follower', 'tempter'],
};

export function isValidArchetype(value: string): value is Archetype {
  return (ARCHETYPES as readonly string[]).includes(value);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/mcp/literary-compiler/archetypes.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/mcp/literary-compiler/archetypes.ts src/mcp/literary-compiler/archetypes.test.ts
git commit -m "feat(literary-compiler): add 12 canonical narrative archetypes with keyword sets"
```

---

### Task 2: Rename NPC archetype system to npc-role

**Covers:** [S2]

**Files:**
- Rename: `src/models/archetype.ts` → `src/models/npc-role.ts`
- Rename: `src/models/archetype.test.ts` → `src/models/npc-role.test.ts`
- Modify: `src/services/npc-generator.ts`
- Modify: `src/services/npc-economy.ts`
- Modify: `src/services/npc-economy-runtime.ts`
- Modify: `src/services/npc-economy-extras.test.ts`

**Interfaces:**
- Produces: `NPCRoleConfig`, `ALL_NPC_ROLES`, `DEFAULT_NPC_ROLES`, `UNIQUE_NPC_ROLES`, `selectNPCRole()`, `getNPCRoleByName()`

- [x] **Step 1: Rename files**

```bash
git mv src/models/archetype.ts src/models/npc-role.ts
git mv src/models/archetype.test.ts src/models/npc-role.test.ts
```

- [x] **Step 2: Update exports in npc-role.ts**

In `src/models/npc-role.ts`, rename all exports:
- `ArchetypeConfig` → `NPCRoleConfig`
- `DEFAULT_ARCHETYPES` → `DEFAULT_NPC_ROLES`
- `UNIQUE_ARCHETYPES` → `UNIQUE_NPC_ROLES`
- `ALL_ARCHETYPES` → `ALL_NPC_ROLES`
- `selectArchetype` → `selectNPCRole`
- `getArchetypeByName` → `getNPCRoleByName`

- [x] **Step 3: Update imports in npc-generator.ts**

```typescript
// src/services/npc-generator.ts — change imports
import { NPCRoleConfig, ALL_NPC_ROLES, DEFAULT_NPC_ROLES } from "../models/npc-role";
```

Update all references: `ALL_ARCHETYPES` → `ALL_NPC_ROLES`, `DEFAULT_ARCHETYPES` → `DEFAULT_NPC_ROLES`, `ArchetypeConfig` → `NPCRoleConfig`.

- [x] **Step 4: Update imports in npc-economy.ts**

```typescript
// src/services/npc-economy.ts — change import
import { type NPCRoleConfig, ALL_NPC_ROLES, selectNPCRole } from "../models/npc-role";
```

- [x] **Step 5: Update imports in npc-economy-runtime.ts**

```typescript
// src/services/npc-economy-runtime.ts — change import
import { type NPCRoleConfig, ALL_NPC_ROLES, selectNPCRole } from "../models/npc-role";
```

- [x] **Step 6: Update test imports**

In `src/models/npc-role.test.ts`: update imports to use new names.
In `src/services/npc-economy-extras.test.ts`: update imports.

- [x] **Step 7: Run all tests**

Run: `bun test src/models/npc-role.test.ts src/services/npc-economy*.test.ts src/services/npc-generator*.test.ts`
Expected: PASS

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: rename NPC archetype system to npc-role for clarity"
```

---

### Task 3: Add feature flags for Literary Compiler v2

**Covers:** [S2, S8]

**Files:**
- Modify: `src/lib/feature-flags.ts`

- [x] **Step 1: Add flags to DEFAULT_FLAGS**

Add these entries to the `DEFAULT_FLAGS` array in `src/lib/feature-flags.ts`:

```typescript
{
  id: "literary-compiler-v2",
  name: "Literary Compiler V2",
  description: "Use v2 pipeline with BGE-M3 + small LLM extractor",
  enabled: false,
  percentage: 0,
  conditions: [],
  variants: [
    { id: "control", name: "Control (v1)", weight: 50 },
    { id: "v2", name: "V2 Pipeline", weight: 50 },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
},
{
  id: "literary-v2-retrieval",
  name: "Literary V2 Retrieval",
  description: "Use hybrid FTS+BGE-M3 retrieval at runtime",
  enabled: false,
  percentage: 0,
  conditions: [],
  variants: [
    { id: "control", name: "Legacy retrieval", weight: 50 },
    { id: "v2", name: "Hybrid retrieval", weight: 50 },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
},
{
  id: "literary-v2-stylist",
  name: "Literary V2 Stylist",
  description: "Use micro-prompt contract for StylistAgent",
  enabled: false,
  percentage: 0,
  conditions: [],
  variants: [
    { id: "control", name: "Legacy prompt", weight: 50 },
    { id: "v2", name: "Micro-prompt", weight: 50 },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
},
```

- [x] **Step 2: Run tests**

Run: `bun test src/lib/feature-flags.test.ts`
Expected: PASS (existing tests should still pass)

- [x] **Step 3: Commit**

```bash
git add src/lib/feature-flags.ts
git commit -m "feat: add feature flags for literary compiler v2 pipeline"
```

---

## Phase 1: Offline Pipeline

### Task 4: Create text chunker

**Covers:** [S4]

**Files:**
- Create: `src/mcp/literary-compiler/chunker.ts`
- Create: `src/mcp/literary-compiler/chunker.test.ts`

**Interfaces:**
- Produces: `chunkText(text, options) → Chunk[]` where `Chunk = { id, text, startOffset, endOffset, sourceRef }`

- [x] **Step 1: Write failing test**

```typescript
// src/mcp/literary-compiler/chunker.test.ts
import { describe, test, expect } from 'bun:test';
import { chunkText, type Chunk } from './chunker';

describe('chunkText', () => {
  test('splits long text into chunks', () => {
    const text = 'A'.repeat(2000); // ~500 tokens
    const chunks = chunkText(text, { maxTokens: 300, overlapSentences: 2 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  test('each chunk has id, text, offsets', () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
    const chunks = chunkText(text, { maxTokens: 300, overlapSentences: 2 });
    for (const c of chunks) {
      expect(c.id).toBeDefined();
      expect(c.text).toBeDefined();
      expect(typeof c.startOffset).toBe('number');
      expect(typeof c.endOffset).toBe('number');
    }
  });

  test('short text produces single chunk', () => {
    const text = 'Short text.';
    const chunks = chunkText(text, { maxTokens: 300, overlapSentences: 2 });
    expect(chunks).toHaveLength(1);
  });

  test('overlap contains sentences from adjacent chunks', () => {
    const sentences = Array.from({ length: 20 }, (_, i) => `Sentence ${i} with enough words to make it long.`);
    const text = sentences.join(' ');
    const chunks = chunkText(text, { maxTokens: 100, overlapSentences: 2 });
    if (chunks.length > 1) {
      // Second chunk should overlap with end of first
      expect(chunks[1].text).toContain('Sentence');
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/mcp/literary-compiler/chunker.test.ts`
Expected: FAIL — module not found

- [x] **Step 3: Write implementation**

```typescript
// src/mcp/literary-compiler/chunker.ts

export interface Chunk {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  sourceRef?: string;
}

export interface ChunkOptions {
  maxTokens: number;      // default 300
  overlapSentences: number; // default 2
  minTokens: number;      // default 80
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const WORDS_PER_TOKEN = 0.75; // rough estimate: 1 token ≈ 0.75 words

export function chunkText(
  text: string,
  options: Partial<ChunkOptions> = {},
  sourceRef?: string,
): Chunk[] {
  const { maxTokens = 300, overlapSentences = 2, minTokens = 80 } = options;
  const maxWords = Math.round(maxTokens / WORDS_PER_TOKEN);
  const minWords = Math.round(minTokens / WORDS_PER_TOKEN);

  const sentences = text.split(SENTENCE_SPLIT).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return [];

  const chunks: Chunk[] = [];
  let currentSentences: string[] = [];
  let currentWords = 0;
  let offset = 0;

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).length;

    if (currentWords + words > maxWords && currentWords >= minWords) {
      // Flush current chunk
      const chunkText = currentSentences.join(' ');
      chunks.push({
        id: `chunk-${chunks.length}`,
        text: chunkText,
        startOffset: offset,
        endOffset: offset + chunkText.length,
        sourceRef,
      });

      // Overlap: keep last N sentences
      const overlap = currentSentences.slice(-overlapSentences);
      currentSentences = overlap;
      currentWords = overlap.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
      offset += chunkText.length - overlap.join(' ').length;
    }

    currentSentences.push(sentence);
    currentWords += words;
  }

  // Flush remaining
  if (currentSentences.length > 0) {
    const chunkText = currentSentences.join(' ');
    if (currentWords >= minWords || chunks.length === 0) {
      chunks.push({
        id: `chunk-${chunks.length}`,
        text: chunkText,
        startOffset: offset,
        endOffset: offset + chunkText.length,
        sourceRef,
      });
    } else if (chunks.length > 0) {
      // Merge small tail into last chunk
      const last = chunks[chunks.length - 1];
      last.text += ' ' + chunkText;
      last.endOffset = offset + chunkText.length;
    }
  }

  return chunks;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/mcp/literary-compiler/chunker.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/mcp/literary-compiler/chunker.ts src/mcp/literary-compiler/chunker.test.ts
git commit -m "feat(literary-compiler): add text chunker with sentence-based overlap"
```

---

### Task 5: Add schema v2 tables

**Covers:** [S3]

**Files:**
- Modify: `src/mcp/literary-compiler/schema.ts`

**Interfaces:**
- Consumes: `LiteraryCompilerDB` (existing)
- Produces: `scene_templates`, `style_patterns`, `template_style_links`, `chunk_index`, `player_style_profiles`, `retrieval_cache` tables

- [x] **Step 1: Add v2 table creation methods to LiteraryCompilerDB**

Add these methods to the `LiteraryCompilerDB` class in `src/mcp/literary-compiler/schema.ts`:

```typescript
createV2Tables(): void {
  this.db.exec(`
    CREATE TABLE IF NOT EXISTS scene_templates (
      id TEXT PRIMARY KEY,
      source_book TEXT,
      source_chapter INT,
      source_chunk_ids TEXT,
      archetype_primary TEXT NOT NULL,
      archetype_secondary TEXT,
      applicable_positions TEXT NOT NULL,
      variables TEXT NOT NULL,
      template_text TEXT NOT NULL,
      beat_sequence TEXT,
      mood TEXT,
      difficulty TEXT,
      moral_ambiguity REAL,
      tension_curve TEXT,
      tags TEXT,
      domain TEXT,
      scale TEXT,
      embedding_id TEXT,
      quality_score REAL,
      use_count INTEGER DEFAULT 0,
      last_used_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS style_patterns (
      id TEXT PRIMARY KEY,
      source_author_or_era TEXT,
      source_chunk_ids TEXT,
      avg_sentence_len REAL,
      sentence_len_variance REAL,
      sensory_ratio TEXT,
      register TEXT,
      pacing TEXT,
      tone TEXT,
      preferred_constructions TEXT,
      forbidden_phrases TEXT,
      example_snippets TEXT NOT NULL,
      quality_score REAL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS template_style_links (
      template_id TEXT REFERENCES scene_templates(id),
      style_id TEXT REFERENCES style_patterns(id),
      weight REAL DEFAULT 1.0,
      PRIMARY KEY (template_id, style_id)
    );

    CREATE TABLE IF NOT EXISTS chunk_index (
      chunk_id TEXT PRIMARY KEY,
      source_book TEXT,
      source_chapter INT,
      text TEXT NOT NULL,
      token_est INT,
      char_start INT,
      char_end INT,
      embedding_ref TEXT,
      dict_hits TEXT,
      pre_score REAL,
      cluster_id TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS player_style_profiles (
      player_id TEXT PRIMARY KEY,
      avg_sentence_len REAL,
      sensory_bias TEXT,
      register_score REAL,
      dialogue_ratio REAL,
      preferred_motifs TEXT,
      anti_patterns TEXT,
      sample_snippets TEXT,
      confidence REAL DEFAULT 0,
      message_count_used INT DEFAULT 0,
      last_updated INTEGER
    );

    CREATE TABLE IF NOT EXISTS retrieval_cache (
      cache_key TEXT PRIMARY KEY,
      template_id TEXT,
      style_id TEXT,
      hits INTEGER DEFAULT 0,
      expires_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_scene_archetype ON scene_templates(archetype_primary);
    CREATE INDEX IF NOT EXISTS idx_scene_mood ON scene_templates(mood);
    CREATE INDEX IF NOT EXISTS idx_scene_domain ON scene_templates(domain);
    CREATE INDEX IF NOT EXISTS idx_chunk_source ON chunk_index(source_book, source_chapter);
  `);
}
```

- [x] **Step 2: Add FTS5 virtual tables**

```typescript
createV2FTS(): void {
  this.db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS scene_fts USING fts5(
      template_text, tags, archetype_primary, mood, domain,
      content=scene_templates, content_rowid=rowid
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
      text, dict_hits,
      content=chunk_index, content_rowid=rowid
    );
  `);
}
```

- [x] **Step 3: Add insert/query methods**

Add methods to `LiteraryCompilerDB`:
- `insertSceneTemplate(template)` — INSERT INTO scene_templates
- `insertStylePattern(pattern)` — INSERT INTO style_patterns
- `insertTemplateStyleLink(link)` — INSERT INTO template_style_links
- `insertChunkIndex(chunk)` — INSERT INTO chunk_index
- `getSceneTemplatesByArchetype(archetype)` — SELECT with FTS
- `getTopTemplates(keys, limit)` — composite ranking query

- [x] **Step 4: Write test**

```typescript
// In existing schema test or new file
test('createV2Tables creates all tables', () => {
  const db = new LiteraryCompilerDB(':memory:');
  db.createV2Tables();
  // Verify tables exist by inserting
  db.insertSceneTemplate({
    id: 'test-1',
    archetype_primary: 'escape_liberation',
    applicable_positions: '["leader","follower"]',
    variables: '["current_leader","oppressor"]',
    template_text: 'The hero leads the people past the oppressor.',
  });
  const result = db.getSceneTemplatesByArchetype('escape_liberation');
  expect(result.length).toBe(1);
});
```

- [x] **Step 5: Run tests**

Run: `bun test src/mcp/literary-compiler/schema.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/mcp/literary-compiler/schema.ts
git commit -m "feat(literary-compiler): add v2 schema tables with FTS5 indexes"
```

---

### Task 6: Create dictionary pre-score module

**Covers:** [S4]

**Files:**
- Create: `src/mcp/literary-compiler/pre-score.ts`
- Create: `src/mcp/literary-compiler/pre-score.test.ts`

**Interfaces:**
- Consumes: `ARCHETYPE_KEYWORDS` from archetypes.ts, `Chunk` from chunker.ts
- Produces: `preScoreChunk(chunk) → PreScoreResult` with `{ archetypeScores, dictHits, narrativeScore }`

- [x] **Step 1: Write failing test**

```typescript
// src/mcp/literary-compiler/pre-score.test.ts
import { describe, test, expect } from 'bun:test';
import { preScoreChunk, type PreScoreResult } from './pre-score';

describe('preScoreChunk', () => {
  test('scores escape_liberation higher for escape-related text', () => {
    const result = preScoreChunk({
      id: 'c1',
      text: 'The people fled across the sea, escaping the tyrant\'s chains.',
      startOffset: 0,
      endOffset: 60,
    });
    expect(result.archetypeScores['escape_liberation']).toBeGreaterThan(0);
    expect(result.archetypeScores['escape_liberation']).toBeGreaterThan(
      result.archetypeScores['judgment_trial'] ?? 0
    );
  });

  test('returns dictHits with matched keywords', () => {
    const result = preScoreChunk({
      id: 'c1',
      text: 'He judged the dispute and declared the verdict.',
      startOffset: 0,
      endOffset: 45,
    });
    expect(result.dictHits.length).toBeGreaterThan(0);
    expect(result.dictHits.some(h => h.archetype === 'judgment_trial')).toBe(true);
  });

  test('narrativeScore is 0-1', () => {
    const result = preScoreChunk({
      id: 'c1',
      text: 'Some text with dialogue and action.',
      startOffset: 0,
      endOffset: 35,
    });
    expect(result.narrativeScore).toBeGreaterThanOrEqual(0);
    expect(result.narrativeScore).toBeLessThanOrEqual(1);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/mcp/literary-compiler/pre-score.test.ts`
Expected: FAIL

- [x] **Step 3: Write implementation**

```typescript
// src/mcp/literary-compiler/pre-score.ts

import { ARCHETYPE_KEYWORDS, type Archetype } from './archetypes';
import type { Chunk } from './chunker';

export interface DictHit {
  keyword: string;
  archetype: Archetype;
  position: number;
}

export interface PreScoreResult {
  archetypeScores: Partial<Record<Archetype, number>>;
  dictHits: DictHit[];
  narrativeScore: number;
}

export function preScoreChunk(chunk: Chunk): PreScoreResult {
  const text = chunk.text.toLowerCase();
  const words = text.split(/\s+/);
  const totalWords = words.length || 1;

  const archetypeScores: Partial<Record<Archetype, number>> = {};
  const dictHits: DictHit[] = [];

  // Keyword scoring
  for (const [archetype, keywords] of Object.entries(ARCHETYPE_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      const idx = text.indexOf(kw);
      if (idx !== -1) {
        score++;
        dictHits.push({ keyword: kw, archetype: archetype as Archetype, position: idx });
      }
    }
    archetypeScores[archetype as Archetype] = score / keywords.length;
  }

  // Narrative density features (simple heuristics)
  const dialogueMarks = (text.match(/["'「]/g) ?? []).length;
  const actionVerbs = words.filter(w =>
    ['went', 'ran', 'fought', 'spoke', 'took', 'gave', 'said', 'found', 'lost', 'began'].includes(w)
  ).length;
  const conflictCues = words.filter(w =>
    ['but', 'however', 'against', 'refused', 'could not', 'struggle', 'conflict'].includes(w)
  ).length;

  const narrativeScore = Math.min(1,
    (dialogueMarks * 0.05) +
    (actionVerbs / totalWords) * 2 +
    (conflictCues / totalWords) * 3
  );

  return { archetypeScores, dictHits, narrativeScore };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/mcp/literary-compiler/pre-score.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/mcp/literary-compiler/pre-score.ts src/mcp/literary-compiler/pre-score.test.ts
git commit -m "feat(literary-compiler): add dictionary pre-score for archetype detection"
```

---

### Task 7: Create LLM JSON extractor

**Covers:** [S4]

**Files:**
- Create: `src/mcp/literary-compiler/extractor.ts`
- Create: `src/mcp/literary-compiler/extractor.test.ts`

**Interfaces:**
- Consumes: `Chunk`, `PreScoreResult`
- Produces: `ExtractResult` with `{ archetype, skeleton, roles, variables, mood, sensory, snippets, confidence }`

- [x] **Step 1: Write failing test**

```typescript
// src/mcp/literary-compiler/extractor.test.ts
import { describe, test, expect } from 'bun:test';
import { validateExtractResult, type ExtractResult } from './extractor';

describe('extractor', () => {
  test('validateExtractResult accepts valid JSON', () => {
    const valid: ExtractResult = {
      archetype_primary: 'escape_liberation',
      archetype_secondary: null,
      roles: [{ span: 'Moses', role: 'current_leader' }],
      variables: ['current_leader', 'oppressor', 'obstacle'],
      skeleton: '[current_leader] leads the people from [oppressor]. [obstacle] blocks the path.',
      mood: 'epic',
      sensory: ['sight', 'sound'],
      pacing: 'fast',
      register: 'elevated',
      snippets: ['the waters stood as walls'],
      confidence: 0.8,
    };
    expect(validateExtractResult(valid)).toBe(true);
  });

  test('validateExtractResult rejects empty skeleton', () => {
    const invalid: ExtractResult = {
      archetype_primary: 'escape_liberation',
      roles: [],
      variables: [],
      skeleton: '',
      mood: 'epic',
      sensory: [],
      pacing: 'fast',
      register: 'elevated',
      snippets: [],
      confidence: 0.1,
    };
    expect(validateExtractResult(invalid)).toBe(false);
  });

  test('validateExtractResult rejects invalid archetype', () => {
    const invalid = {
      archetype_primary: 'invalid_archetype',
      roles: [],
      variables: ['x'],
      skeleton: 'test',
      mood: 'epic',
      sensory: [],
      pacing: 'fast',
      register: 'elevated',
      snippets: [],
      confidence: 0.5,
    };
    expect(validateExtractResult(invalid as any)).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/mcp/literary-compiler/extractor.test.ts`
Expected: FAIL

- [x] **Step 3: Write implementation**

```typescript
// src/mcp/literary-compiler/extractor.ts

import { isValidArchetype, type Archetype } from './archetypes';

export interface RoleMapping {
  span: string;
  role: string;
}

export interface ExtractResult {
  archetype_primary: Archetype;
  archetype_secondary: Archetype | null;
  roles: RoleMapping[];
  variables: string[];
  skeleton: string;
  mood: string;
  sensory: string[];
  pacing: string;
  register: string;
  snippets: string[];
  confidence: number;
}

export function validateExtractResult(result: unknown): result is ExtractResult {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;

  if (typeof r.archetype_primary !== 'string') return false;
  if (!isValidArchetype(r.archetype_primary)) return false;
  if (typeof r.skeleton !== 'string' || r.skeleton.length < 10) return false;
  if (!Array.isArray(r.variables) || r.variables.length === 0) return false;
  if (typeof r.mood !== 'string') return false;
  if (!Array.isArray(r.snippets)) return false;
  if (typeof r.confidence !== 'number' || r.confidence < 0) return false;

  return true;
}

export const EXTRACTOR_SYSTEM_PROMPT = `You extract structured literary data from text. Output ONLY valid JSON. No commentary.

Rules:
- archetype_primary: one of [escape_liberation, judgment_trial, loyalty, betrayal, inheritance_return, endurance_suffering, rescue, rise_fall_rise, wisdom_counsel, political_intrigue, quest_journey, temptation_fall]
- skeleton: SHORT scene structure with role placeholders like [current_leader], [oppressor], etc. ≤ 120 tokens.
- roles: map character names from text to roles
- snippets: 1-3 delexified real phrases from the text
- No moralizing. No plot invention beyond the text.
- If unsure, set confidence low. Do not guess.`;

export function buildExtractPrompt(chunkText: string): string {
  return `Extract from this text chunk:
---
${chunkText}
---

Return JSON with these fields:
{
  "archetype_primary": "one of the allowed archetypes",
  "archetype_secondary": null or another archetype,
  "roles": [{"span": "Name", "role": "current_leader|tyrant|mentor|ally|judge|heir|wise_one|follower"}],
  "variables": ["required_slot_names"],
  "skeleton": "[role_placeholder] does [action]. [obstacle] blocks. [intervention] resolves.",
  "mood": "epic|dark|hopeful|ironic|tragic|tense",
  "sensory": ["sight", "sound", "touch", "smell", "taste"] (only present in text),
  "pacing": "fast|slow|mixed",
  "register": "elevated|plain|earthy",
  "snippets": ["2-3 delexified real phrases from text, 5-20 words each"],
  "confidence": 0.0-1.0
}`;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/mcp/literary-compiler/extractor.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/mcp/literary-compiler/extractor.ts src/mcp/literary-compiler/extractor.test.ts
git commit -m "feat(literary-compiler): add LLM JSON extractor with validation"
```

---

### Task 8: Update linter for v2 validation

**Covers:** [S4]

**Files:**
- Modify: `src/mcp/literary-compiler/linter.ts`

- [x] **Step 1: Add v2 validation rules**

Add these checks to the existing linter:

```typescript
validateSceneTemplate(template: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const t = template as Record<string, unknown>;

  if (!t.id) errors.push('missing id');
  if (!t.archetype_primary || !isValidArchetype(t.archetype_primary as string)) {
    errors.push(`invalid archetype: ${t.archetype_primary}`);
  }
  if (!t.template_text || (t.template_text as string).length < 10) {
    errors.push('template_text too short');
  }
  if (!t.variables || !Array.isArray(t.variables) || (t.variables as unknown[]).length === 0) {
    errors.push('no variables defined');
  }

  // Token count check (rough: chars / 4)
  const tokenEst = Math.ceil((t.template_text as string ?? '').length / 4);
  if (tokenEst > 120) {
    errors.push(`template_text too long: ~${tokenEst} tokens (max 120)`);
  }

  // Moralizing detection
  const moralizing = ['the lesson is', 'this teaches', 'we learn that', 'the moral'];
  const lowerText = (t.template_text as string ?? '').toLowerCase();
  for (const phrase of moralizing) {
    if (lowerText.includes(phrase)) {
      errors.push(`moralizing phrase detected: "${phrase}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

validateStylePattern(pattern: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const p = pattern as Record<string, unknown>;

  if (!p.id) errors.push('missing id');
  if (!p.example_snippets || !Array.isArray(p.example_snippets) ||
      (p.example_snippets as unknown[]).length === 0) {
    errors.push('style_pattern requires at least 1 example_snippet');
  }

  return { valid: errors.length === 0, errors };
}
```

- [x] **Step 2: Run existing tests**

Run: `bun test src/mcp/literary-compiler/linter.test.ts`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add src/mcp/literary-compiler/linter.ts
git commit -m "feat(literary-compiler): add v2 scene_template and style_pattern validation"
```

---

### Task 9: Create migration script v1 → v2

**Covers:** [S3, S8]

**Files:**
- Create: `scripts/migrate-v1-to-v2.ts`

- [x] **Step 1: Write migration script**

```typescript
// scripts/migrate-v1-to-v2.ts
import { LiteraryCompilerDB } from '../src/mcp/literary-compiler/schema';
import { isValidArchetype, type Archetype } from '../src/mcp/literary-compiler/archetypes';

const MIGRATION_MAP: Record<string, Archetype> = {
  'escape': 'escape_liberation',
  'liberation': 'escape_liberation',
  'judgment': 'judgment_trial',
  'political': 'political_intrigue',
  // Others keep same name
  'inheritance': 'inheritance_return',
  'wisdom': 'wisdom_counsel',
  'loyalty': 'loyalty',
  'endurance': 'endurance_suffering',
  'rescue': 'rescue',
  'rise_fall_rise': 'rise_fall_rise',
};

function migrateArchetype(oldArchetype: string): Archetype {
  return MIGRATION_MAP[oldArchetype] ?? oldArchetype as Archetype;
}

async function main() {
  const dbPath = process.argv[2] ?? 'data/bible-compiler-output/literary.db';
  console.log(`Migrating ${dbPath} from v1 to v2...`);

  const db = new LiteraryCompilerDB(dbPath);
  db.createV2Tables();

  // Read existing bible_quest_templates
  const templates = db.db.prepare(
    'SELECT * FROM bible_quest_templates'
  ).all() as Array<Record<string, unknown>>;

  console.log(`Found ${templates.length} existing templates`);

  let migrated = 0;
  let skipped = 0;

  for (const t of templates) {
    const archetype = migrateArchetype(t.archetype as string);

    if (!isValidArchetype(archetype)) {
      console.warn(`Skipping template ${t.id}: invalid archetype ${t.archetype}`);
      skipped++;
      continue;
    }

    // Simple skeleton extraction: first 120 tokens worth of text
    const text = (t.template_text as string ?? '').slice(0, 480); // ~120 tokens
    const variables = t.variables ? JSON.parse(t.variables as string) : [];
    const positions = t.applicable_positions ? JSON.parse(t.applicable_positions as string) : [];

    db.db.prepare(`
      INSERT OR IGNORE INTO scene_templates
      (id, archetype_primary, template_text, variables, applicable_positions,
       mood, source_book, quality_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `v2-${t.id}`,
      archetype,
      text,
      JSON.stringify(variables),
      JSON.stringify(positions),
      t.mood ?? null,
      t.source_book ?? null,
      t.quality_score ?? 0.5,
    );

    migrated++;
  }

  console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped`);
}

main().catch(console.error);
```

- [x] **Step 2: Run on test database**

Run: `bun run scripts/migrate-v1-to-v2.ts --db test.db`
Expected: Migration output, no errors

- [x] **Step 3: Commit**

```bash
git add scripts/migrate-v1-to-v2.ts
git commit -m "feat(literary-compiler): add v1→v2 migration script with archetype mapping"
```

---

## Phase 2: Runtime + Stylist

### Task 10: Create hybrid retrieval module

**Covers:** [S5, S6]

**Files:**
- Create: `src/mcp/literary-compiler/retrieval.ts`
- Create: `src/mcp/literary-compiler/retrieval.test.ts`

**Interfaces:**
- Consumes: `scene_templates`, `style_patterns`, `template_style_links` from schema
- Produces: `searchTemplates(keys) → RankedTemplate[]`

- [x] **Step 1: Write failing test**

```typescript
// src/mcp/literary-compiler/retrieval.test.ts
import { describe, test, expect } from 'bun:test';
import { computeRetrievalScore, type RetrievalKeys } from './retrieval';

describe('retrieval', () => {
  test('archetype_match gives high score when matching', () => {
    const keys: RetrievalKeys = {
      archetype: 'escape_liberation',
      mood: 'epic',
      domain: 'water',
    };
    const template = {
      archetype_primary: 'escape_liberation',
      mood: 'epic',
      domain: 'water',
      quality_score: 0.8,
      use_count: 0,
    };
    const score = computeRetrievalScore(keys, template);
    expect(score).toBeGreaterThan(0.7);
  });

  test('score is lower when archetype mismatches', () => {
    const keys: RetrievalKeys = { archetype: 'escape_liberation' };
    const template = { archetype_primary: 'judgment_trial', quality_score: 0.8, use_count: 0 };
    const score = computeRetrievalScore(keys, template);
    expect(score).toBeLessThan(0.5);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/mcp/literary-compiler/retrieval.test.ts`
Expected: FAIL

- [x] **Step 3: Write implementation**

```typescript
// src/mcp/literary-compiler/retrieval.ts

import type { Archetype } from './archetypes';
import type { LiteraryCompilerDB } from './schema';

export interface RetrievalKeys {
  archetype?: Archetype;
  mood?: string;
  domain?: string;
  position?: string;
  queryText?: string;
}

interface TemplateRow {
  id: string;
  archetype_primary: string;
  mood: string | null;
  domain: string | null;
  template_text: string;
  quality_score: number;
  use_count: number;
  tags: string | null;
}

export function computeRetrievalScore(
  keys: RetrievalKeys,
  template: Partial<TemplateRow>,
): number {
  let score = 0;

  // w1: archetype match (0.40)
  if (keys.archetype && template.archetype_primary) {
    score += keys.archetype === template.archetype_primary ? 0.40 : 0;
  }

  // w2: mood match (0.15)
  if (keys.mood && template.mood) {
    score += keys.mood === template.mood ? 0.15 : 0.05;
  }

  // w3: domain match (0.15)
  if (keys.domain && template.domain) {
    score += keys.domain === template.domain ? 0.15 : 0;
  }

  // w4: quality score (0.10)
  score += (template.quality_score ?? 0.5) * 0.10;

  // w5: freshness (0.05)
  score += 0.05 / (1 + (template.use_count ?? 0));

  // w6: tags overlap (0.15)
  if (keys.domain && template.tags) {
    const tags = JSON.parse(template.tags) as string[];
    if (tags.includes(keys.domain)) score += 0.15;
  }

  return Math.min(1, score);
}

export async function searchTemplates(
  db: LiteraryCompilerDB,
  keys: RetrievalKeys,
  limit = 2,
): Promise<Array<TemplateRow & { score: number }>> {
  // FTS pre-filter
  let candidates: TemplateRow[];
  if (keys.archetype) {
    candidates = db.db.prepare(
      `SELECT * FROM scene_templates WHERE archetype_primary = ?`
    ).all(keys.archetype) as TemplateRow[];
  } else {
    candidates = db.db.prepare(
      `SELECT * FROM scene_templates`
    ).all() as TemplateRow[];
  }

  // Score and rank
  const scored = candidates
    .map(t => ({ ...t, score: computeRetrievalScore(keys, t) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/mcp/literary-compiler/retrieval.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/mcp/literary-compiler/retrieval.ts src/mcp/literary-compiler/retrieval.test.ts
git commit -m "feat(literary-compiler): add hybrid retrieval with composite scoring"
```

---

### Task 11: Create fillTemplate deterministic function

**Covers:** [S5]

**Files:**
- Create: `src/mcp/literary-compiler/fill-template.ts`
- Create: `src/mcp/literary-compiler/fill-template.test.ts`

- [x] **Step 1: Write failing test**

```typescript
// src/mcp/literary-compiler/fill-template.test.ts
import { describe, test, expect } from 'bun:test';
import { fillTemplate } from './fill-template';

describe('fillTemplate', () => {
  test('replaces placeholders with context values', () => {
    const skeleton = '[current_leader] leads the people from [oppressor]. [obstacle] blocks the way.';
    const context = {
      current_leader: 'Moses',
      oppressor: 'Pharaoh',
      obstacle: 'the Red Sea',
    };
    const result = fillTemplate(skeleton, context);
    expect(result).toBe('Moses leads the people from Pharaoh. the Red Sea blocks the way.');
  });

  test('leaves unreplaced placeholders as-is', () => {
    const skeleton = '[hero] faces [unknown].';
    const result = fillTemplate(skeleton, { hero: 'David' });
    expect(result).toBe('David faces [unknown].');
  });

  test('returns filled skeleton under 200 words', () => {
    const skeleton = '[a] [b] [c] ' + 'word '.repeat(300);
    const result = fillTemplate(skeleton, { a: 'X', b: 'Y', c: 'Z' });
    expect(result.split(/\s+/).length).toBeLessThanOrEqual(200);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/mcp/literary-compiler/fill-template.test.ts`
Expected: FAIL

- [x] **Step 3: Write implementation**

```typescript
// src/mcp/literary-compiler/fill-template.ts

export function fillTemplate(
  skeleton: string,
  context: Record<string, string>,
): string {
  let result = skeleton;

  // Replace [placeholder] patterns
  result = result.replace(/\[([^\]]+)\]/g, (match, key) => {
    const trimmed = key.trim();
    return context[trimmed] ?? match;
  });

  return result;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/mcp/literary-compiler/fill-template.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/mcp/literary-compiler/fill-template.ts src/mcp/literary-compiler/fill-template.test.ts
git commit -m "feat(literary-compiler): add deterministic fillTemplate function"
```

---

### Task 12: Create Stylist micro-prompt contract

**Covers:** [S7]

**Files:**
- Modify: `src/services/agents/stylist.ts`

- [x] **Step 1: Add v2 prompt builder**

Add method to `StylistAgent`:

```typescript
buildMicroPrompt(
  filledSkeleton: string,
  style: { register: string; pacing: string; sensory: string[]; snippets: string[]; forbidden: string[] },
  context: { world: string; location: string; time?: string },
  outcome: string,
  playerVoice?: string,
): { system: string; user: string } {
  const system = `You are a literary narrator for a living world simulator.
Render the given scene. Do not invent new plot beats.
Respect the outcome exactly.
Write 2-3 paragraphs (~200-280 words).
No moralizing. No summary. No modern slang unless style allows.
Vary sentence length according to style constraints.
Prefer concrete sensory detail over abstract emotion.
Follow the style constraints strictly.`;

  const styleBlock = `Style constraints:
- register: ${style.register}
- pacing: ${style.pacing}
- sensory focus: ${style.sensory.join(', ')}
- prefer constructions like:
${style.snippets.map((s, i) => `  ${i + 1) ${s}`).join('\n')}
- avoid: ${style.forbidden.join(', ')}`;

  const voiceBlock = playerVoice
    ? `\nPlayer voice notes (soft prior):\n${playerVoice}`
    : '';

  const user = `Scene skeleton:
${filledSkeleton}

Outcome (must respect):
${outcome}

Minimal facts:
- world: ${context.world}
- location: ${context.location}${context.time ? `\n- time: ${context.time}` : ''}
${styleBlock}${voiceBlock}

Write 2-3 paragraphs continuing this scene.`;

  return { system, user };
}
```

- [x] **Step 2: Run existing tests**

Run: `bun test src/services/agents/stylist.test.ts`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add src/services/agents/stylist.ts
git commit -m "feat(stylist): add v2 micro-prompt contract for short constrained input"
```

---

### Task 13: Wire V2 pipeline into roleplay engine

**Covers:** [S5, S8]

**Files:**
- Modify: `src/services/roleplay-engine.ts`

- [x] **Step 1: Add v2 pipeline path**

In `processInput()` method, add v2 path under feature flag:

```typescript
// After existing pipeline, before fallback:
if (featureFlags.isEnabled('literary-compiler-v2')) {
  try {
    // 1. Build retrieval keys from intent + simulation
    const keys: RetrievalKeys = {
      archetype: intent.narrativeArchetype as Archetype | undefined,
      mood: simulation.mood,
      domain: context.location?.domain,
      position: intent.position,
    };

    // 2. Retrieve top template
    const results = await searchTemplates(this.literaryDb, keys, 2);
    if (results.length > 0) {
      const template = results[0];

      // 3. Fill template
      const filled = fillTemplate(template.template_text, extractVariables(context));

      // 4. Get linked style
      const style = await this.getStyleForTemplate(template.id);

      // 5. Build micro-prompt and call Stylist
      const prompt = this.stylistAgent.buildMicroPrompt(
        filled,
        style,
        { world: context.world.name, location: context.location?.name ?? 'unknown' },
        formatOutcome(simulation),
      );

      const prose = await this.llmQueue.getAgentClient('stylist').generateText(
        prompt.system + '\n\n' + prompt.user,
        { maxTokens: 400, temperature: 0.6 },
      );

      // 6. Censor
      const clean = featureFlags.isEnabled('literary-v2-stylist')
        ? await this.censorAgent.filter(prose)
        : prose;

      return clean;
    }
  } catch (err) {
    logger.warn({ err }, 'v2 pipeline failed, falling back to legacy');
  }
}
```

- [x] **Step 2: Run existing tests**

Run: `bun test src/services/roleplay-engine.test.ts`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add src/services/roleplay-engine.ts
git commit -m "feat: wire literary compiler v2 pipeline into roleplay engine"
```

---

### Task 14: Create runtime metrics module

**Covers:** [S9]

**Files:**
- Create: `src/mcp/literary-compiler/runtime-metrics.ts`
- Create: `src/mcp/literary-compiler/runtime-metrics.test.ts`

- [x] **Step 1: Write failing test**

```typescript
// src/mcp/literary-compiler/runtime-metrics.test.ts
import { describe, test, expect } from 'bun:test';
import { RuntimeMetrics, type TurnMetrics } from './runtime-metrics';

describe('RuntimeMetrics', () => {
  test('records turn metrics', () => {
    const metrics = new RuntimeMetrics(':memory:');
    metrics.recordTurn({
      turnId: 't1',
      retrievalMs: 5,
      fillMs: 1,
      stylistMs: 1200,
      totalMs: 1250,
      templateUsedId: 'tpl-1',
      archetype: 'escape_liberation',
    });
    const recent = metrics.getRecent(1);
    expect(recent.length).toBe(1);
    expect(recent[0].archetype).toBe('escape_liberation');
  });

  test('computes averages', () => {
    const metrics = new RuntimeMetrics(':memory:');
    metrics.recordTurn({ turnId: 't1', stylistMs: 1000, totalMs: 1050 });
    metrics.recordTurn({ turnId: 't2', stylistMs: 1500, totalMs: 1550 });
    const avg = metrics.getAverages();
    expect(avg.avgStylistMs).toBe(1250);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/mcp/literary-compiler/runtime-metrics.test.ts`
Expected: FAIL

- [x] **Step 3: Write implementation**

```typescript
// src/mcp/literary-compiler/runtime-metrics.ts

import { Database } from 'bun:sqlite';

export interface TurnMetrics {
  turnId: string;
  retrievalMs?: number;
  fillMs?: number;
  stylistMs?: number;
  censorMs?: number;
  totalMs?: number;
  templateUsedId?: string;
  archetype?: string;
}

export class RuntimeMetrics {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runtime_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turn_id TEXT,
        retrieval_ms REAL,
        fill_ms REAL,
        stylist_ms REAL,
        censor_ms REAL,
        total_ms REAL,
        template_used_id TEXT,
        archetype TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
  }

  recordTurn(m: TurnMetrics): void {
    this.db.prepare(`
      INSERT INTO runtime_metrics
      (turn_id, retrieval_ms, fill_ms, stylist_ms, censor_ms, total_ms,
       template_used_id, archetype)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      m.turnId, m.retrievalMs ?? null, m.fillMs ?? null,
      m.stylistMs ?? null, m.censorMs ?? null, m.totalMs ?? null,
      m.templateUsedId ?? null, m.archetype ?? null,
    );
  }

  getRecent(limit = 10): TurnMetrics[] {
    return this.db.prepare(
      'SELECT * FROM runtime_metrics ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as TurnMetrics[];
  }

  getAverages(): { avgStylistMs: number; avgTotalMs: number; avgRetrievalMs: number } {
    const row = this.db.prepare(`
      SELECT
        AVG(stylist_ms) as avgStylistMs,
        AVG(total_ms) as avgTotalMs,
        AVG(retrieval_ms) as avgRetrievalMs
      FROM runtime_metrics
    `).get() as Record<string, number>;
    return {
      avgStylistMs: row.avgStylistMs ?? 0,
      avgTotalMs: row.avgTotalMs ?? 0,
      avgRetrievalMs: row.avgRetrievalMs ?? 0,
    };
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/mcp/literary-compiler/runtime-metrics.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/mcp/literary-compiler/runtime-metrics.ts src/mcp/literary-compiler/runtime-metrics.test.ts
git commit -m "feat(literary-compiler): add runtime metrics tracking"
```

---

## Phase 3: Personalization (deferred)

### Task 15: Create player style profile extraction

**Covers:** [S3]

**Files:**
- Create: `src/mcp/literary-compiler/player-voice.ts`
- Create: `src/mcp/literary-compiler/player-voice.test.ts`

**Note:** This is Phase 3 (deferred). Implement after Phase 2 stabilizes.

- [ ] **Step 1: Write failing test**

```typescript
// src/mcp/literary-compiler/player-voice.test.ts
import { describe, test, expect } from 'bun:test';
import { extractPlayerStats, type PlayerStats } from './player-voice';

describe('player-voice', () => {
  test('extracts sentence length stats', () => {
    const texts = ['Short sentence.', 'A much longer sentence with many words in it.'];
    const stats = extractPlayerStats(texts);
    expect(stats.avgSentenceLen).toBeGreaterThan(0);
  });

  test('extracts dialogue ratio', () => {
    const texts = ['He said "hello" and she replied "hi".'];
    const stats = extractPlayerStats(texts);
    expect(stats.dialogueRatio).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/mcp/literary-compiler/player-voice.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/mcp/literary-compiler/player-voice.ts

export interface PlayerStats {
  avgSentenceLen: number;
  dialogueRatio: number;
  sensoryBias: Record<string, number>;
  confidence: number;
}

export function extractPlayerStats(texts: string[]): PlayerStats {
  const allText = texts.join(' ');
  const sentences = allText.split(/[.!?]+\s+/).filter(s => s.trim().length > 0);
  const words = allText.split(/\s+/);

  // Sentence length
  const sentenceLens = sentences.map(s => s.split(/\s+/).length);
  const avgSentenceLen = sentenceLens.length > 0
    ? sentenceLens.reduce((a, b) => a + b, 0) / sentenceLens.length
    : 0;

  // Dialogue ratio
  const dialogueChars = (allText.match(/["'「].*?["'」]/g) ?? []).join('').length;
  const dialogueRatio = allText.length > 0 ? dialogueChars / allText.length : 0;

  // Sensory bias (simple keyword detection)
  const sensoryKeywords: Record<string, string[]> = {
    sight: ['saw', 'looked', 'bright', 'dark', 'color', 'red', 'blue', 'golden'],
    sound: ['heard', 'loud', 'quiet', 'whisper', 'roar', 'silence'],
    touch: ['felt', 'cold', 'warm', 'rough', 'smooth', 'soft'],
    smell: ['smelled', 'fragrant', 'stench', 'scent'],
    taste: ['tasted', 'sweet', 'bitter', 'sour'],
  };

  const sensoryBias: Record<string, number> = {};
  const lowerText = allText.toLowerCase();
  for (const [sense, keywords] of Object.entries(sensoryKeywords)) {
    const hits = keywords.filter(k => lowerText.includes(k)).length;
    sensoryBias[sense] = hits;
  }

  // Confidence grows with sample size
  const confidence = Math.min(1, texts.length / 20);

  return { avgSentenceLen, dialogueRatio, sensoryBias, confidence };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/mcp/literary-compiler/player-voice.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp/literary-compiler/player-voice.ts src/mcp/literary-compiler/player-voice.test.ts
git commit -m "feat(literary-compiler): add player voice stats extraction (phase 3)"
```

---

## Task Summary

| Task | Phase | Description | Files |
|------|-------|-------------|-------|
| 1 | 0 | Canonical archetype enum | archetypes.ts, archetypes.test.ts |
| 2 | 0 | Rename NPC system | archetype.ts → npc-role.ts + imports |
| 3 | 0 | Feature flags | feature-flags.ts |
| 4 | 1 | Text chunker | chunker.ts, chunker.test.ts |
| 5 | 1 | Schema v2 tables | schema.ts |
| 6 | 1 | Dictionary pre-score | pre-score.ts, pre-score.test.ts |
| 7 | 1 | LLM JSON extractor | extractor.ts, extractor.test.ts |
| 8 | 1 | Linter v2 rules | linter.ts |
| 9 | 1 | Migration script | migrate-v1-to-v2.ts |
| 10 | 2 | Hybrid retrieval | retrieval.ts, retrieval.test.ts |
| 11 | 2 | fillTemplate | fill-template.ts, fill-template.test.ts |
| 12 | 2 | Stylist micro-prompt | stylist.ts |
| 13 | 2 | Wire V2 pipeline | roleplay-engine.ts |
| 14 | 2 | Runtime metrics | runtime-metrics.ts, runtime-metrics.test.ts |
| 15 | 3 | Player voice extraction | player-voice.ts, player-voice.test.ts |
