# Wikipedia RAG — User Guide

Wikipedia RAG (Retrieval-Augmented Generation) automatically enriches game worlds with real-world knowledge from Wikipedia. When you create a world, the system researches relevant topics and builds a knowledge base that agents use for accurate, detailed narratives.

## How It Works

### Automatic Research

When a world is created, the system:

1. **Extracts keywords** from the world description (e.g., "medieval", "knights", "England")
2. **Searches Wikipedia** for relevant articles
3. **Parses articles** — extracts text, sections, categories
4. **Chunks content** — splits into ~500 token pieces with overlap
5. **Builds RAG index** — stores chunks for agent queries

### Example Scenario

You want a **medieval knights** world with literary references (Ivanhoe, Quentin Durward):

```
User: "I want a world of knights and medieval times"
```

The system automatically researches:
- **Geography** — castles, cities, trade routes in medieval England
- **Daily life** — food, clothing, crafts, social structure
- **Weapons & armor** — swords, shields, chainmail, plate armor
- **Rulers & commanders** — kings, lords, their characters and dates
- **Catastrophes** — plagues, fires, earthquakes of the era

All this knowledge is stored in the RAG index and used by agents to generate accurate, detailed narratives.

### Idle Enrichment

When a player is inactive for more than 1 hour, the system continues researching in the background:
- Investigates topics related to the world
- Adds more details to the RAG index
- Next agent responses use the new knowledge

## Progress Tracking

### Web UI

Real-time progress is available via SSE (Server-Sent Events):

```
GET /api/wiki/research/{worldId}/progress
```

Progress stages:
1. **Generating World** — LLM creates the world frame
2. **Wikipedia Research** — Fetching and parsing articles
3. **Building RAG** — Creating vector index

### CLI Progress

Terminal progress bar during world creation:

```
[Stage 2/3: Wikipedia Research] Researching medieval knighthood...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Current: Knight
  → Errors: 1 (skipped: Castles_in_England)
```

### Chat Buttons

In the web UI, you can control research:
- **🌍 Исследовать Wikipedia** — Start research
- **⏸ Пауза** — Pause research
- **▶ Продолжить** — Resume research

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/wiki/research/{worldId}/progress` | SSE progress stream |
| `POST` | `/api/wiki/research/{worldId}` | Start research |
| `POST` | `/api/wiki/research/{worldId}/pause` | Pause research |
| `POST` | `/api/wiki/research/{worldId}/resume` | Resume research |
| `GET` | `/api/wiki/research/{worldId}/status` | Get current status |

## MCP Integration

The Wikipedia RAG is available as an MCP tool for agents:

### Wiki Search Tool

```typescript
// Search for relevant knowledge
const results = await wikiSearch({
  query: "medieval knighthood",
  worldId: "my-world",
  limit: 10
});
```

Returns:
```json
[
  {
    "article": "Knight",
    "section": "History",
    "text": "The concept of knighthood originated in the medieval period...",
    "score": 0.85
  }
]
```

### Usage in Agents

Agents automatically use the RAG when generating responses:
- **Dramaturg** — Uses historical context for narrative patterns
- **Validator** — Verifies facts against Wikipedia data
- **Stylist** — Enriches descriptions with real-world details
- **Actor** — Provides accurate NPC knowledge about the world

## Configuration

### Retry Policy

- **5 attempts** per article
- **2 minute timeout** per attempt
- **Exponential backoff**: 5s → 10s → 20s → 40s → 80s

### Graceful Degradation

If Wikipedia is unavailable:
- World creation continues without Wikipedia data
- Agents use only LLM-generated knowledge
- Research retries in background

## File Structure

```
src/services/
├── wikipedia-researcher.ts      # Wikipedia API client
├── wiki-rag-builder.ts          # Article chunking
├── idle-research-scheduler.ts   # Background enrichment
└── world-creation-progress.ts   # Progress tracking

src/mcp/wiki/
├── index.ts                     # Module exports
└── wiki-search.ts               # MCP search tool

src/routes/
└── wiki-research.ts             # SSE endpoints

src/utils/
└── progress-bar.ts              # CLI progress display
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Research not starting | Check if Wikipedia API is accessible |
| Progress stuck | Check System tab → Operation Logs |
| Articles not loading | Retry policy handles temporary failures |
| RAG not used by agents | Ensure `enableWikipediaResearch()` was called |
| "Authentication required" | Set `AUTH_PASSWORD` in env or Settings |

## Technical Details

### Chunking Strategy

Articles are split into chunks of ~1500 characters (~500 tokens):
- **Overlap**: 150 characters between chunks
- **Sections**: Each section is chunked independently
- **Metadata**: Each chunk stores article title, section, categories

### Search Algorithm

The wiki search tool uses keyword matching:
1. Splits query into words
2. Checks each chunk for word presence
3. Calculates relevance score (matches / total words)
4. Returns top results sorted by score

### Storage

- **SQLite**: Article metadata and chunk text
- **FAISS**: Vector embeddings for semantic search
- **Per-world isolation**: Each world has its own RAG index
