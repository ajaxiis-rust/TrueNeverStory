# Agents Reference

TrueNeverStory uses a multi-agent architecture where each agent handles a specific aspect of the narrative. Agents have their own LLM configuration, system prompts, and user templates.

## Global Variables

These variables are available to most agents through the world state context:

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

## Agents

### Narrator (`narrator`)

**Description:** Primary storyteller. Generates world narrative from story context.

**Template variables:**
`{world_name}` `{time}` `{location}` `{character}` `{role}` `{rules}` `{timeline}` `{memories}` `{facts}` `{npcs}` `{history}`

**System prompt:** Defines the narrator as a skilled storyteller. Writes vivid, immersive prose in second/third person. Never breaks character.

**Temperature:** 0.8 | **Max tokens:** 4096 | **Priority:** 10 (highest)

---

### Director (`director`)

**Description:** Story beat injection. Integrates dramatic moments into the narrative.

**Template variables:**
`{narrative}` `{beat}`

| Variable | Description |
|----------|-------------|
| `{narrative}` | Current narrative text to inject the beat into |
| `{beat}` | Story beat description (inciting incident, revelation, setback, etc.) |

**Temperature:** 0.7 | **Max tokens:** 2048 | **Priority:** 8

---

### Scene Generator (`scene`)

**Description:** Scene transition narratives when characters move between locations.

**Template variables:**
`{character}` `{origin}` `{destination}` `{rules}` `{events}`

| Variable | Description |
|----------|-------------|
| `{origin}` | Current location (where the character is leaving from) |
| `{destination}` | Target location (where the character is going to) |

**Temperature:** 0.8 | **Max tokens:** 2048 | **Priority:** 7

---

### NPC Agent (`npc`)

**Description:** NPC dialogue and reactions. Roleplays individual characters.

**Template variables:**
`{npc_name}` `{npc_personality}` `{player}` `{location}` `{relationship}` `{events}` `{line}`

| Variable | Description |
|----------|-------------|
| `{npc_name}` | Name of the NPC being roleplayed |
| `{npc_personality}` | NPC's personality traits (from entity profile) |
| `{player}` | Player character's name |
| `{relationship}` | Relationship with the player (friend, neutral, enemy, etc.) |
| `{line}` | What the player said to the NPC |

**Temperature:** 0.7 | **Max tokens:** 1024 | **Priority:** 9

---

### Chronicler (`chronicler`)

**Description:** Timeline management. Summarizes events and maintains world history.

**Template variables:**
`{events}` `{timeline}`

| Variable | Description |
|----------|-------------|
| `{events}` | New events to chronicle (recent actions, movements, dialogues) |
| `{timeline}` | Existing timeline for context |

**Temperature:** 0.5 | **Max tokens:** 1024 | **Priority:** 5

---

### Story Planner (`story-planner`)

**Description:** Story arc planning. Plans quests and plot developments.

**Template variables:**
`{world_state}` `{characters}` `{events}` `{quests}`

| Variable | Description |
|----------|-------------|
| `{characters}` | Active characters in the world |
| `{quests}` | Currently active quests |

**Output format:**
```json
{"arc": "description", "quests": [{"title": "", "description": "", "objectives": [""]}], "hooks": [""]}
```

**Temperature:** 0.7 | **Max tokens:** 2048 | **Priority:** 6

---

### Social Simulator (`social-sim`)

**Description:** Social dynamics. Simulates NPC relationships and interactions.

**Template variables:**
`{characters}` `{relationships}` `{context}`

| Variable | Description |
|----------|-------------|
| `{relationships}` | Current relationship graph between characters |
| `{context}` | Social context (meeting, conflict, alliance, etc.) |

**Temperature:** 0.6 | **Max tokens:** 1024 | **Priority:** 4

---

### Villain Manager (`villain`)

**Description:** Antagonist management. Plans villain moves and evil schemes.

**Template variables:**
`{villain}` `{world_state}` `{recent_actions}`

| Variable | Description |
|----------|-------------|
| `{villain}` | Villain profile (personality, goals, abilities) |
| `{recent_actions}` | Recent villain actions in the world |

**Temperature:** 0.8 | **Max tokens:** 2048 | **Priority:** 6

---

### Researcher (`researcher`)

**Description:** Fact-checking, realism validation, and world-building research.

**Template variables:**
`{task}` `{world_context}`

| Variable | Description |
|----------|-------------|
| `{task}` | Research task (recipe verification, character validation, scene enrichment, fact-check) |

**Output format:**
```json
{"verdict": "plausible|questionable|unrealistic", "confidence": 0.0-1.0, "issues": [], "suggestions": [], "enrichedDetails": ""}
```

**Temperature:** 0.3 | **Max tokens:** 2048 | **Priority:** 3 (lowest)

---

### Historian (`historian`)

**Description:** World history, chronology, and historical events.

**Template variables:**
`{query}` `{world_history}` `{relevant_events}` `{world_rules}`

| Variable | Description |
|----------|-------------|
| `{query}` | Historical query from the user |
| `{world_history}` | Established world history and chronology |
| `{relevant_events}` | Recent events relevant to the query |
| `{world_rules}` | World rules that affect historical interpretation |

**Temperature:** 0.5 | **Max tokens:** 2048 | **Priority:** 6

---

### Cartographer (`cartographer`)

**Description:** Maps, locations, distances, and geography.

**Template variables:**
`{query}` `{locations}` `{current_location}`

| Variable | Description |
|----------|-------------|
| `{query}` | Geographic query from the user |
| `{locations}` | Known locations in the world |
| `{current_location}` | Character's current location |

**Temperature:** 0.4 | **Max tokens:** 1024 | **Priority:** 4

---

### Merchant (`merchant`)

**Description:** Trading, pricing, and NPC inventory management.

**Template variables:**
`{query}` `{inventory}` `{world_economy}`

| Variable | Description |
|----------|-------------|
| `{query}` | Trading query from the user |
| `{inventory}` | Merchant's current inventory |
| `{world_economy}` | Economic context (supply, demand, prices) |

**Temperature:** 0.6 | **Max tokens:** 1024 | **Priority:** 5

---

### Quest Giver (`quest-giver`)

**Description:** Generates contextual quests based on world state.

**Template variables:**
`{query}` `{world_state}` `{active_quests}` `{nearby_npcs}` `{player_level}`

| Variable | Description |
|----------|-------------|
| `{query}` | Quest-related query from the user |
| `{world_state}` | Current world state |
| `{active_quests}` | Currently active quests |
| `{nearby_npcs}` | NPCs near the player |
| `{player_level}` | Player's current level |

**Output format:**
```json
{"title": "", "description": "", "objectives": [""], "rewards": "", "difficulty": "easy|medium|hard"}
```

**Temperature:** 0.7 | **Max tokens:** 2048 | **Priority:** 7

---

### Lorekeeper (`lorekeeper`)

**Description:** World facts, magic rules, races, and established canon.

**Template variables:**
`{query}` `{world_facts}` `{magic_system}` `{races}`

| Variable | Description |
|----------|-------------|
| `{query}` | Lore query from the user |
| `{world_facts}` | Established world facts |
| `{magic_system}` | Magic system rules and limitations |
| `{races}` | Known races and their characteristics |

**Temperature:** 0.4 | **Max tokens:** 2048 | **Priority:** 6

---

## Temperature Guide

| Value | Effect | Use for |
|-------|--------|---------|
| 0.1 - 0.3 | Focused, deterministic | Research, fact-checking |
| 0.4 - 0.6 | Balanced | Chronicler, social simulation |
| 0.7 - 0.8 | Creative | Narrative, NPC dialogue, villain schemes |

## Using @agent in Chat

Send a private message to any agent from the chat:

```
@narrator Describe the atmosphere of the ancient forest at dusk
@director Suggest a dramatic plot twist for the current scene
@researcher Is this medieval weapon historically accurate?
@chronicler Summarize what happened in the last hour
```

Responses are marked with a blue left border and agent name in brackets.

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

**Key files:**
- `src/lib/agent-memory-store.ts` — AgentMemoryStore with embedding integration
- `src/lib/sqlite-store.ts` — SQLiteStore with FTS5 + vector search + RRF
- `src/lib/vector-ops.ts` — Vector operations (cosine, L2, dot product)

## Template System

### How userTemplate Works

Each agent stores a `userTemplate` in SQLite (`agent_prompts` table) with JSON file fallback. The template contains `{var}` placeholders that are replaced with real values at runtime by `resolveTemplate()` (`src/utils/template-resolver.ts`).

**Flow:**
1. Agent loads config: `loadAgentConfig(agentId, world?, lang?)`
2. Reads `prompts.userTemplate` from SQLite first, then JSON fallback
3. Calls `resolveTemplate(template, vars)` with context data
4. Sends resolved prompt to LLM

**If no userTemplate exists** → fallback to `PromptBuilder` (hardcoded TypeScript templates).

### Language-Aware Prompts

Agent prompts are stored per world and per language in SQLite:

```sql
CREATE TABLE agent_prompts (
  world TEXT NOT NULL DEFAULT 'default',
  agent_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  system_prompt TEXT NOT NULL DEFAULT '',
  user_template TEXT NOT NULL DEFAULT '',
  output_format TEXT NOT NULL DEFAULT '',
  UNIQUE(world, agent_id, language)
);
```

**Storage hierarchy:**
1. **SQLite** (`agent_prompts` table) — primary storage, per world + language
2. **JSON files** (`worlds/{world}/agents/{agentId}.json`) — fallback during migration
3. **Hardcoded defaults** (`DEFAULT_PROMPTS` in `src/services/agent-config.ts`)

**Dual-write strategy:** During migration, writes go to both SQLite and JSON. Reads prioritize SQLite, falling back to JSON if not found.

### API Endpoints for Prompts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents/:id/prompts` | Get prompts for active world + world language |
| `GET` | `/api/agents/:id/prompts/:lang` | Get prompts for a specific language |
| `PUT` | `/api/agents/:id/prompts/:lang` | Upsert prompts for a specific language |

**Query parameters:**
- `world` — optional, defaults to active world from settings

**Example response:**
```json
{
  "agentId": "narrator",
  "language": "ru",
  "world": "levant",
  "prompts": {
    "systemPrompt": "...",
    "userTemplate": "...",
    "outputFormat": "..."
  }
}
```

### Agents Using userTemplate (dynamic, user-editable via UI)

| Agent | Template Variables |
|-------|-------------------|
| narrator | `{world_name}`, `{time}`, `{location}`, `{character}`, `{role}`, `{rules}`, `{timeline}`, `{memories}`, `{facts}`, `{npcs}`, `{history}` |
| scene | `{character}`, `{origin}`, `{destination}`, `{rules}`, `{events}` |
| director | `{narrative}`, `{beat}` |
| npc | `{npc_name}`, `{npc_personality}`, `{location}`, `{player}`, `{relationship}`, `{events}`, `{line}` |

### Agents Using PromptBuilder (static, code-only)

| Agent | Reason |
|-------|--------|
| **researcher** | Complex multi-method prompts (verifyRecipe, researchTopic, validateCharacter, enrichScene, factCheck). Each method has unique structure not suited for simple variable substitution. |
| **crafter** | Recipe suggestion prompt with dynamic scenario generation. Too complex for template vars. |
| **chronicler** | Data storage service, not a prompt-generating agent. |
| **story-planner** | Connected to LLM via roleplay engine (real prompts). |
| **social-sim** | Connected to LLM via roleplay engine (real prompts). |
| **villain** | Connected to LLM via roleplay engine (real prompts). |

> **Reminder:** If you add a new agent that needs simple prompt templating, add it to the "Using userTemplate" list. If it needs complex multi-branch logic, keep it on PromptBuilder and add it to this list instead.

## i18n System

### UI Translations in SQLite

UI translation strings are stored in SQLite (`ui_translations` table) per language and page:

```sql
CREATE TABLE ui_translations (
  language TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT 'global',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(language, page, key)
);
```

**Supported pages:**
- `agents` — Agent settings page UI strings
- `settings` — Global settings page UI strings
- `agent_names` — Translated agent names
- `agent_descs` — Translated agent descriptions

**Supported languages:** en, ru, de, fr, es, ja, zh

### i18n API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/i18n/translations/:lang/:page` | Get translations for a language+page |
| `GET` | `/api/i18n/translations/:lang` | Get all translations for a language |
| `PUT` | `/api/i18n/translations` | Upsert batch of translations |
| `DELETE` | `/api/i18n/translations/:lang/:page/:key` | Delete a translation key |

**Example request (PUT):**
```json
{
  "language": "ru",
  "page": "agents",
  "entries": {
    "title": "Настройки агентов",
    "savePrompts": "Сохранить промпты"
  }
}
```

**Example response (GET):**
```json
{
  "language": "ru",
  "page": "agents",
  "translations": {
    "title": "Настройки агентов",
    "savePrompts": "Сохранить промпты",
    "settings": "Настройки"
  }
}
```

### Frontend Integration

Frontend pages fetch translations from the API and fall back to inline JavaScript objects:

```javascript
// agents.html
async function loadTranslations(langCode) {
  const res = await fetch(`/api/i18n/translations/${langCode}/agents`);
  const data = await res.json();
  remoteTranslations = data.translations || {};
}

function t(key) {
  if (remoteTranslations[key] !== undefined) return remoteTranslations[key];
  return I18N[lang]?.[key] ?? I18N.en[key] ?? key;
}
```

### Seeding Translations

On first startup, `seedUITranslations()` in `src/lib/sqlite-store.ts` populates the `ui_translations` table with all 7 languages for all 4 pages. This only runs if the table is empty.

## Priority

Higher priority agents are processed first when multiple LLM requests queue up.

| Agent | Priority |
|-------|----------|
| narrator | 10 (highest) |
| npc | 9 |
| director | 8 |
| scene | 7 |
| quest-giver | 7 |
| story-planner | 6 |
| villain | 6 |
| historian | 6 |
| lorekeeper | 6 |
| chronicler | 5 |
| merchant | 5 |
| social-sim | 4 |
| cartographer | 4 |
| researcher | 3 (lowest) |

> **Note:** Template variables are resolved at runtime by `resolveTemplate()` in `src/utils/template-resolver.ts`. Agents using userTemplate (narrator, scene, director, npc) read from `worlds/default/agents/{id}.json` and resolve `{var}` placeholders with real context data. Researcher and crafter use `PromptBuilder` (code-only) because their prompts have complex multi-branch logic not suitable for simple variable substitution.

## Storage Architecture

### SQLite Database

The project uses SQLite via Bun's built-in `bun:sqlite` module. The database file is `tns.db` in the configured `dbPath` (default `./world_db`).

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

### Dual-Write Strategy

During migration, writes go to both SQLite and JSON:
- **Reads:** SQLite first → JSON fallback → hardcoded defaults
- **Writes:** Dual-write to SQLite + JSON (JSON for backward compatibility)
- **Future:** Can drop JSON fallback after verification
