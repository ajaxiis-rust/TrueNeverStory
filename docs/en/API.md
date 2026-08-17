# TrueNeverStory API Reference

REST API for the TrueNeverStory world-building and roleplay platform. All endpoints return JSON unless noted.

**Base URL:** `http://localhost:8000`

---

## Table of Contents

- [Health](#health)
- [Chat & Roleplay](#chat--roleplay)
- [Worlds](#worlds)
- [Entities & Graph](#entities--graph)
- [Sessions](#sessions)
- [Branches](#branches)
- [Probability](#probability)
- [Romance](#romance)
- [Quests](#quests)
- [Feedback](#feedback)
- [Rules Engine](#rules-engine)
- [Feature Flags](#feature-flags)
- [API Versioning](#api-versioning)
- [Memory](#memory)
- [Maintenance](#maintenance)
- [System](#system)
- [Agents](#agents)
- [Providers & Models](#providers--models)
- [Settings](#settings)
- [Launch](#launch)
- [WebSocket](#websocket)
- [Authentication](#authentication)
- [Cross-World](#cross-world)
- [Plugins](#plugins)
- [Monitoring](#monitoring)
- [I18n](#i18n)
- [World Store](#world-store)
- [Wiki Research](#wiki-research)

---

## Health

### `GET /health`
Health check.

**Response:** `{ status: "ok", engine_ready: boolean, uptime: number, version: string }`

### `GET /system-check`
System status with node version and platform info.

**Response:** `{ ok: boolean, message: string, node_version: string, platform: string }`

---

## Chat & Roleplay

### `POST /chat/setup`
Initialize or update the active roleplay session.

**Request:**
```json
{
  "character": "Kaelen",
  "location": "Silverwood",
  "story_time": "2025-06-01T12:00:00Z",
  "role": "protagonist",
  "session_id": "default"
}
```

**Response:** `{ active_character, current_location, current_time, session_id }`

### `POST /chat/message`
Send a player message, get a narrative response.

**Request:** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**Response:** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
SSE streaming endpoint for progressive narrative delivery. Same request body as `/chat/message`.

**Response:** Server-Sent Events stream:
- `event: start` — session state
- `event: chunk` — narrative text chunk
- `event: agent` — agent response (for `@agent` mentions)
- `event: heartbeat` — keepalive comment (`: keepalive`)
- `event: done` — final state
- `event: error` — error message
- `data: [DONE]` — stream end sentinel

### `POST /chat/agent`
Send a private message to a specific agent.

**Request:** `{ agentId: string, message: string }`

**Response:** `{ narrative, agent_id, agent_name, location, story_time, active_character, success, error? }`

### `GET /chat/session`
Get current session state.

**Response:** `{ active_character, current_location, current_time, session_id }`

### `GET /chat/history?limit=20`
Get recent conversation history.

**Response:** Array of `{ user: string, assistant: string, timestamp: string }`

---

## Worlds

### `GET /worlds`
List all available worlds.

**Response:** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
Get active world name (lightweight).

**Response:** `{ active: string }`

### `POST /worlds`
Create a new world.

**Request:** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

**Response:** `{ status: "created", world }`

### `GET /worlds/:name`
Get world details and frame data.

### `PUT /worlds/:name`
Update world frame fields.

### `DELETE /worlds/:name`
Delete a world.

### `POST /worlds/:name/switch`
Switch the active world.

### `POST /worlds/:name/chapters/generate`
Generate a literary chapter from session data.

**Request:** `{ sessionId?: string, prompt?: string }`

### `GET /worlds/:name/chapters`
List generated chapters.

### `GET /worlds/:name/chapters/:filename`
Get chapter content.

### `GET /worlds/:name/detail`
Full world statistics for the statistics modal.

**Response:**
```json
{
  "name": "default",
  "title": "My World",
  "description": "...",
  "genre": "fantasy",
  "language": "en",
  "worldRules": [{ "name": "...", "description": "..." }],
  "magicSystem": "...",
  "entityCounts": { "Character": 5, "Location": 3, "Faction": 2, "Item": 8 },
  "totalEntities": 18,
  "characters": [{ "name": "...", "summary": "...", "tags": [], "relationships": [] }],
  "locations": [{ "name": "...", "summary": "..." }],
  "factions": [{ "name": "...", "summary": "..." }],
  "items": [{ "name": "...", "summary": "..." }],
  "sessionCount": 4,
  "eventCount": 42,
  "chapterCount": 3,
  "villainCount": 1,
  "hasFrame": true
}
```

---

## Entities & Graph

### `GET /entity/:uid?layers=l1,l2,l3`
Get entity details by UID.

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
Get entity neighbors with graph traversal. Direction: `out`, `in`, or `both`.

### `GET /path?source=Character:Kaelen&target=Location:Village`
Find shortest path between two entities.

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
Search entities by name or semantic similarity.

**Response:** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
Graph statistics (node/edge counts, branch info).

### `GET /graph/d3?mode=relationships`
Get graph data formatted for d3-force visualization. Mode: `relationships` or `crafting`.

**Response:** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## Sessions

### `GET /sessions`
List all session histories.

### `GET /sessions/list`
List available game sessions.

**Response:** `{ sessions: array, count: number }`

### `GET /sessions/:sessionId/history`
Get conversation history for a session.

### `GET /sessions/:sessionId/summarize`
Summarize a session.

### `POST /sessions/export`
Export session to markdown.

**Request:** `{ session_id?: string, messages: [{role, content, timestamp?}] }`

### `GET /sessions/exports`
List exported markdown files.

### `GET /sessions/exports/:filename`
Load an exported file.

---

## Branches

### `POST /branch/create?name=my-branch&from_branch=main`
Create a new world branch (git-like snapshots).

### `POST /branch/switch?name=my-branch`
Switch active branch.

### `POST /branch/merge?name=my-branch`
Merge a branch into main.

### `GET /branch/list`
List all branches.

---

## Probability

### `GET /probability/:character/:profile?target=optional`
Get success probability for a character action.

Profiles: `combat`, `persuasion`, `stealth`, `intimidation`, `deception`, `athletics`, `investigation`, `romance`, `generic`.

**Response:** `{ character, profile, probability: number }`

### `POST /probability/modifier`
Apply a temporary probability modifier.

**Request:** `{ entity: string, parameter: string, value: number, duration_seconds?: number }`

### `GET /probability/modifiers/:entity`
List active modifiers for an entity.

---

## Romance

### `GET /romance/:character1/:character2`
Get romantic relationship status.

**Response:** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
Attempt a romance action. Actions: `attraction`, `confess`, `date`, `kiss`, `propose`, `breakup`.

**Request:** `{ character, target, location?, message? }`

**Response:** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
Get all romantic relationships for a character.

---

## Quests

### `GET /quests`
List all quests with progress.

### `GET /quest/:questId`
Get single quest details.

---

## Feedback

### `POST /feedback`
Record a like/dislike/neutral reaction for the last narrative turn.

**Request:** `{ turnId: number, reaction: 'like'|'dislike'|'neutral', techniques: string[] }`

On `dislike`, the engine regenerates the last turn and returns `{ ok, regenerated }`. Otherwise returns `{ ok: true }`.

---

## Rules Engine

### `GET /rules`
List social/economic rules for the world.

### `GET /rules/:id`
Get rule details by ID.

### `POST /rules/preview`
Preview merged rules with modifiers. Body: `RulesConfig`.

### `POST /rules/check`
Check if an action is allowed. Body: `{ config, action, superiorClass?, subordinateClass? }`.

---

## Feature Flags

### `GET /feature-flags`
List all feature flags and exposures.

### `GET /feature-flags/:id`
Get a single flag.

### `POST /feature-flags`
Create a new flag.

### `PUT /feature-flags/:id`
Update a flag.

### `DELETE /feature-flags/:id`
Delete a flag.

### `POST /feature-flags/:id/check`
Check if a flag is enabled for a context (user, etc.).

---

## API Versioning

TrueNeverStory supports two API versions:

- **v1** — Legacy wrapper for backward compatibility
- **v2** — Enhanced version with agent registry integration

Legacy routes (anything under `/api/*`) include deprecation headers:

- `X-API-Version: legacy`
- `Deprecation: true`
- `Sunset: 2026-12-31`

---

## Memory

### `POST /memory/forget?older_than=30&min_importance=0.2`
Forget old, low-importance memories.

### `POST /memory/summarise?tag=keyword`
Summarise memories by tag or node UID.

### `GET /memory/export?fmt=json`
Export all memories.

### `POST /memory/import`
Import memories from body.

**Request:** `{ data: MemoryEntry[] }`

### `POST /memory/update/:entryId`
Update a memory entry.

**Request:** `{ content: string }`

### `GET /memory/stats`
Memory system statistics.

### `POST /memory/rebuild`
Rebuild the FAISS vector index.

### `GET /memory/retrieve?q=keyword&top_k=10`
Semantic search over memories.

---

## Maintenance

### `POST /maintenance/run?full=true`
Run memory maintenance (pruning, clustering, archiving).

### `GET /maintenance/status`
Memory and maintenance statistics.

### `POST /maintenance/rebuild-index`
Rebuild vector index.

### `POST /maintenance/clean-orphans`
Clean orphaned embeddings.

---

## System

### `POST /system/pause`
Pause the roleplay engine. Accepts no parameters.

### `POST /system/resume`
Resume the roleplay engine. Accepts no parameters.

### `GET /system/status`
Get running/paused status of the engine.

---

## Agents

### `GET /agents`
List all configured agents.

**Query params:** `world` — optional, filter by specific world

### `GET /agents/:id`
Get single agent configuration.

**Query params:** `world` — optional, load from specific world

### `PUT /agents/:id`
Update agent config (model, temperature, prompts, etc.). Rate-limited: 30/min/IP.

**Query params:** `world` — optional, save to specific world

### `PUT /agents/:id/prompts`
Update only prompts for an agent.

**Query params:** `world` — optional, save to specific world

### `POST /agents/:id/reset`
Reset agent to defaults.

### `GET /agents/providers/options`
Get available provider/model options for agent assignment.

### `GET /agents/:id/prompts/:lang`
Get agent prompts for a specific language.

### `PUT /agents/:id/prompts/:lang`
Update agent prompts for a specific language.

### `GET /agents/registry`
List all registered agents (AgentRegistry).

### `GET /agents/registry/stats`
Get registry statistics.

### `GET /agents/registry/:id`
Get single registered agent.

### `PUT /agents/registry/:id`
Update registered agent.

### `POST /agents/registry/:id/enable`
Enable an agent.

### `POST /agents/registry/:id/disable`
Disable an agent.

### `DELETE /agents/registry/:id`
Unregister an agent.

---

## Providers & Models

### `GET /providers`
List all LLM providers.

### `POST /providers`
Add a new provider.

### `GET /providers/models`
List all models across providers.

### `POST /providers/health`
Trigger health check on all providers.

### `POST /providers/assign`
Assign a provider+model to an agent.

**Request:** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `GET /providers/assignments`
List all provider-agent assignments.

### `GET /providers/agents`
List agents from provider manager.

### `POST /providers/sync-from-agents`
Sync assignments from agent config.

### `GET /providers/reset`
Reset provider manager.

### `DELETE /providers/assign/:agentId`
Remove provider assignment from agent.

### `GET /providers/:id`
Get provider details and available models.

### `PUT /providers/:id`
Update provider config.

### `DELETE /providers/:id`
Remove a provider.

### `POST /providers/:id/default`
Set provider as default.

### `POST /providers/:id/keys`
Add an API key.

### `DELETE /providers/:id/keys/:keyId`
Remove an API key.

### `GET /models`
List all installed and available models.

### `POST /models/install`
Install a model.

**Request:** `{ source: "ollama"|"gguf_url", name: string, backend: "ollama"|"llamacpp" }`

### `DELETE /models/:id`
Remove a model.

### `POST /models/import`
Import a local model file.

### `POST /models/apply`
Apply a model to settings.

### `GET /models/browse?path=/`
Browse filesystem for model files.

---

## Settings

### `GET /settings`
Get current settings (API keys masked).

### `PUT /settings`
Update settings. Passwords auto-hashed, masked keys ignored.

### `POST /settings/reset`
Reset to defaults.

### `GET /languages`
List available UI languages (EN, RU, DE, FR, ES, JA, ZH).

### `GET /llm-config`
Get LLM server configuration.

### `PUT /llm-config`
Update LLM server configuration.

### `POST /server/restart`
Restart LLM servers.

### `GET /server/status`
Check LLM server status.

---

## Launch

### `POST /launch`
Create a new game session with character generation.

**Request:** `{ hints?: string, isekai?: boolean, starting_age?: number, name?: string }`

- `name` — explicit character name (optional). If provided, skips LLM name generation. Supports non-Latin characters.

**Response:** `{ status: "success", session_id, character_name, opening_narrative, race, social_class, birthplace, initial_location }`

### `POST /continue`
Continue an existing session.

**Request:** `{ session_id: string }`

**Response:** `{ status: "success", session_id, character_name, restored: boolean }`

### `POST /snapshot`
Save current game state.

**Request:** `{ session_id?: string }`

---

## WebSocket

### `GET /ws/*`
WebSocket endpoint for real-time roleplay. The server accepts WebSocket upgrades on any `/ws/*` path. Session context is determined by message type, not URL.

**Client → Server:** `{ type: "message", content: string }` or `{ type: "setup", ... }`
**Server → Client:** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## Authentication

When password auth is enabled, sessions use HttpOnly cookies. Include `credentials: "include"` in fetch calls.

---

## Cross-World

### `GET /api/cross-world/status`
Get cross-world communication status.

**Response:** `{ enabled: boolean, portals: number, eventLog: number }`

### `POST /api/cross-world/enable`
Enable cross-world communication.

**Response:** `{ enabled: true }`

### `POST /api/cross-world/disable`
Disable cross-world communication.

**Response:** `{ enabled: false }`

### `GET /api/cross-world/portals`
List active portals between worlds.

**Response:** Array of `{ id, world1, world2, createdAt, active }`

### `POST /api/cross-world/portals`
Create a portal between two worlds.

**Request:** `{ world1: string, world2: string }`

**Response:** `{ id, world1, world2, createdAt, active }`

### `DELETE /api/cross-world/portals/:id`
Destroy a portal.

**Response:** `{ deleted: true }`

### `GET /api/cross-world/events?limit=50`
Get cross-world event log.

**Response:** Array of `{ type, data, source, timestamp }`

---

## Plugins

### `GET /api/plugins`
List all registered plugins.

**Response:** Array of `{ id, name, version, description, agents, routes, hooks }`

### `GET /api/plugins/:id`
Get plugin details.

**Response:** Plugin object with full details.

### `GET /api/plugins/:id/capabilities`
Get plugin capabilities (counts of agents, routes, hooks).

**Response:** `{ agents: number, routes: number, hooks: number }`

### `GET /api/plugins/agents/all`
Get all agents registered by plugins.

**Response:** Array of `{ id, name, description, config }`

### `GET /api/plugins/routes/all`
Get all routes registered by plugins.

**Response:** Array of `{ path, method, handler }`

---

## Monitoring

### `GET /monitoring/dashboard`
Aggregated monitoring dashboard data.

### `GET /monitoring/stats`
Lightweight stats for polling.

---

## I18n

### `GET /i18n/translations/:lang/:page`
Get translations for a specific language and page.

### `GET /i18n/translations/:lang`
Get all translations for a language.

### `PUT /i18n/translations`
Upsert batch translations.

### `DELETE /i18n/translations/:lang/:page/:key`
Delete a translation key.

---

## World Store

### `POST /world-store/migrate`
Migrate JSON data to SQLite.

### `GET /world-store/stats`
Get migration statistics.

### `GET /world-store/quests`
Get quests from SQLite.

### `GET /world-store/npc-memories/:uid`
Get NPC memories by entity UID.

### `GET /world-store/frame`
Get world frame from SQLite.

---

## Wiki Research

### `POST /api/wiki/research/:worldId`
Initiate Wikipedia research for a world.

### `GET /api/wiki/research/:worldId/progress`
SSE progress stream for ongoing research.

### `POST /api/wiki/research/:worldId/pause`
Pause ongoing research.

### `POST /api/wiki/research/:worldId/resume`
Paused research.

### `GET /api/wiki/research/:worldId/status`
Get research status.

---

*Generated: 2026-07-31 | TrueNeverStory v0.32.6*
