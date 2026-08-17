# Wikipedia RAG Enrichment

## Überblick

TrueNeverStory nutzt Wikipedia, um Spielwelten mit Wissen aus der realen Welt anzureichern. Bei der Welterstellung recherchiert das System automatisch relevante Themen und baut einen RAG-Index (Retrieval-Augmented Generation) auf.

## Architektur

1. **WikipediaResearcher** — Holt Artikel von der Wikipedia-API mit Wiederholungslogik
2. **WikiRAGBuilder** — Teilt Artikel in Abschnitte und baut Vektorindex auf
3. **WorldCreationProgress** — Verfolgt den Fortschritt mit SSE-Unterstützung
4. **IdleResearchScheduler** — Reichert RAG während der Spielerleerlaufzeit an

## Verwendung

### Automatische Recherche

Bei der Welterstellung erfolgt die Wikipedia-Recherche automatisch:

```typescript
import { WorldBuilder } from './services/world-builder';

const worldBuilder = new WorldBuilder(deps);
worldBuilder.enableWikipediaResearch(worldId);
await worldBuilder.createWorld();
await worldBuilder.enrichWithWikipedia();
```

### Manuelle Recherche

Recherche aus der UI starten:
- Button "🌍 Исследовать Wikipedia" klicken
- Fortschritt über SSE-Endpunkt überwachen
- Bei Bedarf pausieren/fortsetzen

### CLI-Fortschritt

Der Fortschritt wird während der Welterstellung im Terminal angezeigt:

```
[Stage 2/3: Wikipedia Research] Researching medieval knighthood...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Current: Knight
```

## API-Endpunkte

- `GET /api/wiki/research/:worldId/progress` — SSE-Fortschrittsstream
- `POST /api/wiki/research/:worldId` — Recherche starten
- `POST /api/wiki/research/:worldId/pause` — Recherche pausieren
- `POST /api/wiki/research/:worldId/resume` — Recherche fortsetzen
- `GET /api/wiki/research/:worldId/status` — Aktuellen Status abrufen

## Konfiguration

### Wiederholungsrichtlinie
- 5 Versuche pro Artikel
- 2 Minuten Timeout pro Versuch
- Exponentielles Backoff: 5s → 10s → 20s → 40s → 80s

### Leerlaufanreicherung
- Löst nach 1 Stunde Inaktivität aus
- Verarbeitet bis zu 10 Themen pro Sitzung
- Konfigurierbare Schwellenwerte

## MCP-Integration

Das Wikipedia-Suchtool ist über MCP verfügbar:

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

## Dateistruktur

```
src/services/
├── wikipedia-researcher.ts      # Wikipedia-API-Client
├── wiki-rag-builder.ts          # Artikelaufteilung
├── idle-research-scheduler.ts   # Hintergrundanreicherung
└── world-creation-progress.ts   # Fortschrittsverfolgung

src/mcp/wiki/
├── index.ts                     # Modul-Exporte
└── wiki-search.ts               # MCP-Suchtool

src/routes/
└── wiki-research.ts             # SSE-Endpunkte

src/utils/
└── progress-bar.ts              # CLI-Fortschrittsanzeige
```

## Fehlerbehandlung

- Wikipedia-API-Fehler werden protokolliert und wiederholt
- Fehlgeschlagene Artikel werden übersprungen, Recherche geht weiter
- Graceful Degradation: Welt wird erstellt, auch wenn Wikipedia nicht verfügbar ist
- Alle Fehler werden im Fortschrittsmanager verfolgt
