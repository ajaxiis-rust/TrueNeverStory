# Literary Compiler v2 — Design Spec

**Date:** 2026-07-29
**Status:** Implemented (v0.33.0)
**Author:** MiMo Code + User (brainstorm)

---

## [S1] Problem

Current Literary Compiler has 10 narrative archetypes, mixes structure/style in schema, no player personalization, and weak ranking. BRIEF v1/v2 proposals are comprehensive but need correction: v1 allows external NLP (rejected), v2 is stack-native but some archetypes overlap.

**Decision:** Reduce BRIEF v2's 15 archetypes to 12 controlled primary + `everyday_life` fallback. Rename NPC archetype system to avoid terminology collision.

---

## [S2] Archetype System — Canonical Design

### 2.1 Narrative Archetypes (Literary Compiler)

**12 primary archetypes:**

| # | Archetype | Covers | Examples |
|---|-----------|--------|----------|
| 1 | `escape_liberation` | Flight, emancipation from bondage | Exodus, Odyssey, prison break |
| 2 | `judgment_trial` | Trial, proof of innocence, verdict | Solomon, Kafka's Trial, Orestes |
| 3 | `loyalty` | Faithfulness, devotion, service | Ruth, Round Table knights, samurai |
| 4 | `betrayal` | Treachery, treason, deception | Judas, Brutus, Iago |
| 5 | `inheritance_return` | Legacy, restoration of status | Prodigal Son, Hamlet, inheritance dispute |
| 6 | `endurance_suffering` | Suffering, patience, ordeal | Job, Prometheus, King Lear |
| 7 | `rescue` | Salvation, deliverance | David vs Goliath, Perseus and Andromeda |
| 8 | `rise_fall_rise` | Exaltation -> fall -> exaltation | Joseph, Faust, Scarlett O'Hara |
| 9 | `wisdom_counsel` | Wisdom, instruction, parable | Ecclesiastes, Merlin, mentor figures |
| 10 | `political_intrigue` | Power, conspiracy, intrigue | Esther, Machiavelli, court drama |
| 11 | `quest_journey` | Journey, search, quest | Abraham, Odyssey, LOTR |
| 12 | `temptation_fall` | Temptation, sin, fall from grace | Adam and Eve, Faust, Macbeth |

**Fallback:** `everyday_life` — used when no primary archetype scores above threshold (0.3).

**Why these 12:**
- Removed `confrontation` (too broad — every conflict is confrontation)
- Removed `restoration_healing` (overlaps with `endurance_suffering` happy end)
- Removed `covenant_bargain` (biblical-specific; covered by `loyalty` + `political_intrigue` in secular texts)

### 2.2 NPC Roles (Character System)

**Rename:** `ArchetypeConfig` → `NPCRoleConfig`, `ALL_ARCHETYPES` → `ALL_NPC_ROLES`

| File | Change |
|------|--------|
| `src/models/archetype.ts` | Rename to `npc-role.ts`, rename all exports |
| `src/models/archetype.test.ts` | Rename to `npc-role.test.ts` |
| `src/services/npc-generator.ts` | Update imports |
| `src/services/npc-economy.ts` | Update imports |
| `src/services/npc-economy-runtime.ts` | Update imports |

NPC roles are character types (farmer, merchant, king), NOT narrative patterns. No content changes, only naming.

### 2.3 DramaturgAgent — Internal Tone Mapping

`src/services/agents/dramaturg.ts` uses `tragic_hero`, `triumphant_hero`, `struggling_hero`, `social_dynamics`, `journey`, `challenge` as **narrative tone categories**, not archetype classification.

**Decision:** No code changes. Add documentation comment: "These are internal tone categories for DramaturgAgent, not literary archetypes."

---

## [S3] Target Data Model

### 3.1 `scene_templates` (structure)

```sql
CREATE TABLE scene_templates (
  id TEXT PRIMARY KEY,
  source_book TEXT,
  source_chapter INT,
  source_chunk_ids TEXT,          -- JSON array
  archetype_primary TEXT NOT NULL, -- from 12 canonical
  archetype_secondary TEXT NULL,
  applicable_positions TEXT NOT NULL, -- JSON array
  variables TEXT NOT NULL,        -- JSON array of required slots
  template_text TEXT NOT NULL,    -- SHORT skeleton, ≤ 120 tokens
  beat_sequence TEXT NULL,        -- JSON array
  mood TEXT,
  difficulty TEXT,
  moral_ambiguity REAL,
  tension_curve TEXT NULL,        -- JSON number array
  tags TEXT,                      -- JSON array
  domain TEXT NULL,
  scale TEXT NULL,                -- personal|tribal|national
  embedding_id TEXT NULL,
  quality_score REAL,
  use_count INTEGER DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);
```

**FTS:** `template_text`, `tags`, `archetype_primary`, `mood`, `domain`

### 3.2 `style_patterns` (how to write)

```sql
CREATE TABLE style_patterns (
  id TEXT PRIMARY KEY,
  source_author_or_era TEXT,
  source_chunk_ids TEXT,
  avg_sentence_len REAL,
  sentence_len_variance REAL,
  sensory_ratio TEXT,             -- JSON {sight, sound, touch, smell, taste}
  register TEXT,                  -- elevated|plain|earthy
  pacing TEXT,                    -- fast|slow|mixed
  tone TEXT,
  preferred_constructions TEXT,   -- JSON array
  forbidden_phrases TEXT,         -- JSON array
  example_snippets TEXT,          -- JSON array, 1-4 delexified REQUIRED
  quality_score REAL,
  created_at INTEGER DEFAULT (unixepoch())
);
```

### 3.3 `template_style_links`

```sql
CREATE TABLE template_style_links (
  template_id TEXT REFERENCES scene_templates(id),
  style_id TEXT REFERENCES style_patterns(id),
  weight REAL DEFAULT 1.0,
  PRIMARY KEY (template_id, style_id)
);
```

### 3.4 `chunk_index` (BGE-M3 layer)

```sql
CREATE TABLE chunk_index (
  chunk_id TEXT PRIMARY KEY,
  source_book TEXT,
  source_chapter INT,
  text TEXT NOT NULL,
  token_est INT,
  char_start INT,
  char_end INT,
  embedding_ref TEXT,
  dict_hits TEXT,                 -- JSON
  pre_score REAL,
  cluster_id TEXT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
```

### 3.5 `player_style_profiles`

```sql
CREATE TABLE player_style_profiles (
  player_id TEXT PRIMARY KEY,
  avg_sentence_len REAL,
  sensory_bias TEXT,              -- JSON
  register_score REAL,            -- 0 earthy..1 elevated
  dialogue_ratio REAL,
  preferred_motifs TEXT,          -- JSON
  anti_patterns TEXT,             -- JSON
  sample_snippets TEXT,           -- JSON, delexified only
  confidence REAL,
  message_count_used INT,
  last_updated INTEGER
);
```

### 3.6 `retrieval_cache`

```sql
CREATE TABLE retrieval_cache (
  cache_key TEXT PRIMARY KEY,
  template_id TEXT,
  style_id TEXT NULL,
  hits INT,
  expires_at INT
);
```

---

## [S4] Offline Pipeline

```
Source text
  → A. Chunker (pure code, 200-400 tokens, overlap 40-80)
  → B. BGE-M3 embed + store
  → C. Dictionary/heuristic candidate pass
  → D. Cluster / near-dup collapse (vectors)
  → E. Select representatives
  → F. Small local LLM JSON extract (Qwen3-8B, temp=0.1)
  → G. Role consistency map
  → H. Linter / quality gate
  → I. Write scene_templates + style_patterns + links
  → J. Emit metrics report
```

### Key constraints:
- No new NLP dependencies (no spaCy, Presidio)
- BGE-M3 for everything vector
- Dictionary/rules before LLM
- Small local model = structured extractor only

---

## [S5] Runtime Flow

```
Player input
  → Intent + Simulation + State mutation (0 LLM)
  → Build retrieval keys: position, archetype, mood, domain
  → Cache lookup
  → FTS + BGE-M3 hybrid retrieval → top-1 template (top-2 if near-tied)
  → Get linked style_pattern
  → fillTemplate (deterministic)
  → Stylist micro-prompt → 1 LLM call → 2-3 paragraphs
  → Rule-based Censor
  → Optional translation (small model)
```

**Hard budget:** 1-2 LLM calls per turn.

---

## [S6] Retrieval Scoring

```
score =
  0.40 * archetype_match     -- binary: 1 if same, 0 if different
+ 0.30 * vector_similarity   -- cosine [0,1]
+ 0.15 * mood_match          -- 1 - |valence_diff|
+ 0.10 * quality_score       -- from extraction
+ 0.05 * freshness           -- 1 / (1 + use_count)
```

---

## [S7] Stylist Prompt Contract

**System:** ~50 tokens. Literary narrator, no moralizing, 2-3 paragraphs.

**Style block:** register, pacing, sensory focus, sentence length, 2-3 example snippets, forbidden phrases.

**User:** filled skeleton + outcome lock + minimal facts + optional player voice.

**Max tokens:** 350-400.

---

## [S8] Phased Delivery

### Phase 0: Canonical Architecture
- `src/mcp/literary-compiler/archetypes.ts` — 12 + keyword sets
- `src/models/npc-role.ts` — rename from archetype.ts
- Feature flags

### Phase 1: Offline Pipeline
- Chunker, BGE-M3, dictionary pre-score, LLM extractor, linter
- Schema v2 tables

### Phase 2: Runtime + Stylist
- Hybrid retrieval, fillTemplate, Stylist micro-prompt
- Wire V2 agents, CensorAgent integration

### Phase 3: Personalization (deferred)
- PlayerStyleProfile, confidence gate, soft prior

### Phase 4: Hardening
- Retrieval cache, overuse penalty, docs, load test

---

## [S9] Acceptance Criteria

- [ ] 12 canonical archetypes defined + keyword sets
- [ ] NPC system renamed to npc-role (no logic changes)
- [ ] Schema v2 tables created
- [ ] Runtime: 1-2 LLM calls per turn
- [ ] Output: 2-3 paragraphs (~200-280 words EN)
- [ ] Top-1/2 retrieval with score
- [ ] Style patterns include real delexified snippets
- [ ] Compiler and runtime metrics emitted
- [ ] Docs match implemented reality
