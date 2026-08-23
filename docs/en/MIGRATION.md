# Migration Guide: JSON to SQLite

This guide covers the migration of world data from JSON files to SQLite, plus the storage layout used by TrueNeverStory.

## Overview

TrueNeverStory stores world data in **SQLite** via the `WorldStore` class (`src/store/world-store.ts`). The database file is `tns.db`, created inside the world directory (`<worldPath>/tns.db`) with WAL journal mode enabled.

The original JSON files remain in the world directory as the migration source and are never deleted — they serve as a fallback and historical record.

## v0.33.4 Migration: Literary Compiler & Economic Models

The v0.33.4 release adds the Literary Compiler and Economic Models. No migration required — these are additive features that extend the existing State-First pipeline.

## v0.33.4 Migration: State-First Pipeline

### What Changed

The v0.33.4 release introduces a state-first pipeline architecture. Two agent systems now coexist:

1. **The Big Six (AgentV2)** — the narrative prose pipeline (`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`), registered in `AgentRegistryV2`.
2. **Configured agents (`DEFAULT_AGENTS`)** — the config-driven agents in `src/services/agent-config.ts` (`director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation`), backing the Settings/Providers UI and a few subsystems.

**Old Pipeline:**
```
User Intent → Agent Selection → Agent Execution → Response
```

**New Pipeline:**
```
User Intent → Simulation → Pattern Selection (Dramaturg) → Fact Check (Validator) → Style Render (Stylist) → NPC Dialogue (Actor) → Linting (Censor) → Memory Update (Chronicler)
```

**Removed Agents:**

| Removed | Replaced by |
|---------|-------------|
| `narrator`, `scene` | `stylist` (prose generation) |
| `historian` | `validator` (fact verification) |
| `cartographer`, `lorekeeper`, `merchant`, `quest-giver` | (dropped) |
| `npc` | `actor` (NPC dialogue) |

`villain`, `social-sim`, `researcher`, and `director` remain available as configured agents. `crafter` remains as a crafting subsystem.

**Backward Compatibility:** The removed agent IDs (`@narrator`, `@npc`, `@scene`, `@director`) no longer exist and do not resolve. Chat `@mentions` route only to the configured handlers (`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`).

### MCP Integration

v0.33.4 introduces Model Context Protocol (MCP) tools for external knowledge access:

| MCP Server | Tools | Purpose |
|------------|-------|---------|
| Bible Parser | `search_verses`, `get_pattern`, `get_archetype` | Narrative patterns from biblical texts |
| Gutenberg Parser | `get_style_pattern`, `apply_style` | Stylistic patterns from literature |
| Wikipedia Tools | `verify_fact`, `get_context` | Historical fact-checking |

**Configuration:**

```typescript
// In conf/settings.json
{
  "mcpServers": {
    "bible": { "enabled": true, "dbPath": "./data/bible.db" },
    "gutenberg": { "enabled": true, "dbPath": "./data/styles.db" },
    "wikipedia": { "enabled": true }
  }
}
```

### New Dependencies

| Dependency | Status | Purpose |
|------------|--------|---------|
| Zod | Already in project | Schema validation |
| Mojo FFI | Already in project | Compute kernels |
| TranslationService | No external deps | UI translations |

### Breaking Changes

- **RoleplayEngine internal flow rewritten** — The pipeline now follows Simulation → Pattern → Style → Dialogue → Lint → Memory
- **AgentV2.process() replaces generateResponse()** — New signature: `process(intent, simulation, context, pattern?)`
- **createRoleplayEngine() requires new deps** — MCP server references, AgentRegistryV2, EventBus
- **`getLanguageInstruction()` removed** — language handling moved to `TranslationService` at the output boundary

---

## Storage Layout

### SQLite Database

The `WorldStore` constructor opens (and creates if missing) a `tns.db` file inside the world directory:

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");
// Opens worlds/my-world/tns.db with:
//   PRAGMA journal_mode = WAL
//   PRAGMA synchronous = NORMAL
```

**Tables created on init (`CREATE TABLE IF NOT EXISTS`):**

| Table | Purpose |
|-------|---------|
| `quests` | Quest data (`id`, `title`, `description`, `giver`, `objectives`, `status`, timestamps) |
| `npc_memories` | NPC short-term and long-term memories, indexed by `npc_uid` + `memory_type` |
| `story_arcs` | Story-planner arc data (single JSON blob per row) |
| `world_frame` | World frame key/value pairs |
| `director_state` | Director state key/value pairs |
| `villains` | Villain data (JSON blob per row) |

### JSON Files (Migration Source)

The original JSON files live in the same world directory and are read as the migration source. They are never deleted after migration:

| JSON file | Migrated into table |
|-----------|---------------------|
| `worlds/{name}/quests.json` | `quests` |
| `worlds/{name}/npc_profiles.json` | `npc_memories` |
| `worlds/{name}/world_frame.json` | `world_frame` |
| `worlds/{name}/story_planner.json` | `story_arcs` |
| `worlds/{name}/director_state.json` | `director_state` |
| `worlds/{name}/villains.json` | `villains` |

## Migration Process

### Triggering Migration

Migration is run on demand via the HTTP endpoint (there is no automatic migration at startup):

```typescript
const store = new WorldStore("worlds/my-world");

const result = await store.migrate();
// result = { migrated: ["quests", "npc_profiles", ...], errors: [] }

store.close();
```

The `migrate()` method migrates each data source independently inside its own `try/catch`, so a failure in one source does not abort the others. Each successfully migrated source is appended to `migrated`; any failure is recorded in `errors`.

**Migrated sources (in order):** `quests`, `npc_profiles`, `world_frame`, `story_planner`, `director_state`, `villains`.

If a JSON source file is missing or unparseable, that source is skipped silently (the read helper returns `null`).

### Legacy Path Migration

On startup (`src/index.ts`), if the `WORLDS_ROOT` directory does not exist, it is created and a legacy `WORLD_DB_PATH` directory (e.g. `world_db/`) is renamed to `worlds/default/`:

```
world_db/  →  worlds/default/
```

## WorldStore API

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");

// Migration
const result = await store.migrate();           // { migrated: string[], errors: string[] }

// Quest CRUD
const quests = store.getQuests();               // QuestData[]
const quest = store.getQuest(id);               // QuestData | null
store.upsertQuest(quest);                       // insert or replace
const removed = store.deleteQuest(id);          // boolean

// NPC memories
const memories = store.getNPCMemories(npcUid);              // all memory types
const short = store.getNPCMemories(npcUid, "short_term");   // filtered by type
store.addNPCMemory(npcUid, memory);                         // default type "short_term"

// World frame
const frame = store.getWorldFrame();            // Record<string, string>
store.setWorldFrame(key, value);

// Stats
const stats = store.getStats();                 // { quests, memories, worldFrame }

store.close();
```

## API Endpoints

The router (`src/routes/world-store.ts`) is mounted under `/api`. Every endpoint accepts an optional `?world=` query parameter to target a specific world (defaults to the active world):

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/world-store/migrate` | Migrate JSON files to SQLite; returns `{ status, world, migrated, errors }` |
| `GET` | `/api/world-store/stats` | Returns `{ world, stats }` (counts of quests, memories, world-frame keys) |
| `GET` | `/api/world-store/quests` | List quests from SQLite |
| `GET` | `/api/world-store/npc-memories/:uid` | NPC memories (`?type=short_term\|long_term_episodic`) |
| `GET` | `/api/world-store/frame` | World frame key/value pairs |

## Rollback

If migration fails or you need to roll back:

1. SQLite data is isolated in `worlds/{name}/tns.db`
2. The original JSON files remain in `worlds/{name}/`
3. Delete `worlds/{name}/tns.db` to reset to a JSON-only state
4. Re-run `POST /api/world-store/migrate` to migrate again from JSON

## Troubleshooting

### "Table already exists" error

This is normal — tables are created with `IF NOT EXISTS`.

### Missing data after migration

Check that the JSON source file exists in the world directory and is valid JSON. Unparseable files are skipped silently and reported only if the parse throws — inspect the `errors` array in the migrate result for details.

### Performance

- SQLite WAL mode is enabled by default in `WorldStore`
- `PRAGMA synchronous = NORMAL` is set for a balance of durability and speed
- Run `PRAGMA optimize` periodically on large databases
