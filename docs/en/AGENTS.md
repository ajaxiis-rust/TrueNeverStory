# Agents Reference (v0.32.6)

TrueNeverStory has **two agent systems** that coexist:

1. **The Big Six (AgentV2)** — the narrative prose pipeline and `@mention` routing. Registered in `AgentRegistryV2` and instantiated in `RoleplayEngine`.
2. **Configured agents (`DEFAULT_AGENTS`)** — admin-config metadata for the Settings/Providers UI, listed in `src/services/agent-config.ts`. Backs a few subsystems (idle research, villain management).

The Big Six are: `dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`. The configured agents are: `director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation` (static prompts for `director`, `chronicler`, `story-planner`, `social-sim` have been removed — migrated to Big Six).

`stylist` is the sole prose generator. The removed agents (`narrator`, `npc`, `scene`, `historian`, `cartographer`, `lorekeeper`, `merchant`, `quest-giver`) no longer exist anywhere in the code.

---

## The Big Six (AgentV2)

These handle the deterministic prose pipeline: intent → simulation → context → prose.

### 1. Dramaturg (The Architect)

**ID:** `dramaturg`
**Role:** Selects narrative patterns from Bible archetypes
**MCP Tools:** `search_verses`, `get_pattern`, `get_archetype`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Analyzes the current situation and chooses appropriate story structures from biblical patterns |
| **Input** | Intent, SimulationResult, GameContext |
| **Output** | NarrativePattern (archetype, name, description, verses, mood) |
| **Dependencies** | TNSServer (MCP), LLMQueue |

**Workflow:**
1. Infers mood from intent type and simulation outcome
2. Queries Bible MCP for matching archetypes
3. Falls back to LLM-generated patterns if MCP unavailable

### 2. Validator (The Fact-Checker)

**ID:** `validator`
**Role:** Verifies facts via Wikipedia MCP
**MCP Tools:** `verify_fact`, `get_context`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Ensures world consistency and historical accuracy |
| **Input** | Intent, SimulationResult, GameContext |
| **Output** | Verification results (verified, confidence, evidence, sources) |
| **Dependencies** | TNSServer (MCP) |

**Workflow:**
1. Extracts factual claims from the situation
2. Queries Wikipedia MCP for verification
3. Returns verification results with confidence levels

### 3. Stylist (The Narrator)

**ID:** `stylist`
**Role:** Renders prose using Gutenberg style patterns — the sole prose generator
**MCP Tools:** `get_style_pattern`, `apply_style`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Core text generation agent that produces narrative prose |
| **Input** | Intent, SimulationResult, GameContext, NarrativePattern |
| **Output** | Prose text |
| **Dependencies** | TNSServer (MCP), LLMQueue |

**Workflow:**
1. Gets style based on mood from Gutenberg MCP
2. Builds constrained prompt with simulation results and style
3. Generates prose via LLM
4. Returns rendered text

### 4. Actor (NPC Ensemble)

**ID:** `actor`
**Role:** Manages NPC interactions and dialogue
**MCP Tools:** None

| Aspect | Detail |
|--------|--------|
| **Purpose** | Handles all NPC dialogue, trading, crafting, social dynamics |
| **Input** | Intent, SimulationResult, GameContext |
| **Output** | NPC dialogue text, state changes |
| **Dependencies** | UnifiedEntityStore, LLMQueue |

**Workflow:**
1. Routes to appropriate sub-handler based on intent type
2. Gets NPC's hidden motivations from L3 profile
3. Generates NPC response using LLM
4. Computes relationship state changes

### 5. Censor (Linter)

**ID:** `censor`
**Role:** Removes AI clichés and enforces style consistency
**MCP Tools:** None

| Aspect | Detail |
|--------|--------|
| **Purpose** | Cleans prose by removing AI-generated clichés and anachronisms |
| **Input** | Prose text, GameContext |
| **Output** | Cleaned prose text |
| **Dependencies** | LLMQueue |

**Workflow:**
1. Removes AI clichés via regex patterns
2. Fixes anachronisms based on world context
3. LLM-based polish for complex issues
4. Returns cleaned text

**Common AI Clichés Removed:**
- "delved", "tapestry", "rich tapestry", "palpable", "visceral"
- "it's worth noting", "it goes without saying"
- "the very fabric of", "on a deeper level"

### 6. Chronicler

**ID:** `chronicler`
**Role:** Updates world memory and maintains timeline
**MCP Tools:** None

| Aspect | Detail |
|--------|--------|
| **Purpose** | Logs all significant events and maintains world consistency |
| **Input** | Intent, SimulationResult, GameContext |
| **Output** | State changes (NPC memory updates) |
| **Dependencies** | UnifiedEntityStore, EventBus |

**Workflow:**
1. Creates event description from intent and outcome
2. Publishes to EventBus for other systems
3. Updates NPC memories for nearby characters
4. Logs to timeline

---

## Configured agents (`DEFAULT_AGENTS`)

These live in `src/services/agent-config.ts` and back the Settings/Providers UI, `LLMQueue`/`LLMClient`, and a few subsystems. `chronicler` is shared with the Big Six. Their temperature and token limits come from global defaults (0.7 / 2048) unless overridden in `conf/agents.json`.

| ID | Name | Priority | Used by |
|----|------|----------|---------|
| `director` | Director | 8 | story-beat injection |
| `chronicler` | Chronicler | 5 | timeline summary (`@mention` too) |
| `story-planner` | Story Planner | 6 | story-arc suggestions (`@mention`) |
| `social-sim` | Social Simulator | 4 | NPC social dynamics (`@mention`) |
| `villain` | Villain Manager | 6 | antagonist schemes (`@mention`) |
| `researcher` | Researcher | 3 | `IdleResearchScheduler`, item evaluation (`@mention`) |
| `translation` | Translation | 2 | English ↔ user language at the output boundary |

**Prompt templates (template variables → what they resolve to):**

- **director** — `{narrative}`, `{beat}`. Integrates a story beat into ongoing narrative.
- **chronicler** — `{events}`, `{timeline}`. Summarizes new events chronologically.
- **story-planner** — `{world_state}`, `{characters}`, `{events}`, `{quests}`. Output: `{"arc": ..., "quests": [{"title", "description", "objectives"}], "hooks": [...]}`.
- **social-sim** — `{characters}`, `{relationships}`, `{context}`. Describes relationship changes and faction implications.
- **villain** — `{villain}`, `{world_state}`, `{recent_actions}`. Plans the antagonist's next move.
- **researcher** — `{task}`, `{world_context}`. Output: `{"verdict": "plausible|questionable|unrealistic", "confidence", "issues", "suggestions", "enrichedDetails"}`.
- **translation** — `{source_lang}`, `{target_lang}`, `{text}`. Returns only the translated text.

---

## Dialogue System (v0.32.6)

New `DialogueManager` + `DialogueContext` for structured NPC conversations:

| Feature | Description |
|---------|-------------|
| **Session management** | Greeting → Active → Farewell lifecycle |
| **Relationship awareness** | Friend/neutral/enemy greetings and topic availability |
| **Feudal hierarchy** | Lord/vassal special greetings |
| **Topic-based choices** | personal, faction, quest, trade, combat, crafting, rumor, gossip, etc. |
| **Memory recording** | Dialogue summaries stored in NPC long-term memory |

Access via `engine.dialogueManager` (requires `npcRuntime` to be available).

**Note:** Chat `@mentions` now route through the Big Six via an adapter (`@dramaturg`, `@stylist`, `@actor`, `@validator`, `@censor`, `@chronicler`). `@villain` and `@researcher` retain their own handlers. `@story-planner` and `@social-sim` have been removed (redundant with Big Six). `@narrator`, `@director`, `@scene`, and `@npc` no longer exist.

---

## Agent Registry v2

The Big Six are registered in `AgentRegistryV2` (`src/services/agent-registry-v2.ts`):

```typescript
import { getAgentRegistryV2 } from './agent-registry-v2';

const registry = getAgentRegistryV2();

// Register agents
registry.register(dramaturgAgent);
registry.register(validatorAgent);
registry.register(stylistAgent);
registry.register(actorAgent);
registry.register(censorAgent);
registry.register(chroniclerAgent);

// Get agent by ID
const dramaturg = registry.get('dramaturg');

// Get agents with specific MCP tool
const withSearch = registry.getAgentsWithTool('search_verses');
```

---

## Agent Interface (v0.32.6)

```typescript
interface AgentV2 {
  readonly id: AgentId;
  readonly name: string;
  readonly description: string;
  readonly mcpTools: string[];

  process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput>;
}

interface AgentOutput {
  text?: string;
  stateChanges?: StateChange[];
  metadata?: Record<string, unknown>;
}
```

---

## Global Variables

These variables are available to agents through the game context:

| Variable | Description |
|----------|-------------|
| `{world_name}` | Name of the current world (from world_frame.json) |
| `{time}` | Current story time (ISO string) |
| `{location}` | Current character location |
| `{character}` | Active character name |
| `{role}` | User's role (protagonist, observer, etc.) |
| `{rules}` | World rules (magic laws, social norms, etc.) |
| `{timeline}` | Recent world events (last 5 from chronicler) |
| `{memories}` | Recent roleplay memories |
| `{facts}` | Established world facts |
| `{npcs}` | Nearby NPC names |
| `{history}` | Recent conversation history (last 3 exchanges) |
| `{events}` | Recent events (context-dependent, last 3-5) |
| `{world_state}` | Summary of current world state |
| `{world_context}` | World context for research |
| `{genre}` | World genre (fantasy, sci-fi, horror, etc.) |
| `{magic_system}` | Magic system description |
| `{language}` | Primary world language (en, ru, etc.) |
| `{world_description}` | World description/pitch |

---

## Temperature Guide

Configured agents use global defaults (temperature 0.7, max tokens 2048) unless overridden in `conf/agents.json`.

| Value | Effect | Use for |
|-------|--------|---------|
| 0.1 - 0.3 | Focused, deterministic | Research, fact-checking, intent parsing |
| 0.4 - 0.6 | Balanced | Chronicler, social simulation |
| 0.7 - 0.8 | Creative | Narrative, NPC dialogue, villain schemes |

---

## Using @agent in Chat

Send a private message to an agent from the chat. Chat `@mentions` route to the configured handlers, not the Big Six:

```
@chronicler summarize the last hour
@story-planner suggest the next story beat
@researcher is this medieval sword historically accurate?
@social-sim how do the villagers react?
@villain what does the antagonist do next?
```

Responses are marked with a blue left border and agent name in brackets.

The Big Six (`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`) are registered in `AgentRegistryV2` and are reachable via `@mention` through the Big Six adapter (v2-paradigm Vector 2a).

---

## RAG System (Embeddings + Long-Term Memory)

All agents have full embedding support with long-term memory via RAG:

- **llama.cpp Embedding Server** — BGE-M3 model on port 5002 for vector generation
- **SQLite Hybrid Search** — FTS5 keyword search + dense vector search + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — per-agent, per-session memory isolation via `role` column
- **World-Scoped Memory** — memory is isolated per world to prevent cross-world hallucinations
- **Mojo Compute Kernels** — 5 Mojo kernels via FFI with TypeScript fallbacks:
  - `probability_ffi.mojo` — Success chance, roll outcomes, batch probability
  - `vector_ffi.mojo` — 4-dim vector operations (cosine, L2, dot)
  - `vector_full.mojo` — Full-dimension vector operations (768-dim BGE-M3)
  - `batch_ops.mojo` — Batch NPC operations (age decay, vice, tax, loyalty)
  - `graph_ops.mojo` — Graph traversal, RRF fusion, reputation computation

**Memory Flow:**
```
Agent Request → AgentMemoryStore → SQLite (hybrid search)
                                      ↓
                              ┌───────┴───────┐
                              │ FTS5 (LIKE)   │ Dense Vectors (BGE-M3)
                              │ Keyword Match │ Cosine Similarity
                              └───────┬───────┘
                                      ↓
                              Reciprocal Rank Fusion (RRF)
                                      ↓
                              Context for LLM Prompt
```

---

## MCP Integration (v0.32.6)

### Bible Patterns

Biblical texts stored in SQLite with verse-level granularity. Each verse is an atomic pointer that can be referenced by agents.

**Tools:**
- `search_verses` — Search by text, book, or reference
- `get_pattern` — Get narrative patterns by archetype, mood, or function
- `get_archetype` — Get archetype details by name

### Gutenberg Styles

Stylistic patterns extracted from Gutenberg Project texts. Delexified descriptions preserve structure without character names.

**Tools:**
- `get_style_pattern` — Search styles by mood, tags, or description
- `apply_style` — Apply style to text (delexify and return suggestions)

### Wikipedia Validation

Historical fact-checking via Wikipedia API.

**Tools:**
- `verify_fact` — Verify a factual claim
- `get_context` — Get Wikipedia context for a topic

---

## Template System

### How userTemplate Works

Each agent stores a `userTemplate` in SQLite (`agent_prompts` table) with JSON file fallback. The template contains `{var}` placeholders that are replaced with real values at runtime by `resolveTemplate()` (`src/utils/template-resolver.ts`).

**Flow:**
1. Agent loads config: `loadAgentConfig(agentId, world?, lang?)`
2. Reads `prompts.userTemplate` from SQLite first, then JSON fallback
3. Calls `resolveTemplate(template, vars)` with context data
4. Sends resolved prompt to LLM

**If no userTemplate exists** → fallback to `PromptBuilder` (hardcoded TypeScript templates).

---

## Player Style Profiles (v0.32.6)

`PlayerProfileStore` (`src/lib/player-profile-store.ts`) provides cross-agent player style profiles shared between Stylist and LiteraryV2Generator.

**Metrics tracked:**
| Metric | Description |
|--------|-------------|
| `avg_sentence_len` | Average sentence length in words |
| `sensory_bias` | Sensory detail preference (0-1) |
| `register_score` | Formal/informal register (0-1) |
| `dialogue_ratio` | Proportion of dialogue in text |
| `narrative_distance` | Close vs distant narration (0-1) |
| `action_orientation` | Action vs reflection preference (0-1) |
| `emotional_expressiveness` | Emotional detail level (0-1) |
| `preferred_pace` | slow / medium / fast |
| `literary_sophistication` | Vocabulary/structure complexity (0-1) |
| `preferred_motifs` | Top preferred narrative motifs |
| `anti_patterns` | Avoided patterns |
| `sample_snippets` | Representative text samples |
| `confidence` | Profile confidence (0-1) |

**Storage:** `data/player-profiles.db` (SQLite, WAL mode)

---

## Storage Architecture

### SQLite Database

The project uses SQLite via Bun's built-in `bun:sqlite` module. The database file is `tns.db` in the configured `dbPath` (default `./worlds/{active}`).

**Tables:**
- `entities` — World entities with FTS5 full-text search
- `embeddings` — Vector embeddings for semantic search
- `memories` — Roleplay memories with FTS5
- `agent_prompts` — Agent prompts per world + language
- `ui_translations` — UI translation strings per language + page

### JSON File Storage (Fallback)

JSON files remain as fallback during migration:

```
conf/
  settings.json          — App-wide settings (LLM, server, language, etc.)
  agents.json            — Global agent model/provider assignments
worlds/{active}/
  agents/{agentId}.json  — Per-world agent prompts (fallback)
```
