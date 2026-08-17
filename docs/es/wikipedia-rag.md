# Wikipedia RAG Enrichment

## Descripción general

TrueNeverStory utiliza Wikipedia para enriquecer los mundos de juego con conocimientos del mundo real. Durante la creación del mundo, el sistema investiga automáticamente temas relevantes y construye un índice RAG (Retrieval-Augmented Generation).

## Arquitectura

1. **WikipediaResearcher** — Obtiene artículos de la API de Wikipedia con lógica de reintentos
2. **WikiRAGBuilder** — Fragmenta artículos y construye el índice vectorial
3. **WorldCreationProgress** — Sigue el progreso con soporte SSE
4. **IdleResearchScheduler** — Enriquece el RAG durante los tiempos de inactividad del jugador

## Uso

### Investigación automática

Al crear un mundo, la investigación de Wikipedia ocurre automáticamente:

```typescript
import { WorldBuilder } from './services/world-builder';

const worldBuilder = new WorldBuilder(deps);
worldBuilder.enableWikipediaResearch(worldId);
await worldBuilder.createWorld();
await worldBuilder.enrichWithWikipedia();
```

### Investigación manual

Iniciar investigación desde la interfaz:
- Hacer clic en el botón "🌍 Исследовать Wikipedia"
- Monitorear el progreso mediante el endpoint SSE
- Pausar/reanudar según sea necesario

### Progreso CLI

El progreso se muestra en la terminal durante la creación del mundo:

```
[Stage 2/3: Wikipedia Research] Researching medieval knighthood...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Current: Knight
```

## Endpoints API

- `GET /api/wiki/research/:worldId/progress` — Flujo SSE de progreso
- `POST /api/wiki/research/:worldId` — Iniciar investigación
- `POST /api/wiki/research/:worldId/pause` — Pausar investigación
- `POST /api/wiki/research/:worldId/resume` — Reanudar investigación
- `GET /api/wiki/research/:worldId/status` — Obtener estado actual

## Configuración

### Política de reintentos
- 5 intentos por artículo
- Timeout de 2 minutos por intento
- Backoff exponencial: 5s → 10s → 20s → 40s → 80s

### Enriquecimiento en inactividad
- Se activa después de 1 hora de inactividad
- Procesa hasta 10 temas por sesión
- Umbrales configurables

## Integración MCP

La herramienta de búsqueda de Wikipedia está disponible vía MCP:

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

## Estructura de archivos

```
src/services/
├── wikipedia-researcher.ts      # Cliente API de Wikipedia
├── wiki-rag-builder.ts          # Fragmentación de artículos
├── idle-research-scheduler.ts   # Enriquecimiento en segundo plano
└── world-creation-progress.ts   # Seguimiento de progreso

src/mcp/wiki/
├── index.ts                     # Exportaciones del módulo
└── wiki-search.ts               # Herramienta de búsqueda MCP

src/routes/
└── wiki-research.ts             # Endpoints SSE

src/utils/
└── progress-bar.ts              # Visualización de progreso CLI
```

## Manejo de errores

- Los errores de la API de Wikipedia se registran y reintentan
- Los artículos fallidos se omiten, la investigación continúa
- Degradación elegante: el mundo se crea incluso si Wikipedia no está disponible
- Todos los errores se rastrean en el gestor de progreso
