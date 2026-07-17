# Agents Reference (v0.27.0)

TrueNeverStory uses a multi-agent architecture where each agent handles a specific aspect of the narrative. As of v0.27.0, the engine uses **6 core agents** (The Big Six) plus **5 specialist agents** and a **dialogue system**.

---

## The Big Six Agents

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

---

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

---

### 3. Stylist (The Narrator)

**ID:** `stylist`
**Role:** Renders prose using Gutenberg style patterns
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

---

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

---

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

---

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

## Legacy Agents (Deprecated)

The following agents are deprecated in v0.27.0 but still available for backward compatibility:

| Agent | Replacement | Status |
|-------|-------------|--------|
| Narrator | Stylist | Deprecated |
| Director | Dramaturg | Deprecated |
| Scene | Stylist | Deprecated |
| NPC | Actor | Deprecated |
| Crafter | Actor | Deprecated |
| Researcher | Validator | Deprecated |
| Historian | Chronicler | Deprecated |
| Cartographer | Actor | Deprecated |
| Merchant | Actor | Deprecated |
| Quest Giver | Dramaturg | Deprecated |
| Lorekeeper | Dramaturg | Deprecated |
| Social Sim | Actor | Deprecated |
| Villain | Dramaturg | Deprecated |
| User Agent | Actor | Deprecated |

---

## Specialist Agents (v0.27.0)

The following specialist agents are now wired into `RoleplayEngine` and available via `engine.<agent>`:

| Agent | Field | Purpose |
|-------|-------|---------|
| **CartographerAgent** | `engine.cartographer` | Location/geography information — distances, paths, terrain, points of interest |
| **HistorianAgent** | `engine.historian` | World history, chronology, past events, lore narration |
| **LorekeeperAgent** | `engine.lorekeeper` | World facts, magic system rules, race information, established canon |
| **MerchantAgent** | `engine.merchant` | NPC merchant trading, pricing, inventory management |
| **QuestGiverAgent** | `engine.questGiver` | Quest generation based on world state, player level, story threads |

Each specialist agent takes only `LLMQueue` as a dependency and generates text via dedicated prompts.

---

## Dialogue System (v0.27.0)

New `DialogueManager` + `DialogueContext` for structured NPC conversations:

| Feature | Description |
|---------|-------------|
| **Session management** | Greeting → Active → Farewell lifecycle |
| **Relationship awareness** | Friend/neutral/enemy greetings and topic availability |
| **Feudal hierarchy** | Lord/vassal special greetings |
| **Topic-based choices** | personal, faction, quest, trade, combat, crafting, rumor, gossip, etc. |
| **Memory recording** | Dialogue summaries stored in NPC long-term memory |

Access via `engine.dialogueManager` (requires `npcRuntime` to be available).

**Backward Compatibility:**
Old agent IDs (`@narrator`, `@director`, etc.) still work but route to the new agents internally.

---

## Agent Registry v2

All agents are registered in `AgentRegistryV2` (`src/services/agent-registry-v2.ts`):

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

## Agent Interface (v0.27.0)

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

| Value | Effect | Use for |
|-------|--------|---------|
| 0.1 - 0.3 | Focused, deterministic | Research, fact-checking, intent parsing |
| 0.4 - 0.6 | Balanced | Chronicler, social simulation |
| 0.7 - 0.8 | Creative | Narrative, NPC dialogue, villain schemes |

---

## Using @agent in Chat

Send a private message to any agent from the chat:

```
@dramaturg Suggest a narrative pattern for this scene
@validator Is this historical event accurate?
@stylist Describe the ancient ruins in Gothic style
@actor Talk to the merchant about rare items
@chronicler What happened in the last hour?
```

Responses are marked with a blue left border and agent name in brackets.

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

## MCP Integration (v0.27.0)

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
