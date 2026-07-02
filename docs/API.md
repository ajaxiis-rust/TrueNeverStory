# TrueNeverStory API Reference

REST API for the TrueNeverStory world-building and roleplay platform. All endpoints return JSON unless noted.

**Base URL:** `http://localhost:3000`

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
- [Memory](#memory)
- [Maintenance](#maintenance)
- [Agents](#agents)
- [Providers & Models](#providers--models)
- [Settings](#settings)
- [Launch](#launch)

---

## Health

### `GET /health`
Health check.

**Response:** `{ status: "ok", engine_ready: boolean, uptime: number }`

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

## Agents

### `GET /agents`
List all configured agents.

### `GET /agents/:id`
Get single agent configuration.

### `PUT /agents/:id`
Update agent config (model, temperature, prompts, etc.). Rate-limited: 30/min/IP.

### `PUT /agents/:id/prompts`
Update only prompts for an agent.

### `POST /agents/:id/reset`
Reset agent to defaults.

### `GET /agents/providers/options`
Get available provider/model options for agent assignment.

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

---

## Launch

### `POST /launch`
Create a new game session with character generation.

**Request:** `{ hints?: string, isekai?: boolean, starting_age?: number }`

**Response:** `{ status: "success", session_id, character_name, opening_narrative, url }`

### `POST /continue`
Continue an existing session.

**Request:** `{ session_id: string }`

**Response:** `{ status: "success", session_id, character_name, url }`

---

## WebSocket

### `GET /ws/roleplay/:sessionId`
WebSocket endpoint for real-time roleplay. Messages are JSON:

**Client → Server:** `{ type: "message", content: string }`
**Server → Client:** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## Authentication

When password auth is enabled, sessions use HttpOnly cookies. Include `credentials: "include"` in fetch calls.

---

*Generated: 2026-06-27 | TrueNeverStory v0.11.4*
