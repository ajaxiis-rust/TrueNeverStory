# Wikipedia RAG Enrichment

## Aperçu

TrueNeverStory utilise Wikipedia pour enrichir les mondes de jeu avec des connaissances du monde réel. Lors de la création d'un monde, le système recherche automatiquement les sujets pertinents et construit un index RAG (Retrieval-Augmented Generation).

## Architecture

1. **WikipediaResearcher** — Récupère les articles de l'API Wikipedia avec logique de réessai
2. **WikiRAGBuilder** — Découpe les articles et construit l'index vectoriel
3. **WorldCreationProgress** — Suit la progression avec support SSE
4. **IdleResearchScheduler** — Enrichit le RAG pendant les périodes d'inactivité du joueur

## Utilisation

### Recherche automatique

Lors de la création d'un monde, la recherche Wikipedia se fait automatiquement :

```typescript
import { WorldBuilder } from './services/world-builder';

const worldBuilder = new WorldBuilder(deps);
worldBuilder.enableWikipediaResearch(worldId);
await worldBuilder.createWorld();
await worldBuilder.enrichWithWikipedia();
```

### Recherche manuelle

Lancer la recherche depuis l'interface :
- Cliquer sur le bouton "🌍 Исследовать Wikipedia"
- Surveiller la progression via l'endpoint SSE
- Mettre en pause/reprendre selon les besoins

### Progression CLI

La progression s'affiche dans le terminal lors de la création du monde :

```
[Stage 2/3: Wikipedia Research] Researching medieval knighthood...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Current: Knight
```

## Endpoints API

- `GET /api/wiki/research/:worldId/progress` — Flux SSE de progression
- `POST /api/wiki/research/:worldId` — Démarrer la recherche
- `POST /api/wiki/research/:worldId/pause` — Mettre en pause la recherche
- `POST /api/wiki/research/:worldId/resume` — Reprendre la recherche
- `GET /api/wiki/research/:worldId/status` — Obtenir le statut actuel

## Configuration

### Politique de réessai
- 5 tentatives par article
- Timeout de 2 minutes par tentative
- Backoff exponentiel : 5s → 10s → 20s → 40s → 80s

### Enrichissement en veille
- Se déclenche après 1 heure d'inactivité
- Traite jusqu'à 10 sujets par session
- Seuils configurables

## Intégration MCP

L'outil de recherche Wikipedia est disponible via MCP :

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

## Structure des fichiers

```
src/services/
├── wikipedia-researcher.ts      # Client API Wikipedia
├── wiki-rag-builder.ts          # Découpage des articles
├── idle-research-scheduler.ts   # Enrichissement en arrière-plan
└── world-creation-progress.ts   # Suivi de progression

src/mcp/wiki/
├── index.ts                     # Exportations du module
└── wiki-search.ts               # Outil de recherche MCP

src/routes/
└── wiki-research.ts             # Endpoints SSE

src/utils/
└── progress-bar.ts              # Affichage de progression CLI
```

## Gestion des erreurs

- Les erreurs de l'API Wikipedia sont journalisées et réessayées
- Les articles échoués sont ignorés, la recherche continue
- Dégradation gracieuse : le monde est créé même si Wikipedia est indisponible
- Toutes les erreurs sont suivies dans le gestionnaire de progression
