# Migration Guide: JSON to SQLite

This guide covers the migration from JSON file storage to SQLite for world data.

## v0.25.3 Migration: Literary Compiler & Economic Models

The v0.25.3 release adds the Literary Compiler and Economic Models. No migration required — these are additive features that extend the existing State-First pipeline.

## v0.25.0 Migration: State-First Pipeline

### What Changed

The v0.25.0 release introduces a state-first pipeline architecture that consolidates the previous 14-agent system into 6 specialized agents (The Big Six).

**Old Pipeline:**
```
User Intent → Agent Selection → Agent Execution → Response
```

**New Pipeline:**
```
User Intent → Simulation → Pattern Selection (Dramaturg) → Fact Check (Validator) → Style Render (Stylist) → NPC Dialogue (Actor) → Linting (Censor) → Memory Update (Chronicler)
```

**Agent Consolidation:**

| Old Agents (14) | New Agent | Responsibility |
|-----------------|-----------|----------------|
| Narrator, Director, Scene | Stylist | Prose generation |
| Quest Giver, Lorekeeper, Villain | Dramaturg | Pattern selection |
| Researcher, Historian | Validator | Fact verification |
| NPC, Crafter, Cartographer, Merchant, Social Sim, User Agent | Actor | NPC interactions |
| (none) | Censor | Style linting |
| (none) | Chronicler | Memory maintenance |

**Backward Compatibility:** Old agent IDs (`@narrator`, `@director`, etc.) still work but route to new agents internally.

### MCP Integration

v0.25.0 introduces Model Context Protocol (MCP) tools for external knowledge access:

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

---

## Overview

TrueNeverStory uses a hybrid storage approach:

- **SQLite** (`tns.db`) — Primary storage for search, embeddings, sessions, and agent prompts
- **JSON files** — Fallback storage for backward compatibility

## What's Stored Where

| Data | SQLite Table | JSON Fallback |
|------|--------------|---------------|
| Entities | `entities` (FTS5) | `worlds/{name}/entities.json` |
| Embeddings | `embeddings` (vectors) | — |
| Memories | `memories` (FTS5) | — |
| Agent Prompts | `agent_prompts` | `worlds/{name}/agents/*.json` |
| UI Translations | `ui_translations` | — |
| Sessions | `sessions` | — |
| World Frame | — | `worlds/{name}/world_frame.json` |
| NPC Profiles | — | `worlds/{name}/npc_profiles.json` |
| Social Graph | — | `worlds/{name}/social/*.json` |
| Quests | — | `worlds/{name}/quests.json` |

## Migration Process

### Automatic Migration

On startup, `WorldStore` automatically:

1. Checks if SQLite tables exist
2. Reads JSON files if SQLite is empty
3. Inserts data into SQLite
4. Verifies data integrity
5. Backs up original JSON files

### Manual Migration

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");

// Migrate entities
await store.migrateEntitiesFromJson();

// Migrate quests
await store.migrateQuestsFromJson();

// Migrate social data
await store.migrateSocialFromJson();

// Verify migration
const report = await store.verifyMigration();
console.log(report);
```

## Dual-Write Strategy

During migration, writes go to both SQLite and JSON:

- **Reads:** SQLite first → JSON fallback → hardcoded defaults
- **Writes:** Dual-write to SQLite + JSON (JSON for backward compatibility)
- **Future:** Can drop JSON fallback after verification

## WorldStore API

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");

// CRUD operations
const entities = await store.listEntities();
const entity = await store.getEntity(uid);
await store.createEntity(entity);
await store.updateEntity(uid, updates);
await store.deleteEntity(uid);

// Search
const results = await store.searchEntities("query");

// Transactions
await store.beginTransaction();
try {
  await store.createEntity(entity1);
  await store.createEntity(entity2);
  await store.commit();
} catch (e) {
  await store.rollback();
  throw e;
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/world-store/entities` | List entities |
| `GET` | `/api/world-store/entities/:uid` | Get entity |
| `POST` | `/api/world-store/entities` | Create entity |
| `PUT` | `/api/world-store/entities/:uid` | Update entity |
| `DELETE` | `/api/world-store/entities/:uid` | Delete entity |
| `GET` | `/api/world-store/search?q=query` | Search entities |

## Rollback

If migration fails or you need to rollback:

1. SQLite data is isolated in `tns.db`
2. JSON files remain in `worlds/{name}/`
3. Delete `tns.db` to reset to JSON-only mode
4. The system will re-migrate on next startup

## Troubleshooting

### "Table already exists" error

This is normal — tables are created with `IF NOT EXISTS`.

### Missing data after migration

Check `worlds/{name}/backup/` for original JSON files.

### Performance issues

- Ensure SQLite WAL mode is enabled (default)
- Run `PRAGMA optimize` periodically
- Check index creation in `sqlite-store.ts`
