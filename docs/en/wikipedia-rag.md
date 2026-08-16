# Wikipedia RAG Enrichment

## Overview

TrueNeverStory uses Wikipedia to enrich game worlds with real-world knowledge. During world creation, the system automatically researches relevant topics and builds a RAG (Retrieval-Augmented Generation) index.

## Architecture

1. **WikipediaResearcher** - Fetches articles from Wikipedia API with retry logic
2. **WikiRAGBuilder** - Chunks articles and builds vector index
3. **WorldCreationProgress** - Tracks progress with SSE support
4. **IdleResearchScheduler** - Enriches RAG during player idle time

## Usage

### Automatic Research

When creating a world, Wikipedia research happens automatically:

```typescript
import { WorldBuilder } from './services/world-builder';

const worldBuilder = new WorldBuilder(deps);
worldBuilder.enableWikipediaResearch(worldId);
await worldBuilder.createWorld();
await worldBuilder.enrichWithWikipedia();
```

### Manual Research

Trigger research from the UI:
- Click "🌍 Исследовать Wikipedia" button
- Monitor progress via SSE endpoint
- Pause/resume as needed

### CLI Progress

Progress is displayed in the terminal during world creation:

```
[Stage 2/3: Wikipedia Research] Researching medieval knighthood...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Current: Knight
```

## API Endpoints

- `GET /api/wiki/research/:worldId/progress` - SSE progress stream
- `POST /api/wiki/research/:worldId` - Start research
- `POST /api/wiki/research/:worldId/pause` - Pause research
- `POST /api/wiki/research/:worldId/resume` - Resume research
- `GET /api/wiki/research/:worldId/status` - Get current status

## Configuration

### Retry Policy
- 5 attempts per article
- 2 minute timeout per attempt
- Exponential backoff: 5s → 10s → 20s → 40s → 80s

### Idle Enrichment
- Triggers after 1 hour of inactivity
- Processes up to 10 topics per session
- Configurable thresholds

## MCP Integration

The wiki search tool is available via MCP:

```typescript
import { WikiSearchTool } from './mcp/wiki/wiki-search';

const tool = new WikiSearchTool();
tool.registerRAGBuilder(worldId, ragBuilder);

const results = await tool.search({
  query: 'medieval knighthood',
  worldId: 'my-world',
  limit: 10,
});
```

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

## Error Handling

- Wikipedia API errors are logged and retried
- Failed articles are skipped, research continues
- Graceful degradation: world creates even if Wikipedia is unavailable
- All errors are tracked in progress manager
